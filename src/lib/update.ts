/**
 * Noticing that the server has a newer build than the one running.
 *
 * The app is offline-first: the service worker serves everything from cache, so a
 * deploy reaches nobody until they are told about it and agree. This is the
 * telling. One small request on start, comparing the build id baked into this
 * bundle against the one the server is publishing.
 *
 * Kept apart from the component so the comparison, which has more edge cases
 * than it looks, can be tested without a browser.
 */

/** Baked in at build time by next.config, from public/version.json. */
export const RUNNING_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

export interface UpdateCheck {
  /** The id the server is currently serving, or null if it could not be read. */
  serverBuildId: string | null;
  runningBuildId: string;
}

/**
 * Whether to offer an update.
 *
 * Every uncertain case resolves to "no". A failed fetch, an unparseable response,
 * a missing id, a development build, none of those are evidence that an update
 * exists, and prompting on any of them would mean offering a reload to someone
 * who is simply offline.
 */
export function updateAvailable({ serverBuildId, runningBuildId }: UpdateCheck): boolean {
  if (!serverBuildId) return false;
  // "dev" means the build skipped the version script; it has no id to compare.
  if (runningBuildId === "dev") return false;
  return serverBuildId !== runningBuildId;
}

/**
 * Ask the server what it is serving.
 *
 * `no-store` matters twice over: the HTTP cache would otherwise answer from a
 * previous response, and this must survive being asked repeatedly in a long PWA
 * session. The service worker separately refuses to intercept this path.
 */
export async function fetchServerBuildId(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch("/version.json", { cache: "no-store", signal });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const id = (body as { buildId?: unknown } | null)?.buildId;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    // Offline, or a captive portal returning something that is not our JSON.
    return null;
  }
}

/**
 * Throw away every cached asset and the worker, then reload onto the new build.
 *
 * Heavy-handed on purpose. Selectively refreshing a cache risks a page running
 * new HTML against old chunks, and the failure looks like a random broken screen
 * rather than a bad update. Only ever called after a successful version fetch, so
 * the network is known to be reachable and the reload cannot strand anyone.
 */
export async function applyUpdate(): Promise<void> {
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // Even if clearing fails, the reload below still fetches fresh HTML.
  }
  // Bypasses the bfcache and any in-memory copy of the old document.
  window.location.reload();
}

/** A resident PWA is rarely "started", so re-check when it comes back into view. */
export const RECHECK_AFTER_MS = 6 * 60 * 60_000;

export function shouldRecheck(lastCheckedAt: number | null, nowMs: number): boolean {
  if (lastCheckedAt == null) return true;
  const elapsed = nowMs - lastCheckedAt;
  // A clock that moved backwards should not freeze checking forever.
  return elapsed < 0 || elapsed >= RECHECK_AFTER_MS;
}
