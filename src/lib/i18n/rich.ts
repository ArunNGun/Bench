/**
 * Emphasis inside a translated sentence.
 *
 * A warning that reads "one mark is 0.025 mL on U-40 against 0.01 mL on U-100"
 * puts its weight on the numbers, and in the source that was `<strong>` in the
 * middle of the JSX. A translator cannot be handed JSX, and splitting the
 * sentence into three keys around the tags is worse: the fragments only fit
 * together in English word order, which is the one thing translation changes.
 *
 * So the whole sentence stays one key, and the emphasis travels inside it as
 * `**like this**`. The translator can move it, drop it, or put it on a
 * different word, which is theirs to judge.
 *
 * Deliberately not Markdown. This understands one thing, and a string with a
 * stray asterisk in it renders as a string with a stray asterisk in it rather
 * than as a parse error or a silently swallowed character.
 */

export interface RichPart {
  text: string;
  strong: boolean;
}

/**
 * Split on paired `**`. An unpaired one is not a marker and is left alone,
 * because a sentence that ends up with a literal asterisk is a small blemish
 * and a sentence that loses half its words is a bug.
 */
export function splitEmphasis(text: string): RichPart[] {
  const parts: RichPart[] = [];
  let rest = text;

  while (rest.length > 0) {
    const open = rest.indexOf("**");
    if (open === -1) break;

    const close = rest.indexOf("**", open + 2);
    if (close === -1) break;

    if (open > 0) parts.push({ text: rest.slice(0, open), strong: false });
    parts.push({ text: rest.slice(open + 2, close), strong: true });
    rest = rest.slice(close + 2);
  }

  if (rest.length > 0) parts.push({ text: rest, strong: false });
  return parts;
}

/**
 * A sentence with something that is not text in the middle of it.
 *
 * "Saved days show up in the Log, beside the doses from that day", where Log
 * is a link. Three keys around the tag would hand a translator two fragments
 * that only fit together in English word order, which is the one thing
 * translation changes.
 *
 * So the key keeps the whole sentence and marks the spot with a placeholder,
 * `{log}`, and this returns the pieces in order with the placeholders called
 * out. Moving the placeholder in a translation moves the link.
 *
 * Unknown placeholders are left as literal text, the same way an unpaired `**`
 * is: a stray brace is a blemish, a swallowed sentence is a bug.
 */
export type SlotPart = { text: string } | { slot: string };

export function splitSlots(text: string, slots: string[]): SlotPart[] {
  if (!slots.length) return text ? [{ text }] : [];

  const pattern = new RegExp(`\\{(${slots.join("|")})\\}`, "g");
  const parts: SlotPart[] = [];
  let at = 0;

  for (const m of text.matchAll(pattern)) {
    if (m.index > at) parts.push({ text: text.slice(at, m.index) });
    parts.push({ slot: m[1] });
    at = m.index + m[0].length;
  }

  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}
