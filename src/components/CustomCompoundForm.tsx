"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Callout,
  Field,
  NumberInput,
  Select,
  TextInput,
  Textarea,
} from "./ui";
import { allPeptides, useStore } from "@/lib/store";
import {
  draftToPeptide,
  validateDraft,
  type CustomDraft,
  type DraftProblem,
} from "@/lib/calc/custom";
import { CATEGORY_LABEL, type Peptide, type PeptideCategory, type Route } from "@/lib/types";

const CATEGORIES: PeptideCategory[] = [
  "metabolic",
  "repair",
  "growth-hormone",
  "anabolic",
  "cognitive",
  "longevity",
  "immune",
  "sexual",
  "cosmetic",
  "blend",
];

const ROUTES: { id: Route; label: string }[] = [
  { id: "subcutaneous", label: "Subcutaneous" },
  { id: "intramuscular", label: "Intramuscular" },
  { id: "oral", label: "Oral" },
  { id: "intranasal", label: "Intranasal" },
  { id: "topical", label: "Topical" },
];

export const EMPTY_DRAFT: CustomDraft = {
  name: "",
  category: "repair",
  routes: ["subcutaneous"],
  preparation: "powder",
};

/**
 * The form for defining a compound the library does not have.
 *
 * Lives on its own so it can appear next to every compound picker rather than
 * only in the library. Someone discovers that their compound is missing at the
 * moment they go to select it, sending them to a different screen to add it, and
 * then back again to start the protocol over, is how a feature ends up unused.
 *
 * `onCreated` hands back the new entry so the caller can select it immediately.
 */
export function CustomCompoundForm({
  onCreated,
  onCancel,
  initialName,
}: {
  onCreated?: (peptide: Peptide) => void;
  onCancel: () => void;
  initialName?: string;
}) {
  const addCustomPeptide = useStore((s) => s.addCustomPeptide);
  const custom = useStore((s) => s.customPeptides);

  const [draft, setDraft] = useState<CustomDraft>({ ...EMPTY_DRAFT, name: initialName ?? "" });
  const [submitted, setSubmitted] = useState(false);

  const everything = useMemo(() => allPeptides(custom), [custom]);
  const problems = useMemo(() => validateDraft(draft, everything), [draft, everything]);

  const errorFor = (field: keyof CustomDraft): DraftProblem | undefined =>
    submitted ? problems.find((p) => p.field === field) : undefined;

  const set = <K extends keyof CustomDraft>(key: K, value: CustomDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function save() {
    setSubmitted(true);
    if (problems.length) return;

    const peptide = draftToPeptide(draft);
    addCustomPeptide(peptide);
    setDraft(EMPTY_DRAFT);
    setSubmitted(false);
    onCreated?.(peptide);
  }

  return (
    <div className="space-y-4 rounded-[var(--r-inner)] bg-[var(--sunken)] p-3.5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" hint={errorFor("name")?.message}>
          <TextInput
            autoFocus
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. VIP, SS-31, a vendor blend"
          />
        </Field>
        <Field label="Category" hint="Groups it in the library and drives the safety checks.">
          <Select
            value={draft.category}
            onChange={(e) => set("category", e.target.value as PeptideCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Also known as" hint="Optional, comma separated. Used when matching an import.">
        <TextInput
          value={draft.aka ?? ""}
          onChange={(e) => set("aka", e.target.value)}
          placeholder="e.g. Vasoactive intestinal peptide"
        />
      </Field>

      <div>
        <p className="mb-1.5 text-[12px] font-bold text-[var(--muted)]">How you take it</p>
        <div className="flex flex-wrap gap-1.5">
          {ROUTES.map((r) => {
            const on = draft.routes.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set("routes", on ? draft.routes.filter((x) => x !== r.id) : [...draft.routes, r.id])
                }
                className="press rounded-[var(--r-pill)] px-3 py-1.5 text-[12.5px] font-semibold"
                style={{
                  background: on ? "var(--mint-soft)" : "var(--card)",
                  color: on ? "var(--mint-ink)" : "var(--muted)",
                  border: `1px solid ${on ? "var(--mint)" : "var(--line)"}`,
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        {errorFor("routes") && (
          <p className="mt-1 text-[11.5px] text-[var(--rose-ink)]">{errorFor("routes")!.message}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Comes as"
          hint={
            draft.preparation === "powder"
              ? "You add the water yourself."
              : "Already mixed, an oil or a pen, no reconstitution step."
          }
        >
          <Select
            value={draft.preparation}
            onChange={(e) => set("preparation", e.target.value as "powder" | "solution")}
          >
            <option value="powder">Lyophilised powder</option>
            <option value="solution">Ready-mixed solution</option>
          </Select>
        </Field>
        <Field
          label="Half-life"
          hint={
            errorFor("halfLifeHours")?.message ??
            "Optional. Leave blank if unknown, no curve beats a made-up one."
          }
        >
          <NumberInput
            value={draft.halfLifeHours ?? ""}
            min={0}
            step={0.1}
            suffix="hours"
            placeholder="unknown"
            onChange={(e) =>
              set("halfLifeHours", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Typical dose, low" hint={errorFor("doseLowMcg")?.message}>
          <NumberInput
            value={draft.doseLowMcg ?? ""}
            min={0}
            suffix="mcg"
            placeholder=", "
            onChange={(e) =>
              set("doseLowMcg", e.target.value === "" ? undefined : Number(e.target.value))
            }
          />
        </Field>
        <Field label="high" hint={errorFor("doseHighMcg")?.message}>
          <NumberInput
            value={draft.doseHighMcg ?? ""}
            min={0}
            suffix="mcg"
            placeholder=", "
            onChange={(e) =>
              set("doseHighMcg", e.target.value === "" ? undefined : Number(e.target.value))
            }
          />
        </Field>
        <Field label="Doses per week" hint={errorFor("perWeek")?.message ?? "Drives burn rate."}>
          <NumberInput
            value={draft.perWeek ?? ""}
            min={0}
            step={0.5}
            placeholder="7"
            onChange={(e) => set("perWeek", e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Usual vial size" hint={errorFor("vialSizeMg")?.message ?? "Optional."}>
          <NumberInput
            value={draft.vialSizeMg ?? ""}
            min={0}
            step={0.5}
            suffix="mg"
            placeholder=", "
            onChange={(e) =>
              set("vialSizeMg", e.target.value === "" ? undefined : Number(e.target.value))
            }
          />
        </Field>
        <Field
          label="Units per mg"
          hint={errorFor("iuPerMg")?.message ?? "Only for things dosed in IU, like growth hormone."}
        >
          <NumberInput
            value={draft.iuPerMg ?? ""}
            min={0}
            step={0.1}
            suffix="IU/mg"
            placeholder=", "
            onChange={(e) => set("iuPerMg", e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </Field>
      </div>

      <Field label="What it is, and anything worth remembering" hint="Optional.">
        <Textarea
          rows={3}
          value={draft.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Mechanism, where it came from, how it made you feel…"
        />
      </Field>

      {submitted && problems.length > 0 && (
        <Callout tone="danger" title="Not saved yet">
          <ul className="list-disc space-y-0.5 pl-4">
            {problems.map((p) => (
              <li key={`${p.field}-${p.message}`}>{p.message}</li>
            ))}
          </ul>
        </Callout>
      )}

      <div className="flex flex-wrap gap-2.5">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save}>
          Add {draft.name.trim() || "compound"}
        </Button>
      </div>
    </div>
  );
}
