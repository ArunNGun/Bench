/**
 * Pulling the text layer out of a PDF, in the browser, with no PDF library.
 *
 * Lab results arrive as PDFs and typing sixteen numbers off a printout is the
 * reason nobody uses a bloodwork tracker twice. Every app that solves this
 * uploads the file to a server to be read. This app has none to upload to, and
 * says so on its landing page, so the file has to be read here or not at all.
 * The optional sync server is no exception: it takes a sealed blob and would
 * not know what to do with a PDF.
 *
 * The scope is deliberately narrow. A PDF is a container of objects, some of
 * which are compressed streams, some of which are content streams describing
 * where to paint glyphs. This finds the content streams, inflates them with the
 * inflate already in the bundle for xlsx, and reads the text-showing operators.
 * That is enough for any lab report produced by software, which is all of them.
 *
 * What it deliberately does not do:
 *
 *   - OCR. A scanned or photographed report has no text layer and this returns
 *     nothing for it. Saying "no text found" is right; guessing is not.
 *   - Fonts and encodings beyond the standard ones. A PDF can remap every glyph
 *     through a custom encoding, and honouring that properly means shipping
 *     font machinery. Where a file does that, the extracted text comes out as
 *     mojibake, the parser downstream matches nothing, and the user is told the
 *     file could not be read.
 *   - Layout. Column positions are approximated from text positioning
 *     operators, which is enough to keep a marker on the same line as its value
 *     and not enough to reconstruct a table faithfully.
 *
 * Everything it extracts is offered to the user for review before anything is
 * saved, which is what makes the approximations acceptable.
 */

import { inflateSync, strFromU8 } from "fflate";

export class PdfError extends Error {}

/** Cheap sniff, so a mislabelled file fails with a sentence rather than a stack trace. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 // F
  );
}

/**
 * Latin-1 view of the bytes.
 *
 * A PDF's structure is ASCII with binary stream payloads spliced in. Decoding
 * as UTF-8 would corrupt those payloads and shift every byte offset, so the
 * structure is read one byte to one character and stream bodies are sliced back
 * out of the original array by index.
 */
function latin1(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

interface RawStream {
  dict: string;
  body: Uint8Array;
}

/**
 * Every `stream ... endstream` payload, with the dictionary that precedes it.
 *
 * Found by scanning rather than by walking the cross-reference table. The xref
 * is the correct route and is also the part most often broken by incremental
 * updates and by generators that write it wrong, and a broken xref would mean
 * extracting nothing from a file whose streams are perfectly readable.
 */
function findStreams(bytes: Uint8Array, text: string): RawStream[] {
  const out: RawStream[] = [];
  let at = 0;

  while (at < text.length) {
    const start = text.indexOf("stream", at);
    if (start === -1) break;

    // "endstream" also contains "stream"; skip when this is the tail of one.
    if (text.slice(start - 3, start) === "end") {
      at = start + 6;
      continue;
    }

    // The dictionary is whatever precedes it, back to the object header.
    const objStart = text.lastIndexOf("obj", start);
    const dict = objStart === -1 ? "" : text.slice(objStart, start);

    // The keyword is followed by CRLF or LF, never by CR alone, per the spec.
    let bodyStart = start + "stream".length;
    if (text[bodyStart] === "\r") bodyStart++;
    if (text[bodyStart] === "\n") bodyStart++;

    const end = text.indexOf("endstream", bodyStart);
    if (end === -1) break;

    out.push({ dict, body: bytes.subarray(bodyStart, trimEol(text, bodyStart, end)) });
    at = end + "endstream".length;
  }

  return out;
}

/** The newline before `endstream` belongs to the syntax, not the payload. */
function trimEol(text: string, from: number, end: number): number {
  let e = end;
  if (e > from && text[e - 1] === "\n") e--;
  if (e > from && text[e - 1] === "\r") e--;
  return e;
}

/**
 * Decode one stream body, or null if it is not something we can read.
 *
 * Only FlateDecode is handled, because it is what essentially every generator
 * emits. A stream with no filter at all is already plain. Anything else, and
 * notably any encrypted document, is skipped rather than guessed at.
 */
function decodeStream(s: RawStream): string | null {
  if (/\/Filter\s*\/(?!FlateDecode)/.test(s.dict)) return null;

  if (!s.dict.includes("FlateDecode")) {
    // No filter: the body is already the content.
    return s.body.length ? latin1(s.body) : null;
  }

  try {
    return strFromU8(inflateSync(s.body), true);
  } catch {
    // A stream that will not inflate is not fatal. Others in the file may.
    return null;
  }
}

/** Content streams paint text; image and font streams do not. */
function isContent(decoded: string): boolean {
  return /\bBT\b/.test(decoded) && /\b(Tj|TJ)\b/.test(decoded);
}

/**
 * Unescape a PDF literal string.
 *
 * Backslash escapes, plus three-digit octal, which is how a generator writes
 * any byte outside printable ASCII.
 */
function unescapeLiteral(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== "\\") {
      out += c;
      continue;
    }

    const next = raw[++i];
    if (next === undefined) break;

    const simple: Record<string, string> = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      "(": "(",
      ")": ")",
      "\\": "\\",
    };
    if (simple[next] != null) {
      out += simple[next];
      continue;
    }

    if (next >= "0" && next <= "7") {
      let oct = next;
      while (oct.length < 3 && raw[i + 1] >= "0" && raw[i + 1] <= "7") oct += raw[++i];
      out += String.fromCharCode(parseInt(oct, 8));
      continue;
    }

    // A backslash before a newline is a line continuation and emits nothing.
    if (next === "\n") continue;
    if (next === "\r") {
      if (raw[i + 1] === "\n") i++;
      continue;
    }

    out += next;
  }
  return out;
}

