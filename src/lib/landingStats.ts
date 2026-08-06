/**
 * Server-side stats for the landing page stat band.
 *
 * Fetches two numbers:
 *  - APK download count from GitHub releases API
 *  - Total page view count from Vercel Web Analytics API
 *
 * Both are best-effort: a failure returns null and the tile is hidden rather
 * than showing a broken placeholder. Results are cached for 1 hour.
 *
 * Required env vars (set in Vercel project settings):
 *  - VERCEL_TOKEN          — a Vercel API token (Account → Tokens)
 *  - VERCEL_PROJECT_ID     — found in Project → Settings → General
 *  - GITHUB_TOKEN          — optional, raises GitHub rate limit to 5000/hr
 */

const GITHUB_REPO = "ArunNGun/Bench";

export interface LandingStats {
  apkDownloads: number | null;
  pageViews: number | null;
}

async function fetchApkDownloads(): Promise<number | null> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases`,
      { headers, next: { revalidate: 3600 } },
    );

    if (!res.ok) return null;

    const releases: { assets: { download_count: number }[] }[] = await res.json();
    return releases.reduce(
      (sum, r) => sum + r.assets.reduce((s, a) => s + a.download_count, 0),
      0,
    );
  } catch {
    return null;
  }
}

async function fetchPageViews(): Promise<number | null> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;

  try {
    const url = new URL("https://vercel.com/v1/query/web-analytics/visits/count");
    url.searchParams.set("projectId", projectId);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) return null;

    const body = await res.json();
    // Response shape: { data: [{ count: number }], ... }
    const count = body?.data?.[0]?.count ?? body?.data?.count ?? null;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

export async function getLandingStats(): Promise<LandingStats> {
  const [apkDownloads, pageViews] = await Promise.all([
    fetchApkDownloads(),
    fetchPageViews(),
  ]);

  return { apkDownloads, pageViews };
}
