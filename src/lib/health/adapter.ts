/**
 * The boundary between the app and a platform health store.
 *
 * Read-only, deliberately. Nothing this app records is ever written back to the
 * health store: weight typed in here stays here. That is why only read access is
 * requested, holding write permission the app never exercises is a liability for
 * no benefit, and a bug in a sync loop cannot corrupt data it has no rights to.
 *
 * Everything above this file is platform-free and unit-tested. Everything
 * below it is a native call that cannot run in a browser. Keeping the seam
 * here means the web build stays completely unaffected, the adapter simply
 * reports itself unavailable and nothing else changes.
 *
 * ANDROID ONLY. Health Connect has no web API, and Google Fit's REST API is
 * deprecated and closed to new registrations, so there is no browser route to
 * this data. Reaching it requires the Capacitor build.
 */

import type { HealthSample } from "../calc/healthsync";

export type HealthAvailability =
  | "available"
  | "not-on-this-platform"
  | "not-installed"
  | "permission-denied";

export interface HealthAdapter {
  /** Whether this device can talk to a health store at all. */
  availability(): Promise<HealthAvailability>;
  /** Prompt for read access to weight. Resolves true if granted. */
  requestPermissions(): Promise<boolean>;
  /**
   * Open the platform's own health settings.
   *
   * Health Connect stops showing its permission sheet after the user has
   * dismissed it a couple of times, and from then on access can only be
   * granted in settings. Without this there is no way out of that state.
   */
  openSettings(): Promise<void>;
  /** Weight samples recorded at or after `sinceMs`. */
  readWeight(sinceMs: number): Promise<HealthSample[]>;
}

/**
 * What the web build uses. Every call resolves harmlessly so callers need no
 * platform checks of their own.
 */
export const unavailableAdapter: HealthAdapter = {
  availability: async () => "not-on-this-platform",
  requestPermissions: async () => false,
  openSettings: async () => {},
  readWeight: async () => [],
};

/**
 * Resolve the adapter for wherever this is running.
 *
 * The native implementation is loaded lazily and only when Capacitor is
 * actually present, so the plugin never has to exist in a web install.
 */
export async function getHealthAdapter(): Promise<HealthAdapter> {
  if (typeof window === "undefined") return unavailableAdapter;

  // Capacitor injects this global; its absence means a plain browser.
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  if (!cap?.isNativePlatform?.()) return unavailableAdapter;

  try {
    const { capacitorHealthAdapter } = await import("./capacitor");
    return capacitorHealthAdapter;
  } catch {
    // The plugin is not installed in this build.
    return unavailableAdapter;
  }
}

export const AVAILABILITY_MESSAGE: Record<HealthAvailability, string> = {
  available: "Connected to Health Connect.",
  "not-on-this-platform":
    "Health Connect is Android-only, so this works in the Android app rather than the browser.",
  "not-installed":
    "Health Connect is not set up on this device. Install it from the Play Store, then try again.",
  "permission-denied":
    "Bench does not have permission to read your weight. Grant it in Health Connect settings.",
};
