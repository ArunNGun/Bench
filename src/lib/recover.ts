/**
 * Getting back in when the shell in the cache no longer matches the server.
 *
 * The failure, in the order it happens. Updates here are deliberately explicit:
 * the service worker caches per build id and the running app compares its own
 * id against `/version.json` and offers the choice, rather than swapping code
 * under somebody mid-session. The cache is therefore allowed to go on serving
 * the old document, which registers `/sw.js?v=<old id>`, which is the same URL
 * as before, so no new worker installs. All of that is intended.
 *
 * What was not intended is that a deploy takes the old build's files off the
 * server. Chunks are content-hashed and lazily loaded, so any chunk the old
 * shell had not already cached is, from the moment of the deploy, a 404. The
 * old webpack runtime asks for it by its old name, the request fails, and the
 * page is a client-side exception before it has drawn anything.
 *
 * That is the part that makes it serious: the way out, the update prompt, lives
 * inside the app that cannot boot. Reported as exactly that, a white screen and
 * `ChunkLoadError: Loading chunk 135 failed` on a deployment whose other chunk
 * had kept its hash and loaded fine.
 *
 * So this repairs it. Not by giving up on explicit updates, which are a good
 * decision, but by noticing that the shell is already broken and that there is
 * nothing left to protect: drop the caches, unregister the worker, reload once.
 *
 * Twice in ten minutes, and then it stops. If clearing the cache did not help,
 * the fault is on the server and reloading forever would turn one broken page
 * into a machine hammering it.
 */

/** Two attempts, then leave the error on screen where somebody can read it. */
export const RECOVERY_LIMIT = 2;
export const RECOVERY_WINDOW_MS = 10 * 60 * 1000;
export const RECOVERY_KEY = "bench-chunk-recovery";

/**
 * Whether this error is the shell asking for a file that is no longer there.
 *
 * Matched on the message as well as the name, because the same failure reaches
 * us under three different names depending on how the chunk was requested and
 * which browser is asking.
 */
export function isChunkError(name: unknown, message: unknown): boolean {
  const text = `${name ?? ""} ${message ?? ""}`;
  return (
    /ChunkLoadError/i.test(text) ||
    /Loading chunk \S+ failed/i.test(text) ||
    /Loading CSS chunk/i.test(text) ||
    /error loading dynamically imported module/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text)
  );
}

export interface RecoveryHistory {
  /** How many times this browser has already tried, inside the window. */
  n: number;
  /** When the first of those attempts was. */
  first: number;
}

export function readHistory(raw: string | null): RecoveryHistory {
  try {
    const v = JSON.parse(raw ?? "");
    const n = Number(v?.n);
    const first = Number(v?.first);
    if (Number.isFinite(n) && Number.isFinite(first)) return { n, first };
  } catch {
    // Nothing stored, or something else wrote here. Either way, start over.
  }
  return { n: 0, first: 0 };
}

/**
 * Whether to try again, and what to write down before doing so.
 *
 * The window restarts once it has passed, so a deploy next week is not refused
 * a repair because of one last month.
 */
export function recoveryPlan(
  history: RecoveryHistory,
  nowMs: number): { allow: boolean; next: RecoveryHistory } {
  const stale = history.first === 0 || nowMs - history.first > RECOVERY_WINDOW_MS;
  const n = stale ? 0 : history.n;
  if (n >= RECOVERY_LIMIT) return { allow: false, next: history };
  return { allow: true, next: { n: n + 1, first: stale ? nowMs : history.first } };
}

/**
 * The listener, as source, for an inline script in the document head.
 *
 * Inline and not a component, because by the time React could mount one the
 * chunk it needs may be the chunk that is missing. This runs before the app's
 * own code and is listening while it loads.
 *
 * Serialised from the real functions above rather than written out a second
 * time as a string. Two copies of a rule is how one of them gets fixed.
 */
export const RECOVERY_SCRIPT = `
(function(){
  var isChunkError = ${isChunkError.toString()};
  var readHistory = ${readHistory.toString()};
  var recoveryPlan = ${recoveryPlan.toString()};
  var RECOVERY_LIMIT = ${RECOVERY_LIMIT};
  var RECOVERY_WINDOW_MS = ${RECOVERY_WINDOW_MS};
  var KEY = ${JSON.stringify(RECOVERY_KEY)};

  function recover() {
    var plan;
    try {
      plan = recoveryPlan(readHistory(localStorage.getItem(KEY)), Date.now());
      if (!plan.allow) return;
      localStorage.setItem(KEY, JSON.stringify(plan.next));
    } catch (e) {
      // Storage refused, which is a browsing mode rather than a fault. One
      // attempt with no memory of it is better than none at all.
      plan = { allow: true };
    }

    var jobs = [];
    try {
      if (self.caches) {
        jobs.push(caches.keys().then(function (names) {
          return Promise.all(names.map(function (n) { return caches.delete(n); }));
        }));
      }
    } catch (e) {}
    try {
      if (navigator.serviceWorker) {
        jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister(); }));
        }));
      }
    } catch (e) {}

    var again = function () { location.reload(); };
    Promise.all(jobs).then(again, again);
  }

  addEventListener("error", function (e) {
    if (isChunkError(e && e.error && e.error.name, (e && e.message) || (e && e.error && e.error.message))) recover();
  });
  addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    if (isChunkError(r && r.name, r && r.message)) recover();
  });
})();
`;
