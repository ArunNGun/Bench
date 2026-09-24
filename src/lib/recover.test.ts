import { describe, expect, it } from "vitest";
import {
  RECOVERY_LIMIT,
  RECOVERY_SCRIPT,
  RECOVERY_WINDOW_MS,
  isChunkError,
  readHistory,
  recoveryPlan,
} from "./recover";

describe("isChunkError", () => {
  /* The one that was actually reported, from a real deployment. */
  it("knows the error that started this", () => {
    expect(isChunkError("ChunkLoadError", "Loading chunk 135 failed.")).toBe(true);
  });

  it("knows it under each name it arrives with", () => {
    expect(isChunkError("Error", "Loading chunk 42 failed.")).toBe(true);
    expect(isChunkError("ChunkLoadError", undefined)).toBe(true);
    expect(isChunkError("TypeError", "Failed to fetch dynamically imported module: /_next/x.js")).toBe(true);
    expect(isChunkError("TypeError", "error loading dynamically imported module")).toBe(true);
    expect(isChunkError("Error", "Loading CSS chunk 7 failed.")).toBe(true);
  });

  /*
   * The important half. Reloading and dropping the cache on an ordinary bug
   * would hide it and cost somebody their unsaved form, so this has to stay
   * narrow.
   */
  it("leaves every other error alone", () => {
    expect(isChunkError("TypeError", "x is not a function")).toBe(false);
    expect(isChunkError("Error", "Network request failed")).toBe(false);
    expect(isChunkError(undefined, undefined)).toBe(false);
    expect(isChunkError(null, "")).toBe(false);
    expect(isChunkError("QuotaExceededError", "The quota has been exceeded.")).toBe(false);
  });
});

describe("readHistory", () => {
  it("starts from nothing when nothing is stored", () => {
    expect(readHistory(null)).toEqual({ n: 0, first: 0 });
  });

  it("starts from nothing when something else wrote there", () => {
    expect(readHistory("not json")).toEqual({ n: 0, first: 0 });
    expect(readHistory('{"n":"lots"}')).toEqual({ n: 0, first: 0 });
  });

  it("reads back what it wrote", () => {
    expect(readHistory('{"n":1,"first":1700000000000}')).toEqual({
      n: 1,
      first: 1_700_000_000_000,
    });
  });
});

describe("recoveryPlan", () => {
  const NOW = 1_700_000_000_000;

  it("allows the first attempt and remembers when it was", () => {
    const { allow, next } = recoveryPlan({ n: 0, first: 0 }, NOW);
    expect(allow).toBe(true);
    expect(next).toEqual({ n: 1, first: NOW });
  });

  it("allows a second, on the same clock", () => {
    const { allow, next } = recoveryPlan({ n: 1, first: NOW }, NOW + 4000);
    expect(allow).toBe(true);
    expect(next).toEqual({ n: 2, first: NOW });
  });

  /*
   * The guard that matters. If clearing the cache did not fix it the fault is
   * on the server, and a page that reloads forever is one broken page turned
   * into a machine hammering it.
   */
  it("stops after the limit, rather than looping", () => {
    const { allow, next } = recoveryPlan({ n: RECOVERY_LIMIT, first: NOW }, NOW + 5000);
    expect(allow).toBe(false);
    expect(next).toEqual({ n: RECOVERY_LIMIT, first: NOW });
  });

  it("forgives once the window has passed", () => {
    const later = NOW + RECOVERY_WINDOW_MS + 1;
    const { allow, next } = recoveryPlan({ n: RECOVERY_LIMIT, first: NOW }, later);
    expect(allow).toBe(true);
    expect(next).toEqual({ n: 1, first: later });
  });
});

/*
 * The script is the functions above, serialised. These hold that it stayed
 * that way: a second copy written out by hand is how one of them gets fixed
 * and the other does not.
 */
