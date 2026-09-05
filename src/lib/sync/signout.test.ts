import { describe, expect, it } from "vitest";
import { describeRefusal, refusalFor } from "./signout";

/**
 * The rule that decides whether a browser may be wiped.
 *
 * Worth its own tests because both ways of getting it wrong are bad, and they
 * are bad in opposite directions: too strict and somebody is stuck signed in on
 * a shared machine, too loose and a day of logging is erased to log them out of
 * a website.
 */
describe("when signing out may clear this browser", () => {
  it("allows it once the server has everything", () => {
    expect(refusalFor("idle")).toBeNull();
  });

  it("allows it when there was nothing to sync in the first place", () => {
    expect(refusalFor("off")).toBeNull();
  });

  it("refuses while the server cannot be reached", () => {
    // The latest changes exist only here. Clearing would be the loss.
    expect(refusalFor("offline")).toEqual({ ok: false, reason: "unreachable" });
  });

  it("refuses while a conflict is unanswered", () => {
    // Both sides moved. Clearing answers the question in the direction that
    // discards the work done on this device.
    expect(refusalFor("conflict")).toEqual({ ok: false, reason: "unsent" });
  });

  it("refuses after a failed run, which cannot claim the server has everything", () => {
    expect(refusalFor("error")).toEqual({ ok: false, reason: "unsent" });
  });

  it("refuses an expired session, and says something different about it", () => {
    // Waiting for the status line would be waiting forever. The instruction has
    // to be to sign in again.
    const r = refusalFor("signedout");
    expect(r).toEqual({ ok: false, reason: "expired" });
    expect(describeRefusal(r!)).toMatch(/sign in again/i);
  });

  it("tells each refusal apart, and says what to do about it", () => {
    // Three different problems with three different ways out. One message for
    // all of them would leave somebody trying the wrong one.
    const said = (["unsent", "unreachable", "expired"] as const).map((reason) =>
      describeRefusal({ ok: false, reason }));

    expect(new Set(said).size).toBe(3);
    expect(said[0]).toMatch(/wait|answer/i);
    expect(said[1]).toMatch(/online/i);
    expect(said[2]).toMatch(/sign in again/i);
  });
});
