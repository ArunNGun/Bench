"use client";

/**
 * Self-hosted sync, for the web build only.
 *
 * A prototype, and it says so on the card. It keeps IndexedDB as the real
 * store rather than replacing it, and the server is a copy that other devices
 * can read.
 *
 * Syncing itself happens in `SyncRunner`, mounted in the layout. This card is
 * only the parts that need a person: the address, the password once per device,
 * and the one question the engine refuses to answer on its own.
 */

import { useState } from "react";
import { CloudOff, CloudUpload, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, Callout, Card, Field, SectionLabel, TextInput } from "./ui";
import { useStore } from "@/lib/store";
import {
  cryptoAvailable,
  isNative,
  login,
  logout,
  register,
  SyncError,
} from "@/lib/sync/client";
import { accountRequired, HOSTED } from "@/lib/sync/hosted";
import { useSyncState } from "@/lib/sync/state";
import { forgetKey, rememberKey } from "@/lib/sync/vault";
import { formatDateTime } from "@/lib/format";
import { ConflictChoices } from "./SyncNotice";

export function SyncPanel() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  const key = useSyncState((s) => s.key);
  const setKey = useSyncState((s) => s.setKey);
  const setSession = useSyncState((s) => s.setSession);
  const status = useSyncState((s) => s.status);
  const engine = useSyncState((s) => s.engine);

  // A hosted build knows its own address. Nobody types it, and nobody can point
  // this build at a different one, which is the whole reason it is a build.
  const [url, setUrl] = useState(HOSTED?.url ?? settings.sync?.url ?? "");
  const [username, setUsername] = useState(settings.sync?.username ?? "");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  // Only the first run needs a token, so the field stays out of the way until asked for.
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyIsRemembered, setKeyIsRemembered] = useState(true);

  // The Android build serves its own files and has no server to talk to. Same
  // reasoning as ServiceWorker, and the same check.
  if (isNative()) return null;

  /**
   * Nothing here can work without WebCrypto, and WebCrypto is absent on an
   * insecure origin. Saying so up front beats letting someone fill in three
   * fields and then reporting a failure they cannot act on.
   */
  const canEncrypt = cryptoAvailable();
  const connected = key != null;
  /*
   * Signed in as far as this device is concerned, and not as far as the server
   * is concerned. The key is still here and still correct; only the cookie is
   * gone. So the way out is the password, and nothing else needs touching.
   */
  const expired = connected && status.phase === "signedout";

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof SyncError ? err.message : "Something went wrong. See the console.");
      if (!(err instanceof SyncError)) console.error(err);
    } finally {
      setBusy(null);
    }
  }

  const connect = (mode: "login" | "register") =>
    run(mode === "register" ? "Creating the account" : "Signing in", async () => {
      const derived =
        mode === "register"
          ? await register(url, username, password, setupToken.trim())
          : await login(url, username, password);

      // Stored so a reload does not leave the engine keyless and quietly idle.
      // A browser that refuses says so here rather than by never syncing again.
      setKeyIsRemembered(await rememberKey(derived));

      // The password itself is never stored. Only where the server is and who
      // you are there.
      updateSettings({
        sync: { url, username, remoteSeenAt: settings.sync?.remoteSeenAt },
      });
      setKey(derived);
      setPassword("");
      setSetupToken("");
      setRegistering(false);
    });

  /**
   * Back in, without throwing anything away.
   *
   * The address, the username and the key are all still right. Only the server
   * has forgotten who this is, so only the password is asked for, and the
   * settings are left exactly as they are.
   */
  const reconnect = () =>
    run("Signing in", async () => {
      const derived = await login(url, username, password);
      setKeyIsRemembered(await rememberKey(derived));
      setKey(derived);
      setPassword("");
      engine?.request("now");
    });

  const disconnect = () =>
    run("Signing out", async () => {
      await logout(url).catch(() => undefined);
      await forgetKey();
      setKey(null);
      setSession(null);
      updateSettings({ sync: undefined });
      /*
       * Where the app is served from behind the server's own login, signing out
       * of the server means signing out of the app. Staying put would leave
       * somebody looking at a page they are no longer allowed to load, until
       * the next reload told them so.
       */
      if (accountRequired()) window.location.assign("/login");
    });

  const conflicted = status.phase === "conflict";

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>Sync to your own server</SectionLabel>

      {HOSTED ? (
        <Callout tone="info" title="This copy of Bench syncs to one server">
          Your data is encrypted in this browser before it is uploaded, with a key derived from your
          password, so the server holds something it cannot read. That includes whoever runs it:
          they can see that your account exists and how large it is, and nothing else. It also
          means nobody can reset your password for you. Lose it and the copy on the server is lost
          with it, which is why you were asked to keep your own backup.
        </Callout>
      ) : (
        <Callout tone="info" title="Prototype">
          This is the one part of the app that talks to a network. Your data is encrypted in this
          browser before it is uploaded, with a key derived from your password, so the server holds
          something it cannot read. Lose the password and the copy on the server is lost with it.
          Everything still works offline; the server is a copy, not the store. New accounts on a
          server are made by invitation from whoever set it up.
        </Callout>
      )}

      {!canEncrypt && (
        <Callout tone="danger" title="Not available on this address">
          Your browser only allows encryption on a secure origin, which means https, or localhost on
          the machine running the app. This page is neither, so the key cannot be derived and sync
          is switched off. Reach the app over https, or open it on the machine it runs on.
        </Callout>
      )}

      {expired && (
        <Callout tone="warn" title="Your session on the server has expired">
          <p>
            Nothing is wrong with your data, on this device or on the server. A session lasts thirty
            days, and every session on a server ends at once if its signing secret is changed. Type
            your password below to sign in again. The address, the username and the key on this
            device all stay as they are.
          </p>
        </Callout>
      )}

      {connected && !keyIsRemembered && (
        <Callout tone="warn" title="You will have to sign in again after a reload">
          This browser will not keep the key between visits, which private browsing windows in
          particular refuse to do. Syncing works for as long as this tab stays open.
        </Callout>
      )}

      {/*
        The one decision the engine will not make. Both sides changed, so either
        answer discards something, and which something is not for code to pick.
      */}
      {conflicted && (
        <Callout tone="danger" title="Two copies have both changed">
          <p>
            This device and the server have both been edited since they last agreed. Keeping one
            means discarding the other, so nothing has been sent or taken until you say which.
          </p>
          {/* One implementation, used here and in the frame. Two would drift. */}
          <ConflictChoices />
        </Callout>
      )}

      {HOSTED ? (
        <p className="text-[12.5px] text-[var(--muted)]">
          Server: <span className="font-mono text-[var(--text)]">{HOSTED.url}</span>
        </p>
      ) : (
        <Field
          label="Server address"
          hint="For example https://bench.example.com or http://localhost:8787"
        >
          <TextInput
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:8787"
            disabled={connected}
          />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Username">
          <TextInput
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            disabled={connected}
          />
        </Field>
        <Field
          label="Password"
          hint={
            expired
              ? "The same password. It signs you in and derives the same key."
              : connected
                ? "Not stored. The key it derives is."
                : "Also the encryption key."
          }
        >
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={connected && !expired}
          />
        </Field>
      </div>

      {/*
        A hosted build has no setup token to offer. Its server already has an
        owner, and everyone after that arrives by an invitation link that makes
        the account on the login page, before this screen is ever reached.
      */}
      {!HOSTED && !connected && registering && (
        <Field
          label="Setup token"
          hint="Printed in the server log when it starts, while it still has no account. docker compose logs sync"
        >
          <TextInput
            value={setupToken}
            onChange={(e) => setSetupToken(e.target.value)}
            placeholder="a hex string from the server log"
            autoComplete="off"
          />
        </Field>
      )}

      <div className="flex flex-wrap gap-2.5">
        {!connected ? (
          <>
            <Button
              variant="primary"
              disabled={!canEncrypt || !url || !username || !password || busy != null}
              onClick={() => connect("login")}
            >
              <CloudUpload size={15} /> Sign in
            </Button>
            {/*
              Two clicks to register rather than one. The first reveals the token
              field, which is also the moment to notice that a server with an
              account on it will refuse anyway.
            */}
            {!HOSTED &&
              (!registering ? (
                <Button disabled={!canEncrypt} onClick={() => setRegistering(true)}>
                  Set up a new server
                </Button>
              ) : (
                <Button
                  disabled={
                    !canEncrypt || !url || !username || !password || !setupToken || busy != null
                  }
                  onClick={() => connect("register")}
                >
                  Create the account
                </Button>
              ))}
          </>
        ) : (
          <>
            {expired ? (
              <Button variant="primary" disabled={!password || busy != null} onClick={reconnect}>
                <CloudUpload size={15} /> Sign in again
              </Button>
            ) : (
              /*
                Syncing is automatic now, so this is not how data gets to the
                server. It is here for the moment when someone wants to see it
                happen rather than trust that it did.
              */
              <Button
                variant="ghost"
                disabled={busy != null || conflicted}
                onClick={() => engine?.request("now")}
              >
                <RefreshCw size={15} /> Sync now
              </Button>
            )}
            {/*
              A hosted build signs out from the header and from its own card,
              which also clear this browser's copy. Leaving this one here would
              be a second way to leave that does less, sitting next to the first.
            */}
            {!accountRequired() && (
              <Button variant="ghost" disabled={busy != null} onClick={disconnect}>
                <CloudOff size={15} /> Sign out
              </Button>
            )}
          </>
        )}
      </div>

      <SyncLine busy={busy} error={error} />
    </Card>
  );
}

