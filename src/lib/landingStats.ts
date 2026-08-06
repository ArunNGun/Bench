/**
 * Server-side stats for the landing page stat band.
 *
 * Fetches three numbers at build/request time:
 *  - unique installs from Vercel KV (HyperLogLog count)
 *  - APK download count from the GitHub releases API
 *  - GitHub star count as a fallback if downloads are unavailable
 *
 * All three are best-effort: a failure returns null and the stat band shows
 * a dash rather than crashing the page. Results are cached for 1 hour so
 * the GitHub API rate limit is never a concern.
 */

import { kv } from "@vercel/kv";

const GITHUB_REPO = "ArunNGun/Bench";
const HLL_KEY = "bench:users";

interface LandingStats {
  users: number | null;
  ghStars: number | null;
  apkDownloads: number | null;
}

async function fetchGitHubStats(): Promise<{ stars: number | null; downloads: number | null }> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    // GITHUB_TOKEN is optional — without it the rate limit is 60 req/hr,
    // which is fine given the 1-hour cache below.
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    const [repoRes, releasesRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
        headers,
        next: { revalidate: 3600 },
      }),
      fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases`, {
        headers,
        next: { revalidate: 3600 },
      }),
    ]);

    const stars = repoRes.ok ? (await repoRes.json()).stargazers_count ?? null : null;

    let downloads: number | null = null;
    if (releasesRes.ok) {
      const releases: { assets: { download_count: number }[] }[] = await releasesRes.json();
      downloads = releases.reduce(
        (sum, r) => sum + r.assets.reduce((s, a) => s + a.download_count, 0),
        0,
      );
    }

    return { stars, downloads };
  } catch {
    return { stars: null, downloads: null };
  }
}

async function fetchUserCount(): Promise<number | null> {
  // KV is only available in the Vercel environment. In local dev or the
  // Android static build there is no KV connection, so we return null.
  if (!process.env.KV_REST_API_URL) return null;
  try {
    return await kv.pfcount(HLL_KEY);
  } catch {
    return null;
  }
}


export async function getLandingStats(): Promise<LandingStats> {
  const [userCount, github] = await Promise.all([fetchUserCount(), fetchGitHubStats()]);

  return {
    users: userCount,
    ghStars: github.stars,
    apkDownloads: github.downloads,
  };
}
