"use client";

/**
 * What you worked out about a compound, in your own words.
 *
 * Raised as a question with no answer: the Library lets you write notes on a
 * compound you added yourself, and offers nowhere to write them on GHK-Cu.
 * Somebody wanted to record twenty attempts at injecting it without it
 * stinging, and the app had nowhere to put the answer.
 *
 * Offered on every compound rather than only on the ones with no half-life,
 * which is the rule `YourHalfLife` above it follows and the opposite of what
 * this one needs. A published figure is a reason not to invite a contradicting
 * one. There is no published figure for how your own arm reacts, so there is
 * nothing here to contradict.
 *
 * One note, edited in place. The dose log is where the twenty observations go,
 * each with its day, its vial, its concentration and its site; this is the
 * conclusion drawn from them. Kept apart on purpose, because a conclusion
 * buried under its own workings is a conclusion nobody rereads.
 */

import { useEffect, useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { Button, Textarea } from "./ui";
import { useProfileData, useStore } from "@/lib/store";
import { formatDate } from "@/lib/format";
import { useLang } from "@/lib/i18n";

export function CompoundNotes({ peptideId, name }: { peptideId: string; name: string }) {
  const { t } = useLang();
  const { compoundNotes } = useProfileData();
  const setCompoundNote = useStore((s) => s.setCompoundNote);
  const mine = compoundNotes.find((c) => c.peptideId === peptideId);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState(mine?.text ?? "");

  /*
   * Switching profile while this page is open changes whose note this is, and
   * the draft in the box belongs to the profile that was on screen when it was
   * typed. Reseeding on the stored note's identity rather than on its text
   * leaves an edit in progress alone.
   */
  useEffect(() => {
    setText(mine?.text ?? "");
    setOpen(false);
    // The exhaustive rule wants `mine?.text` here and it is wrong to give it:
    // depending on the text would reseed the box from the store on every
    // keystroke's round trip and undo what is being typed. The identity is the
    // dependency; the text is the payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine?.id]);

  if (!open) {
    return (
      <div className="border-t border-[var(--line)] px-4 py-3">
        {mine ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="text-[var(--muted)]">{t("note_yours")}</span>
              <span className="text-[var(--faint)]">
                {t("note_written_on", { date: formatDate(mine.updatedAt) })}
              </span>
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={t("note_change", { name })}
                className="press ml-auto p-1 text-[var(--faint)] hover:text-[var(--ink)]"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => setCompoundNote(peptideId, "")}
                aria-label={t("note_remove", { name })}
                className="press p-1 text-[var(--faint)] hover:text-[var(--rose)]"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {/* Written by hand, so the line breaks are part of what was written. */}
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--ink)]">
              {mine.text}
            </p>
          </div>
        ) : (
          <Button variant="soft" onClick={() => setOpen(true)} className="px-2.5 py-1 text-[12px]">
            <Pencil size={13} /> {t("note_add")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-[var(--line)] px-4 py-3">
      <p className="text-[12px] leading-relaxed text-[var(--muted)]">{t("note_intro", { name })}</p>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("note_placeholder")}
        aria-label={t("note_change", { name })}
        rows={5}
      />

      <div className="flex flex-wrap gap-2.5">
        <Button
          variant="ghost"
          onClick={() => {
            setText(mine?.text ?? "");
            setOpen(false);
          }}
        >
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            setCompoundNote(peptideId, text);
            setOpen(false);
          }}
        >
          <Check size={14} /> {t("note_save")}
        </Button>
      </div>
    </div>
  );
}
