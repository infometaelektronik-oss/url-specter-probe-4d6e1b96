# Otonom Medya Kütüphanesi

Tek tıkla URL tara, AI ile dizi-film-canlı yayın olarak organize et, kırık linkleri otomatik ele, kütüphaneye kaydet.

## Proje Özellikleri

- **Otonom Tarama**: URL girerek medya içeriğini otomatik olarak tarayın
- **Akıllı Kategorize**: AI destekli olarak dizileri, filmleri ve canlı yayınları otomatik kategorize edin
- **Link Doğrulama**: Tüm linkleri kontrol ederek ölü linkleri otomatik tespit edin
- **Kütüphane Yönetimi**: Tüm medya içeriğinizi merkezi bir kütüphanede saklayın
- **HLS Oynatıcı**: Modern video oynatma desteği
- **Türkçe Arayüz**: Tam Türkçe kullanıcı arayüzü

## Teknoloji Stack

- **Frontend**: React 19 + TanStack Start
- **Styling**: Tailwind CSS + Radix UI
- **Oynatıcı**: HLS.js
- **Form Yönetimi**: React Hook Form
- **Veri Sorgulama**: TanStack React Query
- **Yönlendirme**: TanStack React Router
- **TypeScript**: 5.8

## Kurulum

### Gereksinimler

- Node.js 18+
- npm veya yarn

### Adımlar

1. Depoyu klonlayın:
```bash
git clone https://github.com/infometaelektronik-oss/url-specter-probe-4d6e1b96.git
cd url-specter-probe-4d6e1b96
```

2. Bağımlılıkları yükleyin:
```bash
npm install
```

3. Çalışma ortamını ayarlayın:
```bash
cp .env.example .env.local
```

4. Geliştirme sunucusunu başlatın:
```bash
npm run dev
```

5. Tarayıcınızda açın:
```
http://localhost:5173
```

## Mevcut Komutlar

- `npm run dev` - Geliştirme sunucusunu başlat
- `npm run build` - Üretim derlemesi
- `npm run build:dev` - Geliştirme modunda derleme
- `npm run preview` - Derlenmiş sürümün önizlemesi
- `npm run lint` - Kod linting
- `npm run format` - Kodu biçimlendir

## Proje Yapısı

```
src/
├── routes/          # TanStack Start dosya tabanlı rotaları
│   ├── __root.tsx   # Kök layout
│   └── index.tsx    # Ana sayfa
├── components/      # Reusable React bileşenleri
│   ├── HlsPlayer.tsx
│   └── ui/
├── lib/             # Yardımcı fonksiyonlar ve business logic
│   ├── autonomous.functions.ts
│   ├── library.functions.ts
│   └── lovable-error-reporting.ts
├── styles.css       # Global stiller
└── server.ts        # SSR sunucu ayarları
```

## API Fonksiyonları

### `autonomousCrawl(url: string, deep: boolean)`
Verilen URL'den medya içeriğini tarar ve kütüphaneye ekler.

**Parametreler:**
- `url`: Taranacak sayfa URL'si
- `deep`: Derin tarama yapılıp yapılmayacağı

**Dönüş:**
```typescript
{
  ok: boolean
  saved: number
  error?: string
  log: string[]
}
```

### `listLibrary()`
Tüm medya öğelerini listeler.

**Dönüş:**
```typescript
{
  items: LibraryItem[]
}
```

### `reverifyLibrary()`
Tüm linkleri yeniden doğrular.

**Dönüş:**
```typescript
{
  checked: number
  alive: number
}
```

### `deleteDeadItems()`
Ölü linkleri siler.

**Dönüş:**
```typescript
{
  ok: boolean
  removed: number
}
```

## Türkçe TV Kanalları Ön Ayarları

Uygulama aşağıdaki TV kanallarından içerik taraması için ön ayarlar içerir:

- Kanal D
- Star TV
- Show TV
- ATV
- NOW
- TV8
- FOX
- TRT İzle
- TRT 1 Canlı
- PuhuTV

## Geliştirme Rehberi

### Yeni Bileşen Ekleme

`src/components/` içine `.tsx` dosyası ekleyin:

```typescript
export function MyComponent() {
  return <div>İçerik</div>;
}
```

### Yeni Rota Ekleme

`src/routes/` içinde TanStack Start dosya tabanlı yönlendirme kullanın:

```typescript
export const Route = createFileRoute("/my-page")({
  component: MyPage,
});
```

### Sunucu Fonksiyonu Ekleme

`src/lib/` içine `.functions.ts` dosyası ekleyin ve `serverFn` kullanın:

```typescript
export const myFunction = serverFn(async (input) => {
  // Sunucu kodu buraya gelir
  return result;
});
```

## Lisans

MIT

## Destek

Sorunlar ve öneriler için [Issues](https://github.com/infometaelektronik-oss/url-specter-probe-4d6e1b96/issues) bölümünü kullanın.