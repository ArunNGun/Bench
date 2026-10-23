"use client";

import { useState, useMemo } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  Pill,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  SectionLabel,
  Select,
  TextInput,
  Textarea,
} from "@/components/ui";
import { useStore, useProfileData } from "@/lib/store";
import type { Med, MedCategory, MedFrequency, MedLog } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FREQUENCY_LABELS: Record<MedFrequency, string> = {
  daily: "Daily",
  "twice-daily": "Twice daily",
  weekly: "Weekly",
  "as-needed": "As needed",
};

const CATEGORY_LABELS: Record<MedCategory, string> = {
  hair: "Hair",
  general: "Multivitamin / General",
  mineral: "Mineral",
  omega: "Omega / Fish oil",
  vitamin: "Vitamin",
  prescription: "Prescription",
  other: "Other",
};

const CATEGORY_EMOJI: Record<MedCategory, string> = {
  hair: "💊",
  general: "💊",
  mineral: "🧂",
  omega: "🐟",
  vitamin: "☀️",
  prescription: "💊",
  other: "💊",
};

const SUGGESTED_MEDS: { name: string; dose: string; category: MedCategory; frequency: MedFrequency }[] = [
  { name: "Finasteride", dose: "1 mg", category: "hair", frequency: "daily" },
  { name: "Dutasteride", dose: "0.5 mg", category: "hair", frequency: "daily" },
  { name: "Minoxidil", dose: "5 mg", category: "hair", frequency: "daily" },
  { name: "Omega-3", dose: "1000 mg", category: "omega", frequency: "daily" },
  { name: "Magnesium Glycinate", dose: "400 mg", category: "mineral", frequency: "daily" },
  { name: "Vitamin D3", dose: "5000 IU", category: "vitamin", frequency: "daily" },
  { name: "Vitamin B12", dose: "1000 mcg", category: "vitamin", frequency: "daily" },
  { name: "Zinc", dose: "30 mg", category: "mineral", frequency: "daily" },
  { name: "Multivitamin", dose: "1 tablet", category: "general", frequency: "daily" },
];

// ---------------------------------------------------------------------------
// Add/Edit Med Sheet
// ---------------------------------------------------------------------------

interface MedFormProps {
  initial?: Partial<Med>;
  onSave: (data: Omit<Med, "id" | "profileId" | "createdAt">) => void;
  onClose: () => void;
}