/**
 * One quiet line rather than a spinner.
 *
 * Automatic sync is only pleasant if it is not constantly announcing itself, so
 * the ordinary states say little and the two that need a person, offline and
 * failure, say what happened in words rather than in a state name.
 */
function SyncLine({ busy, error }: { busy: string | null; error: string | null }) {
  const status = useSyncState((s) => s.status);
  const connected = useSyncState((s) => s.key != null);

  if (error) return <p className="text-[12.5px] text-[var(--rose)]">{error}</p>;
  if (busy) return <p className="text-[12.5px] text-[var(--muted)]">{busy}...</p>;
  if (!connected) return null;

  const tone =
    status.phase === "error" || status.phase === "conflict"
      ? "text-[var(--rose)]"
      : "text-[var(--faint)]";

  return (
    <p className={`flex items-center gap-1.5 text-[12px] ${tone}`}>
      {status.phase === "syncing" && <RefreshCw size={12} className="animate-spin" />}
      {(status.phase === "offline" || status.phase === "error") && <TriangleAlert size={12} />}
      <span>
        {status.message}
        {status.lastSyncedAt != null && status.phase === "idle" && (
          <> Last agreed with the server {formatDateTime(status.lastSyncedAt)}.</>
        )}
      </span>
    </p>
  );
}
