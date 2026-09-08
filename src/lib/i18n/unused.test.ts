import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRANSLATIONS } from "./translations";

/**
 * Keys nothing renders.
 *
 * The dictionary reached 1236 keys with 246 of them unused: the original set
 * from the first translation pass, left behind as each screen was wired to
 * more specific keys. Nothing failed, because an unused key breaks nothing.
 * The cost lands on a person: a translator working through the file has no way
 * to tell which strings will ever be seen, and four languages were carrying
 * every one of them.
 *
 * So this counts them instead of leaving it to somebody noticing. It reads the
 * source rather than the types, which is the only way to see a key that no
 * longer has a call site.
 */

const SRC = join(__dirname, "..", "..");

/** Files that mention a key without rendering it: the dictionary and its tests. */
const IGNORE = new Set(["translations.ts", "translations.test.ts", "unused.test.ts"]);

function sources(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sources(path, into);
    else if (/\.tsx?$/.test(entry) && !IGNORE.has(entry)) into.push(path);
  }
  return into;
}

const CODE = sources(SRC)
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

/** Bases of plural families. One form being used keeps the whole family. */
const FAMILIES = Object.keys(TRANSLATIONS.en)
  .filter((k) => k.endsWith("_other"))
  .map((k) => k.slice(0, -"_other".length))
  .sort((a, b) => b.length - a.length);

/**
 * `t(`reminders_lead_${minutes}`)` names no key in full. The prefix is
 * collected instead, and every key under it counts as used.
 *
 * The lookbehind matters: without it `get(` ends in a `t(` and the prefix `p`
 * would mark every key beginning with p as used, which is most of them.
 */
const PREFIXES = [...CODE.matchAll(/(?<![A-Za-z0-9_$])t\(`([a-z0-9_]+)\$\{/g)].map((m) => m[1]);

function isUsed(key: string) {
  const base = FAMILIES.find((f) => key.startsWith(`${f}_`)) ?? key;
  return CODE.includes(`"${base}"`) || PREFIXES.some((p) => base.startsWith(p));
}

describe("translation keys", () => {
  it("found the source to read", () => {
    expect(CODE.length).toBeGreaterThan(10_000);
  });

  it("proves the prefix rule works, so the check cannot pass by accident", () => {
    expect(PREFIXES).toContain("reminders_lead_");
    expect(isUsed("reminders_lead_15")).toBe(true);
    expect(isUsed("a_key_nothing_will_ever_render")).toBe(false);
  });

  it("are all rendered somewhere", () => {
    const unused = Object.keys(TRANSLATIONS.en).filter((k) => !isUsed(k));
    expect(unused).toEqual([]);
  });
});
