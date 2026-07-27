# Sahne — kişisel müzik odan

Kişisel, **ticari olmayan** bir öğrenim projesi. YouTube'un içeriklerini, resmi
"Data API"si yerine youtube.com'un kendi arayüzünün kullandığı iç protokolü
(InnerTube) saran açık kaynaklı **`youtubei.js`** kütüphanesiyle arar; oynatma
ise YouTube'un resmi **IFrame Player**'ı üzerinden yapılır. Bu sayede kişisel
bir API anahtarı gerekmez.

> ⚠️ InnerTube, YouTube tarafından resmi olarak desteklenmeyen, tersine
> mühendislikle çözülmüş bir arayüzdür. Herhangi bir noktada değişebilir/
> kırılabilir. Bu proje yalnızca kişisel öğrenim amaçlıdır, dağıtılmak veya
> ticarileştirilmek için tasarlanmamıştır.

## Kurulum

```bash
cd yt-music-learn
npm install
npm start
```

Sunucu `http://localhost:5177` adresinde açılır.

## Mimari

```
yt-music-learn/
  server.js          → Express sunucusu + /api/search (youtubei.js ile)
  public/
    index.html        → Uygulama iskeleti (rail nav, arama, mini/tam ekran çalar)
    styles.css         → Tasarım sistemi ("gece yarısı analog dinleme odası")
    app.js              → Tüm istemci mantığı
    manifest.json        → PWA meta verisi (ana ekrana ekleme)
```

- **Arama**: `GET /api/search?q=...` → backend, `youtubei.js` ile YouTube'da
  video arar, temizlenmiş bir JSON döner (id, başlık, sanatçı, kapak, süre).
- **Oynatma**: İstemci, gizli bir YouTube IFrame Player örneği üzerinden sesi
  çalar; arayüzde görünen "disk" tamamen albüm kapağı görselidir (video
  görünmez, yalnızca ses akışı kullanılır).
- **Sözler**: [lrclib.net](https://lrclib.net) — ücretsiz, anahtarsız, açık
  API. Senkronize (LRC) söz varsa satır satır vurgulanır; yoksa düz metin
  gösterilir; hiç bulunamazsa nazikçe haber verilir.
- **Çalma listeleri / geçmiş**: Hesap gerektirmeden, tarayıcının
  `localStorage`'ında saklanır — tamamen cihazda kalır.

## Şu ana kadar yapılanlar

- [x] Arama (InnerTube üzerinden, API anahtarsız)
- [x] Mini çalar + tam ekran "Şimdi Çalıyor" görünümü
- [x] Albüm kapağından üretilen dinamik ortam (ambient) rengi
- [x] Senkronize / düz şarkı sözleri paneli
- [x] Kuyruk, karıştır, tekrar modları
- [x] Çalma listeleri ve dinleme geçmişi (localStorage)
- [x] Mobil (alt sekme çubuğu) + masaüstü (yan rail) düzeni
- [x] Medya tuşu desteği (Media Session API) ve klavye kısayolları
      (Boşluk = oynat/duraklat, Shift+→/← = sonraki/önceki, Esc = kapat)
- [x] Temel PWA manifest'i (ana ekrana ekleme)
