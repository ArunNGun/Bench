"use client";

/**
 * Where the data key waits between visits.
 *
 * Sync used to hold the key in a React component's state, which meant a reload
 * lost it and the password had to be typed again. That was tolerable while
 * syncing was a button you pressed. It is not tolerable once syncing is meant
 * to happen by itself, because the common case is a tab that has been reloaded
 * and a key that is gone, so nothing would be sent and nobody would be told.
 *
 * IndexedDB can hold a CryptoKey directly. The structured clone algorithm knows
 * the type, so the key is stored as a key rather than as bytes, and a key
 * derived with `extractable: false` stays unreadable: script on this origin can
 * ask it to encrypt, and cannot ask it what it is. Neither the raw key nor the
 * password is ever written down.
 *
 * What this does give away is that anyone who can run script on this origin, in
 * this browser profile, can decrypt the server's copy. Weigh that against what
 * is already true: the app's whole dataset sits in the same IndexedDB in plain
 * text, and always has. Someone with the browser open has already read the dose
 * history without needing the key at all. The key adds reach to the server copy
 * of the same data, and nothing else.
 *
 * What it protects against is unchanged, and is the point: the server holds
 * ciphertext, so whoever holds the server cannot read it.
 */

import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";

const VAULT_KEY = "bench-sync-datakey-v1";

/**
 * Whether a stored key can survive at all.
 *
 * Firefox in private browsing refuses IndexedDB outright, and a CryptoKey
 * cannot be structured-cloned in a few older engines. Both fail at write time
 * rather than at read time, which would leave sync quietly doing nothing, so
 * the write is checked and the caller told.
 */
export async function rememberKey(key: CryptoKey): Promise<boolean> {
  try {
    await idbSet(VAULT_KEY, key);
    // Read back rather than trust the write. A structured clone failure for an
    // unsupported type is the case this catches.
    return (await idbGet(VAULT_KEY)) instanceof CryptoKey;
  } catch {
    return false;
  }
}

/** The stored key, or null when there is none and the password must be asked for. */
export async function recallKey(): Promise<CryptoKey | null> {
  try {
    const stored = await idbGet(VAULT_KEY);
    return stored instanceof CryptoKey ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Signing out has to reach this, not just the component state.
 *
 * Forgetting it would leave a key behind for the next person to open the tab,
 * which is the one failure this file could introduce that the old in-memory
 * version could not.
 */
export async function forgetKey(): Promise<void> {
  try {
    await idbDel(VAULT_KEY);
  } catch {
    // Nothing useful to do. The key is unreadable either way, and reporting a
    // failed delete on the way out of the door helps nobody.
  }
}
