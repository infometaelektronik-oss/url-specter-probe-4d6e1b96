// Madde 1-4: Otonom keşif (DuckDuckGo HTML + GitHub search API + Pastebin trend).
// Google/Yandex/Bing bloklu (bot koruması + terms). DuckDuckGo HTML endpoint açık.
import { safeFetch } from "./user-agents";

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
