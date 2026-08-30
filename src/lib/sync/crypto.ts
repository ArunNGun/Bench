/**
 * Keys and sealed envelopes for the self-hosted sync.
 *
 * One password does two jobs that must never be the same secret. The server has
 * to be able to say "this is you", and it must not be able to read anything. So
 * the password is stretched once into a master key, and two independent values
 * are derived from it:
 *
 *   auth secret   sent to the server, which stores only a hash of it
 *   data key      never leaves the browser, and is what encrypts the payload
 *
 * Deriving both from the same stretched key by different labels is what makes
 * the first safe to hand over. Knowing the auth secret tells you nothing about
 * the data key, because HKDF's outputs for different labels are independent.
 *
 * WebCrypto only, deliberately. This file adds no dependency to a project whose
 * whole point is that you can read what it does.
 */

/**
 * PBKDF2 rather than Argon2id, which would be the better choice and is not
 * available in WebCrypto. The iteration count is the OWASP figure for
 * PBKDF2-HMAC-SHA256 at the time of writing. It is stored in the envelope, so
 * raising it later does not strand data encrypted under the old one.
 */
export const PBKDF2_ITERATIONS = 600_000;

/** Envelope format version, so a future change can be recognised rather than guessed. */
export const ENVELOPE_VERSION = 1;

export interface SealedEnvelope {
  v: number;
  /** Base64. Per payload, never reused. */
  iv: string;
  /** Base64 AES-GCM ciphertext with its tag. */
  ct: string;
  /** Iterations the key was derived with, for forward compatibility. */
  kdf: { name: "PBKDF2"; iterations: number };
}

export interface DerivedKeys {
  /** Handed to the server at login. Hex, so it survives JSON without fuss. */
  authSecret: string;
  /** Stays here. Non-extractable, so it cannot be read back out of memory by script. */
  dataKey: CryptoKey;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * The salt is per account and comes from the server, which is why it is fetched
 * before the password is asked for. Deriving it from the username instead would
 * make two people with the same password share a key stream.
 */
export async function deriveKeys(
  password: string,
  saltB64: string,
  iterations = PBKDF2_ITERATIONS): Promise<DerivedKeys> {
  const salt = fromBase64(saltB64);

  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);

  // One expensive stretch, then two cheap and independent derivations from it.
  const masterBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    256);

  const master = await crypto.subtle.importKey("raw", masterBits, "HKDF", false, ["deriveBits", "deriveKey"]);

  const authBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: enc.encode("bench-sync/auth") },
    master,
    256);

  const dataKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: enc.encode("bench-sync/data") },
    master,
    { name: "AES-GCM", length: 256 },
    // Not extractable. Nothing in the app has any reason to read the raw key,
    // and refusing means a stray console.log cannot leak it.
    false,
    ["encrypt", "decrypt"]);

  return { authSecret: toHex(new Uint8Array(authBits)), dataKey };
}

/** Encrypt a value for storage on a server that is not trusted to read it. */
export async function seal(value: unknown, key: CryptoKey): Promise<SealedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(value)));

  return {
    v: ENVELOPE_VERSION,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ct)),
    kdf: { name: "PBKDF2", iterations: PBKDF2_ITERATIONS },
  };
}

/**
 * Decrypt an envelope.
 *
 * Throws on a wrong key or a tampered payload rather than returning something
 * plausible. AES-GCM authenticates, so a single flipped bit anywhere fails here
 * instead of quietly becoming a corrupt dose history.
 */
export async function open<T = unknown>(envelope: SealedEnvelope, key: CryptoKey): Promise<T> {
  if (envelope.v !== ENVELOPE_VERSION) {
    throw new Error(`Unknown envelope version ${envelope.v}`);
  }

  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope.iv) },
    key,
    fromBase64(envelope.ct));

  return JSON.parse(dec.decode(plain)) as T;
}

/** Shape check for something arriving over the wire, before it is trusted. */
export function isSealedEnvelope(v: unknown): v is SealedEnvelope {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<SealedEnvelope>;
  return typeof e.v === "number" && typeof e.iv === "string" && typeof e.ct === "string";
}
