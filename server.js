// server.js
// -----------------------------------------------------------------------------
// Kişisel / öğrenim amaçlı, ticari olmayan bir müzik keşif & dinleme uygulaması.
// Arama, YouTube'un resmi "Data API"si YERİNE, youtube.com'un kendi arayüzünün
// kullandığı iç (InnerTube) protokolünü saran açık kaynak "youtubei.js"
// kütüphanesi ile yapılır. Bu sayede kişisel bir API anahtarı gerekmez.
// Bu, YouTube tarafından resmi olarak desteklenmeyen (unofficial) bir yöntemdir;
// yalnızca kişisel/deneysel kullanım için uygundur.
// -----------------------------------------------------------------------------

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Innertube } from 'youtubei.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5177;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Tek bir Innertube oturumunu yeniden kullanmak, her istekte yeniden
// oturum açmaktan çok daha hızlıdır.
let ytClientPromise = null;
function getClient() {
  if (!ytClientPromise) {
    ytClientPromise = Innertube.create({ generate_session_locally: true });
  }
  return ytClientPromise;
}

function pickBestThumbnail(thumbnails) {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return null;
  return thumbnails.reduce((best, t) => (t.width > (best?.width || 0) ? t : best), null)?.url || null;
}

function normalizeVideo(item) {
  try {
    const id = item.id || item.video_id;
    if (!id) return null;
    const title = item.title?.text || item.title?.toString?.() || 'Bilinmeyen başlık';
    const author =
      item.author?.name ||
      item.author?.toString?.() ||
      item?.metadata?.author ||
      'Bilinmeyen sanatçı';
    const thumbnails = item.thumbnails || item.thumbnail?.contents || item?.best_thumbnail ? [item.best_thumbnail] : [];
    const thumbnail =
      pickBestThumbnail(item.thumbnails) ||
      pickBestThumbnail(item.thumbnail?.contents) ||
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    const durationText =
      item.duration?.text || item.length_text?.text || item.duration?.toString?.() || '';
    const viewCountText =
      item.view_count?.text || item.short_view_count?.text || item.view_count?.toString?.() || '';

    return { id, title, author, thumbnail, duration: durationText, views: viewCountText };
  } catch {
    return null;
  }
}

app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'Sorgu (q) gerekli' });

  try {
    const yt = await getClient();
    const search = await yt.search(q, { type: 'video' });

    const rawItems =
      search?.results?.filter?.((r) => r?.type === 'Video') ||
      search?.videos ||
      search?.results ||
      [];

    const results = rawItems.map(normalizeVideo).filter(Boolean).slice(0, 30);

    res.json({ query: q, results });
  } catch (err) {
    console.error('Arama hatası:', err);
    res.status(502).json({ error: 'YouTube araması başarısız oldu', detail: String(err?.message || err) });
  }
});

// Basit sağlık kontrolü
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`yt-music-learn sunucusu http://localhost:${PORT} adresinde çalışıyor`);
});
