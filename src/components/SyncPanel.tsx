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
import { useLang } from "@/lib/i18n";
import { ConflictChoices } from "./SyncNotice";

export function SyncPanel() {
  const { t } = useLang();
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
      setError(err instanceof SyncError ? err.message : t("sync_went_wrong"));
      if (!(err instanceof SyncError)) console.error(err);
    } finally {
      setBusy(null);
    }
  }

  const connect = (mode: "login" | "register") =>
    run(mode === "register" ? t("sync_creating_account") : t("sync_signing_in"), async () => {
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
    run(t("sync_signing_in"), async () => {
      const derived = await login(url, username, password);
      setKeyIsRemembered(await rememberKey(derived));
      setKey(derived);
      setPassword("");
      engine?.request("now");
    });

  const disconnect = () =>
    run(t("sync_signing_out"), async () => {
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
      <SectionLabel>{t("sync_own_server")}</SectionLabel>

      {HOSTED ? (
        <Callout tone="info" title={t("sync_one_server")}>
          {t("sync_hosted_promise")}
        </Callout>
      ) : (
        <Callout tone="info" title={t("sync_prototype")}>
          {t("sync_promise")}
        </Callout>
      )}

      {!canEncrypt && (
        <Callout tone="danger" title={t("sync_not_available_here")}>
          {t("sync_insecure_origin")}
        </Callout>
      )}

      {expired && (
        <Callout tone="warn" title={t("sync_session_expired")}>
          <p>
            {t("sync_expired_explain")}
          </p>
        </Callout>
      )}

      {connected && !keyIsRemembered && (
        <Callout tone="warn" title={t("sync_reload_warning")}>
          {t("sync_key_not_kept")}
        </Callout>
      )}

      {/*
        The one decision the engine will not make. Both sides changed, so either
        answer discards something, and which something is not for code to pick.
      */}
      {conflicted && (
        <Callout tone="danger" title={t("sync_both_changed")}>
          <p>
            {t("sync_conflict_explain")}
          </p>
          {/* One implementation, used here and in the frame. Two would drift. */}
          <ConflictChoices />
        </Callout>
      )}

      {HOSTED ? (
        <p className="text-[12.5px] text-[var(--muted)]">
          {t("sync_server_label")} <span className="font-mono text-[var(--text)]">{HOSTED.url}</span>
        </p>
      ) : (
        <Field
          label={t("sync_server_address")}
          hint={t("sync_server_hint")}
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
        <Field label={t("sync_username")}>
          <TextInput
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            disabled={connected}
          />
        </Field>
        <Field
          label={t("sync_password")}
          hint={
            expired
              ? t("sync_password_expired_hint")
              : connected
                ? t("sync_password_connected_hint")
                : t("sync_password_new_hint")
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
          label={t("sync_setup_token")}
          hint={t("sync_setup_token_hint")}
        >
          <TextInput
            value={setupToken}
            onChange={(e) => setSetupToken(e.target.value)}
            placeholder={t("sync_setup_token_placeholder")}
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
              <CloudUpload size={15} /> {t("sync_sign_in_plain")}
            </Button>
            {/*
              Two clicks to register rather than one. The first reveals the token
              field, which is also the moment to notice that a server with an
              account on it will refuse anyway.
            */}
            {!HOSTED &&
              (!registering ? (
                <Button disabled={!canEncrypt} onClick={() => setRegistering(true)}>
                  {t("sync_setup_new")}
                </Button>
              ) : (
                <Button
                  disabled={
                    !canEncrypt || !url || !username || !password || !setupToken || busy != null
                  }
                  onClick={() => connect("register")}
                >
                  {t("sync_create_account")}
                </Button>
              ))}
          </>
        ) : (
          <>
            {expired ? (
              <Button variant="primary" disabled={!password || busy != null} onClick={reconnect}>
                <CloudUpload size={15} /> {t("sync_sign_in_again")}
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
                <RefreshCw size={15} /> {t("sync_now")}
              </Button>
            )}
            {/*
              A hosted build signs out from the header and from its own card,
              which also clear this browser's copy. Leaving this one here would
              be a second way to leave that does less, sitting next to the first.
            */}
            {!accountRequired() && (
              <Button variant="ghost" disabled={busy != null} onClick={disconnect}>
                <CloudOff size={15} /> {t("sync_sign_out")}
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
  const { t } = useLang();
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
          <> {t("sync_last_agreed", { when: formatDateTime(status.lastSyncedAt) })}</>
        )}
      </span>
    </p>
  );
}
