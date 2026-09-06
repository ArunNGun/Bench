import { describe, expect, it } from "vitest";
import { hostedFrom } from "./hosted";

describe("whether this build belongs to a server", () => {
  it("is nothing at all when no address was given", () => {
    // The ordinary build. Every screen behaves exactly as it did before.
    expect(hostedFrom(undefined, undefined)).toBeNull();
    expect(hostedFrom("", "1")).toBeNull();
    expect(hostedFrom("   ", "1")).toBeNull();
  });

  it("ignores a requirement with no address, rather than half obeying it", () => {
    // Requiring an account without saying where would lock the app behind a
    // sign-in it cannot offer.
    expect(hostedFrom(undefined, "1")).toBeNull();
  });

  it("takes the address and drops a trailing slash", () => {
    expect(hostedFrom("https://bench.example/", undefined)).toEqual({
      url: "https://bench.example",
      required: false,
    });
    expect(hostedFrom("  https://bench.example///  ", undefined)?.url).toBe("https://bench.example");
  });

  it("allows an address without a requirement, which is a real case", () => {
    // The server is filled in, and somebody who wants to use the app without an
    // account still can.
    expect(hostedFrom("https://bench.example", undefined)?.required).toBe(false);
    expect(hostedFrom("https://bench.example", "0")?.required).toBe(false);
    expect(hostedFrom("https://bench.example", "false")?.required).toBe(false);
  });

  it("accepts the ways people write yes", () => {
    for (const yes of ["1", "true", "TRUE", "yes", " Yes "]) {
      expect(hostedFrom("https://bench.example", yes)?.required).toBe(true);
    }
  });
});