/** `<48656C6C6F>` style strings. Odd length pads with a trailing zero, per spec. */
function decodeHexString(raw: string): string {
  const hex = raw.replace(/[^0-9a-fA-F]/g, "");
  const padded = hex.length % 2 ? `${hex}0` : hex;
  let out = "";
  for (let i = 0; i < padded.length; i += 2) {
    out += String.fromCharCode(parseInt(padded.slice(i, i + 2), 16));
  }
  return out;
}

/**
 * UTF-16BE, when a string announces itself with a byte order mark.
 *
 * Generators emit this for anything non-ASCII, and a µ in "µIU/mL" is exactly
 * the sort of thing that arrives this way.
 */
function decodeMaybeUtf16(s: string): string {
  if (s.length < 2 || s.charCodeAt(0) !== 0xfe || s.charCodeAt(1) !== 0xff) return s;
  let out = "";
  for (let i = 2; i + 1 < s.length; i += 2) {
    out += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
  }
  return out;
}

/**
 * Read the text out of one content stream.
 *
 * Walks the operators rather than regexing for strings, because a literal
 * string can contain anything at all, including the delimiters of the syntax
 * around it. Nesting and escaping both have to be tracked to know where one
 * ends.
 *
 * Line breaks are inferred from the positioning operators. `Td`, `TD`, `T*` and
 * `Tm` all move the cursor, and in a report each row is placed with one of
 * them, so treating a move as a newline reconstructs the lines well enough to
 * keep a marker name beside its result.
 */
function textFromContent(content: string): string {
  const out: string[] = [];
  let line = "";
  let i = 0;

  const endLine = () => {
    const trimmed = line.replace(/\s+/g, " ").trim();
    if (trimmed) out.push(trimmed);
    line = "";
  };

  while (i < content.length) {
    const c = content[i];

    // Literal string: track nesting depth and escapes to find the true close.
    if (c === "(") {
      let depth = 1;
      let raw = "";
      i++;
      while (i < content.length && depth > 0) {
        const ch = content[i];
        if (ch === "\\") {
          raw += ch + (content[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (depth === 0) break;
        }
        raw += ch;
        i++;
      }
      i++;
      line += decodeMaybeUtf16(unescapeLiteral(raw));
      continue;
    }

    // Hex string. A dictionary opens with "<<", which is not one.
    if (c === "<" && content[i + 1] !== "<") {
      const close = content.indexOf(">", i);
      if (close === -1) break;
      line += decodeMaybeUtf16(decodeHexString(content.slice(i + 1, close)));
      i = close + 1;
      continue;
    }

    // Skip a dictionary wholesale; inline image parameters live in these.
    if (c === "<" && content[i + 1] === "<") {
      const close = content.indexOf(">>", i);
      i = close === -1 ? content.length : close + 2;
      continue;
    }

    // Comments run to end of line.
    if (c === "%") {
      const nl = content.indexOf("\n", i);
      i = nl === -1 ? content.length : nl + 1;
      continue;
    }

    if (/[A-Za-z*'"]/.test(c)) {
      let op = "";
      while (i < content.length && /[A-Za-z0-9*'"]/.test(content[i])) op += content[i++];
      // Every one of these moves the text cursor to a new position.
      if (op === "Td" || op === "TD" || op === "T*" || op === "Tm" || op === "ET") endLine();
      // The quote operators show a string and move to the next line.
      else if (op === "'" || op === '"') endLine();
      continue;
    }

    i++;
  }

  endLine();
  return out.join("\n");
}

export interface PdfText {
  /** Every line found, in the order the operators emitted them. */
  lines: string[];
  /** How many content streams contributed. */
  streams: number;
}

/**
 * Extract the text layer.
 *
 * Throws only when the file is not a PDF at all. A PDF with no readable text is
 * not an error here; it returns nothing and the caller explains why, because
 * "this looks like a scan" is a far more useful message than a parse failure.
 */
export function readPdfText(bytes: Uint8Array): PdfText {
  if (!looksLikePdf(bytes)) {
    throw new PdfError("That does not look like a PDF.");
  }

  const text = latin1(bytes);

  if (/\/Encrypt\b/.test(text)) {
    throw new PdfError(
      "This PDF is encrypted. Open it in a reader and save or print an unprotected copy first.",
    );
  }

  const lines: string[] = [];
  let streams = 0;

  for (const raw of findStreams(bytes, text)) {
    const decoded = decodeStream(raw);
    if (!decoded || !isContent(decoded)) continue;
    streams++;
    const extracted = textFromContent(decoded);
    if (extracted) lines.push(...extracted.split("\n"));
  }

  return { lines: lines.filter((l) => l.trim().length > 0), streams };
}
