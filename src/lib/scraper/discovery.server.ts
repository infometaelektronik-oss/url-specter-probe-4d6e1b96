// Madde 1-4: Otonom keşif (DuckDuckGo HTML + GitHub search API + Pastebin trend).
// Google/Yandex/Bing bloklu (bot koruması + terms). DuckDuckGo HTML endpoint açık.
import { smartFetch as safeFetch } from "./fetch.server";

const DDG_ENDPOINT = "https://html.duckduckgo.com/html/";

// DuckDuckGo HTML sonuçlarından URL çıkar
const DDG_RESULT_RE = /<a[^>]+class="result__a"[^>]+href="([^"]+)"/gi;
const DDG_UDDG_RE = /uddg=([^&"']+)/;

export async function searchDuckDuckGo(query: string, limit = 20): Promise<string[]> {
  const url = `${DDG_ENDPOINT}?q=${encodeURIComponent(query)}`;
  const r = await safeFetch(url, { timeoutMs: 10000 });
  if (!r.text) return [];
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const rx = new RegExp(DDG_RESULT_RE.source, "gi");
  while ((m = rx.exec(r.text)) && out.length < limit) {
    let link = m[1];
    const uddg = link.match(DDG_UDDG_RE);
    if (uddg) {
      try {
        link = decodeURIComponent(uddg[1]);
      } catch {
        /* ignore */
      }
    }
    if (link.startsWith("//")) link = "https:" + link;
    if (/^https?:\/\//.test(link)) out.push(link);
  }
  return Array.from(new Set(out));
}

// GitHub public code search
export async function searchGitHub(query: string, limit = 15): Promise<string[]> {
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(query + " extension:m3u")}&per_page=${limit}`;
  const r = await safeFetch(url, { timeoutMs: 10000 });
  if (!r.text) return [];
  try {
    const j = JSON.parse(r.text) as {
      items?: Array<{ html_url?: string; url?: string; path?: string; repository?: { full_name?: string } }>;
    };
    const out: string[] = [];
    for (const it of j.items ?? []) {
      if (it.repository?.full_name && it.path) {
        // raw content endpoint
        out.push(
          `https://raw.githubusercontent.com/${it.repository.full_name}/HEAD/${it.path}`,
        );
      }
    }
    return out;
  } catch {
    return [];
  }
}

// Pastebin trend/arşiv (public paste'ler)
export async function scanPastebinTrends(): Promise<string[]> {
  // Pastebin trend sayfası artık login-walled; alternatif: pastebin.com/archive
  const r = await safeFetch("https://pastebin.com/archive", { timeoutMs: 8000 });
  if (!r.text) return [];
  const rx = /href="\/([A-Za-z0-9]{8})"/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(r.text)) && out.length < 20) {
    out.push(`https://pastebin.com/raw/${m[1]}`);
  }
  return Array.from(new Set(out));
}

// --- Anahtarsız çalışan ek kaynaklar ---

const MOJEEK_RE = /<a[^>]+class="ob"[^>]+href="([^"]+)"/gi;
export async function searchMojeek(query: string, limit = 15): Promise<string[]> {
  const r = await safeFetch(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}`, { timeoutMs: 10000 });
  if (!r.text) return [];
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const rx = new RegExp(MOJEEK_RE.source, "gi");
  while ((m = rx.exec(r.text)) && out.size < limit) if (/^https?:\/\//.test(m[1])) out.add(m[1]);
  return Array.from(out);
}

const GH_HEADERS = (): Record<string, string> => {
  const t = process.env["GITHUB_TOKEN"];
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/** Repo araması anahtarsız çalışır; dosya ağacından tüm playlistleri çıkarır. */
export async function searchGitHubRepos(query: string, repos = 4): Promise<string[]> {
  const out: string[] = [];
  try {
    const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&per_page=${repos}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "core-stream-engine", ...GH_HEADERS() },
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { items?: Array<{ full_name: string; default_branch: string }> };
    for (const repo of j.items ?? []) out.push(...(await listRepoPlaylists(repo.full_name, repo.default_branch)));
  } catch { /* ignore */ }
  return out;
}

export async function listRepoPlaylists(fullName: string, branch = "HEAD", max = 25): Promise<string[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}/git/trees/${branch}?recursive=1`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "core-stream-engine", ...GH_HEADERS() },
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { tree?: Array<{ path: string; type: string }> };
    return (j.tree ?? [])
      .filter((f) => f.type === "blob" && /\.m3u8?$/i.test(f.path))
      .slice(0, max)
      .map((f) => `https://raw.githubusercontent.com/${fullName}/${branch}/${f.path.split("/").map(encodeURIComponent).join("/")}`);
  } catch { return []; }
}

/** Açık, sürekli güncellenen liste havuzu (dönüşümlü). */
export const SEED_PLAYLISTS: string[] = [
  ...["tr", "az", "cy", "de", "nl", "fr", "gb", "us", "it", "es", "ru", "ua", "ar", "ae", "sa", "eg", "in", "br", "mx", "jp", "kr"].map((c) => `https://iptv-org.github.io/iptv/countries/${c}.m3u`),
  ...["news", "sports", "movies", "series", "music", "kids", "entertainment", "documentary", "general", "religious", "classic", "comedy", "culture", "animation"].map((c) => `https://iptv-org.github.io/iptv/categories/${c}.m3u`),
  ...["tur", "eng", "ara", "deu", "fra", "rus", "spa"].map((l) => `https://iptv-org.github.io/iptv/languages/${l}.m3u`),
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8",
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_turkey.m3u8",
];

export const GITHUB_REPO_QUERIES = ["iptv m3u turkey", "turkish iptv", "iptv playlist m3u8", "canli tv m3u", "free iptv m3u", "iptv sports m3u"];

export type IptvOrgStream = { url: string; title: string; category: string; country: string | null; quality: string | null; referrer: string | null; user_agent: string | null };

/** iptv-org açık API: streams + channels birleştirilmiş. */
export async function fetchIptvOrgIndex(): Promise<IptvOrgStream[]> {
  const [sRes, cRes] = await Promise.all([
    fetch("https://iptv-org.github.io/api/streams.json"),
    fetch("https://iptv-org.github.io/api/channels.json"),
  ]);
  if (!sRes.ok) return [];
  const streams = (await sRes.json()) as Array<{ channel: string | null; url: string; title?: string; quality?: string | null; referrer?: string | null; user_agent?: string | null }>;
  const chMap = new Map<string, { name: string; categories: string[]; country: string; is_nsfw?: boolean }>();
  if (cRes.ok) {
    const chans = (await cRes.json()) as Array<{ id: string; name: string; categories: string[]; country: string; is_nsfw?: boolean }>;
    for (const c of chans) chMap.set(c.id, c);
  }
  const out: IptvOrgStream[] = [];
  for (const s of streams) {
    const ch = s.channel ? chMap.get(s.channel) : undefined;
    if (ch?.is_nsfw) continue;
    out.push({
      url: s.url, title: s.title || ch?.name || s.channel || "Kanal",
      category: ch?.categories?.[0] ?? "general", country: ch?.country ?? null,
      quality: s.quality ?? null, referrer: s.referrer ?? null, user_agent: s.user_agent ?? null,
    });
  }
  return out;
}
