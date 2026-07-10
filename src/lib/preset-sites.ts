// Server-side extended preset site list for autonomous crawling.
// The cron job walks each active URL, extracts links + streams, then AI-categorizes.

export type PresetSite = {
  url: string;
  label: string;
  kind: "dizi" | "film" | "canli" | "auto";
};

export const PRESET_SITES: PresetSite[] = [
  // Ana yayıncılar — dizi
  { label: "Kanal D Diziler", url: "https://www.kanald.com.tr/diziler", kind: "dizi" },
  { label: "Star TV Diziler", url: "https://www.startv.com.tr/dizi", kind: "dizi" },
  { label: "Show TV Diziler", url: "https://www.showtv.com.tr/diziler", kind: "dizi" },
  { label: "ATV Diziler", url: "https://www.atv.com.tr/diziler", kind: "dizi" },
  { label: "NOW TV Diziler", url: "https://www.nowtv.com.tr/diziler", kind: "dizi" },
  { label: "TRT İzle Diziler", url: "https://www.trtizle.com/dizi", kind: "dizi" },
  { label: "TV8 Diziler", url: "https://www.tv8.com.tr/diziler", kind: "dizi" },
  { label: "PuhuTV", url: "https://puhutv.com", kind: "auto" },

  // Canlı yayın havuzları
  { label: "TRT 1 Canlı", url: "https://www.trtizle.com/canli/tv/trt-1", kind: "canli" },
  { label: "TRT Haber Canlı", url: "https://www.trtizle.com/canli/tv/trt-haber", kind: "canli" },
  { label: "Kanal D Canlı", url: "https://www.kanald.com.tr/canli-yayin", kind: "canli" },
  { label: "Star TV Canlı", url: "https://www.startv.com.tr/canli-yayin", kind: "canli" },
  { label: "Show TV Canlı", url: "https://www.showtv.com.tr/canli-yayin", kind: "canli" },
  { label: "ATV Canlı", url: "https://www.atv.com.tr/canli-yayin", kind: "canli" },
  { label: "NOW Canlı", url: "https://www.nowtv.com.tr/canli-yayin", kind: "canli" },
  { label: "TV8 Canlı", url: "https://www.tv8.com.tr/canli-yayin", kind: "canli" },

  // Film / dizi arşiv siteleri (kamuya açık kaynaklar)
  { label: "TRT İzle Filmler", url: "https://www.trtizle.com/film", kind: "film" },
];
