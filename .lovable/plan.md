# Motoru gerçekten link çeken hale getirme

## Neden şu an 0 geliyor (ekran görüntüsü + kod incelemesi)
- DuckDuckGo, sunucu IP'lerini bot olarak engelliyor: tüm aramalar "→ 0".
- GitHub kod araması anahtarsız çalışmıyor (giriş ister): "github → 0".
- Sabit açık listeler (iptv-org) son 6 saatte bir kez eklendiği için tekrar kuyruğa girmiyor: "0 yeni görev".
- Bulunan sayfalardaki yeni linkler kuyruğa geri eklenmiyor, yani motor kendini büyütmüyor.

## Ne yapacağız
1. **Anahtarsız çalışan keşif kaynakları**
   - iptv-org açık veri servisi (streams + channels JSON, ~10 bin akış): toplu, doğrudan içe aktarım.
   - GitHub depo araması (anahtarsız çalışır) + depo dosya ağacından tüm `.m3u/.m3u8` dosyalarını bulma.
   - Bilinen açık Türkçe/dünya liste depoları (Free-TV, iptv-org dil/bölge listeleri vb.) dönüşümlü seed havuzu.
   - Arama motoru yedeği: DuckDuckGo lite + Mojeek/Startpage HTML; engellenirse sessizce atlanır, log'a "engellendi" yazılır.
2. **Kendini büyüten tarama**: başarılı sayfalardaki yeni playlist/embed/player linkleri derinlik +1 ile kuyruğa eklenir; alan adı başına limit ve yasaklı alan listesi.
3. **Akıllı tekrar ekleme**: seed'ler 6 saat yerine kaynak bazlı dönüşümle (her turda farklı dilim) kuyruğa girer; büyük listeler parçalara bölünür (her parça ayrı görev), böylece 40 akış sınırı aşılır.
4. **Hızlı doğrulama hattı**: toplu listelerde önce hafif HEAD/ilk-bayt kontrolü, AI sınıflandırma sadece başlığı belirsiz olanlara; kategori iptv-org metadata'sından gelir (daha az "Diğer").
5. **GitHub token opsiyonu**: istersen ücretsiz bir GitHub token eklenir, kod araması da açılır (zorunlu değil).
6. **Konsolda görünürlük**: Keşif sekmesinde kaynak başına son tur sonucu (bulunan/eklenen/engellendi) ve "kaynağı kapat/aç".

## Beklenen sonuç
İlk turda yüzlerce, sonraki turlarda kuyruk sürekli dolu; "Yeni kayıt" sayacı artar.

## Teknik ayrıntılar
- `discovery.server.ts`: `searchGitHubRepos`, `listRepoPlaylists` (git/trees API), `fetchIptvOrgIndex`, `searchMojeek`; `searchGitHub` token varsa kullanılır.
- `orchestrator.server.ts`: `ingestIptvOrg()` toplu upsert (stream_url çakışmasında güncelle), seed rotasyonu `discovery_queries.last_run_at` üzerinden, playlist chunk görevleri (`crawl_jobs.referer` alanına `#offset=N`), link takibi derinlik ≤2, host başına ≤20 görev/tur.
- Worker başına 6 eşzamanlı istek kuralı korunur; tüm istekler `smartFetch` üzerinden.
- Yeni engine türleri için `discovery_queries` seed migration'ı.
