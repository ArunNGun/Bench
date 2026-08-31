"use client";

import { useState } from "react";
import { FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, SectionLabel } from "./ui";
import { CustomCompoundForm } from "./CustomCompoundForm";
import { useStore } from "@/lib/store";
import { CATEGORY_LABEL } from "@/lib/types";

/**
 * Compounds you added yourself, listed in the library.
 *
 * The form itself lives in CustomCompoundForm so the same thing can appear under
 * every compound picker, this screen is where you manage them afterwards, not
 * the only way in.
 */
export function CustomCompounds() {
  const custom = useStore((s) => s.customPeptides);
  const removeCustomPeptide = useStore((s) => s.removeCustomPeptide);
  const protocols = useStore((s) => s.protocols);
  const logs = useStore((s) => s.logs);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  /** How much of the app would lose its reference if this were deleted. */
  const usage = (id: string) => ({
    protocols: protocols.filter((p) => p.peptideId === id).length,
    logs: logs.filter((l) => l.peptideId === id).length,
  });

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel
        action={
          !open && (
            <Button variant="soft" onClick={() => setOpen(true)} className="px-2.5 py-1 text-[12px]">
              <Plus size={13} strokeWidth={2.6} /> Add your own
            </Button>
          )
        }
      >
        Your own compounds
      </SectionLabel>

      <p className="text-[13px] leading-relaxed text-[var(--muted)]">
        Anything the library does not carry. Your entries work everywhere a built-in one does, protocols, logging, stock and cost, but they are never shown as researched: dose ranges are
        tagged as yours, there are no citations, and no curve is drawn unless you give a half-life.
        You can also add one straight from any compound dropdown.
      </p>

      {custom.length > 0 && (
        <ul className="space-y-1.5">
          {custom.map((p) => {
            const used = usage(p.id);
            return (
              <li key={p.id} className="rounded-[var(--r-inner)] bg-[var(--sunken)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-bold text-[var(--ink)]">{p.name}</span>
                  <Badge tone="grape">yours</Badge>
                  <Badge tone="neutral">{CATEGORY_LABEL[p.category]}</Badge>
                  {p.halfLifeHours == null && <Badge tone="tangerine">no half-life</Badge>}
                  {/*
                    The badge above used to be a dead end: it named a gap and
                    offered no way to fill it, and the only route to a half-life
                    was to delete the compound and rebuild it, losing every
                    protocol and logged dose that pointed at its id.
                  */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(editingId === p.id ? null : p.id);
                      setConfirming(null);
                      setOpen(false);
                    }}
                    aria-label={`Edit ${p.name}`}
                    className="press ml-auto p-1 text-[var(--faint)] hover:text-[var(--ink)]"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(confirming === p.id ? null : p.id)}
                    aria-label={`Delete ${p.name}`}
                    className="press p-1 text-[var(--faint)] hover:text-[var(--rose)]"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <p className="mt-1 text-[11.5px] text-[var(--faint)]">
                  {used.protocols} protocol{used.protocols === 1 ? "" : "s"} · {used.logs} logged dose
                  {used.logs === 1 ? "" : "s"}
                </p>

                {editingId === p.id && (
                  <div className="mt-2.5">
                    <CustomCompoundForm
                      editing={p}
                      onCancel={() => setEditingId(null)}
                      onCreated={() => setEditingId(null)}
                    />
                  </div>
                )}

                {confirming === p.id && (
                  <div className="mt-2.5 rounded-[var(--r-inner)] bg-[var(--rose-soft)] p-3">
                    <p className="text-[13px] leading-relaxed" style={{ color: "var(--rose-ink)" }}>
                      {used.logs > 0 || used.protocols > 0 ? (
                        <>
                          {used.logs} dose{used.logs === 1 ? "" : "s"} and {used.protocols} protocol
                          {used.protocols === 1 ? "" : "s"} reference {p.name}. Deleting the compound
                          leaves those records in place but with nothing to name them, so they will
                          show as an unknown id. Deleting the protocols first is usually what you want.
                        </>
                      ) : (
                        <>Nothing references {p.name}, so this is safe to remove.</>
                      )}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button variant="soft" onClick={() => setConfirming(null)}>
                        Keep it
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => {
                          removeCustomPeptide(p.id);
                          setConfirming(null);
                        }}
                      >
                        Delete {p.name}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!open && !custom.length && (
        <p className="flex items-center gap-2 text-[12.5px] text-[var(--faint)]">
          <FlaskConical size={14} /> None yet.
        </p>
      )}

      {open && <CustomCompoundForm onCancel={() => setOpen(false)} onCreated={() => setOpen(false)} />}

      {custom.length > 0 && (
        <p className="text-[11.5px] leading-relaxed text-[var(--faint)]">
          Your compounds are stored on this device with the rest of your data, and travel with your
          exports and backups.
        </p>
      )}
    </Card>
  );
}
