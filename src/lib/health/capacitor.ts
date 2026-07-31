/**
 * Health Connect, via Capacitor.
 *
 * Verified against @capgo/capacitor-health 8.10.0 (native side reports 7.2.14)
 * on a Galaxy S25 Ultra running Android 16 / API 36. Every method name and
 * response shape below was read off the plugin's own type definitions and then
 * confirmed by calling it on the device, because an earlier version of this
 * file guessed at all of them and got almost every one wrong.
 */

import type { HealthSample } from "../calc/healthsync";
import type { HealthAdapter, HealthAvailability } from "./adapter";

/** The plugin's data-type name for body weight. Lower case, and it matters. */
const WEIGHT = "weight";

/** Weight always arrives in kilograms, which is what this app stores. */
const KILOGRAM = "kilogram";

/** Read only. The app never writes to the health store, so it never asks to. */
const SCOPES = { read: [WEIGHT] };

/**
 * Health Connect returns at most this many samples per read. Its own window is
 * the real limit. Without the READ_HEALTH_DATA_HISTORY permission, which this
 * app does not ask for, it will not hand back anything older than about 30
 * days, however far back `startDate` reaches.
 */
const READ_LIMIT = 500;

interface AuthorizationStatus {
  readAuthorized: string[];
  readDenied: string[];
  writeAuthorized: string[];
  writeDenied: string[];
}

interface PluginSample {
  value?: number;
  unit?: string;
  startDate?: string;
  endDate?: string;
  /** Health Connect's own record id. Stable across reads. */
  platformId?: string;
  sourceName?: string;
}

/** Only the surface this app touches, so a plugin change fails loudly here. */
interface HealthPlugin {
  isAvailable(): Promise<{ available: boolean; platform?: string; reason?: string }>;
  checkAuthorization(options: typeof SCOPES): Promise<AuthorizationStatus>;
  requestAuthorization(options: typeof SCOPES): Promise<AuthorizationStatus>;
  readSamples(options: {
    dataType: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    ascending?: boolean;
  }): Promise<{ samples?: PluginSample[] }>;
  openHealthConnectSettings(): Promise<void>;
}

/**
 * Capacitor registers every native plugin on a global, and that is the only
 * route to it from the built app.
 *
 * This used to be `await import("@capgo/capacitor-health")` held behind a
 * variable so TypeScript would not resolve it. That import cannot ever succeed:
 * a bare module specifier means nothing to a webview, so it threw "Failed to
 * resolve module specifier" every single time, and the caller's catch reported
 * the result as "no health store on this platform". The feature looked wired up
 * and was dead. Going through the registry needs no bundler and no resolver.
 */
function plugin(): HealthPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor;
  return (cap?.Plugins?.Health as HealthPlugin | undefined) ?? null;
}

const granted = (status: AuthorizationStatus | undefined, list: keyof AuthorizationStatus) =>
  !!status?.[list]?.includes(WEIGHT);

export const capacitorHealthAdapter: HealthAdapter = {
  async availability(): Promise<HealthAvailability> {
    const h = plugin();
    if (!h) return "not-on-this-platform";

    try {
      const { available } = await h.isAvailable();
      if (!available) return "not-installed";

      const status = await h.checkAuthorization(SCOPES);
      return granted(status, "readAuthorized") ? "available" : "permission-denied";
    } catch {
      return "not-installed";
    }
  },

  async requestPermissions() {
    const h = plugin();
    if (!h) return false;
    try {
      // Opens Health Connect's own permission sheet. Android only shows it a
      // couple of times before it must be granted in settings instead, which
      // is why openSettings exists alongside this.
      const status = await h.requestAuthorization(SCOPES);
      return granted(status, "readAuthorized");
    } catch {
      return false;
    }
  },

  async openSettings() {
    try {
      await plugin()?.openHealthConnectSettings();
    } catch {
      // Nothing useful to do if the settings screen will not open.
    }
  },

  async readWeight(sinceMs) {
    const h = plugin();
    if (!h) return [];

    try {
      const res = await h.readSamples({
        dataType: WEIGHT,
        startDate: new Date(sinceMs).toISOString(),
        // endDate is exclusive, so a reading taken this second would fall
        // outside a window that ended at exactly now.
        endDate: new Date(Date.now() + 60_000).toISOString(),
        limit: READ_LIMIT,
        ascending: true,
      });

      return (res.samples ?? [])
        .map((s, i): HealthSample | null => {
          const at = s.startDate ? Date.parse(s.startDate) : NaN;
          const kg = typeof s.value === "number" ? s.value : NaN;
          if (!Number.isFinite(at) || !Number.isFinite(kg) || kg <= 0) return null;

          // Weight is documented as kilograms and arrives that way. Anything
          // else is dropped rather than stored under the wrong unit, a silent
          // 2.2x error in a weight trend is worse than a missing point.
          if (s.unit && s.unit !== KILOGRAM) return null;

          return {
            // Composite key only when the platform withholds its own id, so
            // dedup still works instead of re-importing forever.
            externalId: s.platformId ?? `hc:${at}:${kg}:${i}`,
            at,
            weightKg: kg,
          };
        })
        .filter((s): s is HealthSample => s !== null);
    } catch {
      return [];
    }
  },

};
