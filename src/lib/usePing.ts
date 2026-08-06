/**
 * usePing — unique install counter hook.
 *
 * On first mount it generates a UUID for this install (or reads the existing
 * one) and sends it to /api/ping. The server adds it to a HyperLogLog and
 * returns the current unique-install count.
 *
 * Offline / APK behaviour: if the fetch fails for any reason, the last count
 * stored in localStorage is used. The component that consumes this hook should
 * treat `null` as "not yet known" and hide the stat rather than showing zero.
 *
 * The UUID is stable per browser profile / Android WebView storage partition.
 * Clearing site data or reinstalling the APK generates a new one, which is
 * correct — it is a new install.
 */

import { useEffect, useState } from "react";

const UUID_KEY = "bench:install-id";
const COUNT_KEY = "bench:user-count";
const PING_URL = "/api/ping";

function getOrCreateUuid(): string {
  try {
    const stored = localStorage.getItem(UUID_KEY);
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(UUID_KEY, id);
    return id;
  } catch {
    // localStorage blocked (private browsing with strict settings, etc.).
    // Generate a ephemeral one — it won't be remembered, but the ping still
    // increments the counter for this visit.
    return crypto.randomUUID();
  }
}

function readCachedCount(): number | null {
  try {
    const v = localStorage.getItem(COUNT_KEY);
    const n = v != null ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function writeCachedCount(n: number) {
  try {
    localStorage.setItem(COUNT_KEY, String(n));
  } catch {
    // Ignore — storage quota or private mode.
  }
}

export interface PingResult {
  /** Total unique installs, or null while loading / if never fetched. */
  users: number | null;
  /** True if this is a new install (server had not seen this UUID before). */
  isNew: boolean;
}

export function usePing(): PingResult {
  const [users, setUsers] = useState<number | null>(readCachedCount);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      const userId = getOrCreateUuid();

      try {
        const res = await fetch(PING_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });

        if (!res.ok) return; // Server error — keep cached value.

        const data = await res.json();
        if (cancelled) return;

        if (typeof data.users === "number") {
          setUsers(data.users);
          writeCachedCount(data.users);
        }
        if (data.isNew) setIsNew(true);
      } catch {
        // Network offline or APK with no server — silently keep cached value.
      }
    }

    ping();
    return () => { cancelled = true; };
  }, []);

  return { users, isNew };
}
