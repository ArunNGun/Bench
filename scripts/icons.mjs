/**
 * Generates every icon the app ships, from one source file.
 *
 *   node scripts/icons.mjs
 *
 * The source is assets/brand-icon.svg. Nothing downstream is edited by hand,
 * because hand-exporting a dozen PNGs is exactly the job that goes wrong
 * quietly: an earlier pass wrote every Android foreground layer as solid opaque
 * white, which covers the background completely and gives a blank white
 * squircle on every launcher from Android 8 on. Neither the build nor a code
 * review looks inside a PNG. Generating them, and asserting the result is not a
 * single flat colour, does catch it.
 *
 * The source is three stacked paths: a rounded square, the mark, and a third
 * path in the background colour that punches the hole in the middle of the
 * mark. That third path is a knockout, not artwork, which matters as soon as
 * the mark has to stand on its own: on Android the background is a separate
 * layer that the launcher may shift for parallax, so a fake hole painted in the
 * background colour would slide out of register. The mark is rebuilt with a
 * real transparent hole instead.
 */

import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SOURCE = "assets/brand-icon.svg";
const RES = "android/app/src/main/res";

/** Adaptive icons are 108dp, of which only the middle 72dp is guaranteed visible. */
const CANVAS = 108;
const VISIBLE = 72;

/**
 * How much of its frame the mark fills.
 *
 * The source has it at 302/496, about 61% of the rounded square. That is kept
 * for Android, where the launcher's own mask defines the frame. For the web the
 * icon is also declared `maskable`, and a maskable icon can be cropped to a
 * circle inscribed in 80% of the canvas: a square mark at 61% has a diagonal of
 * 86%, so its corners would be clipped. 56% keeps the diagonal just inside.
 */
const FILL_ANDROID = 302 / 496;
const FILL_WEB = 0.56;

const src = readFileSync(SOURCE, "utf8");
const paths = [...src.matchAll(/<path\b([^>]*?)\/>/g)].map((blob) => ({
  d: blob[1].match(/\bd="([^"]*)"/)[1],
  fill: blob[1].match(/fill="([^"]*)"/)?.[1],
  transform: blob[1].match(/transform="([^"]*)"/)?.[1] ?? "",
}));
if (paths.length !== 3) throw new Error(`expected 3 paths in ${SOURCE}, found ${paths.length}`);

const [plate, mark, knockout] = paths;
export const BRAND = plate.fill; // the rounded square's colour, the brand teal
const MARK_COLOUR = mark.fill;

/** Measured from the source once, rather than guessed. */
const SRC_SIZE = 512;
const MARK_BOX = { min: 105, max: 406 };
const MARK_SPAN = MARK_BOX.max - MARK_BOX.min + 1;

const el = (p, fill) => `<path d="${p.d}" transform="${p.transform}" fill="${fill}"/>`;

/**
 * The mark with a genuinely transparent middle, placed on a canvas of `size`
 * and scaled to `fill` of it.
 */
function markSvg(size, fill, background) {
  // Always composed on the source's own 512 canvas, whatever the output size.
  // librsvg silently drops the mask when the nominal canvas is small: at
  // width="108" the same markup renders completely empty, with no warning.
  // Build big, then let sharp resize.
  const k = (size * fill) / MARK_SPAN;
  const offset = (size - MARK_SPAN * k) / 2 - MARK_BOX.min * k;
  const place = `translate(${offset.toFixed(4)} ${offset.toFixed(4)}) scale(${k.toFixed(6)})`;

  // The mask stays in the source's untransformed space and the scale goes on a
  // wrapper outside it. A `mask` on an element that carries its own transform
  // has that transform applied to the mask as well, so putting `place` on both
  // scales the mask by k a second time: the mark is then clipped to the k²
  // shape and comes out around two thirds of the size asked for, with nothing
  // to indicate it happened. Here both the mark and the mask sit inside one
  // wrapper, so they scale together.
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<defs><mask id="hole" maskUnits="userSpaceOnUse" x="0" y="0" width="${SRC_SIZE}" height="${SRC_SIZE}">` +
      `${el(mark, "#fff")}${el(knockout, "#000")}` +
      `</mask></defs>` +
      (background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "") +
      `<g transform="${place}"><g mask="url(#hole)">${el(mark, MARK_COLOUR)}</g></g>` +
      `</svg>`,
  );
}

/** The original artwork, rounded corners and all, at an arbitrary size. */
function plateSvg(size) {
  const k = size / SRC_SIZE;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${SRC_SIZE} ${SRC_SIZE}">` +
      `<g transform="scale(${k / k})">${el(plate, plate.fill)}${el(mark, MARK_COLOUR)}${el(knockout, knockout.fill)}</g>` +
      `</svg>`,
  );
}

/** Rendering at the target size directly keeps thin strokes from going soft. */
const render = (svg, size) =>
  sharp(svg, { density: 72 * (size / SRC_SIZE) * 4 }).resize(size, size).png().toBuffer();

/** A layer that is one flat colour is the failure this script exists to prevent. */
async function assertNotFlat(buf, label) {
  const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const seen = new Set();
  for (let i = 0; i < data.length; i += 4) {
    seen.add((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]);
    if (seen.size > 1) return buf;
  }
  throw new Error(`${label} came out as a single flat colour`);
}

async function write(path, buf, label) {
  await assertNotFlat(buf, path);
  writeFileSync(path, buf);
  console.log(`  ${path.padEnd(58)} ${label}`);
}

