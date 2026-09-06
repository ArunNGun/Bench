/**
 * What a number field should show: the text as typed, or the value it holds.
 *
 * Pulled out of the component so the rule can be read on its own, because it is
 * the whole of the fix and it is one line of reasoning rather than one line of
 * code.
 *
 * The problem it solves: every caller keeps a number and turns the field's text
 * into one with `Number(...)`, so an empty field means zero. Clearing a field
 * showing 0 wrote 0 straight back and the nought reappeared, which is why
 * typing 250 into one produced 0250.
 *
 * The rule is that what was typed is shown for as long as it still means the
 * number the caller is holding. Empty means zero, so an empty box over a zero
 * is truthful and stays empty. When the two stop agreeing, which is what
 * happens when something outside the field changes the value, the caller wins.
 */
export function shownValue(
  draft: string | null,
  value: string | number | readonly string[] | undefined): string | number | readonly string[] {
  if (draft === null) return value ?? "";

  const holdsANumber = typeof value === "number" || (typeof value === "string" && value !== "");
  if (!holdsANumber) return value ?? "";

  return Number(draft) === Number(value) ? draft : value;
}
