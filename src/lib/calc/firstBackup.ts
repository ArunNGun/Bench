/**
 * Whether somebody has to be stopped and told, before they start.
 *
 * This exists for one arrangement only: a server run for several people, where
 * each account is sealed with its own password and nobody, the owner included,
 * holds a key to anybody else's. That is the property worth having, and it has
 * a consequence that has to be said out loud rather than discovered: there is
 * no password reset, and there cannot be one. Forget the password and the copy
 * on the server is ciphertext forever.
 *
 * A line in a settings panel is not enough for that. Somebody joining is going
 * to record months of doses before they ever open Settings, and by the time
 * they read it the sentence is about data they already have.
 *
 * So a hosted build stops once, at the start, and asks for a file. The file
 * itself is nearly empty on a new account and that is not the point. The point
 * is that the warning is read at the moment it can still be acted on, and that
 * the person has done the thing once and knows where the button is.
 *
 * It leans on `lastBackupAt` rather than a flag of its own. Anyone who has ever
 * saved a file has both the habit and the file, and inventing a second field to
 * ask them again would be a worse answer than reading the one that already
 * says so.
 */

export interface FirstBackupInputs {
  /** This build belongs to a server and an account is not optional. */
  required: boolean;
  /** A key is present, so there is somebody here to talk to. */
  signedIn: boolean;
  /** The store has loaded. Before this, everything looks absent. */
  hydrated: boolean;
  /**
   * The first sync run has finished.
   *
   * Without this the gate flashes on a second device: the store is empty for
   * the moment between signing in and the server's copy arriving, which looks
   * exactly like a new account until it does not.
   */
  settled: boolean;
  /** When a file was last saved, from `settings.lastBackupAt`. */
  lastBackupAt: number | undefined;
}

export function needsFirstBackup(o: FirstBackupInputs): boolean {
  if (!o.required || !o.signedIn || !o.hydrated || !o.settled) return false;
  return o.lastBackupAt == null;
}
