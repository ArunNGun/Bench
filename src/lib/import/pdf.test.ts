import { describe, expect, it } from "vitest";
import { deflateSync, strToU8 } from "fflate";
import { looksLikePdf, PdfError, readPdfText } from "./pdf";

/**
 * Build a real PDF around a content stream.
 *
 * Small enough to read, complete enough that the extractor has to do the actual
 * work: find the stream, inflate it, and walk the operators. Fixtures that skip
 * the container would test nothing that matters.
 */
function buildPdf(content: string, { compress = true }: { compress?: boolean } = {}): Uint8Array {
  const body = compress ? deflateSync(strToU8(content)) : strToU8(content);
  const filter = compress ? " /Filter /FlateDecode" : "";
  const header = strToU8(
    `%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Length ${body.length}${filter} >>\nstream\n`,
  );
  const footer = strToU8("\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

  const out = new Uint8Array(header.length + body.length + footer.length);
  out.set(header, 0);
  out.set(body, header.length);
  out.set(footer, header.length + body.length);
  return out;
}

const show = (lines: string[]) =>
  `BT /F1 12 Tf ${lines.map((l) => `1 0 0 1 72 700 Tm (${l}) Tj`).join(" ")} ET`;

describe("looksLikePdf", () => {
  it("accepts the magic bytes", () => {
    expect(looksLikePdf(buildPdf(show(["x"])))).toBe(true);
  });

  it("rejects anything else", () => {
    expect(looksLikePdf(strToU8("Marker,Value\nHbA1c,5.4"))).toBe(false);
    expect(looksLikePdf(new Uint8Array([]))).toBe(false);
  });
});

describe("readPdfText", () => {
  it("reads a compressed content stream", () => {
    const pdf = buildPdf(show(["HbA1c 5.4 %", "Total testosterone 612 ng/dL"]));
    const { lines, streams } = readPdfText(pdf);
    expect(streams).toBe(1);
    expect(lines).toContain("HbA1c 5.4 %");
    expect(lines).toContain("Total testosterone 612 ng/dL");
  });

  it("reads an uncompressed content stream", () => {
    const { lines } = readPdfText(buildPdf(show(["Ferritin 84 ng/mL"]), { compress: false }));
    expect(lines).toContain("Ferritin 84 ng/mL");
  });

  it("splits lines on the positioning operators", () => {
    // Each row of a report is placed with a move, so a move is a line break.
    const content = "BT (first) Tj 0 -14 Td (second) Tj 0 -14 Td (third) Tj ET";
    expect(readPdfText(buildPdf(content)).lines).toEqual(["first", "second", "third"]);
  });

  it("joins runs shown at the same position into one line", () => {
    // Kerning splits a label across several Tj calls with no move between them.
    const content = "BT 1 0 0 1 72 700 Tm (Oes) Tj (tradiol) Tj ( 28 pg/mL) Tj ET";
    expect(readPdfText(buildPdf(content)).lines).toContain("Oestradiol 28 pg/mL");
  });

  it("reads the array form of TJ, which is how kerned text is written", () => {
    const content = "BT 1 0 0 1 72 700 Tm [(Hae) -20 (matocrit) -20 ( 48 %)] TJ ET";
    expect(readPdfText(buildPdf(content)).lines).toContain("Haematocrit 48 %");
  });

  it("decodes hex strings", () => {
    // "Lipase 31 U/L"
    const content = "BT 1 0 0 1 72 700 Tm <4C697061736520333120552F4C> Tj ET";
    expect(readPdfText(buildPdf(content)).lines).toContain("Lipase 31 U/L");
  });

  it("decodes octal escapes, which is how a non-ASCII unit arrives", () => {
    // \265 is micro. Getting this wrong turns µIU/mL into IU/mL.
    const content = "BT 1 0 0 1 72 700 Tm (Insulin 6.1 \\265IU/mL) Tj ET";
    expect(readPdfText(buildPdf(content)).lines).toContain("Insulin 6.1 \u00b5IU/mL");
  });

  it("decodes UTF-16 strings announced by a byte order mark", () => {
    const utf16 = "\\376\\377\\000A\\000L\\000T\\000 \\0002\\0002";
    const content = `BT 1 0 0 1 72 700 Tm (${utf16}) Tj ET`;
    expect(readPdfText(buildPdf(content)).lines).toContain("ALT 22");
  });

  it("survives brackets inside a literal string", () => {
    // An unescaped nested pair is legal and a naive regex ends the string early.
    const content = "BT 1 0 0 1 72 700 Tm (Free T (calculated) 18.2) Tj ET";
    expect(readPdfText(buildPdf(content)).lines).toContain("Free T (calculated) 18.2");
  });

  it("survives an escaped closing bracket", () => {
    const content = "BT 1 0 0 1 72 700 Tm (Result \\) high) Tj ET";
    expect(readPdfText(buildPdf(content)).lines).toContain("Result ) high");
  });

  it("does not mistake endstream for another stream", () => {
    expect(readPdfText(buildPdf(show(["only one"]))).streams).toBe(1);
  });

  it("ignores streams that paint no text", () => {
    // An image or font stream inflates fine and contains no text operators.
    const pdf = buildPdf("q 100 0 0 100 0 0 cm /Im1 Do Q");
    const { lines, streams } = readPdfText(pdf);
    expect(streams).toBe(0);
    expect(lines).toEqual([]);
  });

  it("returns nothing for a scan rather than pretending", () => {
    // No text layer is the honest answer for a photographed report.
    expect(readPdfText(buildPdf("q /Im0 Do Q")).lines).toEqual([]);
  });

  it("rejects a file that is not a PDF", () => {
    expect(() => readPdfText(strToU8("Marker,Value\n"))).toThrow(PdfError);
  });

  it("explains an encrypted file instead of returning gibberish", () => {
    const pdf = buildPdf(show(["x"]));
    const tagged = new Uint8Array(pdf.length + 20);
    tagged.set(pdf, 0);
    tagged.set(strToU8(" /Encrypt 9 0 R "), pdf.length);
    expect(() => readPdfText(tagged)).toThrow(/encrypted/i);
  });

  it("keeps going when one stream will not inflate", () => {
    // A corrupt stream should cost that stream, not the whole document.
    const good = buildPdf(show(["Glucose 92 mg/dL"]));
    const broken = strToU8(
      "1 0 obj\n<< /Length 4 /Filter /FlateDecode >>\nstream\n\x00\x01\x02\x03\nendstream\nendobj\n",
    );
    const merged = new Uint8Array(good.length + broken.length);
    merged.set(good, 0);
    merged.set(broken, good.length);
    expect(readPdfText(merged).lines).toContain("Glucose 92 mg/dL");
  });

  it("collapses runs of whitespace inside a line", () => {
    const content = "BT 1 0 0 1 72 700 Tm (TSH    1.8     mIU/L) Tj ET";
    expect(readPdfText(buildPdf(content)).lines).toContain("TSH 1.8 mIU/L");
  });

  it("drops blank lines", () => {
    const content = "BT ( ) Tj 0 -14 Td (Real 1) Tj 0 -14 Td () Tj ET";
    expect(readPdfText(buildPdf(content)).lines).toEqual(["Real 1"]);
  });
});
