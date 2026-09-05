"use client";

/**
 * The password, once, on arrival.
 *
 * Signing in on the login page proves who you are and nothing more. That page
 * derives only the auth half of the password, deliberately, because it is a
 * sign-in form and has no business holding a key to somebody's dose history.
 * So the app can come up authenticated and still unable to read anything the
 * server sends it.
 *
 * That gap has existed since the login page was written, and went unnoticed
 * because the only way in was the panel in Settings, which asks for the
 * password and derives both halves. Signing out made the login page the normal
 * way in, and the result was an app that looked signed in, synced nothing, and
 * offered no clue: the fix was to open Settings and type a password into a card
 * headed "Sync to your own server", which nobody would think to do.
 *
 * So it is asked for here instead, in front of the app, in one field. It also
 * makes what is happening true rather than mysterious: the password is the key,
 * this browser does not have it yet, and nothing can be read until it does.
 */

import { useState } from "react";
import { KeyRound, Unlock } from "lucide-react";
import { Button, TextInput } from "./ui";
import { useStore } from "@/lib/store";
import { cryptoAvailable, login, SyncError } from "@/lib/sync/client";
import { HOSTED, accountRequired } from "@/lib/sync/hosted";
import { useSyncState } from "@/lib/sync/state";
import { needsUnlock } from "@/lib/sync/unlock";
import { rememberKey } from "@/lib/sync/vault";

export function UnlockGate() {
  const hydrated = useStore((s) => s.hydrated);
  const session = useSyncState((s) => s.session);
  const key = useSyncState((s) => s.key);
  const setKey = useSyncState((s) => s.setKey);

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const show = needsUnlock({
    required: accountRequired(),
    signedIn: session != null,
    hasKey: key != null,
    canEncrypt: cryptoAvailable(),
    hydrated,
  });
  if (!show || !session || !HOSTED) return null;

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      /*
       * The same call the panel makes. It signs in again as well as deriving,
       * which is not waste: it renews the cookie and, more usefully, it is what
       * tells a wrong password from a right one. Deriving alone would produce a
       * key that decrypts nothing and report no error until the first sync.
       */
      const derived = await login(HOSTED!.url, session!.username, password);
      await rememberKey(derived);
      setKey(derived);
      setPassword("");
    } catch (err) {
      setError(err instanceof SyncError ? err.message : "Could not unlock. See the console.");
      if (!(err instanceof SyncError)) console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-title"
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--canvas)]/95 p-4 backdrop-blur-sm"
    >
      <form
        className="w-full max-w-sm space-y-4 rounded-[var(--r-card)] bg-[var(--card)] p-5 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        <div className="flex items-center gap-2.5">
          <KeyRound size={18} className="text-[var(--muted)]" />
          <h2 id="unlock-title" className="text-[17px] font-semibold text-[var(--ink)]">
            Unlock your data
          </h2>
        </div>

        <p className="text-[13px] leading-relaxed text-[var(--muted)]">
          Signed in as <span className="font-medium text-[var(--ink)]">{session.username}</span>.
          Your data is encrypted, and your password is the key. This browser needs it once before
          anything can be read.
        </p>

        <TextInput
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="Password"
          autoFocus
        />

        {error && <p className="text-[12.5px] text-[var(--rose)]">{error}</p>}

        <Button
          type="submit"
          variant="primary"
          className="w-full justify-center"
          disabled={busy || !password}
        >
          <Unlock size={15} /> {busy ? "Unlocking..." : "Unlock"}
        </Button>

        <p className="text-[12px] text-[var(--faint)]">
          It takes a moment. Turning a password into a key is deliberately slow, which is what makes
          it worth guessing at only once.
        </p>
      </form>
    </div>
  );
}
