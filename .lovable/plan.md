# Otonom Medya Sistemi v2

Sistemi tek bir "Otonom Tara" butonuyla baştan sona kendi kendine çalışan, sonuçları veritabanında saklayan ve kırık linkleri eleyen bir platforma çeviriyoruz.

## Ana Akış (otonom)

1. Kullanıcı bir URL girer veya preset seçer → "Otonom Tara" tıklar.
2. Sunucu sırayla şunları yapar (tek RPC, ilerleme stream):
   - Kök sayfayı tara (UA rotasyonu + retry).
   - Aday sayfaları paralel çöz (eşzamanlılık 4).
   - Her sayfadan m3u8 / mp4 / mpd / iframe çıkar.
   - **Kırık link filtresi**: her akış için HEAD/Range isteği — 2xx/206 değilse ele.
   - **Fragman filtresi**: başlık + süre + URL heuristic ("fragman", "teaser", "shorts", <5dk).
   - AI organize (Gemini 2.5 Flash, mevcut `organize.functions.ts` güçlendirilmiş prompt + tool schema).
   - Sonuçları DB'ye yaz (upsert, kaynak URL hash'i ile).
3. UI sonuçları DB'den canlı listeler, eski taramalar da geçmiş sekmesinde görünür.

## Veritabanı (Lovable Cloud)

Tek tablo `media_items` (public, RLS açık, herkese SELECT — bu uygulama auth'suz):
- `id uuid pk`, `source_url text`, `title text`, `kind text check (dizi|film|canli)`,
- `season int`, `episode int`, `episode_name text`, `year int`,
- `stream_url text`, `thumbnail text`, `is_alive bool default true`,
- `last_checked_at timestamptz`, `created_at timestamptz default now()`,
- `unique (source_url, stream_url)`.

İkinci tablo `crawl_runs`: `id, root_url, status, log jsonb, item_count, created_at`.

Grants + RLS:
```sql
grant select on public.media_items to anon, authenticated;
grant all on public.media_items to service_role;
alter table public.media_items enable row level security;
create policy "public read" on public.media_items for select using (true);
-- yazma sadece service_role (server fn üzerinden)
```

## Kırık Link Doğrulama

`src/lib/probe.functions.ts` — tek bir URL'ye HEAD; HEAD desteklemezse `Range: bytes=0-1` GET; 200/206 değilse ölü. m3u8 için ilk segment listesini de parse edip 1 segment doğrular. Sonuç DB `is_alive` alanına yazılır.

Arka plan periyodik tazeleme: kullanıcı "Linkleri Doğrula" butonuna basınca tüm `media_items` paralel (eşzamanlılık 6) yeniden kontrol edilir.

## Tarama İyileştirmeleri

- Preset listesi genişler: Kanal D, Star, Show, ATV, NOW, TRT, Fox, TV8, CNN Türk, Habertürk, NTV, Beyaz TV, A Haber, TLC, DMAX, PuhuTV, beIN Connect (free), Exxen public.
- HTML çekiminde 2 kez UA rotasyonu + 1 saniye backoff (mevcut `crawl.functions.ts` zaten var, retry sayısı 3'e çıkar).
- Başlık çıkarımı: `og:title`, `<title>`, `aria-label`, link metni — en uzun anlamlı olanı.
- Thumbnail: `og:image`, `<img src>`, `data-src`, srcset ilk büyük varyant.
- Fragman/shorts filtresi: regex + AI prompt'una "süre tahminin <5dk ise ele" kuralı.

## AI Organize Güçlendirme

- Model: `google/gemini-2.5-flash` (mevcut).
- Prompt'a Türk dizi/film kanalları sözlüğü eklenir, kanal adı normalizasyonu netleşir.
- Tool schema'ya `confidence` (0-1) ve `isTrailer` alanları eklenir; `isTrailer=true` veya `confidence<0.4` olanlar drop edilir.
- Hata kodları (`429`, `402`) UI'da net mesajla gösterilir.

## UI/UX

- Tek "Otonom Tara" CTA + URL inputu, presetler chip olarak.
- Sol panel: canlı ilerleme log'u (sunucu fonksiyonu adım adım dönerken).
- Sağ panel: 3 sekme — **Diziler** (akordeon: dizi → sezon → bölüm), **Filmler** (kart grid, yıl rozeti), **Canlı** (logo kart).
- Her kartta: oynat, kopyala, "ölü link" badge'i (kırmızı), yenile.
- Yerleşik HLS player modal (mevcut `HlsPlayer` korunur, daha temiz çerçeve).
- Hata mesajları toast (`sonner`) ile.
- Boş durum illüstrasyonları + yüklenme skeleton'ları.

## Teknik Dosya Değişiklikleri

- **Yeni**: `src/lib/probe.functions.ts`, `src/lib/autonomous.functions.ts` (orkestre), `src/lib/media-db.functions.ts` (DB upsert + list).
- **Migration**: `media_items` + `crawl_runs` + grants + RLS.
- **Değişiklik**: `src/lib/organize.functions.ts` (confidence + isTrailer), `src/routes/index.tsx` (tek CTA + sekmeli UI), `src/components/HlsPlayer.tsx` (modal çerçeve).
- Lovable Cloud zorunlu — etkinleştirilecek.

## Kapsam dışı (bu turda yapmıyorum)

- Cron ile periyodik otomatik tarama (manuel "Doğrula" butonu var).
- Kullanıcı hesapları / favoriler (RLS açık ama auth yok).
- DRM korumalı yayınlar (beIN, Disney+, Netflix vb. — zaten teknik olarak mümkün değil).
