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
import { useLang } from "@/lib/i18n";

export function AccountCard() {
  const { t } = useLang();
  const session = useSyncState((s) => s.session);
  const { go, busy, refused } = useSignOut();

  if (!accountRequired() || !session) return null;

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>{t("account_title")}</SectionLabel>

      <p className="text-[12.5px] text-[var(--muted)]">
        Signed in as <span className="font-medium text-[var(--ink)]">{session.username}</span> on{" "}
        <span className="font-mono">{HOSTED?.url}</span>.
      </p>

      <p className="text-[12.5px] text-[var(--muted)]">
        {t("account_sign_out_note")}
      </p>

      {refused && <Callout tone="danger" title={t("account_not_yet")}>{refused}</Callout>}

      <div>
        <Button disabled={busy} onClick={() => void go()}>
          <LogOut size={15} /> {busy ? "Signing out..." : "Sign out"}
        </Button>
      </div>
    </Card>
  );
}
