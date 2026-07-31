"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, UserRound } from "lucide-react";
import { TONE_BG, TONE_FG, TONE_SOLID } from "./ui";
import { useActiveProfile, useStore } from "@/lib/store";
import type { Profile } from "@/lib/types";

/** Two initials, so a name of any length fits the same circle. */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ profile, size = 32 }: { profile: Profile; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-[var(--r-pill)] font-bold"
      style={{
        width: size,
        height: size,
        background: TONE_SOLID[profile.tone],
        color: "var(--on-accent)",
        fontSize: size * 0.38,
      }}
    >
      {initials(profile.name)}
    </span>
  );
}

/**
 * Switches whose data the app is showing, and is the way in to adding one.
 *
 * Always visible, even with a single profile: hiding it left the feature with
 * no entry point anywhere in the UI.
 */
export function ProfileSwitcher() {
  const profiles = useStore((s) => s.profiles);
  const active = useActiveProfile();
  const switchProfile = useStore((s) => s.switchProfile);
  const addProfile = useStore((s) => s.addProfile);

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function create() {
    if (!name.trim()) return;
    addProfile(name);
    setName("");
    setAdding(false);
    setOpen(false);
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="press flex h-10 items-center gap-2 rounded-[var(--r-pill)] bg-[var(--card)] pl-1 pr-2.5 shadow-[var(--shadow-xs)]"
      >
        <Avatar profile={active} size={32} />
        <span className="hidden max-w-28 truncate text-[13.5px] font-semibold text-[var(--ink)] sm:inline">
          {active.name}
        </span>
        <ChevronDown size={15} className="text-[var(--faint)]" />
      </button>

      {/*
        On a phone the menu hangs from the header across the full width rather
        than from the button. Anchoring a fixed 16rem panel to the button's right
        edge pushed it 26px off the left of a 384px screen, the button sits
        mid-header with three icons to its right, so there is nowhere near enough
        room to its left. From `sm` up there is, and it goes back to being a
        normal dropdown.
      */}
      {open && (
        <div
          role="menu"
          className="animate-pop fixed inset-x-3 top-[calc(var(--safe-top)+var(--header-h)+0.5rem)] z-50 overflow-hidden rounded-[var(--r-card)] bg-[var(--card)] p-1.5 shadow-[var(--shadow-lg)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64"
        >
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              onClick={() => {
                switchProfile(p.id);
                setOpen(false);
              }}
              className="press flex w-full items-center gap-2.5 rounded-[var(--r-inner)] px-2.5 py-2 text-left hover:bg-[var(--sunken)]"
            >
              <Avatar profile={p} size={30} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--ink)]">
                {p.name}
              </span>
              {p.id === active.id && <Check size={16} style={{ color: TONE_SOLID[p.tone] }} />}
            </button>
          ))}

          <div className="my-1.5 h-px bg-[var(--line)]" />

          {adding ? (
            <div className="p-1.5">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="Name"
                aria-label="New profile name"
                className="w-full rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--sunken)] px-3 py-2 text-[14px] focus:border-[var(--mint)] focus:outline-none"
              />
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="press flex-1 rounded-[var(--r-btn)] px-3 py-2 text-[13px] font-medium text-[var(--muted)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={create}
                  disabled={!name.trim()}
                  className="press flex-1 rounded-[var(--r-btn)] bg-[var(--mint)] px-3 py-2 text-[13px] font-semibold text-[var(--on-accent)] disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="press flex w-full items-center gap-2.5 rounded-[var(--r-inner)] px-2.5 py-2 text-left hover:bg-[var(--sunken)]"
            >
              <span
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[var(--r-pill)]"
                style={{ background: TONE_BG.mint, color: TONE_FG.mint }}
              >
                <Plus size={16} strokeWidth={2.6} />
              </span>
              <span className="text-[14px] font-medium text-[var(--ink)]">Add a profile</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Shown in Settings when there is still only one profile. */
export function AddFirstProfile() {
  const profiles = useStore((s) => s.profiles);
  const addProfile = useStore((s) => s.addProfile);
  const [name, setName] = useState("");

  if (profiles.length > 1) return null;

  return (
    <div className="flex flex-wrap items-end gap-2.5">
      <div className="min-w-40 flex-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && (addProfile(name), setName(""))}
          placeholder="Their name"
          aria-label="New profile name"
          className="w-full rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--sunken)] px-3.5 py-3 text-[15px] focus:border-[var(--mint)] focus:outline-none"
        />
      </div>
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => {
          addProfile(name);
          setName("");
        }}
        className="press flex items-center gap-2 rounded-[var(--r-btn)] bg-[var(--mint)] px-4 py-3 text-[14px] font-semibold text-[var(--on-accent)] disabled:opacity-40"
      >
        <UserRound size={16} /> Add profile
      </button>
    </div>
  );
}