/** ICO is a tiny container: header, one directory entry per size, then the PNGs. */
function ico(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });

  return Buffer.concat([head, ...entries, ...images.map((i) => i.png)]);
}

/** The superellipse most launchers mask with. A rounded rect reads too boxy. */
function squircle(size, n = 4) {
  const r = size / 2;
  const pts = [];
  for (let i = 0; i <= 720; i++) {
    const t = (i / 720) * 2 * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    pts.push(
      `${(r + Math.sign(c) * Math.abs(c) ** (2 / n) * r).toFixed(2)},` +
        `${(r + Math.sign(s) * Math.abs(s) ** (2 / n) * r).toFixed(2)}`,
    );
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<polygon points="${pts.join(" ")}" fill="#fff"/></svg>`,
  );
}

console.log(`source ${SOURCE}, brand ${BRAND}, mark ${MARK_COLOUR}\n`);

// ---- Web ------------------------------------------------------------------
// Full bleed rather than the rounded plate: every platform applies its own
// mask, and rounding an already-rounded corner leaves pale wedges in the gaps.
mkdirSync("public", { recursive: true });
writeFileSync("public/icon.svg", markSvg(SRC_SIZE, FILL_WEB, BRAND).toString());
console.log(`  ${"public/icon.svg".padEnd(58)} full bleed, scalable`);

for (const size of [192, 512]) {
  await write(`public/icon-${size}.png`, await render(markSvg(SRC_SIZE, FILL_WEB, BRAND), size),
    `${size}x${size} any + maskable`);
}
await write("public/apple-touch-icon.png", await render(markSvg(SRC_SIZE, FILL_WEB, BRAND), 180),
  "180x180, iOS applies its own mask");

const favicons = [];
for (const size of [16, 32, 48]) {
  favicons.push({ size, png: await render(markSvg(SRC_SIZE, FILL_WEB, BRAND), size) });
}
writeFileSync("src/app/favicon.ico", ico(favicons));
console.log(`  ${"src/app/favicon.ico".padEnd(58)} 16, 32 and 48`);

// ---- Android --------------------------------------------------------------
writeFileSync(
  `${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<!-- Generated by scripts/icons.mjs from ${SOURCE}. The background layer of\n` +
    `     the adaptive icon is a flat colour, taken from the source artwork. -->\n` +
    `<resources>\n    <color name="ic_launcher_background">${BRAND}</color>\n</resources>\n`,
);
console.log(`\n  ${`${RES}/values/ic_launcher_background.xml`.padEnd(58)} ${BRAND}`);

/** The mark's share of the full 108dp canvas, given it is sized against the visible 72dp. */
const ANDROID_FILL_OF_CANVAS = (VISIBLE / CANVAS) * FILL_ANDROID;

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [bucket, factor] of Object.entries(DENSITIES)) {
  // Foreground: the mark alone, on transparency, sized against the visible 72dp.
  const fgPx = Math.round(CANVAS * factor);
  await write(
    `${RES}/mipmap-${bucket}/ic_launcher_foreground.png`,
    await render(markSvg(SRC_SIZE, ANDROID_FILL_OF_CANVAS, null), fgPx),
    `${fgPx}px adaptive foreground`,
  );

  // Legacy square and round icons. minSdk is 26 so no supported device reads
  // these, but the manifest still has to resolve them.
  const legacyPx = Math.round(48 * factor);
  const legacy = await render(plateSvg(SRC_SIZE), legacyPx);
  await write(`${RES}/mipmap-${bucket}/ic_launcher.png`, legacy, `${legacyPx}px legacy`);
  await write(`${RES}/mipmap-${bucket}/ic_launcher_round.png`, legacy, `${legacyPx}px legacy round`);
}

// Point the adaptive icon at the generated layers.
for (const name of ["ic_launcher", "ic_launcher_round"]) {
  writeFileSync(
    `${RES}/mipmap-anydpi-v26/${name}.xml`,
    `<?xml version="1.0" encoding="utf-8"?>\n` +
      `<!-- Generated by scripts/icons.mjs. Layers come from ${SOURCE}. -->\n` +
      `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n` +
      `    <background android:drawable="@color/ic_launcher_background"/>\n` +
      `    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n` +
      `</adaptive-icon>\n`,
  );
}
console.log(`  ${`${RES}/mipmap-anydpi-v26/*.xml`.padEnd(58)} pointed at the generated layers`);

// ---- Preview --------------------------------------------------------------
// No file on disk shows what a launcher actually draws, so compose one.
const PREVIEW = 512;
const SS = 8;
const full = CANVAS * SS;
const flat = await sharp({
  create: { width: full, height: full, channels: 4, background: BRAND },
})
  .composite([
    {
      input: await sharp(markSvg(SRC_SIZE, ANDROID_FILL_OF_CANVAS, null), { density: 72 * SS })
        .resize(full, full)
        .toBuffer(),
    },
  ])
  .png()
  .toBuffer();

const inset = ((CANVAS - VISIBLE) / 2) * SS;
await sharp(flat)
  .extract({ left: inset, top: inset, width: VISIBLE * SS, height: VISIBLE * SS })
  .resize(PREVIEW, PREVIEW)
  .composite([{ input: squircle(PREVIEW), blend: "dest-in" }])
  .png()
  .toFile("androidicon.png");
await sharp(flat).resize(PREVIEW, PREVIEW).png().toFile("androidicon-full.png");

console.log(`\n  ${"androidicon.png".padEnd(58)} as the launcher draws it`);
console.log(`  ${"androidicon-full.png".padEnd(58)} the whole ${CANVAS}dp canvas`);
