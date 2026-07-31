"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CustomCompoundForm } from "./CustomCompoundForm";
import type { Peptide } from "@/lib/types";

/**
 * "Not in the list?", shown directly under a compound picker.
 *
 * The whole point is that it appears at the moment the gap is discovered. A user
 * scrolling a dropdown for a compound that is not there should not have to work
 * out that the library page has an add form, go there, add it, come back, and
 * start again. On save the new compound is selected for them and they carry on.
 */
export function AddCompoundInline({ onCreated }: { onCreated: (peptide: Peptide) => void }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--mint-ink)] underline decoration-dotted underline-offset-2"
      >
        <Plus size={13} strokeWidth={2.6} /> Not in the list? Add your own
      </button>
    );
  }

  return (
    <div className="mt-2">
      <CustomCompoundForm
        onCancel={() => setOpen(false)}
        onCreated={(p) => {
          setOpen(false);
          onCreated(p);
        }}
      />
    </div>
  );
}
