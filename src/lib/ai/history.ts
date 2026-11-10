/**
 * Chat history stored in IndexedDB under its own key, separate from AppData.
 *
 * Kept outside the main document intentionally:
 *   - It does not need to be backed up or synced.
 *   - The user can clear it without touching protocols or logs.
 *   - Chat messages may be verbose and would bloat every export.
 *
 * The key is per-profile so clearing one person's chat does not touch another.
 */

import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { AiMessage } from "../types";

const KEY_PREFIX = "bench-ai-chat-v1";

function key(profileId: string) {
  return `${KEY_PREFIX}:${profileId}`;
}

export async function loadHistory(profileId: string): Promise<AiMessage[]> {
  try {
    const raw = await idbGet(key(profileId));
    if (!raw) return [];
    return JSON.parse(raw as string) as AiMessage[];
  } catch {
    return [];
  }
}

export async function saveHistory(profileId: string, messages: AiMessage[]): Promise<void> {
  try {
    await idbSet(key(profileId), JSON.stringify(messages));
  } catch {
    // A failed write is non-fatal; the user just loses the history.
  }
}

export async function clearHistory(profileId: string): Promise<void> {
  try {
    await idbDel(key(profileId));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Custom context
//
// When set, replaces the auto-generated system prompt for this profile.
// Stored separately so it survives a chat history clear.
// ---------------------------------------------------------------------------

const CONTEXT_PREFIX = "bench-ai-context-v1";

function contextKey(profileId: string) {
  return `${CONTEXT_PREFIX}:${profileId}`;
}

export async function loadCustomContext(profileId: string): Promise<string | null> {
  try {
    const raw = await idbGet(contextKey(profileId));
    return typeof raw === "string" ? raw : null;
  } catch {
    return null;
  }
}

export async function saveCustomContext(profileId: string, text: string): Promise<void> {
  try {
    await idbSet(contextKey(profileId), text);
  } catch {
    // ignore
  }
}

export async function clearCustomContext(profileId: string): Promise<void> {
  try {
    await idbDel(contextKey(profileId));
  } catch {
    // ignore
  }
}
