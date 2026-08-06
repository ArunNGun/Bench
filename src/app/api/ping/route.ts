/**
 * POST /api/ping
 *
 * Counts unique installs using a Redis HyperLogLog. The client sends a UUID
 * it generated locally and stored in localStorage. If the UUID is new the
 * counter grows by one; if it was seen before the count is unchanged. Either
 * way the current total is returned so the client can cache it for offline use.
 *
 * HyperLogLog stores a fixed-size sketch (~12 KB) regardless of how many IDs
 * have been added. The raw UUIDs are never persisted anywhere — you cannot
 * reconstruct the list of IDs from the sketch, which is a stronger privacy
 * guarantee than storing them and promising not to look.
 *
 * Error rate: ~0.81% at large scale, unnoticeable for a user count display.
 *
 * This route is only reachable on the Vercel web deployment. The Android APK
 * is a static export with no server, so the client treats a network failure
 * as "offline" and falls back to the last cached count.
 */

import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";

export const runtime = "edge";

const HLL_KEY = "bench:users";

/** Loose UUID shape check — rejects obviously garbage payloads. */
function looksLikeUuid(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || !looksLikeUuid(body.userId)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // PFADD returns 1 if the value was new to the sketch, 0 if already seen.
    const isNew = await kv.pfadd(HLL_KEY, body.userId);
    const users = await kv.pfcount(HLL_KEY);

    return NextResponse.json({ users, isNew: isNew === 1 });
  } catch (err) {
    console.error("[ping]", err);
    // Return a 503 so the client knows to fall back to its cached count.
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}

/**
 * GET /api/ping — read-only count, no UUID required.
 * Used by the landing page to show the stat on initial render.
 */
export async function GET() {
  try {
    const users = await kv.pfcount(HLL_KEY);
    return NextResponse.json({ users });
  } catch (err) {
    console.error("[ping:get]", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
