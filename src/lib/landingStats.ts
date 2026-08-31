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

async function fetchNotionUserCount(): Promise<number | null> {
  const token = process.env.BUILD_SYNC_TOKEN;
  const dbId = process.env.BUILD_SYNC_TARGET;
  if (!token || !dbId) return null;

  try {
    let count = 0;
    let cursor: string | undefined;

    do {
      const body: Record<string, unknown> = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;

      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        next: { revalidate: 3600 },
      });

      if (!res.ok) return null;

      const data = await res.json();
      count += data.results?.length ?? 0;
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    return count;
  } catch {
    return null;
  }
}

export async function getLandingStats(): Promise<LandingStats> {
  const baseline = Number(process.env.USER_BASELINE ?? "0") || 0;

  const [apkDownloads, notionCount] = await Promise.all([
    fetchApkDownloads(),
    fetchNotionUserCount(),
  ]);

  const pageViews = notionCount !== null ? baseline + notionCount : null;

  return { apkDownloads, pageViews };
}
