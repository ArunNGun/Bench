/**
 * The decisions the sync server makes, kept apart from the doing of them.
 *
 * `server.mjs` reads files, holds a socket and speaks HTTP, none of which is
 * pleasant to test. What is worth testing is the reasoning: whether an origin
 * may talk to us, whether a password has been guessed at too often, whether an
 * invitation is still good. Those are functions of their arguments and nothing
 * else, so they live here and have a test file beside them, the same way
 * `src/lib/calc` does for the app.
 *
 * No imports on purpose. This file is arithmetic and string comparison.
 */

// ---------------------------------------------------------------------------
// Who may call us
// ---------------------------------------------------------------------------

export const ORIGIN_FALLBACK = "http://localhost:3210";

/**
 * `BENCH_ORIGIN` used to name one address, which was wrong the moment the
 * server had two callers: the app on its real domain, and the same app served
 * from a laptop on the LAN while something is being worked on. One value meant
 * choosing which of the two was allowed to work.
 */
export function parseOrigins(value) {
  const list = String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : [ORIGIN_FALLBACK];
}

/**
 * The value to put in `access-control-allow-origin`.
 *
 * A caller we know gets its own address back, which is what lets the browser
 * proceed. Everyone else gets the first configured origin, which is a name that
 * is not theirs, so their browser refuses. Deliberately not the caller's own
 * address, since echoing whatever arrives is the same as having no list.
 *
 * A request with no `Origin` header is same-origin or is not a browser at all.
 * CORS has nothing to say about either, so the answer does not matter.
 */
export function allowedOrigin(origins, requestOrigin) {
  return requestOrigin && origins.includes(requestOrigin) ? requestOrigin : origins[0];
}

// ---------------------------------------------------------------------------
// How often a password may be guessed
// ---------------------------------------------------------------------------

/**
 * Every answer to a login attempt takes at least this long.
 *
 * Two jobs. It makes casual guessing cost real time rather than microseconds,
 * and it flattens the difference between a name that exists and one that does
 * not, which the constant-time hash comparison alone does not do: a missing
 * account skips the hash entirely and would otherwise answer noticeably faster.
 */
export const FLOOR_MS = 300;

/** Failures older than this stop counting, so an honest person is not punished forever. */
export const WINDOW_MS = 15 * 60_000;

/** Failures inside the window before the account is shut for a while. */
export const MAX_FAILURES = 8;

export const FIRST_LOCK_MS = 5 * 60_000;
export const MAX_LOCK_MS = 6 * 3_600_000;

export const emptyGate = () => ({
  failures: 0,
  lastFailureAt: 0,
  lockedUntil: 0,
  lockCount: 0,
});

/** An account file written before any of this existed has no gate. Treat it as clean. */
export function gateOf(account) {
  const g = account?.gate;
  if (!g) return emptyGate();
  return {
    failures: Number(g.failures) || 0,
    lastFailureAt: Number(g.lastFailureAt) || 0,
    lockedUntil: Number(g.lockedUntil) || 0,
    lockCount: Number(g.lockCount) || 0,
  };
}

/**
 * How long a repeat offender is shut out, doubling each time.
 *
 * Bounded at six hours rather than growing forever. A permanent lock would hand
 * anyone who knows a username the power to delete an account for good, and the
 * point is to make guessing too slow to be worth it, not to punish.
 */
export function lockMs(lockCount) {
  const n = Math.max(1, lockCount);
  return Math.min(FIRST_LOCK_MS * 2 ** (n - 1), MAX_LOCK_MS);
}

/** Milliseconds still to wait, or 0 when the account is open. */
export function lockedFor(gate, nowMs) {
  const until = gate?.lockedUntil ?? 0;
  return until > nowMs ? until - nowMs : 0;
}

/**
 * The gate after one wrong password.
 *
 * The count is a sliding window rather than a running total: quiet for long
 * enough and it starts again. Somebody who mistypes their password four times
 * on Monday and four times on Friday has not been under attack.
 *
 * Locking resets the count but keeps `lockCount`, so returning after the lock
 * expires does not buy a fresh set of free attempts.
 */
export function countFailure(gate, nowMs) {
  const g = gateOf({ gate });
  const stale = g.lastFailureAt > 0 && nowMs - g.lastFailureAt > WINDOW_MS;
  const failures = (stale ? 0 : g.failures) + 1;

  if (failures < MAX_FAILURES) {
    return { ...g, failures, lastFailureAt: nowMs };
  }

  const lockCount = g.lockCount + 1;
  return {
    failures: 0,
    lastFailureAt: nowMs,
    lockCount,
    lockedUntil: nowMs + lockMs(lockCount),
  };
}

/**
 * The gate after the right password.
 *
 * Everything clears, `lockCount` included. Whoever just proved they know the
 * password is the owner, and carrying yesterday's suspicion into their next
 * typo would only make the next lock arrive sooner for the wrong person.
 */
export const clearGate = () => emptyGate();

/** What `Retry-After` should say. Seconds, rounded up, never zero. */
export const retryAfterSeconds = (ms) => Math.max(1, Math.ceil(ms / 1000));

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export const INVITE_DAYS = 7;

export function inviteExpiry(nowMs, days = INVITE_DAYS) {
  return nowMs + Math.max(1, Number(days) || INVITE_DAYS) * 86_400_000;
}

/**
 * Why an invitation cannot be used, or null when it can.
 *
 * One message per reason rather than one for all of them. These are read by
 * someone the owner invited on purpose, sitting in front of a form that will
 * not let them in, and "invalid invitation" tells them nothing about whether to
 * ask for a new link or to check they opened the right one. The secrecy that
 * matters here is the token, which is never in the message.
 */
export function inviteProblem(invite, username, nowMs) {
  if (!invite) return "This invitation does not exist.";
  if (invite.usedAt) return "This invitation has already been used.";
  if (!(invite.expiresAt > nowMs)) return "This invitation has expired.";
  if (invite.username !== username) return "This invitation is for a different username.";
  return null;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/**
 * A username becomes a filename, so it is checked rather than trusted.
 *
 * `encodeURIComponent` already makes a path traversal impossible, and this is
 * the second lock: a short, boring set of characters, so that a name cannot be
 * confusable with another one on a case-insensitive filesystem or invisible in
 * a list.
 */
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

export const usernameOk = (u) => USERNAME_RE.test(String(u ?? ""));
