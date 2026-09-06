import { describe, expect, it } from "vitest";
import {
  FIRST_LOCK_MS,
  INVITE_DAYS,
  MAX_FAILURES,
  MAX_LOCK_MS,
  ORIGIN_FALLBACK,
  WINDOW_MS,
  allowedOrigin,
  clearGate,
  countFailure,
  emptyGate,
  gateOf,
  inviteExpiry,
  inviteProblem,
  lockMs,
  lockedFor,
  parseOrigins,
  retryAfterSeconds,
  usernameOk,
} from "./policy.mjs";

const NOW = Date.UTC(2026, 8, 5, 12, 0, 0);

describe("which origins may call the server", () => {
  it("takes a list, since there is a real domain and a laptop on the LAN", () => {
    expect(parseOrigins("https://bench.wtf.si,http://192.168.1.44:3210")).toEqual([
      "https://bench.wtf.si",
      "http://192.168.1.44:3210",
    ]);
  });

  it("forgives the spaces people put after commas", () => {
    expect(parseOrigins("https://a.example, https://b.example")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("falls back rather than allowing nothing at all", () => {
    expect(parseOrigins("")).toEqual([ORIGIN_FALLBACK]);
    expect(parseOrigins(undefined)).toEqual([ORIGIN_FALLBACK]);
    expect(parseOrigins(",  ,")).toEqual([ORIGIN_FALLBACK]);
  });

  it("hands a known caller its own address back", () => {
    const list = ["https://bench.wtf.si", "http://192.168.1.44:3210"];
    expect(allowedOrigin(list, "http://192.168.1.44:3210")).toBe("http://192.168.1.44:3210");
  });

  it("never echoes an origin that is not on the list", () => {
    // Echoing whatever arrives is the same as having no list at all.
    const list = ["https://bench.wtf.si"];
    expect(allowedOrigin(list, "https://evil.example")).toBe("https://bench.wtf.si");
  });

  it("answers something harmless when there is no Origin header", () => {
    // Same-origin, or not a browser. CORS has nothing to say about either.
    expect(allowedOrigin(["https://bench.wtf.si"], undefined)).toBe("https://bench.wtf.si");
  });
});

describe("guessing a password", () => {
  it("treats an account file written before any of this as clean", () => {
    expect(gateOf({ username: "old" })).toEqual(emptyGate());
    expect(gateOf(null)).toEqual(emptyGate());
  });

  it("counts failures without locking, up to the limit", () => {
    let gate = emptyGate();
    for (let i = 1; i < MAX_FAILURES; i++) {
      gate = countFailure(gate, NOW + i * 1000);
      expect(gate.failures).toBe(i);
      expect(lockedFor(gate, NOW + i * 1000)).toBe(0);
    }
  });

  it("shuts the account once the limit is reached", () => {
    let gate = emptyGate();
    for (let i = 0; i < MAX_FAILURES; i++) gate = countFailure(gate, NOW + i * 1000);

    expect(gate.lockCount).toBe(1);
    expect(lockedFor(gate, NOW)).toBe(FIRST_LOCK_MS + (MAX_FAILURES - 1) * 1000);
  });

  it("opens again by itself, because a permanent lock is a way to delete an account", () => {
    let gate = emptyGate();
    for (let i = 0; i < MAX_FAILURES; i++) gate = countFailure(gate, NOW);

    expect(lockedFor(gate, NOW + FIRST_LOCK_MS - 1)).toBeGreaterThan(0);
    expect(lockedFor(gate, NOW + FIRST_LOCK_MS)).toBe(0);
  });

  it("forgets a failure that is old enough", () => {
    // Four typos on Monday and four on Friday is not an attack.
    let gate = emptyGate();
    for (let i = 0; i < 4; i++) gate = countFailure(gate, NOW);
    expect(gate.failures).toBe(4);

    gate = countFailure(gate, NOW + WINDOW_MS + 1);
    expect(gate.failures).toBe(1);
  });

  it("does not hand out a fresh set of attempts after a lock expires", () => {
    let gate = emptyGate();
    for (let i = 0; i < MAX_FAILURES; i++) gate = countFailure(gate, NOW);

    // Wait it out, then start again. The second lock arrives just as fast and
    // lasts twice as long.
    const later = NOW + FIRST_LOCK_MS + 1;
    for (let i = 0; i < MAX_FAILURES; i++) gate = countFailure(gate, later);

    expect(gate.lockCount).toBe(2);
    expect(lockedFor(gate, later)).toBe(FIRST_LOCK_MS * 2);
  });

  it("doubles the lock and then stops doubling", () => {
    expect(lockMs(1)).toBe(FIRST_LOCK_MS);
    expect(lockMs(2)).toBe(FIRST_LOCK_MS * 2);
    expect(lockMs(3)).toBe(FIRST_LOCK_MS * 4);
    expect(lockMs(99)).toBe(MAX_LOCK_MS);
    // 2 ** 1000 is Infinity, and Infinity must not become the lock.
    expect(lockMs(1001)).toBe(MAX_LOCK_MS);
  });

  it("clears everything on the right password, suspicion included", () => {
    let gate = emptyGate();
    for (let i = 0; i < MAX_FAILURES; i++) gate = countFailure(gate, NOW);
    expect(gate.lockCount).toBe(1);

    expect(clearGate()).toEqual(emptyGate());
  });

  it("rounds Retry-After up and never says zero", () => {
    expect(retryAfterSeconds(1)).toBe(1);
    expect(retryAfterSeconds(1500)).toBe(2);
    expect(retryAfterSeconds(0)).toBe(1);
  });
});

describe("invitations", () => {
  const invite = (over = {}) => ({
    id: "i1",
    username: "tofs",
    expiresAt: NOW + 86_400_000,
    usedAt: null,
    ...over,
  });

  it("is good when it is unused, unexpired and for this name", () => {
    expect(inviteProblem(invite(), "tofs", NOW)).toBeNull();
  });

  it("cannot be used twice", () => {
    expect(inviteProblem(invite({ usedAt: NOW - 1000 }), "tofs", NOW)).toMatch(/already been used/);
  });

  it("stops working, so a link left in a chat is not a standing door", () => {
    expect(inviteProblem(invite({ expiresAt: NOW }), "tofs", NOW)).toMatch(/expired/);
    expect(inviteProblem(invite({ expiresAt: NOW + 1 }), "tofs", NOW)).toBeNull();
  });

  it("only makes the account it was written for", () => {
    // So a token read over someone's shoulder cannot become a different name.
    expect(inviteProblem(invite(), "someone-else", NOW)).toMatch(/different username/);
  });

  it("says so when there is nothing to check", () => {
    expect(inviteProblem(null, "tofs", NOW)).toMatch(/does not exist/);
  });

  it("lasts a week unless told otherwise", () => {
    expect(inviteExpiry(NOW)).toBe(NOW + INVITE_DAYS * 86_400_000);
    expect(inviteExpiry(NOW, 1)).toBe(NOW + 86_400_000);
    expect(inviteExpiry(NOW, 0)).toBe(NOW + INVITE_DAYS * 86_400_000);
  });
});

describe("usernames", () => {
  it("accepts the ordinary ones", () => {
    expect(usernameOk("tofs")).toBe(true);
    expect(usernameOk("ana.novak")).toBe(true);
    expect(usernameOk("user_1")).toBe(true);
    expect(usernameOk("a1")).toBe(true);
  });

  it("refuses anything that would be a surprise as a filename", () => {
    expect(usernameOk("../etc/passwd")).toBe(false);
    expect(usernameOk("a b")).toBe(false);
    expect(usernameOk(".hidden")).toBe(false);
    expect(usernameOk("")).toBe(false);
    expect(usernameOk("a")).toBe(false);
    expect(usernameOk("x".repeat(33))).toBe(false);
    expect(usernameOk(null)).toBe(false);
  });

  it("refuses capitals, so two names cannot look the same on disk", () => {
    expect(usernameOk("Tofs")).toBe(false);
  });
});
