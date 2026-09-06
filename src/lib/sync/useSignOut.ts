"use client";

/**
 * Leaving, wherever the control happens to be.
 *
 * A hook rather than a component, because there is no one right place for the
 * button and there never was. The header ran out of room on a phone, and the
 * settings card is somewhere you have to go looking. What must not vary is the
 * order of operations in `signOut`, so that lives in one function and this
 * gives every caller the same one.
 */

import { useState } from "react";
import { useStore } from "@/lib/store";
import { HOSTED, accountRequired } from "./hosted";
import { describeRefusal, signOut } from "./signout";
import { useSyncState } from "./state";

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