function MedForm({ initial, onSave, onClose }: MedFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [dose, setDose] = useState(initial?.dose ?? "");
  const [frequency, setFrequency] = useState<MedFrequency>(initial?.frequency ?? "daily");
  const [category, setCategory] = useState<MedCategory>(initial?.category ?? "general");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [showSuggested, setShowSuggested] = useState(!initial);

  function handleSuggest(s: typeof SUGGESTED_MEDS[number]) {
    setName(s.name);
    setDose(s.dose);
    setCategory(s.category);
    setFrequency(s.frequency);
    setShowSuggested(false);
  }

  function handleSubmit() {
    if (!name.trim() || !dose.trim()) return;
    onSave({ name: name.trim(), dose: dose.trim(), frequency, category, notes: notes.trim() || undefined, active });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-[var(--bg)] p-5 pb-8 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{initial?.id ? "Edit med" : "Add med"}</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-[var(--card)]">
            <X size={18} />
          </button>
        </div>

        {/* Suggestions */}
        {showSuggested && !initial?.id && (
          <div className="mb-4">
            <p className="mb-2 text-xs text-[var(--muted)]">Common picks:</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_MEDS.map((s) => (
                <button
                  key={s.name}
                  onClick={() => handleSuggest(s)}
                  className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--card)]"
                >
                  {s.name}
                </button>
              ))}
            </div>
            <div className="mt-2 border-b border-[var(--border)]" />
          </div>
        )}

        <div className="space-y-3">
          <Field label="Name">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Finasteride, Omega-3, Magnesium…"
              autoFocus
            />
          </Field>

          <Field label="Dose">
            <TextInput
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="1 mg, 500 mg, 1 capsule…"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value as MedCategory)}>
                {(Object.keys(CATEGORY_LABELS) as MedCategory[]).map((k) => (
                  <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Frequency">
              <Select value={frequency} onChange={(e) => setFrequency(e.target.value as MedFrequency)}>
                {(Object.keys(FREQUENCY_LABELS) as MedFrequency[]).map((k) => (
                  <option key={k} value={k}>{FREQUENCY_LABELS[k]}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Notes (optional)">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Taken with food, on empty stomach…"
              rows={2}
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded accent-[var(--accent)]"
            />
            <span>Active (show on today)</span>
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !dose.trim()}
            className="flex-1"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log intake sheet
// ---------------------------------------------------------------------------

interface LogMedSheetProps {
  med: Med;
  onLog: (dose?: string, notes?: string) => void;
  onSkip: () => void;
  onClose: () => void;
}

function LogMedSheet({ med, onLog, onSkip, onClose }: LogMedSheetProps) {
  const [dose, setDose] = useState(med.dose);
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-[var(--bg)] p-5 pb-8 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Log {med.name}</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-[var(--card)]">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Dose taken">
            <TextInput value={dose} onChange={(e) => setDose(e.target.value)} />
          </Field>
          <Field label="Notes (optional)">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to note…"
              rows={2}
            />
          </Field>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="ghost" onClick={onSkip} className="flex-1">
            Mark skipped
          </Button>
          <Button onClick={() => onLog(dose || undefined, notes.trim() || undefined)} className="flex-1">
            <Check size={15} className="mr-1" />
            Taken
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Med card
// ---------------------------------------------------------------------------

interface MedCardProps {
  med: Med;
  logs: MedLog[];
  onLog: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

function MedCard({ med, logs, onLog, onEdit, onDelete, onToggleActive }: MedCardProps) {
  const [expanded, setExpanded] = useState(false);
  const recentLogs = logs.slice(0, 10);

  // Check if already logged today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const loggedToday = logs.some(
    (l) => !l.skipped && l.at >= today.getTime() && l.at < today.getTime() + 86_400_000,
  );

  return (
    <Card className={`overflow-hidden transition-opacity ${!med.active ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 text-xl">{CATEGORY_EMOJI[med.category]}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium leading-tight">{med.name}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {med.dose} &middot; {FREQUENCY_LABELS[med.frequency]}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {loggedToday && (
                <Badge tone="mint" className="text-xs">
                  Taken
                </Badge>
              )}
              <button
                onClick={() => setExpanded((x) => !x)}
                className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)]"
              >
                {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>
          </div>

          {med.notes && (
            <p className="mt-1 text-xs text-[var(--muted)] line-clamp-2">{med.notes}</p>
          )}

          <div className="mt-3 flex gap-2">
            <Button
              variant="default"
              className="h-8 flex-1 text-xs"
              onClick={onLog}
              disabled={loggedToday && med.frequency === "daily"}
            >
              <Plus size={13} className="mr-1" />
              Log intake
            </Button>
            <button
              onClick={onEdit}
              className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)]"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={onToggleActive}
              className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)]"
              title={med.active ? "Pause" : "Resume"}
            >
              {med.active ? <RotateCcw size={13} /> : <Check size={13} />}
            </button>
            <button
              onClick={onDelete}
              className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded history */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-4 py-3">
          <p className="mb-2 text-xs font-medium text-[var(--muted)]">Recent intakes</p>
          {recentLogs.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No intakes logged yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recentLogs.map((l) => (
                <li key={l.id} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted)]">{formatDateTime(l.at)}</span>
                  <span className="flex items-center gap-1.5">
                    {l.skipped ? (
                      <Badge tone="tangerine" className="text-xs">Skipped</Badge>
                    ) : (
                      <>
                        <Badge tone="mint" className="text-xs">{l.dose ?? med.dose}</Badge>
                        {l.notes && <span className="text-[var(--muted)] italic">{l.notes}</span>}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MedsPage() {
  const hydrated = useStore((s) => s.hydrated);
  const { meds, medLogs } = useProfileData();
  const addMed = useStore((s) => s.addMed);
  const updateMed = useStore((s) => s.updateMed);
  const removeMed = useStore((s) => s.removeMed);
  const addMedLog = useStore((s) => s.addMedLog);

  const [showForm, setShowForm] = useState(false);
  const [editMed, setEditMed] = useState<Med | null>(null);
  const [loggingMed, setLoggingMed] = useState<Med | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const activeMeds = useMemo(() => meds.filter((m) => m.active), [meds]);
  const inactiveMeds = useMemo(() => meds.filter((m) => !m.active), [meds]);

  const logsForMed = (medId: string) =>
    medLogs.filter((l) => l.medId === medId).sort((a, b) => b.at - a.at);

  function handleSave(data: Omit<Med, "id" | "profileId" | "createdAt">) {
    if (editMed) {
      updateMed(editMed.id, data);
      setEditMed(null);
    } else {
      addMed(data);
      setShowForm(false);
    }
  }

  function handleLog(med: Med, dose?: string, notes?: string) {
    addMedLog({ medId: med.id, at: Date.now(), dose, notes, skipped: false });
    setLoggingMed(null);
  }

  function handleSkip(med: Med) {
    addMedLog({ medId: med.id, at: Date.now(), skipped: true });
    setLoggingMed(null);
  }

  function handleDelete(med: Med) {
    if (confirm(`Remove ${med.name} and all its history?`)) {
      removeMed(med.id);
    }
  }

  if (!hydrated) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pill size={20} className="text-[var(--accent)]" />
          <h1 className="text-lg font-semibold">Meds &amp; Supplements</h1>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={15} className="mr-1" />
          Add
        </Button>
      </div>

      {/* Active meds */}
      {activeMeds.length === 0 && inactiveMeds.length === 0 ? (
        <EmptyState
          icon={<Pill size={32} />}
          title="No meds yet"
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus size={15} className="mr-1" />
              Add your first med
            </Button>
          }
        >
          Track finasteride, omega-3, magnesium, vitamins, or any supplement you take regularly.
        </EmptyState>
      ) : (
        <>
          {activeMeds.length > 0 && (
            <div className="space-y-3">
              <SectionLabel>Active</SectionLabel>
              {activeMeds.map((med) => (
                <MedCard
                  key={med.id}
                  med={med}
                  logs={logsForMed(med.id)}
                  onLog={() => setLoggingMed(med)}
                  onEdit={() => setEditMed(med)}
                  onDelete={() => handleDelete(med)}
                  onToggleActive={() => updateMed(med.id, { active: !med.active })}
                />
              ))}
            </div>
          )}

          {inactiveMeds.length > 0 && (
            <div className="space-y-3">
              <button
                onClick={() => setShowInactive((x) => !x)}
                className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
              >
                {showInactive ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span>Paused ({inactiveMeds.length})</span>
              </button>
              {showInactive &&
                inactiveMeds.map((med) => (
                  <MedCard
                    key={med.id}
                    med={med}
                    logs={logsForMed(med.id)}
                    onLog={() => setLoggingMed(med)}
                    onEdit={() => setEditMed(med)}
                    onDelete={() => handleDelete(med)}
                    onToggleActive={() => updateMed(med.id, { active: !med.active })}
                  />
                ))}
            </div>
          )}
        </>
      )}

      {/* Sheets */}
      {(showForm || editMed) && (
        <MedForm
          initial={editMed ?? undefined}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false);
            setEditMed(null);
          }}
        />
      )}

      {loggingMed && (
        <LogMedSheet
          med={loggingMed}
          onLog={(dose, notes) => handleLog(loggingMed, dose, notes)}
          onSkip={() => handleSkip(loggingMed)}
          onClose={() => setLoggingMed(null)}
        />
      )}
    </div>
  );
}
