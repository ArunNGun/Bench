"use client";

/**
 * The owner's view of a server that holds more than one account.
 *
 * Drawn only when the server says this account is an owner. That drawing is
 * decoration and nothing more: every endpoint behind it asks the same question
 * again for itself, because a hidden button is not a lock when the request it
 * would have sent can be typed by hand. If this component were served to the
 * wrong person it would show them a list of nothing and four ways to be
 * refused.
 *
 * What it deliberately cannot show is anybody's data. A name, a size and two
 * dates is the whole of it, and that is not restraint: the server holds
 * ciphertext and has no key, so there is nothing else here to show. This is the
 * screen where somebody would one day think it convenient to add "just a peek",
 * and the reason it is impossible is worth having written down next to it.
 *
 * Promoting an account is absent on purpose and belongs in `server/admin.mjs`.
 * It is the only operation that turns a guest into somebody who can delete
 * other people's history, and it should not be reachable by a form in a
 * browser.
 */

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { Button, Callout, Card, Field, SectionLabel, TextInput } from "./ui";
import {
  createInvite,
  listAccounts,
  listInvites,
  removeAccount,
  revokeInvite,
  SyncError,
  type AccountSummary,
  type InviteSummary,
  type NewInvite,
} from "@/lib/sync/client";
import { HOSTED } from "@/lib/sync/hosted";
import { useSyncState } from "@/lib/sync/state";
import { useStore } from "@/lib/store";
import { formatDateTime } from "@/lib/format";

const kb = (bytes: number) => (bytes > 0 ? `${Math.round(bytes / 1024)} kB` : "nothing yet");

export function AdminPanel() {
  const settings = useStore((s) => s.settings);
  const owner = useSyncState((s) => s.session);
  const url = HOSTED?.url ?? settings.sync?.url ?? "";

  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [made, setMade] = useState<NewInvite | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!url) return;
    try {
      const [a, i] = await Promise.all([listAccounts(url), listInvites(url)]);
      setAccounts(a);
      setInvites(i);
    } catch (err) {
      setError(err instanceof SyncError ? err.message : "Could not read the server.");
    }
  }, [url]);

  useEffect(() => {
    if (owner?.admin) void refresh();
  }, [owner?.admin, refresh]);

  // Not an owner, or not signed in. The server would refuse anyway; this is so
  // that nobody is shown a panel of refusals.
  if (!owner?.admin || !url) return null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof SyncError ? err.message : "Something went wrong. See the console.");
      if (!(err instanceof SyncError)) console.error(err);
    } finally {
      setBusy(false);
    }
  }

  const invite = () =>
    run(async () => {
      setMade(await createInvite(url, name.trim().toLowerCase()));
      setName("");
    });

  /**
   * Removing somebody asks twice: once for the confirmation, once for the
   * password. The password is the part that matters, and it is checked by the
   * server rather than here.
   */
  const remove = (target: string) =>
    run(async () => {
      if (!window.confirm(
        `Remove ${target}? Their account and the only copy of their history on this server both go, and there is no undo.`)) {
        return;
      }
      const password = window.prompt(`Your own password, to confirm removing ${target}.`);
      if (!password) return;
      await removeAccount(url, owner.username, password, target);
    });

  const link = made ? `${url}/login?invite=${made.token}` : "";

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={13} /> This server
        </span>
      </SectionLabel>

      <p className="text-[12.5px] text-[var(--muted)]">
        You own this server, so you can see who has an account on it and invite more people. You
        cannot see anything they have recorded. The server holds their data sealed with their own
        password and has no key to it, which also means you cannot reset a password for anybody, and
        neither can anyone else.
      </p>

      {error && <Callout tone="danger" title="The server said no">{error}</Callout>}

      {/* Shown once. Only the hash reaches the disk, so this cannot be asked for again. */}
      {made && (
        <Callout tone="info" title={`Invitation for ${made.username}`}>
          <p>
            Send this over something private. Whoever opens it chooses their own password, which
            nobody else will ever know, you included. It works once, and stops working{" "}
            {formatDateTime(made.expiresAt)}.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-[var(--sunken)] px-2 py-1.5 text-[12px]">
              {link}
            </code>
            <Button onClick={() => void navigator.clipboard?.writeText(link)}>
              <Copy size={14} /> Copy
            </Button>
          </div>
          <p className="mt-2 text-[12px] text-[var(--faint)]">
            This is the only time it is shown. If it is lost, cancel it below and make another.
          </p>
        </Callout>
      )}

      <div className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-[12rem] flex-1">
          <Field label="Invite somebody" hint="You choose the name. They choose the password.">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="tofs"
              autoComplete="off"
            />
          </Field>
        </div>
        <Button variant="primary" disabled={busy || !name.trim()} onClick={invite}>
          <UserPlus size={15} /> Make an invitation
        </Button>
      </div>

      <Accounts rows={accounts} me={owner.username} busy={busy} onRemove={remove} />
      <Invites rows={invites} busy={busy} onCancel={(id) => run(() => revokeInvite(url, id))} />
    </Card>
  );
}

function Accounts({
  rows,
  me,
  busy,
  onRemove,
}: {
  rows: AccountSummary[] | null;
  me: string;
  busy: boolean;
  onRemove: (username: string) => void;
}) {
  if (rows == null) return <p className="text-[12.5px] text-[var(--faint)]">Reading the server...</p>;

  return (
    <div className="space-y-1.5">
      <SectionLabel>Accounts</SectionLabel>
      {rows.map((a) => (
        <div
          key={a.username}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[var(--sunken)] px-3 py-2"
        >
          <span className="font-medium">{a.username}</span>
          {a.admin && <span className="text-[11.5px] text-[var(--faint)]">owner</span>}
          {/*
            A lockout is shown because the owner is the one who will be told
            about it, usually by the person it happened to, and because the way
            to clear it early is a command they have to run.
          */}
          {a.lockedUntil != null && (
            <span className="text-[11.5px] text-[var(--rose)]">
              locked until {formatDateTime(a.lockedUntil)}
            </span>
          )}
          <span className="ml-auto text-[12px] text-[var(--faint)]">
            {kb(a.bytes)}
            {a.lastSyncAt != null && <>, last synced {formatDateTime(a.lastSyncAt)}</>}
          </span>
          {a.username !== me && (
            <Button variant="ghost" disabled={busy} onClick={() => onRemove(a.username)}>
              <Trash2 size={14} /> Remove
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function Invites({
  rows,
  busy,
  onCancel,
}: {
  rows: InviteSummary[];
  busy: boolean;
  onCancel: (id: string) => void;
}) {
  if (!rows.length) return null;

  return (
    <div className="space-y-1.5">
      <SectionLabel>Invitations</SectionLabel>
      {rows.map((i) => (
        <div
          key={i.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[var(--sunken)] px-3 py-2 text-[12.5px]"
        >
          <Link2 size={13} className="text-[var(--faint)]" />
          <span className="font-medium">{i.username}</span>
          <span className="ml-auto text-[12px] text-[var(--faint)]">
            {i.usedAt != null
              ? `used ${formatDateTime(i.usedAt)}`
              : `expires ${formatDateTime(i.expiresAt)}`}
          </span>
          <Button variant="ghost" disabled={busy} onClick={() => onCancel(i.id)}>
            {i.usedAt != null ? "Clear" : "Cancel"}
          </Button>
        </div>
      ))}
    </div>
  );
}
