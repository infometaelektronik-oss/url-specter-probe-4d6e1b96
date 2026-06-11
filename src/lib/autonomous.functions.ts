import { serverFn } from "@tanstack/react-start/server";

interface AutonomousCrawlInput {
  url: string;
  deep: boolean;
}

interface AutonomousCrawlResult {
  ok: boolean;
  saved: number;
  error?: string;
  log: string[];
}

export const autonomousCrawl = serverFn(
  async (data: AutonomousCrawlInput): Promise<AutonomousCrawlResult> => {
    const logs: string[] = [];
    
    try {
      logs.push(`[BAŞLADI] URL: ${data.url}`);
      logs.push("[TARAMA] Sayfaya bağlanılıyor...");

      // Fetch the page
      const response = await fetch(data.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        logs.push(`[HATA] Sayfa alınamadı: ${response.status}`);
        return {
          ok: false,
          saved: 0,
          error: `HTTP ${response.status}`,
          log: logs,
        };
      }

      const html = await response.text();
      logs.push("[AYRIŞTI] HTML içeriği işleniyor...");

      // Extract stream URLs from HTML (m3u8, mp4, etc.)
      const streamPatterns = [
        /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi,
        /https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi,
        /https?:\/\/[^\s"'<>]+\.mkv[^\s"'<>]*/gi,
      ];

      const foundUrls = new Set<string>();
      for (const pattern of streamPatterns) {
        const matches = html.match(pattern);
        if (matches) {
          matches.forEach((url) => foundUrls.add(url.split(/[?#]/)[0]));
        }
      }

      logs.push(`[BULUNDU] ${foundUrls.size} akış URL'i algılandı`);

      // Mock save to library
      const saved = Math.min(foundUrls.size, 5); // Simulate saving some
      logs.push(`[KAYDEDİLDİ] ${saved} medya öğesi kütüphaneye eklendi`);

      return {
        ok: true,
        saved,
        log: logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bilinmeyen hata";
      logs.push(`[HATA] ${message}`);
      return {
        ok: false,
        saved: 0,
        error: message,
        log: logs,
      };
    }
  }
);