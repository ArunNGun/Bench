"use client";

import { useEffect } from "react";

/**
 * Registers the offline worker, on the web only.
 *
 * Explicitly skipped inside the Capacitor build. There the app is already served
 * from local files in the APK, so a worker adds nothing, and it would actively
 * cause harm, because it would cache those local files and then keep serving the
 * old ones after an app update, with no deploy to invalidate them.
 *
 * Also asks for persistent storage. Browsers are entitled to evict IndexedDB
 * under storage pressure, and this app has no server copy to re-fetch from, so
 * eviction means the data is simply gone. The request is granted silently for an
 * installed app on most engines and declined on some; either way it costs
 * nothing to ask.
 */
export function ServiceWorker() {
  useEffect(() => {
    const isNative =
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
        ?.isNativePlatform?.() === true;

    if (isNative || !("serviceWorker" in navigator)) return;

    // Registering after load keeps the worker off the critical path.
    const register = () => {
      // The build id in the query string is what makes a deploy reach people:
      // it changes the worker's URL, so the browser installs the new one instead
      // of finding the old file unchanged and keeping a stale offline copy.
      const url = `/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`;
      navigator.serviceWorker.register(url, { scope: "/" }).catch(() => {
        // A failed registration only costs offline support, so there is nothing
        // worth interrupting the user about.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    navigator.storage?.persist?.().catch(() => undefined);

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
