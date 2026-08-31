/**
 * The dose history as a CSV.
 *
 * Pulled out of the settings screen and made pure, because this file is one of
 * the two things a person hands to somebody else, and it was built inline with
 * no test of any kind. A column that quietly goes missing here is not a display
 * bug, it is a clinician reading a history that is not the one that was
 * recorded, which is exactly what happened: side effects were tapped, stored,
 * and never exported.
 */

import { FEELING_LABELS, INJECTION_SITES, type DoseLog } from "../types";

export const DOSE_CSV_HEADER = [
  "date",
  "time",
  "peptide",
  "dose_mcg",
  "dose_mg",
  "route",
  "site",
  "units",
  "syringe_scale",
  "volume_ml",
  "skipped",
  "feeling",
  "side_effects",
  "notes",
] as const;

/** Quote only when the value would otherwise break the row. */
export function escapeCsv(value: unknown) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * `nameFor` resolves a peptide id to a name, so this stays free of the store
 * and of the compound library.
 *
 * Rows come out oldest first. A spreadsheet is read downwards and a history
 * reads forwards, which is the opposite of the app's own newest-first list.
 */
export function doseCsv(logs: DoseLog[], nameFor: (peptideId: string) => string) {
  const rows = [...logs]
    .sort((a, b) => a.at - b.at)
    .map((l) => {
      const d = new Date(l.at);
      return [
        d.toLocaleDateString("en-CA"),
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        nameFor(l.peptideId),
        l.doseMcg,
        l.doseMcg / 1000,
        l.route,
        INJECTION_SITES.find((s) => s.id === l.site)?.label ?? "",
        l.units ?? "",
        l.syringeScale ?? "",
        l.volumeMl ?? "",
        l.skipped ? "yes" : "no",
        l.feeling != null ? (FEELING_LABELS[l.feeling] ?? l.feeling) : "",
        // Semicolons rather than commas. A comma inside a cell survives only by
        // quoting, and someone splitting this column back apart in a
        // spreadsheet should not have to think about that.
        (l.sideEffects ?? []).join("; "),
        l.notes ?? "",
      ]
        .map(escapeCsv)
        .join(",");
    });

  return { rows, text: [DOSE_CSV_HEADER.join(","), ...rows].join("\n") };
}
