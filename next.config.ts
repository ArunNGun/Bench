import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

/**
 * The Android build needs a folder of static files, because a Capacitor
 * webview has no Node server to render on demand. That mode is opt-in via
 * BUILD_TARGET=static so the ordinary web build and `next dev` are unchanged.
 */
const isStatic = process.env.BUILD_TARGET === "static";

/**
 * The build identifier, read from the file scripts/version.mjs just wrote.
 *
 * Reading it rather than generating it here is what keeps the two copies in step:
 * public/version.json is served to the browser as "what the server has", and this
 * constant is compiled into the bundle as "what you are running". Generating the
 * id in both places would produce two different numbers and a permanent phantom
 * update.
 *
 * It also names the service worker's cache. That file lives in public/ and is
 * never content-hashed, so without a changing URL the browser finds it byte-
 * identical after a deploy and never reinstalls it.
 */
function readBuildId(): string {
  try {
    const raw = readFileSync(join(process.cwd(), "public", "version.json"), "utf8");
    return String(JSON.parse(raw).buildId);
  } catch {
    // A build that skipped the script still works; it just cannot detect updates.
    return "dev";
  }
}

const BUILD_ID = readBuildId();

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID }, ...(isStatic
    ? {
        output: "export" as const,
        // No image optimiser exists without a server.
        images: { unoptimized: true },
        // Emit /library/klow/index.html, which the webview resolves directly.
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
