"use client";

/**
 * Talking to a Bench sync server.
 *
 * Every call goes out with credentials, because the session is an HttpOnly
 * cookie the browser holds and this code never sees. Nothing here knows what
 * is inside an envelope; encryption happened before it arrived and decryption
 * happens after it leaves.
 *
 * This file is the reason the "no network calls" claim has to change in any
 * build that includes it. It is the only place in the app that talks to
 * anything, and it is inert unless a server address has been configured.
 */

import { deriveKeys, isSealedEnvelope, open, seal, type SealedEnvelope } from "./crypto";

export interface StoredBlob {
  envelope: SealedEnvelope;
  updatedAt: number;
}

export class SyncError extends Error {}

/**
 * The server refused a write because its copy moved since we last read it.
 *
 * Its own type rather than a message, because it is the one failure the caller
 * must not treat as "try again in a minute". Retrying would either fail the
 * same way forever or, worse, succeed after a blind re-read and destroy the
 * edit made elsewhere. It carries the copy the server actually holds so the
 * person can be shown both and asked.
 */
export class SyncConflict extends SyncError {
  constructor(readonly current: StoredBlob | null) {
    super("This device and the server both changed. Choose which copy to keep.");
  }
}

/** Distinguishes "the network is down" from "the server said no". */
export class SyncOffline extends SyncError {}

/** True inside the Android build, where this whole feature is switched off. */
export function isNative() {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/**
 * Whether this page can do cryptography at all.
 *
 * `crypto.subtle` is exposed only in a secure context: https, or localhost and
 * 127.0.0.1. Open the app over plain http by IP address, which is what reaching
 * it from another machine on the network looks like, and it is simply absent.
 *
 * Worth its own check because the failure is otherwise a TypeError deep inside
 * key derivation, which tells the reader nothing about the actual problem.
 */
export function cryptoAvailable() {
  return typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";
}

function requireCrypto() {
  if (cryptoAvailable()) return;
  throw new SyncError(
    "This browser will not do encryption on an insecure address. Open the app over https, or on localhost, and try again.");
}

const trimSlash = (url: string) => url.replace(/\/+$/, "");

async function call(baseUrl: string, path: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${trimSlash(baseUrl)}${path}`, {
      ...init,
      credentials: "include",
      /*
       * Every one of these is a question about right now, so a cached answer is
       * a wrong answer. The service worker is told to keep away from /api/ as
       * well; this is the same instruction to the HTTP cache, and saying it
       * twice is cheap next to the failure it prevents, which is a device that
       * pushes cheerfully and never sees a change made anywhere else.
       */
      cache: "no-store",
      headers: { "content-type": "application/json", ...init.headers },
    });
  } catch {
    // A refused connection and a wrong address look the same from here, and
    // both mean the same thing to the person reading the status line. Typed as
    // offline so a background sync knows to wait and try again rather than to
    // announce a failure the person cannot act on.
    throw new SyncOffline("Could not reach the server. Check the address and that it is running.");
  }

  if (res.status === 204) return null;

  const body = await res.json().catch(() => null);

  if (res.status === 409) {
    const current = (body as { current?: StoredBlob | null } | null)?.current ?? null;
    throw new SyncConflict(current && isSealedEnvelope(current.envelope) ? current : null);
  }

  if (!res.ok) {
    throw new SyncError((body as { error?: string } | null)?.error ?? `Server said ${res.status}`);
  }
  return body;
}

/**
 * The salt has to be known before the password can be turned into keys, and it
 * lives on the server so that a second device derives the same ones. It is not
 * a secret; it exists to make two accounts with the same password produce
 * different keys.
 */
export async function fetchSalt(baseUrl: string, username: string): Promise<string> {
  const body = (await call(
    baseUrl,
    `/api/salt?username=${encodeURIComponent(username)}`)) as { salt: string } | null;
  if (!body?.salt) throw new SyncError("The server did not return a salt");
  return body.salt;
}

/**
 * Claim the one account this server allows.
 *
 * The setup token is printed in the server's log at startup and is only valid
 * while no account exists. It is what stops whoever finds the port first from
 * registering before you do.
 */
export async function register(
  baseUrl: string,
  username: string,
  password: string,
  setupToken: string) {
  requireCrypto();
  // A brand new account needs a salt that nothing has seen yet, so this one is
  // made here rather than fetched.
  const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const { authSecret, dataKey } = await deriveKeys(password, salt);
  await call(baseUrl, "/api/register", {
    method: "POST",
    body: JSON.stringify({ username, authSecret, salt, setupToken }),
  });
  return dataKey;
}

export async function login(baseUrl: string, username: string, password: string) {
  requireCrypto();
  const salt = await fetchSalt(baseUrl, username);
  const { authSecret, dataKey } = await deriveKeys(password, salt);
  await call(baseUrl, "/api/login", {
    method: "POST",
    body: JSON.stringify({ username, authSecret }),
  });
  // Held by the caller for the session and never written anywhere.
  return dataKey;
}

export async function logout(baseUrl: string) {
  await call(baseUrl, "/api/logout", { method: "POST" });
}

/** The stored blob, or null when the account has never uploaded anything. */
export async function fetchBlob(baseUrl: string): Promise<StoredBlob | null> {
  const body = (await call(baseUrl, "/api/data")) as StoredBlob | null;
  if (!body) return null;
  if (!isSealedEnvelope(body.envelope)) throw new SyncError("The server returned something unreadable");
  return body;
}

/**
 * `ifMatch` is the `updatedAt` this device believes is on the server, or null
 * for "nothing is stored yet". The server refuses the write if that is no
 * longer true, which surfaces here as a SyncConflict.
 */
export async function putBlob(baseUrl: string, blob: StoredBlob, ifMatch: number | null) {
  await call(baseUrl, "/api/data", { method: "PUT", body: JSON.stringify({ ...blob, ifMatch }) });
}

/** Encrypt here, upload the result. The server never holds the plain payload. */
export async function pushData(
  baseUrl: string,
  data: unknown,
  key: CryptoKey,
  updatedAt: number,
  ifMatch: number | null) {
  await putBlob(baseUrl, { envelope: await seal(data, key), updatedAt }, ifMatch);
}

/** Download, then decrypt here. A wrong password fails loudly rather than quietly. */
export async function pullData<T>(baseUrl: string, key: CryptoKey): Promise<{ data: T; updatedAt: number } | null> {
  const blob = await fetchBlob(baseUrl);
  if (!blob) return null;

  try {
    return { data: await open<T>(blob.envelope, key), updatedAt: blob.updatedAt };
  } catch {
    throw new SyncError(
      "The server's copy could not be decrypted. That usually means a different password was used to write it.");
  }
}
