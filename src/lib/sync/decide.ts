/**
 * Which copy wins.
 *
 * One person on two devices does not need a merge algorithm, and a wrong merge
 * of a dose history is worse than a lost edit that can be seen and redone. So
 * the newer copy wins, and the decision is a pure function that can be reasoned
 * about without a server or a browser.
 *
 * The rule used to be a comparison of two timestamps, which was honest enough
 * while a person pressed a button and watched what happened. Automatic syncing
 * broke it twice over. Clocks on two devices disagree, so "newer" was never
 * reliable, and a background push that silently flattens an edit made on a
 * phone is not something anyone would notice until the data was gone.
 *
 * So nothing here compares clocks. It compares versions: the copy this device
 * last synced with against the copy the server holds now. Either they match, in
 * which case this device is the only one that has moved and may safely write,
 * or they do not, in which case somebody else wrote and the only safe answers
 * are to take their copy or to ask.
 */

export type SyncAction =
  /** Nothing on the server yet. Send what this device has. */
  | { kind: "push"; reason: "server-empty" }
  /** Only this device has moved since both sides last agreed. */
  | { kind: "push"; reason: "local-changed" }
  /** The server moved and this device has nothing unsent to lose. */
  | { kind: "pull"; reason: "server-changed" }
  /** This device holds nothing, so there is nothing to weigh against. */
  | { kind: "pull"; reason: "local-empty" }
  /** Both sides moved. Not a decision code should make on its own. */
  | { kind: "ask"; reason: "both-changed" }
  /** Never synced with this server, and both sides hold something. */
  | { kind: "ask"; reason: "first-contact" }
  /** Signing in to an account whose copy is the one that counts. */
  | { kind: "pull"; reason: "adopt-account" }
  /** Neither side has moved. */
  | { kind: "none"; reason: "in-step" }
  /** Two empty sides. Pushing would publish emptiness as though it were data. */
  | { kind: "none"; reason: "nothing-to-send" };

export interface SyncInput {
  /**
   * The `updatedAt` of the copy this device last agreed with, or null when it
   * has never synced with this server. This, not a clock reading, is what makes
   * the decision safe: it is a version, and versions from one server are
   * comparable in a way that timestamps from two devices are not.
   */
  remoteSeenAt: number | null;
  /** The `updatedAt` the server reports now, or null when it holds nothing. */
  remoteUpdatedAt: number | null;
  /** Whether this device has changes it has not sent. */
  dirty: boolean;
  /** Whether this device holds anything at all worth sending. */
  localEmpty: boolean;
  /**
   * Whether the account on the server is the copy that counts.
   *
   * True in a build made for a server that requires an account. It changes one
   * case and one only: the first contact between a browser and an account.
   *
   * On a copy of Bench that syncs to a server somebody set up for themselves,
   * two sides holding different data is a genuine question, because either one
   * could be the real history. Signing in to an account is not that question.
   * The account has a history, this browser has whatever was in it before,
   * and the reason somebody signed in is to see the account.
   *
   * It deliberately does not extend past that moment. Once the two have agreed
   * once, a device that has edits the server has not seen is holding work
   * somebody did, and "the server is primary" is not a reason to throw it away
   * without asking. Server wins at the start, device wins during.
   */
  serverPrimary?: boolean;
}

export function decideSync({
  remoteSeenAt,
  remoteUpdatedAt,
  dirty,
  localEmpty,
  serverPrimary = false,
}: SyncInput): SyncAction {
  if (remoteUpdatedAt == null) {
    /*
     * An empty device must not push to an empty server. It looks harmless and
     * is not: the server would then hold an empty document as the authoritative
     * copy, and the next device to connect would dutifully pull it and wipe
     * itself. A fresh install left running for a moment before the real device
     * connects is exactly how that happens.
     */
    return localEmpty
      ? { kind: "none", reason: "nothing-to-send" }
      : { kind: "push", reason: "server-empty" };
  }

  if (remoteSeenAt == null) {
    // Nothing has been agreed with this server yet, so there is no version to
    // compare against and no way to tell which side is the continuation of the
    // other. Taking the server's copy is only safe when there is nothing here.
    if (localEmpty) return { kind: "pull", reason: "local-empty" };

    /*
     * Where the account is the copy that counts, this is not a question.
     * Somebody signed in to see their account, and whatever this browser held
     * before was never part of it.
     *
     * Only when nothing is waiting to be sent, and that condition is the whole
     * lesson of the bug that followed the first version of this. `dirty` means
     * this device holds an edit nobody else has seen, made by somebody in this
     * session, seconds ago. Adopting over the top of that is not "the server is
     * primary", it is destroying work that was typed while the app was open.
     *
     * The leftovers this case exists for are not dirty: they were read from
     * IndexedDB at startup, not edited. So the narrow rule catches the case it
     * was written for and cannot reach the one it must never touch.
     */
    if (serverPrimary && !dirty) return { kind: "pull", reason: "adopt-account" };
    return { kind: "ask", reason: "first-contact" };
  }

  if (remoteUpdatedAt !== remoteSeenAt) {
    return dirty
      ? { kind: "ask", reason: "both-changed" }
      : { kind: "pull", reason: "server-changed" };
  }

  return dirty
    ? { kind: "push", reason: "local-changed" }
    : { kind: "none", reason: "in-step" };
}

/** What the status line says, in words rather than a state name. */
export function describeSync(action: SyncAction): string {
  switch (action.reason) {
    case "server-empty":
      return "Sending this device's data up for the first time.";
    case "local-changed":
      return "Sending this device's changes.";
    case "server-changed":
      return "Another device made changes. Taking them.";
    case "local-empty":
      return "Taking the copy from the server.";
    case "both-changed":
      return "This device and another one both changed. Choose which copy to keep.";
    case "first-contact":
      return "This device and the server both hold data. Choose which copy to keep.";
    case "adopt-account":
      return "Taking your account's data. What was in this browser before is set aside.";
    case "in-step":
      return "Up to date.";
    case "nothing-to-send":
      return "Nothing to sync yet.";
  }
}
