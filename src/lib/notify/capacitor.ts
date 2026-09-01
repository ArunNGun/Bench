/**
 * Local notifications, via Capacitor.
 *
 * Written against @capacitor/local-notifications. Nothing here reaches a
 * network: the plugin hands the alarm to Android's own AlarmManager and the
 * operating system raises it, offline, with the app closed. That is the whole
 * reason this is the Android answer and there is no web equivalent.
 *
 * The plugin is reached through Capacitor's global registry rather than an
 * import of "@capacitor/local-notifications". A bare module specifier cannot be
 * resolved in a webview at runtime, which is exactly the bug that left Health
 * Connect silently dead, so the registry is the only reliable route. It also
 * means a build made without the plugin degrades to "no-plugin" rather than
 * failing to load.
 */

import type { Reminder } from "../calc/reminders";
import type { NotifyAdapter, NotifyAvailability } from "./adapter";

/**
 * Android will not accept an unbounded queue of alarms, and there is no reason
 * to ask it to. A fortnight of a busy plan sits well inside this.
 */
const MAX_PENDING = 400;

/** Only the surface this app touches, so a plugin change fails loudly here. */
interface LocalNotificationsPlugin {
  checkPermissions(): Promise<{ display: string }>;
  requestPermissions(): Promise<{ display: string }>;
  schedule(options: { notifications: PluginNotification[] }): Promise<unknown>;
  getPending(): Promise<{ notifications: { id: number }[] }>;
  cancel(options: { notifications: { id: number }[] }): Promise<void>;
}

interface PluginNotification {
  id: number;
  title: string;
  body: string;
  schedule: {
    at: Date;
    /**
     * Ask the operating system for an exact time rather than a convenient one.
     *
     * Without this Android is free to batch the alarm into whatever wake-up
     * window suits the battery, which can be tens of minutes late. A reminder
     * for a timed dose that arrives whenever is not a reminder.
     */
    allowWhileIdle: boolean;
  };
  /** Clear the notification once it has been tapped. */
  autoCancel?: boolean;
}

function plugin(): LocalNotificationsPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor;
  return (cap?.Plugins?.LocalNotifications as LocalNotificationsPlugin | undefined) ?? null;
}

/** The plugin reports permission as a string; only one value is a yes. */
const granted = (state: string) => state === "granted";

export const capacitorNotifier: NotifyAdapter = {
  async availability(): Promise<NotifyAvailability> {
    const p = plugin();
    if (!p) return "no-plugin";

    try {
      const { display } = await p.checkPermissions();
      return granted(display) ? "available" : "permission-denied";
    } catch {
      return "no-plugin";
    }
  },

  async requestPermission() {
    const p = plugin();
    if (!p) return false;

    try {
      const { display } = await p.requestPermissions();
      return granted(display);
    } catch {
      return false;
    }
  },

  async arm(reminders: Reminder[]) {
    const p = plugin();
    if (!p) return 0;

    await this.clear();
    const wanted = reminders.slice(0, MAX_PENDING);
    if (!wanted.length) return 0;

    try {
      await p.schedule({
        notifications: wanted.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          schedule: { at: new Date(r.at), allowWhileIdle: true },
          autoCancel: true,
        })),
      });
      return wanted.length;
    } catch {
      // A refused permission or a plugin that changed shape. Either way there
      // is nothing armed, and saying zero is the truth.
      return 0;
    }
  },

  async clear() {
    const p = plugin();
    if (!p) return;

    try {
      const { notifications } = await p.getPending();
      if (notifications.length) await p.cancel({ notifications });
    } catch {
      // Nothing pending, or the plugin is not there. Both are the desired end
      // state of a cancel.
    }
  },
};