describe("the inline script", () => {
  it("carries the real functions rather than a retyped copy", () => {
    expect(RECOVERY_SCRIPT).toContain(isChunkError.toString());
    expect(RECOVERY_SCRIPT).toContain(recoveryPlan.toString());
    expect(RECOVERY_SCRIPT).toContain(readHistory.toString());
  });

  it("closes the door behind itself", () => {
    expect(RECOVERY_SCRIPT).toContain("location.reload()");
    expect(RECOVERY_SCRIPT).toContain("unregister()");
    expect(RECOVERY_SCRIPT).toContain("caches.delete");
  });

  /* It goes into a script tag, so a stray closing tag would end it early. */
  it("cannot end the tag it is written into", () => {
    expect(RECOVERY_SCRIPT).not.toContain("</script");
  });
});

/*
 * The script is serialised source, and source that was never run is source
 * that has never been checked. These run it in a sandbox with the browser it
 * expects stubbed out, which is what catches a typo in the part that only
 * exists as a string.
 */
describe("the inline script, run", () => {
  async function boot(stored: string | null = null) {
    const { runInNewContext } = await import("node:vm");
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    const state = { reloads: 0, cachesDeleted: [] as string[], unregistered: 0, wrote: "" };

    const sandbox = {
      addEventListener(type: string, fn: (e: unknown) => void) {
        (listeners[type] ??= []).push(fn);
      },
      localStorage: {
        getItem: () => stored,
        setItem: (_k: string, v: string) => {
          state.wrote = v;
        },
      },
      caches: {
        keys: async () => ["bench-1", "bench-2"],
        delete: async (n: string) => {
          state.cachesDeleted.push(n);
          return true;
        },
      },
      navigator: {
        serviceWorker: {
          getRegistrations: async () => [
            {
              unregister: async () => {
                state.unregistered++;
                return true;
              },
            },
          ],
        },
      },
      location: {
        reload: () => {
          state.reloads++;
        },
      },
      Date,
      Promise,
      JSON,
      console,
    } as Record<string, unknown>;
    sandbox.self = sandbox;

    runInNewContext(RECOVERY_SCRIPT, sandbox);
    return { listeners, state };
  }

  /** A microtask turn or two, for the promises inside the handler. */
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("parses and attaches to both kinds of failure", async () => {
    const { listeners } = await boot();
    expect(listeners.error).toHaveLength(1);
    expect(listeners.unhandledrejection).toHaveLength(1);
  });

  it("clears the cache, drops the worker and reloads, in that order", async () => {
    const { listeners, state } = await boot();
    listeners.error[0]({ error: { name: "ChunkLoadError" }, message: "Loading chunk 135 failed." });
    await settle();

    expect(state.cachesDeleted).toEqual(["bench-1", "bench-2"]);
    expect(state.unregistered).toBe(1);
    expect(state.reloads).toBe(1);
    expect(JSON.parse(state.wrote).n).toBe(1);
  });

  it("recovers from a rejected dynamic import too", async () => {
    const { listeners, state } = await boot();
    listeners.unhandledrejection[0]({
      reason: { name: "TypeError", message: "Failed to fetch dynamically imported module: /_next/x.js" },
    });
    await settle();
    expect(state.reloads).toBe(1);
  });

  it("does nothing at all for an ordinary error", async () => {
    const { listeners, state } = await boot();
    listeners.error[0]({ error: { name: "TypeError" }, message: "x is not a function" });
    await settle();
    expect(state.reloads).toBe(0);
    expect(state.cachesDeleted).toEqual([]);
  });

  it("refuses a third attempt inside the window", async () => {
    const { listeners, state } = await boot(
      JSON.stringify({ n: RECOVERY_LIMIT, first: Date.now() }));
    listeners.error[0]({ error: { name: "ChunkLoadError" }, message: "Loading chunk 135 failed." });
    await settle();
    expect(state.reloads).toBe(0);
  });
});
