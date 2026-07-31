import { describe, expect, it } from "vitest";
import { RECHECK_AFTER_MS, shouldRecheck, updateAvailable } from "./update";

describe("updateAvailable", () => {
  it("offers an update when the ids differ", () => {
    expect(updateAvailable({ serverBuildId: "200", runningBuildId: "100" })).toBe(true);
  });

  it("stays quiet when they match", () => {
    expect(updateAvailable({ serverBuildId: "100", runningBuildId: "100" })).toBe(false);
  });

  it("stays quiet when the server could not be reached", () => {
    // Being offline is not evidence of an update, and prompting a reload to
    // someone with no connection would strand them.
    expect(updateAvailable({ serverBuildId: null, runningBuildId: "100" })).toBe(false);
  });

  it("stays quiet in a build with no id of its own", () => {
    // A dev build has nothing meaningful to compare, so it must not prompt on
    // every single page load.
    expect(updateAvailable({ serverBuildId: "200", runningBuildId: "dev" })).toBe(false);
  });

  it("offers an update even when the server id looks older", () => {
    // A rollback is still a change the running app needs to pick up, so the test
    // is inequality rather than "greater than".
    expect(updateAvailable({ serverBuildId: "100", runningBuildId: "200" })).toBe(true);
  });
});

describe("shouldRecheck", () => {
  const NOW = Date.UTC(2026, 6, 31, 12);

  it("checks when it never has", () => {
    expect(shouldRecheck(null, NOW)).toBe(true);
  });

  it("does not check again straight away", () => {
    expect(shouldRecheck(NOW - 60_000, NOW)).toBe(false);
    expect(shouldRecheck(NOW - (RECHECK_AFTER_MS - 1), NOW)).toBe(false);
  });

  it("checks again after long enough", () => {
    expect(shouldRecheck(NOW - RECHECK_AFTER_MS, NOW)).toBe(true);
  });

  it("is not frozen by a check timestamped in the future", () => {
    expect(shouldRecheck(NOW + 10 * RECHECK_AFTER_MS, NOW)).toBe(true);
  });
});
