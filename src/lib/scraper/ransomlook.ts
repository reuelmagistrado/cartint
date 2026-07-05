// RansomLook API client — health monitoring for ransomware leak-site mirrors.
//
// Before scraping a ransomware group's leak site, check if it's actually up
// using the RansomLook API. This prevents wasting time on down mirrors.
//
// API docs: https://www.ransomlook.io/api
// Base URL: https://www.ransomlook.io/api (configurable via RANSOMLOOK_API_URL)

const RANSOMLOOK_API = process.env.RANSOMLOOK_API_URL || "https://www.ransomlook.io/api";

// ─── Types ─────────────────────────────────────────────────────────────────

export type MirrorHealth = {
  slug: string;
  uptime_30d: number;
  available_today: boolean;
  series: number[];
};

export type GroupHealthResult = {
  available: boolean;
  reason?: string;
  mirrors: MirrorHealth[];
  best_mirror: string | null;
  avg_uptime_30d: number;
};

export type RansomLookPost = {
  post_title: string;
  post_url?: string;
  group_name?: string;
  timestamp?: string;
  description?: string;
};

export type SearchResult = {
  groups: unknown[];
  markets: unknown[];
  posts: RansomLookPost[];
  leaks: unknown[];
  notes: unknown[];
};

export type Stats = {
  groups: number;
  markets: number;
  posts: number;
  online: number;
};

// ─── API methods ───────────────────────────────────────────────────────────

// GET /api/health/{name} — Mirror health (30-day uptime % and daily availability).
export async function checkGroupHealth(groupName: string): Promise<GroupHealthResult> {
  try {
    const res = await fetch(`${RANSOMLOOK_API}/health/${encodeURIComponent(groupName)}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 404) {
      return { available: false, reason: "No health data found", mirrors: [], best_mirror: null, avg_uptime_30d: 0 };
    }
    if (!res.ok) {
      return { available: false, reason: `HTTP ${res.status}`, mirrors: [], best_mirror: null, avg_uptime_30d: 0 };
    }

    const mirrors = (await res.json()) as Array<{
      slug: string;
      uptime_30d?: number;
      series?: number[];
    }>;

    const mirrorResults: MirrorHealth[] = mirrors.map((m) => ({
      slug: m.slug,
      uptime_30d: m.uptime_30d ?? 0,
      available_today: m.series && m.series.length > 0 ? m.series[m.series.length - 1] === 1 : false,
      series: m.series ?? [],
    }));

    // Pick the mirror with highest uptime that's available today
    const upMirrors = mirrorResults.filter((m) => m.available_today);
    const bestMirror = upMirrors.length > 0
      ? upMirrors.reduce((best, m) => (m.uptime_30d > best.uptime_30d ? m : best)).slug
      : null;

    const avgUptime = mirrorResults.length > 0
      ? mirrorResults.reduce((sum, m) => sum + m.uptime_30d, 0) / mirrorResults.length
      : 0;

    return {
      available: upMirrors.length > 0,
      mirrors: mirrorResults,
      best_mirror: bestMirror,
      avg_uptime_30d: Math.round(avgUptime * 100) / 100,
    };
  } catch (e) {
    return { available: false, reason: (e as Error).message, mirrors: [], best_mirror: null, avg_uptime_30d: 0 };
  }
}

// GET /api/group/{name} — Group metadata + mirror locations + all posts.
export async function getGroupPosts(groupName: string): Promise<{ groupMeta: unknown | null; posts: RansomLookPost[] }> {
  try {
    const res = await fetch(`${RANSOMLOOK_API}/group/${encodeURIComponent(groupName)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { groupMeta: null, posts: [] };

    const data = await res.json();
    if (Array.isArray(data) && data.length >= 2) {
      return { groupMeta: data[0], posts: data[1] as RansomLookPost[] };
    }
    return { groupMeta: null, posts: [] };
  } catch {
    return { groupMeta: null, posts: [] };
  }
}

// GET /api/search?q={query} — Search across groups, posts, leaks, notes.
export async function searchRansomLook(query: string): Promise<SearchResult> {
  try {
    const res = await fetch(`${RANSOMLOOK_API}/search?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { groups: [], markets: [], posts: [], leaks: [], notes: [] };
    return (await res.json()) as SearchResult;
  } catch {
    return { groups: [], markets: [], posts: [], leaks: [], notes: [] };
  }
}

// GET /api/recent/{number} — Most recent N posts across all groups.
export async function getRecentPosts(count = 50): Promise<RansomLookPost[]> {
  try {
    const res = await fetch(`${RANSOMLOOK_API}/recent/${count}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    return (await res.json()) as RansomLookPost[];
  } catch {
    return [];
  }
}

// GET /api/posts?days={N} — Posts from last N days.
export async function getPostsByDays(days = 7): Promise<RansomLookPost[]> {
  try {
    const res = await fetch(`${RANSOMLOOK_API}/posts?days=${days}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.posts ?? []) as RansomLookPost[];
  } catch {
    return [];
  }
}

// GET /api/hot/{days} — Trending groups by post activity.
export async function getHotGroups(days = 7): Promise<{ group: string; count: number; last_post: string }[]> {
  try {
    const res = await fetch(`${RANSOMLOOK_API}/hot/${days}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.rows ?? []) as { group: string; count: number; last_post: string }[];
  } catch {
    return [];
  }
}

// GET /api/stats — Platform stats.
export async function getStats(): Promise<Stats | null> {
  try {
    const res = await fetch(`${RANSOMLOOK_API}/stats`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Stats;
  } catch {
    return null;
  }
}

// GET /api/compare?a={g1}&b={g2} — Compare two groups.
export async function compareGroups(g1: string, g2: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${RANSOMLOOK_API}/compare?a=${encodeURIComponent(g1)}&b=${encodeURIComponent(g2)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Extract a ransomware group name from a .onion URL by checking against
// RansomLook's known onion addresses. This maps onion hostnames → group names.
// (In practice, we'd cache the full group list from RansomLook and reverse-lookup.)
export function extractGroupNameFromOnion(onionUrl: string): string | null {
  try {
    const u = new URL(onionUrl);
    const host = u.hostname;
    // Common pattern: group name appears in the onion slug before .onion
    // e.g. embargobe3n5okxyzqphpmk3moinoap2snz5k6765mvtkk7hhi544jid.onion
    // → "embargo" (first word before the random string)
    const match = host.match(/^([a-z]+)[a-z0-9]{16,56}\.onion$/i);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}
