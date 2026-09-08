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
  peptideToDraft,
  validateDraft,
  type CustomDraft,
  type DraftProblem,
} from "@/lib/calc/custom";
import {
  CATEGORY_LABEL,
  ROUTE_LABEL,
  type Peptide,
  type PeptideCategory,
  type Route,
} from "@/lib/types";
import { useLang } from "@/lib/i18n";

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

/*
 * The labels come from ROUTE_LABEL rather than from a copy kept here. There
 * used to be a copy, and a route renamed in one place would have been renamed
 * in one place only.
 */
const ROUTES: Route[] = ["subcutaneous", "intramuscular", "oral", "intranasal", "topical"];

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
 *
 * Pass `editing` to change an entry that already exists. The same form does
 * both, because they are the same fields, and because a compound you can create
 * but never correct is a compound you have to delete and rebuild, taking every
 * protocol and logged dose that referenced it with you.
 */
export function CustomCompoundForm({
  onCreated,
  onCancel,
  initialName,
  editing,
}: {
  onCreated?: (peptide: Peptide) => void;
  onCancel: () => void;
  initialName?: string;
  editing?: Peptide;
}) {
  const { t } = useLang();
  const addCustomPeptide = useStore((s) => s.addCustomPeptide);
  const updateCustomPeptide = useStore((s) => s.updateCustomPeptide);
  const custom = useStore((s) => s.customPeptides);

  const [draft, setDraft] = useState<CustomDraft>(() =>
    editing ? peptideToDraft(editing) : { ...EMPTY_DRAFT, name: initialName ?? "" });
  const [submitted, setSubmitted] = useState(false);

  const everything = useMemo(() => allPeptides(custom), [custom]);
  const problems = useMemo(
    () => validateDraft(draft, everything, editing?.id),
    [draft, everything, editing?.id]);

  const errorFor = (field: keyof CustomDraft): DraftProblem | undefined =>
    submitted ? problems.find((p) => p.field === field) : undefined;

  const set = <K extends keyof CustomDraft>(key: K, value: CustomDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function save() {
    setSubmitted(true);
    if (problems.length) return;

    const peptide = draftToPeptide(draft);

    if (editing) {
      // The id stays whatever it was. Everything that references this compound
      // references that string, so a rename must not become a new compound.
      updateCustomPeptide(editing.id, peptide);
      setSubmitted(false);
      onCreated?.({ ...peptide, id: editing.id });
      return;
    }

    addCustomPeptide(peptide);
    setDraft(EMPTY_DRAFT);
    setSubmitted(false);
    onCreated?.(peptide);
  }

  return (
    <div className="space-y-4 rounded-[var(--r-inner)] bg-[var(--sunken)] p-3.5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("ccf_name")} hint={errorFor("name")?.message}>
          <TextInput
            autoFocus
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={t("ccf_name_placeholder")}
          />
        </Field>
        <Field label={t("ccf_category")} hint={t("ccf_category_hint")}>
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

      <Field label={t("ccf_aka")} hint={t("ccf_aka_hint")}>
        <TextInput
          value={draft.aka ?? ""}
          onChange={(e) => set("aka", e.target.value)}
          placeholder={t("ccf_aka_placeholder")}
        />
      </Field>

      <div>
        <p className="mb-1.5 text-[12px] font-bold text-[var(--muted)]">{t("ccf_how_you_take")}</p>
        <div className="flex flex-wrap gap-1.5">
          {ROUTES.map((r) => {
            const on = draft.routes.includes(r);
            return (
              <button
                key={r}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set("routes", on ? draft.routes.filter((x) => x !== r) : [...draft.routes, r])
                }
                className="press rounded-[var(--r-pill)] px-3 py-1.5 text-[12.5px] font-semibold"
                style={{
                  background: on ? "var(--mint-soft)" : "var(--card)",
                  color: on ? "var(--mint-ink)" : "var(--muted)",
                  border: `1px solid ${on ? "var(--mint)" : "var(--line)"}`,
                }}
              >
                {ROUTE_LABEL[r]}
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
          label={t("ccf_comes_as")}
          hint={
            draft.preparation === "powder" ? t("ccf_powder_hint") : t("ccf_solution_hint")
          }
        >
          <Select
            value={draft.preparation}
            onChange={(e) => set("preparation", e.target.value as "powder" | "solution")}
          >
            <option value="powder">{t("ccf_powder")}</option>
            <option value="solution">{t("ccf_solution")}</option>
          </Select>
        </Field>
        <Field
          label={t("ccf_half_life")}
          hint={errorFor("halfLifeHours")?.message ?? t("ccf_half_life_hint")}
        >
          <NumberInput
            value={draft.halfLifeHours ?? ""}
            min={0}
            step={0.1}
            suffix={t("hours")}
            placeholder={t("ccf_unknown")}
            onChange={(e) =>
              set("halfLifeHours", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("ccf_dose_low")} hint={errorFor("doseLowMcg")?.message}>
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
        <Field label={t("ccf_dose_high")} hint={errorFor("doseHighMcg")?.message}>
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
        <Field label={t("ccf_per_week")} hint={errorFor("perWeek")?.message ?? t("ccf_per_week_hint")}>
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
        <Field label={t("ccf_vial_size")} hint={errorFor("vialSizeMg")?.message ?? t("labs_optional")}>
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
          label={t("ccf_iu_per_mg")}
          hint={errorFor("iuPerMg")?.message ?? t("ccf_iu_hint")}
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

      <Field label={t("ccf_notes")} hint={t("labs_optional")}>
        <Textarea
          rows={3}
          value={draft.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          placeholder={t("ccf_notes_placeholder")}
        />
      </Field>

      {submitted && problems.length > 0 && (
        <Callout tone="danger" title={t("ccf_not_saved")}>
          <ul className="list-disc space-y-0.5 pl-4">
            {problems.map((p) => (
              <li key={`${p.field}-${p.message}`}>{p.message}</li>
            ))}
          </ul>
        </Callout>
      )}

      <div className="flex flex-wrap gap-2.5">
        <Button variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button variant="primary" onClick={save}>
          {editing
            ? t("ccf_save_changes")
            : t("ccf_add", { name: draft.name.trim() || t("ccf_compound") })}
        </Button>
      </div>
    </div>
  );
}
