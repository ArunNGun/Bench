"use client";

/**
 * Leaving, on a machine that is not necessarily yours.
 *
 * An ordinary copy of Bench has nothing to sign out of. A hosted one does, and
 * it creates a situation the app has never had before: a browser that one
 * person used and another person opens.
 *
 * Signing out used to mean forgetting the key and the server address. That is
 * enough to stop syncing and nowhere near enough to leave. The dose history
 * itself sits in IndexedDB in plain text and always has, because on a device
 * that belongs to one person there is nobody to hide it from. On a shared one
 * the next person opens the app and reads it, with no password asked for at
 * any point.
 *
 * So a hosted sign out clears the local copy as well. Which makes the order of
 * operations the whole of this file: anything unsent has to reach the server
 * before anything local is destroyed, and if it cannot, this must refuse and
 * say so rather than take the day's logging with it.
 */

import { wipeLocal } from "@/lib/store";
import { forgetKey } from "./vault";
import { logout } from "./client";
import { accountRequired } from "./hosted";
import type { SyncEngine } from "./engine";

export type SignOutRefusal =
  /** Changes are still waiting to go up, so nothing local may be cleared. */
  | { ok: false; reason: "unsent" }
  /** The server could not be reached at all, which is the same problem. */
  | { ok: false; reason: "unreachable" }
  /** The session ended by itself, so nothing can be sent until it is renewed. */
  | { ok: false; reason: "expired" };

export type SignOutResult = { ok: true } | SignOutRefusal;

/**
 * Whether the state the engine is in makes it unsafe to clear this browser.
 *
 * Pulled out as a function of the phase alone so the rule can be read and
 * tested without a server, a store or a browser, which is where the actual risk
 * lives: get this wrong in one direction and somebody stays signed in on a
 * shared machine, get it wrong in the other and a day of logging is erased to
 * log them out of a website.
 */
export function refusalFor(phase: string): SignOutRefusal | null {
  if (phase === "offline") return { ok: false, reason: "unreachable" };

  /*
   * Its own reason rather than folded into the one below. Refusing is right,
   * because nothing can be sent without a session, but telling somebody to
   * wait for the status line would leave them waiting forever. The way out is
   * to sign in again, which is a different instruction.
   */
  if (phase === "signedout") return { ok: false, reason: "expired" };

  /*
   * A conflict is unsent changes wearing a different hat. Both sides moved, so
   * this device holds an edit the server has never seen and the person has not
   * yet said which copy wins. Clearing would answer that for them, in the
   * direction that loses their work.
   *
   * An error is the same in the way that matters here: the last run did not
   * finish, so nothing can claim the server has everything.
   */
  if (phase === "conflict" || phase === "error") return { ok: false, reason: "unsent" };

  return null;
}

export function describeRefusal(r: SignOutRefusal): string {
  switch (r.reason) {
    case "unsent":
      return "Some changes have not reached the server yet, so signing out would take them with them. Wait for the status line to say it is up to date, or answer the question it is asking, and try again.";
    case "unreachable":
      return "The server cannot be reached, so your latest changes are still only on this device. Signing out now would lose them. Try again once you are back online.";
    case "expired":
      return "Your session has expired, so nothing can be sent up. Sign in again in Settings first, let it catch up, and then sign out.";
  }
}

/**
 * Send everything, then leave nothing behind.
 *
 * The order is deliberate and is the reason this is not written inline in two
 * components. Flush first, check it actually landed, and only then destroy.
 * The opposite order is one dropped connection away from erasing a day of
 * somebody's records to log them out of a website.
 */
export async function signOut(
  url: string,
  engine: SyncEngine | null): Promise<SignOutResult> {
  const hosted = accountRequired();

  if (hosted && engine) {
    // Not the quiet period. Whatever is pending goes now, because there is no
    // later: the next thing that happens is the store being emptied.
    await engine.flush();

    const refusal = refusalFor(engine.getStatus().phase);
    if (refusal) return refusal;
  }

  // From here nothing can fail in a way worth reporting. Each step is
  // independent, and a failure to reach a server we are leaving anyway is not
  // a reason to stay signed in.
  await logout(url).catch(() => undefined);
  await forgetKey();

  /*
   * The document and the rescue copy both go, and the rescue copy is the
   * subtle half. Everywhere else in the app it is a safety net. Here it would
   * be the previous person's dose history, offered to the next person who
   * signs in on this browser, by a notice built to be helpful.
   *
   * Safe to erase because of the check above: the server has confirmed it
   * holds all of it, and the person was made to keep a file of their own on
   * the day they joined.
   */
  if (hosted) await wipeLocal();

  return { ok: true };
}
