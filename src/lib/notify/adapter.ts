/**
 * The boundary between the app and whatever can raise an alarm.
 *
 * Same seam as the health adapter: everything above this file is pure and
 * tested, everything below is a native call that cannot run in a browser.
 *
 * The asymmetry here is real and is not hidden. Android schedules a reminder
 * through the operating system and it fires whether or not the app is running.
 * A browser cannot: the API written for it, Notification Triggers, was
 * abandoned by Chrome before it shipped, Periodic Background Sync leaves the
 * cadence to the browser rather than the app, and Push needs a server, which
 * this project does not have. So the web adapter reports itself unavailable and
 * the Settings panel offers the calendar export instead of a switch that would
 * quietly do nothing.
 */

import type { Reminder } from "../calc/reminders";

export type NotifyAvailability =
  | "available"
  | "not-on-this-platform"
  | "permission-denied"
  | "no-plugin";

export interface NotifyAdapter {
  /** Whether this device can raise an alarm at a set time while closed. */
  availability(): Promise<NotifyAvailability>;
  /** Prompt for permission. Resolves true if granted. Asked only on opt in. */
  requestPermission(): Promise<boolean>;
  /**
   * Replace every alarm this app has pending with the given list.
   *
   * Cancel and re-arm rather than reconcile. A plan change moves many doses at
   * once, and reconciling one alarm at a time is how a reminder survives for a
   * dose that no longer exists. Returns how many were armed.
   */
  arm(reminders: Reminder[]): Promise<number>;
  /** Remove every alarm. Used when the switch is turned off. */
  clear(): Promise<void>;
}

/** What the web build uses. Every call resolves harmlessly. */
export const unavailableNotifier: NotifyAdapter = {
  availability: async () => "not-on-this-platform",
  requestPermission: async () => false,
  arm: async () => 0,
  clear: async () => {},
};

/**
 * Resolve the adapter for wherever this is running.
 *
 * The native implementation is loaded lazily and only when Capacitor is
 * present, so the plugin never has to exist in a web install.
 */
export async function getNotifyAdapter(): Promise<NotifyAdapter> {
  if (typeof window === "undefined") return unavailableNotifier;

  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  if (!cap?.isNativePlatform?.()) return unavailableNotifier;

  try {
    const { capacitorNotifier } = await import("./capacitor");
    return capacitorNotifier;
  } catch {
    return unavailableNotifier;
  }
}

export const NOTIFY_MESSAGE: Record<NotifyAvailability, string> = {
  available: "Reminders can be scheduled on this device.",
  "not-on-this-platform":
    "A browser cannot raise a notification at a set time while it is closed, so reminders live in the Android app. Export your doses to your calendar instead and let it remind you.",
  "permission-denied":
    "Android has not been given permission to show notifications for Bench. Grant it in the app's notification settings, then try again.",
  "no-plugin":
    "This build of the Android app was made without the notifications plugin, so there is nothing to schedule with.",
};
