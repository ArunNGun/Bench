import { describe, expect, it } from "vitest";
import { deriveKeys, isSealedEnvelope, open, seal, type SealedEnvelope } from "./crypto";

/**
 * Deliberately far below the production count. These tests are about whether
 * the construction is right, not how slow it is, and 600k iterations per
 * derivation would put this file into the tens of seconds.
 */
const FAST = 1000;

const SALT = btoa("sixteen bytes ok");
const OTHER_SALT = btoa("a different salt");

describe("deriveKeys", () => {
  it("gives the same keys for the same password and salt", async () => {
    const a = await deriveKeys("correct horse", SALT, FAST);
    const b = await deriveKeys("correct horse", SALT, FAST);
    expect(a.authSecret).toBe(b.authSecret);

    // Same data key too, which is what makes a second device able to read what
    // the first one wrote.
    const sealed = await seal({ hello: "world" }, a.dataKey);
    await expect(open(sealed, b.dataKey)).resolves.toEqual({ hello: "world" });
  });

  it("gives different keys for a different password", async () => {
    const a = await deriveKeys("correct horse", SALT, FAST);
    const b = await deriveKeys("correct horst", SALT, FAST);
    expect(a.authSecret).not.toBe(b.authSecret);
  });

  it("gives different keys for a different salt, so two accounts never collide", async () => {
    const a = await deriveKeys("correct horse", SALT, FAST);
    const b = await deriveKeys("correct horse", OTHER_SALT, FAST);
    expect(a.authSecret).not.toBe(b.authSecret);
  });

  /**
   * The point of the whole construction. The server is handed the auth secret
   * on every login, so if that value were the key, or could produce it, the
   * server could read everything.
   */
  it("hands the server a secret that cannot decrypt anything", async () => {
    const { authSecret, dataKey } = await deriveKeys("correct horse", SALT, FAST);
    const sealed = await seal({ doses: [1, 2, 3] }, dataKey);

    // Everything the server ever sees, in one object.
    const whatTheServerHas = { authSecret, salt: SALT, envelope: sealed };

    const impostor = await crypto.subtle.importKey(
      "raw",
      Uint8Array.from(
        whatTheServerHas.authSecret.match(/../g)!.map((h) => parseInt(h, 16))),
      { name: "AES-GCM" },
      false,
      ["decrypt"]);

    await expect(open(whatTheServerHas.envelope, impostor)).rejects.toThrow();
  });

  it("does not let the data key be read back out", async () => {
    const { dataKey } = await deriveKeys("correct horse", SALT, FAST);
    expect(dataKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", dataKey)).rejects.toThrow();
  });
});

describe("seal and open", () => {
  it("round trips a whole app payload", async () => {
    const { dataKey } = await deriveKeys("pw", SALT, FAST);
    const payload = {
      version: 7,
      profiles: [{ id: "me", name: "Me" }],
      logs: [{ id: "a", at: 1_700_000_000_000, doseMcg: 1000 }],
      settings: { currency: "EUR" },
    };
    expect(await open(await seal(payload, dataKey), dataKey)).toEqual(payload);
  });

  it("never reuses an iv", async () => {
    const { dataKey } = await deriveKeys("pw", SALT, FAST);
    const ivs = new Set<string>();
    for (let i = 0; i < 50; i++) ivs.add((await seal({ i }, dataKey)).iv);
    expect(ivs.size).toBe(50);
  });

  it("produces different ciphertext for the same input, so repeats are not visible", async () => {
    const { dataKey } = await deriveKeys("pw", SALT, FAST);
    const a = await seal({ same: true }, dataKey);
    const b = await seal({ same: true }, dataKey);
    expect(a.ct).not.toBe(b.ct);
  });

  it("fails on the wrong password rather than returning rubbish", async () => {
    const right = await deriveKeys("right", SALT, FAST);
    const wrong = await deriveKeys("wrong", SALT, FAST);
    const sealed = await seal({ secret: 1 }, right.dataKey);
    await expect(open(sealed, wrong.dataKey)).rejects.toThrow();
  });

  it("detects a tampered payload, one flipped character is enough", async () => {
    const { dataKey } = await deriveKeys("pw", SALT, FAST);
    const sealed = await seal({ doseMcg: 1000 }, dataKey);

    const chars = [...sealed.ct];
    chars[4] = chars[4] === "A" ? "B" : "A";
    const tampered: SealedEnvelope = { ...sealed, ct: chars.join("") };

    await expect(open(tampered, dataKey)).rejects.toThrow();
  });

  it("refuses an envelope version it does not know", async () => {
    const { dataKey } = await deriveKeys("pw", SALT, FAST);
    const sealed = await seal({ a: 1 }, dataKey);
    await expect(open({ ...sealed, v: 99 }, dataKey)).rejects.toThrow(/version/i);
  });

  it("records the iteration count, so raising it later does not strand old data", async () => {
    const { dataKey } = await deriveKeys("pw", SALT, FAST);
    const sealed = await seal({ a: 1 }, dataKey);
    expect(sealed.kdf.name).toBe("PBKDF2");
    expect(sealed.kdf.iterations).toBeGreaterThan(0);
  });
});

describe("isSealedEnvelope", () => {
  it("accepts what seal produces", async () => {
    const { dataKey } = await deriveKeys("pw", SALT, FAST);
    expect(isSealedEnvelope(await seal({ a: 1 }, dataKey))).toBe(true);
  });

  it("rejects anything else that might arrive over the wire", () => {
    for (const junk of [null, undefined, 1, "text", {}, { v: 1 }, { iv: "a", ct: "b" }, []]) {
      expect(isSealedEnvelope(junk)).toBe(false);
    }
  });
});
