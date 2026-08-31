import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInNewContext } from "node:vm";

/**
 * The service worker, exercised rather than read.
 *
 * It had no test, and that is precisely how a real bug got in: the worker is
 * cache-first over everything on the origin, sync added the app's first ongoing
 * network calls, and nothing connected the two. Pulls were answered from the
 * cache, so a device would send its own changes and never see anyone else's,
 * while looking entirely healthy.
 *
 * `public/sw.js` is plain script with no module system, meant for a scope that
 * does not exist in node, so it is run here in a fake one and asked what it
 * decides. What matters is only whether it takes responsibility for a request,
 * which is `respondWith` being called or not.
 */

const SW_SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

interface FakeRequest {
  url: string;
  method: string;
  mode?: string;
  headers: { has: (name: string) => boolean };
}

function request(url: string, options: { method?: string; mode?: string; range?: boolean } = {}) {
  return {
    url,
    method: options.method ?? "GET",
    mode: options.mode ?? "cors",
    headers: { has: (name: string) => name === "range" && options.range === true },
  } satisfies FakeRequest;
}

/** Load the worker and return a function that asks it about one request. */
function loadWorker() {
  const listeners = new Map<string, (event: unknown) => void>();

  const scope = {
    self: {
      location: { href: "https://bench.example/sw.js?v=test", origin: "https://bench.example" },
      addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
    },
    caches: {
      open: async () => ({ match: async () => undefined, put: async () => undefined, add: async () => undefined }),
      match: async () => undefined,
      keys: async () => [],
      delete: async () => true,
    },
    fetch: async () => ({ ok: true, clone: () => ({}) }),
    URL,
    Response,
    Promise,
    console,
  };

  runInNewContext(SW_SOURCE, createContext(scope));

  const onFetch = listeners.get("fetch");
  if (!onFetch) throw new Error("the worker registered no fetch handler");

  return function handles(req: FakeRequest): boolean {
    let claimed = false;
    onFetch({
      request: req,
      respondWith: () => {
        claimed = true;
      },
    });
    return claimed;
  };
}

describe("service worker caching", () => {
  const handles = loadWorker();

  it("keeps away from the sync server entirely", () => {
    // The bug this file exists for. A cached answer to "what does the server
    // hold now" is a wrong answer by construction, and a cached 204 would
    // convince the device the server was empty for good.
    expect(handles(request("https://bench.example/api/data"))).toBe(false);
    expect(handles(request("https://bench.example/api/session"))).toBe(false);
    expect(handles(request("https://bench.example/api/salt?username=x"))).toBe(false);
  });

  it("keeps away from the login page", () => {
    // Served to whoever has no session. Caching it would let it be handed to
    // someone who does, or worse, kept after they sign in.
    expect(handles(request("https://bench.example/login", { mode: "navigate" }))).toBe(false);
    expect(handles(request("https://bench.example/login?next=/plan", { mode: "navigate" }))).toBe(
      false,
    );
  });

  it("keeps away from the update probe", () => {
    expect(handles(request("https://bench.example/version.json"))).toBe(false);
    expect(handles(request("https://bench.example/sw.js"))).toBe(false);
  });

  it("still takes the app itself, which is the point of it", () => {
    expect(handles(request("https://bench.example/plan", { mode: "navigate" }))).toBe(true);
    expect(handles(request("https://bench.example/_next/static/chunks/main.js"))).toBe(true);
    expect(handles(request("https://bench.example/icon-192.png"))).toBe(true);
  });

  it("ignores other origins, other methods and range requests", () => {
    expect(handles(request("https://elsewhere.example/thing.js"))).toBe(false);
    expect(handles(request("https://bench.example/api/data", { method: "PUT" }))).toBe(false);
    expect(handles(request("https://bench.example/demo.mp4", { range: true }))).toBe(false);
  });

  it("does not mistake a path merely containing api for the sync server", () => {
    // The guard is a prefix on purpose. A library page about a compound whose
    // name happens to contain those letters is still the app.
    expect(handles(request("https://bench.example/library/rapamycin"))).toBe(true);
  });
});
