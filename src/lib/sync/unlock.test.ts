import { describe, expect, it } from "vitest";
import { needsUnlock, type UnlockInputs } from "./unlock";

const arrived = (over: Partial<UnlockInputs> = {}): UnlockInputs => ({
  required: true,
  signedIn: true,
  hasKey: false,
  canEncrypt: true,
  hydrated: true,
  ...over,
});

describe("signed in and still unable to read anything", () => {
  it("asks after signing in on the login page", () => {
    // That page proves who you are and deliberately derives no data key, so the
    // app arrives authenticated and unable to decrypt a thing.
    expect(needsUnlock(arrived())).toBe(true);
  });

  it("says nothing once a key is present", () => {
    expect(needsUnlock(arrived({ hasKey: true }))).toBe(false);
  });

  it("says nothing to somebody the server does not know", () => {
    // A key with no session is an expired cookie, which is a different problem
    // with a different answer, and a password field here would not fix it.
    expect(needsUnlock(arrived({ signedIn: false }))).toBe(false);
  });

  it("never appears in an ordinary build", () => {
    expect(needsUnlock(arrived({ required: false }))).toBe(false);
  });

  it("waits for the store rather than flashing", () => {
    expect(needsUnlock(arrived({ hydrated: false }))).toBe(false);
  });

  it("does not offer a form that cannot succeed", () => {
    // No WebCrypto means no key can be derived at all. The sync panel explains
    // that in words, which is more use than a field that always fails.
    expect(needsUnlock(arrived({ canEncrypt: false }))).toBe(false);
  });
});
