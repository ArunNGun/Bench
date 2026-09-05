/**
 * Signed in, and still unable to read anything.
 *
 * The login page and the app need two different things from the same password.
 * The page needs the auth half, to prove who you are. The app needs the data
 * half, to decrypt what comes back. The page derives only the first, on purpose
 * and with a comment saying so: it is a sign-in form and has no business
 * holding a key to somebody's history.
 *
 * The consequence went unnoticed while the only way in was the panel in
 * Settings, which asks for the password and derives both. Signing out made the
 * login page the normal way in, and then the app came up authenticated,
 * synchronised with nothing, and silent. The way out was to go to Settings and
 * type the password into a card about syncing to your own server, which nobody
 * would guess.
 *
 * So the app asks, once, on arrival. That is the whole of this: a state worth
 * naming, and worth naming apart from being signed out, because the two look
 * identical from the outside and have completely different answers.
 */

export interface UnlockInputs {
  /** This build belongs to a server and an account is not optional. */
  required: boolean;
  /** The server knows who is asking, so there is an account to unlock. */
  signedIn: boolean;
  /** A key is already present, from this session or from the vault. */
  hasKey: boolean;
  /** WebCrypto is available. Without it no key can be derived at all. */
  canEncrypt: boolean;
  /** The store has loaded. */
  hydrated: boolean;
}

export function needsUnlock(o: UnlockInputs): boolean {
  if (!o.required || !o.hydrated) return false;
  /*
   * Both halves are required. Signed in without a key is the case this exists
   * for. A key without a session is an expired cookie, which the panel and the
   * banner already handle and which asking for a password here would not fix.
   */
  if (!o.signedIn || o.hasKey) return false;
  /*
   * Nothing can be derived on an insecure origin, so asking would produce a
   * form that cannot succeed. The sync panel already explains that case in
   * words, which is more use than a password field that fails.
   */
  return o.canEncrypt;
}
