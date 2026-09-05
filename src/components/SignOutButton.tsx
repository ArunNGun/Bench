"use client";

/**
 * Leaving, from wherever you happen to be.
 *
 * Only in a hosted build. An ordinary copy of Bench has no account and nothing
 * to sign out of, so this renders nothing there.
 *
 * In the header rather than only in Settings because that is where somebody
 * looks for it. The control that existed before was inside the Sync card,
 * under a heading about syncing to your own server, which is a sentence that
 * means nothing to somebody who was handed a link and told to log in.
 *
 * Both this and the Settings card call the same `signOut`, because the
 * dangerous part is the order of operations and two copies of that order would
 * eventually stop agreeing.
 */

import { useState } from "react";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { HOSTED, accountRequired } from "@/lib/sync/hosted";
import { useSyncState } from "@/lib/sync/state";
import { describeRefusal, signOut } from "@/lib/sync/signout";
import { useStore } from "@/lib/store";

export function useSignOut() {
  const engine = useSyncState((s) => s.engine);
  const setKey = useSyncState((s) => s.setKey);
  const setSession = useSyncState((s) => s.setSession);
  const stored = useStore((s) => s.settings.sync?.url);
  const url = HOSTED?.url ?? stored ?? "";

  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setRefused(null);
    try {
      const result = await signOut(url, engine);
      if (!result.ok) {
        setRefused(describeRefusal(result));
        return;
      }
      setKey(null);
      setSession(null);
      /*
       * A full navigation rather than a router push. Everything this app holds
       * in memory belongs to the person who just left, and the surest way to be
       * rid of it is to stop being the same page.
       */
      window.location.assign(accountRequired() ? "/login" : "/");
    } finally {
      setBusy(false);
    }
  }

  return { go, busy, refused, canSignOut: url !== "" };
}

export function SignOutButton({ className }: { className?: string }) {
  const { go, busy, refused, canSignOut } = useSignOut();
  const session = useSyncState((s) => s.session);

  // Nothing to leave: an ordinary build, or nobody signed in yet.
  if (!accountRequired() || !canSignOut || !session) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        title={`Sign out of ${session.username}`}
        aria-label={`Sign out of ${session.username}`}
        className={cn(
          "press flex h-10 items-center gap-2 rounded-[var(--r-pill)] px-3 text-[14px] font-medium transition-colors",
          "text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)]",
          busy && "opacity-40",
          className)}
      >
        <LogOut size={18} strokeWidth={2.1} />
        <span className="hidden lg:inline">{busy ? "Signing out..." : "Sign out"}</span>
      </button>
      {/*
        A refusal has to be seen, and this button can be pressed from any page,
        so it cannot rely on a panel being open. Deliberately blunt: it only
        appears when the app is about to lose something.
      */}
      {refused && (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-[var(--rose)] px-4 py-3 text-[13px] text-white">
          {refused}
        </div>
      )}
    </>
  );
}
