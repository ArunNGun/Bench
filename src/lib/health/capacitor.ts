/**
 * Health Connect, via Capacitor.
 *
 * Verified against @capgo/capacitor-health 8.10.0 (native side reports 7.2.14)
 * on a Galaxy S25 Ultra running Android 16 / API 36. Every method name and
 * response shape below was read off the plugin's own type definitions and then
 * confirmed by calling it on the device, because an earlier version of this
 * file guessed at all of them and got almost every one wrong.
 */

import type { HealthSample, HeartRateSample, SleepSegment } from "../calc/healthsync";
import type { HealthAdapter, HealthAvailability } from "./adapter";

/**
 * The plugin's data-type names. Lower case, and it matters.
 *
 * Taken from the HealthDataType union in the plugin's own definitions rather
 * than guessed, because every name guessed for this plugin the first time round
 * was wrong and failed silently.
 */
const WEIGHT = "weight";
const SLEEP = "sleep";
const RESTING_HR = "restingHeartRate";

/** Weight always arrives in kilograms, which is what this app stores. */
const KILOGRAM = "kilogram";

/** Read only. The app never writes to the health store, so it never asks to. */
const SCOPES = { read: [WEIGHT, SLEEP, RESTING_HR] };

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
  /** Sleep only: asleep, awake, rem, deep, light, inBed. */
  sleepState?: string;
  /** Sleep only: the stage breakdown, when the platform exposes one. */
  stages?: { startDate?: string; endDate?: string; stage?: string }[];
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

/**
 * Weight is the one that decides whether the integration is usable at all.
 *
 * Sleep and resting heart rate are checked separately and independently: a user
 * may reasonably grant weight and withhold the rest, and that should leave the
 * weight sync working rather than reporting the whole thing denied.
 */
const granted = (
  status: AuthorizationStatus | undefined,
  list: keyof AuthorizationStatus,
  type: string = WEIGHT,
) => !!status?.[list]?.includes(type);

/**
 * One read against the health store.
 *
 * Shared so the window rules live in one place. `endDate` is exclusive, so it
 * reaches slightly past now; a reading taken this second would otherwise fall
 * outside a window that ended at exactly now.
 */
async function read(dataType: string, sinceMs: number): Promise<PluginSample[]> {
  const h = plugin();
  if (!h) return [];
  try {
    const res = await h.readSamples({
      dataType,
      startDate: new Date(sinceMs).toISOString(),
      endDate: new Date(Date.now() + 60_000).toISOString(),
      limit: READ_LIMIT,
      ascending: true,
    });
    return res.samples ?? [];
  } catch {
    // A type the user withheld permission for throws. That is a normal state,
    // not a failure, and it must not take the other reads down with it.
    return [];
  }
}

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

  async readSleep(sinceMs) {
    const samples = await read(SLEEP, sinceMs);

    return samples.flatMap((s, i): SleepSegment[] => {
      // Prefer the stage breakdown where there is one: it excludes the minutes
      // spent awake mid-night, which the parent session includes.
      if (s.stages?.length) {
        return s.stages
          .map((stage, j) => ({
            externalId: `${s.platformId ?? `hc-sleep:${i}`}:${j}`,
            startAt: stage.startDate ? Date.parse(stage.startDate) : NaN,
            endAt: stage.endDate ? Date.parse(stage.endDate) : NaN,
            state: stage.stage,
          }))
          .filter((x) => Number.isFinite(x.startAt) && Number.isFinite(x.endAt));
      }

      const startAt = s.startDate ? Date.parse(s.startDate) : NaN;
      const endAt = s.endDate ? Date.parse(s.endDate) : NaN;
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) return [];

      return [
        {
          externalId: s.platformId ?? `hc-sleep:${startAt}:${i}`,
          startAt,
          endAt,
          state: s.sleepState,
        },
      ];
    });
  },

  async readRestingHr(sinceMs) {
    const samples = await read(RESTING_HR, sinceMs);

    return samples
      .map((s, i): HeartRateSample | null => {
        const at = s.startDate ? Date.parse(s.startDate) : NaN;
        const bpm = typeof s.value === "number" ? s.value : NaN;
        // A resting rate outside this is a misread, not a person.
        if (!Number.isFinite(at) || !(bpm >= 25 && bpm <= 200)) return null;
        return { externalId: s.platformId ?? `hc-hr:${at}:${bpm}:${i}`, at, bpm };
      })
      .filter((s): s is HeartRateSample => s !== null);
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
