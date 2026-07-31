/*
 * Offline support.
 *
 * Deliberately hand-written and small. The app is a client-side Next build with
 * no server calls of its own, all the data lives in IndexedDB, so "works
 * offline" only means "can still load its own code". That does not need a
 * precache manifest generated at build time, which would have to be regenerated
 * on every deploy and is the usual source of a stale or broken install.
 *
 * Cache-first throughout, deliberately. The app is offline-first: a load should
 * never wait on a network round trip it does not need, and everything served here
 * is either content-hashed build output or a document precached at install.
 *
 * That means a deploy does not reach anyone by itself, which is the point.
 * Updates are explicit, the running app compares its own build id against
 * /version.json and offers the user the choice. Silently swapping the code under
 * someone mid-session is how you get a half-old, half-new app and a bug report
 * nobody can reproduce.
 *
 * /version.json is the one thing never cached, since it is the question being
 * asked rather than part of the app.
 */

/**
 * Namespaced per build.
 *
 * The registering page appends ?v=<build id>, which arrives here as the worker's
 * own search string. A new deploy therefore installs into a new cache and the
 * activate handler deletes every older one, so nobody is left running a mix of
 * old HTML and new chunks.
 */
const BUILD = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `bench-${BUILD}`;

/**
 * Every route's real HTML, fetched at install.
 *
 * Precaching the documents rather than relying on visits matters more than it
 * looks. Moving around the app client-side never fetches a route's HTML, Next
 * requests an RSC payload at the same path with a `_rsc` query instead. That
 * lands in the cache under a different key, so an offline cold start on /plan
 * finds no document, falls back to the / shell, and renders the Now page under
 * the /plan URL. Fetching the documents up front is what makes a deep link work
 * offline.
 *
 * Library detail pages are deliberately absent: there are dozens, and they are
 * cached individually as they are read.
 */
const SHELL = [
  "/",
  "/plan",
  "/log",
  "/stock",
  "/calculator",
  "/labs",
  "/library",
  "/settings",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Individually, so one 404 cannot fail the whole install.
      await Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => undefined)));
      await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })());
});

/** Let the page tell a waiting worker to take over immediately. */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  /\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i.test(url.pathname);

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function cacheFirstNavigation(request) {
  const cache = await caches.open(CACHE);

  // The precached document for this exact route, which is the normal case.
  const exact = await cache.match(request);
  if (exact) return exact;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    // A route never visited and never precached, library detail pages, mostly.
    // The shell boots and the client router renders the right thing.
    return (
      (await cache.match("/")) ??
      new Response(
        "<!doctype html><meta charset=utf-8><title>Offline</title><body style=\"font:16px system-ui;padding:2rem\">You are offline and this page has not been cached yet. Open the app once with a connection.</body>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  return cached ?? (await network) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET, and only our own origin. A cross-origin request has no business
  // in this cache, and a POST is not cacheable anyway.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept the worker, the version probe, or the range requests media
  // elements make. version.json is the question "is there an update", answering
  // it from cache would guarantee the answer is always no.
  if (url.pathname === "/sw.js" || url.pathname === "/version.json") return;
  if (request.headers.has("range")) return;

  if (request.mode === "navigate") {
    event.respondWith(cacheFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
