"use client";

/**
 * Sends the unique-install ping once when the app first mounts.
 * Renders nothing — it exists only for the side effect.
 *
 * Placed in the root layout so it fires on every entry point: the web app,
 * the PWA, and the Android WebView. The hook is a no-op if the API call
 * fails (offline, APK build, etc.).
 */

import { usePing } from "@/lib/usePing";

export function PingOnce() {
  usePing();
  return null;
}
