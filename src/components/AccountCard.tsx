"use client";

/**
 * Who you are on this server, and how to leave.
 *
 * A card of its own rather than a line inside the Sync panel. In a hosted build
 * the account is not a setting somebody chose, it is the thing they signed in
 * as, and the sentence they want to read is their own name rather than a
 * paragraph about syncing to your own server.
 *
 * It says out loud what signing out does to this browser, because that is
 * unusual and because the person deciding is often deciding on somebody else's
 * computer.
 */

import { LogOut } from "lucide-react";
import { Button, Callout, Card, SectionLabel } from "./ui";
import { HOSTED, accountRequired } from "@/lib/sync/hosted";
import { useSyncState } from "@/lib/sync/state";
import { useSignOut } from "@/lib/sync/useSignOut";

export function AccountCard() {
  const session = useSyncState((s) => s.session);
  const { go, busy, refused } = useSignOut();

  if (!accountRequired() || !session) return null;

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>Your account</SectionLabel>

      <p className="text-[12.5px] text-[var(--muted)]">
        Signed in as <span className="font-medium text-[var(--ink)]">{session.username}</span> on{" "}
        <span className="font-mono">{HOSTED?.url}</span>.
      </p>

      <p className="text-[12.5px] text-[var(--muted)]">
        Signing out sends anything unsent to the server first, then removes this browser&apos;s copy
        of your data and the key that reads it. That is on purpose: on a computer somebody else
        uses, leaving would otherwise leave your dose history behind for whoever opens it next.
        Nothing is lost, because the server keeps it and your password brings it back.
      </p>

      {refused && <Callout tone="danger" title="Not yet">{refused}</Callout>}

      <div>
        <Button disabled={busy} onClick={() => void go()}>
          <LogOut size={15} /> {busy ? "Signing out..." : "Sign out"}
        </Button>
      </div>
    </Card>
  );
}
