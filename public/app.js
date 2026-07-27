// app.js — Sahne
// Kişisel / öğrenim amaçlı, ticari olmayan bir müzik dinleme arayüzü.
'use strict';

/* ------------------------------------------------------------------ *
 *  Yardımcılar
 * ------------------------------------------------------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function cleanForLyricsSearch(str) {
  return (str || '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/official( music)? video/gi, '')
    .replace(/lyrics?/gi, '')
    .replace(/ft\.?.*$/i, '')
    .replace(/\s+-\s+topic$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* dolu olabilir */ }
}

/* ------------------------------------------------------------------ *
 *  Uygulama durumu
 * ------------------------------------------------------------------ */
const state = {
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  shuffle: false,
  repeat: 'off', // off | all | one
  playlists: storageGet('sahne:playlists', []),
  history: storageGet('sahne:history', []),
  lyricsLines: null,   // [{time, text}] veya null
  lyricsPlain: null,   // düz metin satırları veya null
  volume: storageGet('sahne:volume', 80),
};

function currentTrack() {
  return state.queue[state.currentIndex] || null;
}

/* ------------------------------------------------------------------ *
 *  Görünüm (view) geçişleri
 * ------------------------------------------------------------------ */
function setView(name) {
  $$('.view').forEach(v => v.hidden = v.dataset.view !== name);
  $$('.rail-btn').forEach(b => b.classList.toggle('is-active', b.dataset.view === name));
  if (name === 'library') renderPlaylists();
  if (name === 'history') renderHistory();
}
$$('.rail-btn').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));

/* ------------------------------------------------------------------ *
 *  Arama
 * ------------------------------------------------------------------ */
const searchForm = $('#search-form');
const searchInput = $('#search-input');
const resultsList = $('#results-list');
const searchStatus = $('#search-status');
const searchEmpty = $('#search-empty');

let searchDebounce = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const q = searchInput.value.trim();
  if (!q) { resultsList.innerHTML = ''; searchEmpty.hidden = false; searchStatus.hidden = true; return; }
  searchDebounce = setTimeout(() => runSearch(q), 420);
});
searchForm.addEventListener('submit', e => {
  e.preventDefault();
  clearTimeout(searchDebounce);
  const q = searchInput.value.trim();
  if (q) runSearch(q);
});

async function runSearch(q) {
  searchEmpty.hidden = true;
  searchStatus.hidden = false;
  searchStatus.textContent = 'Aranıyor…';
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error('search failed');
    const data = await res.json();
    renderResults(data.results || []);
    searchStatus.hidden = true;
  } catch (err) {
    searchStatus.textContent = 'Arama yapılamadı. Sunucu (server.js) çalışıyor mu?';
  }
}

function trackRow(track, { showActions = true } = {}) {
  const li = document.createElement('li');
  li.className = 'track-row';
  li.innerHTML = `
    <img class="track-thumb" src="${track.thumbnail}" alt="" loading="lazy" />
    <div class="track-info">
      <div class="track-title">${escapeHtml(track.title)}</div>
      <div class="track-author">${escapeHtml(track.author)}</div>
    </div>
    <span class="track-duration">${track.duration || ''}</span>
    ${showActions ? `<div class="track-row-actions">
      <button class="icon-btn add-btn" title="Çalma listesine ekle" aria-label="Çalma listesine ekle">
        <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>` : ''}
  `;
  li.addEventListener('click', (e) => {
    if (e.target.closest('.add-btn')) return;
    playFromContext(track, state._lastResultList || [track]);
  });
  const addBtn = li.querySelector('.add-btn');
  if (addBtn) addBtn.addEventListener('click', (e) => { e.stopPropagation(); openAddToPlaylist(track); });
  return li;
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function renderResults(results) {
  state._lastResultList = results;
  resultsList.innerHTML = '';
  if (!results.length) {
    searchStatus.hidden = false;
    searchStatus.textContent = 'Sonuç bulunamadı.';
    return;
  }
  results.forEach(t => resultsList.appendChild(trackRow(t)));
}

/* ------------------------------------------------------------------ *
 *  YouTube IFrame Player — yalnızca ses kaynağı olarak kullanılır.
 *  Görsel olarak albüm kapağı gösterilir (plak/disk metaforu).
 * ------------------------------------------------------------------ */
let ytPlayer = null;
let ytReady = false;
let progressTimer = null;

window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player('yt-player', {
    height: '1', width: '1', videoId: '',
    playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, modestbranding: 1, origin: location.origin },
    events: { onReady: onPlayerReady, onStateChange: onPlayerStateChange },
  });
};

function onPlayerReady() {
  ytReady = true;
  if (ytPlayer.setVolume) ytPlayer.setVolume(state.volume);
}

function onPlayerStateChange(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    state.isPlaying = true; syncPlayIcons(); startProgressTimer();
  } else if (e.data === YT.PlayerState.PAUSED) {
    state.isPlaying = false; syncPlayIcons(); stopProgressTimer();
  } else if (e.data === YT.PlayerState.ENDED) {
    onTrackEnded();
  }
}

function startProgressTimer() {
  stopProgressTimer();
  progressTimer = setInterval(updateProgressUI, 250);
}
function stopProgressTimer() { clearInterval(progressTimer); progressTimer = null; }

function updateProgressUI() {
  if (!ytReady || !ytPlayer.getDuration) return;
  const dur = ytPlayer.getDuration() || 0;
  const cur = ytPlayer.getCurrentTime() || 0;
  const pct = dur ? (cur / dur) * 100 : 0;
  $('#mini-progress-fill').style.width = pct + '%';
  $('#fs-scrub').value = pct;
  $('#fs-scrub').style.setProperty('--pct', pct + '%');
  $('#fs-time-current').textContent = fmtTime(cur);
  $('#fs-time-total').textContent = fmtTime(dur);
  updateActiveLyric(cur);

  const npFill = $('#ipod-np-progress-fill');
  if (npFill) npFill.style.width = pct + '%';
  const npCur = $('#ipod-np-time-current');
  if (npCur) npCur.textContent = fmtTime(cur);
  const npTot = $('#ipod-np-time-total');
  if (npTot) npTot.textContent = fmtTime(dur);
}

/* ------------------------------------------------------------------ *
 *  Oynatma / kuyruk mantığı
 * ------------------------------------------------------------------ */
function playFromContext(track, contextList) {
  const list = contextList && contextList.length ? contextList.slice() : [track];
  const idx = list.findIndex(t => t.id === track.id);
  state.queue = list;
  state.currentIndex = idx >= 0 ? idx : 0;
  loadCurrent();
}

function loadCurrent() {
  const track = currentTrack();
  if (!track) return;
  if (!ytReady) { setTimeout(loadCurrent, 300); return; }
  ytPlayer.loadVideoById(track.id);
  ytPlayer.playVideo();
  updateNowPlayingUI(track);
  addToHistory(track);
  loadLyricsFor(track);
  updateAmbientColor(track);
  updateMediaSession(track);
  $('#mini-player').hidden = false;
  renderQueue();
  if (typeof renderRetroScreen === 'function' && !$('#retro-overlay').hidden) renderRetroScreen();
}

function togglePlay() {
  if (!ytReady) return;
  const s = ytPlayer.getPlayerState();
  if (s === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
  else ytPlayer.playVideo();
}

function playNext(auto = false) {
  if (!state.queue.length) return;
  if (state.repeat === 'one' && auto) { loadCurrent(); return; }
  let next;
  if (state.shuffle) {
    next = Math.floor(Math.random() * state.queue.length);
  } else {
    next = state.currentIndex + 1;
    if (next >= state.queue.length) {
      if (state.repeat === 'all') next = 0;
      else return;
    }
  }
  state.currentIndex = next;
  loadCurrent();
}
function playPrev() {
  if (!state.queue.length) return;
  if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getCurrentTime() > 4) { ytPlayer.seekTo(0, true); return; }
  let prev = state.currentIndex - 1;
  if (prev < 0) prev = state.repeat === 'all' ? state.queue.length - 1 : 0;
  state.currentIndex = prev;
  loadCurrent();
}
function onTrackEnded() { playNext(true); }

function syncPlayIcons() {
  const playPath = 'M8 5v14l11-7z';
  const pausePath = 'M7 5h4v14H7zM13 5h4v14h-4z';
  $('#mini-play-icon').innerHTML = `<path d="${state.isPlaying ? pausePath : playPath}" fill="currentColor"/>`;
  $('#fs-play-icon').innerHTML = `<path d="${state.isPlaying ? pausePath : playPath}" fill="currentColor"/>`;
  $('#fs-disc').classList.toggle('is-spinning', state.isPlaying);

  const wheelIcon = $('#wheel-play-icon');
  if (wheelIcon) wheelIcon.innerHTML = `<path d="${state.isPlaying ? pausePath : playPath}" fill="currentColor"/>`;
  const statusPlay = $('#ipod-status-play');
  if (statusPlay) statusPlay.classList.toggle('is-on', state.isPlaying);
}

function updateNowPlayingUI(track) {
  $('#mini-title').textContent = track.title;
  $('#mini-author').textContent = track.author;
  $('#mini-art-frame').style.backgroundImage = `url(${track.thumbnail})`;
  $('#fs-title').textContent = track.title;
  $('#fs-author').textContent = track.author;
  $('#fs-art-frame').style.backgroundImage = `url(${track.thumbnail})`;
  $$('.track-row').forEach(r => r.classList.remove('is-current'));
}

/* ambient renk: küçük bir canvas'a thumbnail çizip baskın rengi tahmin eder */
function updateAmbientColor(track) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, 16, 16);
      const data = ctx.getImageData(0, 0, 16, 16).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; n++; }
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
      const amb = document.getElementById('fs-ambient');
      amb.style.setProperty('--amb-a', `rgb(${r},${g},${b})`);
      amb.style.setProperty('--amb-b', `rgb(${Math.round(r*0.5)},${Math.round(g*0.4)},${Math.round(b*0.4)})`);
    } catch { /* CORS engelleyebilir; sessizce yoksay */ }
  };
  img.src = track.thumbnail;
}

function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title, artist: track.author, artwork: [{ src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' }],
  });
  navigator.mediaSession.setActionHandler('play', togglePlay);
  navigator.mediaSession.setActionHandler('pause', togglePlay);
  navigator.mediaSession.setActionHandler('previoustrack', playPrev);
  navigator.mediaSession.setActionHandler('nexttrack', () => playNext(false));
}

/* ------------------------------------------------------------------ *
 *  Mini çalar kontrolleri
 * ------------------------------------------------------------------ */
$('#mini-play').addEventListener('click', togglePlay);
$('#mini-next').addEventListener('click', () => playNext(false));
$('#mini-prev').addEventListener('click', playPrev);
$('#mini-expand-btn').addEventListener('click', openFullscreen);
$('#mini-queue-btn').addEventListener('click', () => { openFullscreen(); switchFsTab('queue'); });

/* ------------------------------------------------------------------ *
 *  Tam ekran oynatıcı
 * ------------------------------------------------------------------ */
const fsPlayer = $('#fullscreen-player');
function openFullscreen() { fsPlayer.hidden = false; }
function closeFullscreen() { fsPlayer.hidden = true; }
$('#fs-collapse-btn').addEventListener('click', closeFullscreen);
$('#fs-play').addEventListener('click', togglePlay);
$('#fs-next').addEventListener('click', () => playNext(false));
$('#fs-prev').addEventListener('click', playPrev);
$('#fs-add-btn').addEventListener('click', () => { const t = currentTrack(); if (t) openAddToPlaylist(t); });

$('#fs-shuffle').addEventListener('click', (e) => {
  state.shuffle = !state.shuffle;
  e.currentTarget.style.color = state.shuffle ? 'var(--accent-amber)' : '';
});
$('#fs-repeat').addEventListener('click', (e) => {
  const order = ['off', 'all', 'one'];
  state.repeat = order[(order.indexOf(state.repeat) + 1) % order.length];
  e.currentTarget.style.color = state.repeat === 'off' ? '' : 'var(--accent-amber)';
  e.currentTarget.title = { off: 'Tekrar kapalı', all: 'Tümünü tekrarla', one: 'Şarkıyı tekrarla' }[state.repeat];
});

const scrub = $('#fs-scrub');
let scrubbing = false;
scrub.addEventListener('input', () => {
  scrubbing = true;
  scrub.style.setProperty('--pct', scrub.value + '%');
});
scrub.addEventListener('change', () => {
  if (ytReady && ytPlayer.getDuration) {
    const dur = ytPlayer.getDuration() || 0;
    ytPlayer.seekTo((scrub.value / 100) * dur, true);
  }
  scrubbing = false;
});

$$('.fs-tab').forEach(tab => tab.addEventListener('click', () => switchFsTab(tab.dataset.tab)));
function switchFsTab(name) {
  $$('.fs-tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === name));
  $$('.fs-panel').forEach(p => p.classList.toggle('is-active', p.dataset.panel === name));
}

/* ------------------------------------------------------------------ *
 *  Kuyruk paneli
 * ------------------------------------------------------------------ */
function renderQueue() {
  const list = $('#queue-list');
  list.innerHTML = '';
  state.queue.forEach((t, i) => {
    const row = trackRow(t, { showActions: false });
    if (i === state.currentIndex) row.classList.add('is-current');
    row.addEventListener('click', () => { state.currentIndex = i; loadCurrent(); });
    list.appendChild(row);
  });
}

/* ------------------------------------------------------------------ *
 *  Sözler (lyrics) — lrclib.net, API anahtarı gerektirmez
 * ------------------------------------------------------------------ */
async function loadLyricsFor(track) {
  const wrap = $('#lyrics-wrap');
  wrap.innerHTML = `<p class="lyrics-status">Sözler aranıyor…</p>`;
  state.lyricsLines = null;

  const artist = cleanForLyricsSearch(track.author.replace(/\s*-\s*Topic$/i, ''));
  const title = cleanForLyricsSearch(track.title);

  try {
    let hit = await tryLyricsQuery(title, artist);
    if (!hit) hit = await tryLyricsQuery(title, '');
    if (!hit) { wrap.innerHTML = `<p class="lyrics-status">Bu şarkı için söz bulunamadı.</p>`; return; }

    if (hit.syncedLyrics) {
      state.lyricsLines = parseLRC(hit.syncedLyrics);
      renderSyncedLyrics(state.lyricsLines);
    } else if (hit.plainLyrics) {
      renderPlainLyrics(hit.plainLyrics);
    } else {
      wrap.innerHTML = `<p class="lyrics-status">Bu şarkı için söz bulunamadı.</p>`;
    }
  } catch {
    wrap.innerHTML = `<p class="lyrics-status">Sözler alınamadı (bağlantı sorunu olabilir).</p>`;
  }
}

async function tryLyricsQuery(title, artist) {
  const url = new URL('https://lrclib.net/api/search');
  url.searchParams.set('track_name', title);
  if (artist) url.searchParams.set('artist_name', artist);
  const res = await fetch(url);
  if (!res.ok) return null;
  const arr = await res.json();
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

function parseLRC(text) {
  const lines = [];
  text.split('\n').forEach(line => {
    const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)/);
    if (m) {
      const time = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
      const content = m[3].trim();
      if (content) lines.push({ time, text: content });
    }
  });
  return lines.sort((a, b) => a.time - b.time);
}

function renderSyncedLyrics(lines) {
  const wrap = $('#lyrics-wrap');
  wrap.innerHTML = '';
  lines.forEach((l, i) => {
    const p = document.createElement('p');
    p.className = 'lyric-line';
    p.dataset.index = i;
    p.textContent = l.text;
    p.addEventListener('click', () => { if (ytReady) ytPlayer.seekTo(l.time, true); });
    wrap.appendChild(p);
  });
}

function renderPlainLyrics(text) {
  const wrap = $('#lyrics-wrap');
  wrap.innerHTML = '';
  text.split('\n').forEach(line => {
    const p = document.createElement('p');
    p.className = 'lyric-line is-plain';
    p.textContent = line || '\u00A0';
    wrap.appendChild(p);
  });
}

function updateActiveLyric(currentTime) {
  if (!state.lyricsLines || !state.lyricsLines.length) return;
  let activeIdx = -1;
  for (let i = 0; i < state.lyricsLines.length; i++) {
    if (state.lyricsLines[i].time <= currentTime) activeIdx = i; else break;
  }
  const lineEls = $$('.lyric-line', $('#lyrics-wrap'));
  lineEls.forEach((el, i) => el.classList.toggle('is-active', i === activeIdx));
  if (activeIdx >= 0 && lineEls[activeIdx] && $('#view-search').closest) {
    const activeEl = lineEls[activeIdx];
    const panel = $('.fs-panel[data-panel="lyrics"]');
    if (panel && panel.classList.contains('is-active')) {
      activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Geçmiş
 * ------------------------------------------------------------------ */
function addToHistory(track) {
  state.history = [track, ...state.history.filter(t => t.id !== track.id)].slice(0, 60);
  storageSet('sahne:history', state.history);
}
function renderHistory() {
  const list = $('#history-list');
  list.innerHTML = '';
  if (!state.history.length) {
    list.innerHTML = `<p class="lyrics-status" style="text-align:left;margin:0;">Henüz dinleme geçmişin yok.</p>`;
    return;
  }
  state._lastResultList = state.history;
  state.history.forEach(t => list.appendChild(trackRow(t)));
}
$('#clear-history-btn').addEventListener('click', () => {
  state.history = [];
  storageSet('sahne:history', []);
  renderHistory();
});

/* ------------------------------------------------------------------ *
 *  Çalma listeleri (playlists)
 * ------------------------------------------------------------------ */
function savePlaylists() { storageSet('sahne:playlists', state.playlists); }

function createPlaylist(name) {
  const pl = { id: 'pl_' + Date.now(), name, tracks: [] };
  state.playlists.push(pl);
  savePlaylists();
  return pl;
}

$('#new-playlist-btn').addEventListener('click', () => {
  const name = prompt('Çalma listesi adı:');
  if (name && name.trim()) { createPlaylist(name.trim()); renderPlaylists(); }
});

function renderPlaylists() {
  const grid = $('#playlists-grid');
  grid.innerHTML = '';
  if (!state.playlists.length) {
    grid.innerHTML = `<p class="lyrics-status" style="text-align:left;margin:0;">Henüz çalma listen yok. Yukarıdaki "+ Yeni çalma listesi" ile başla.</p>`;
    return;
  }
  state.playlists.forEach(pl => {
    const card = document.createElement('div');
    card.className = 'playlist-card';
    const covers = pl.tracks.slice(0, 4);
    card.innerHTML = `
      <div class="playlist-cover">${covers.map(t => `<img src="${t.thumbnail}" alt="" />`).join('') || ''}</div>
      <div class="playlist-name">${escapeHtml(pl.name)}</div>
      <div class="playlist-count">${pl.tracks.length} şarkı</div>
    `;
    card.addEventListener('click', () => openPlaylist(pl));
    grid.appendChild(card);
  });
}

function openPlaylist(pl) {
  setView('search');
  $('#search-input').value = '';
  searchEmpty.hidden = true;
  searchStatus.hidden = true;
  resultsList.innerHTML = '';
  const heading = document.createElement('li');
  heading.innerHTML = `<div style="padding:8px 10px;color:var(--text-muted);font-size:12.5px;font-weight:700;">${escapeHtml(pl.name)}</div>`;
  resultsList.appendChild(heading);
  state._lastResultList = pl.tracks;
  pl.tracks.forEach(t => resultsList.appendChild(trackRow(t)));
}

/* ekle sheet */
const sheet = $('#add-to-playlist-sheet');
let pendingTrack = null;
function openAddToPlaylist(track) {
  pendingTrack = track;
  const list = $('#add-to-playlist-list');
  list.innerHTML = '';
  if (!state.playlists.length) {
    list.innerHTML = `<li style="color:var(--text-muted);cursor:default;">Henüz çalma listen yok.</li>`;
  } else {
    state.playlists.forEach(pl => {
      const li = document.createElement('li');
      li.textContent = `${pl.name} (${pl.tracks.length})`;
      li.addEventListener('click', () => {
        if (!pl.tracks.find(t => t.id === track.id)) pl.tracks.push(track);
        savePlaylists();
        sheet.hidden = true;
      });
      list.appendChild(li);
    });
  }
  sheet.hidden = false;
}
$('#add-to-playlist-close').addEventListener('click', () => sheet.hidden = true);
$('#add-to-playlist-new').addEventListener('click', () => {
  const name = prompt('Çalma listesi adı:');
  if (name && name.trim()) {
    const pl = createPlaylist(name.trim());
    if (pendingTrack) { pl.tracks.push(pendingTrack); savePlaylists(); }
    sheet.hidden = true;
  }
});

/* ------------------------------------------------------------------ *
 *  Ses (volume) barı
 * ------------------------------------------------------------------ */
function applyVolume(v) {
  v = Math.max(0, Math.min(100, Math.round(v)));
  state.volume = v;
  if (ytReady && ytPlayer.setVolume) ytPlayer.setVolume(v);
  storageSet('sahne:volume', v);
  syncVolumeUI();
}
function syncVolumeUI() {
  const slider = $('#fs-volume');
  if (slider) { slider.value = state.volume; slider.style.setProperty('--pct', state.volume + '%'); }
  const icon = $('#fs-volume-icon');
  if (icon) {
    icon.innerHTML = state.volume === 0
      ? `<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`
      : `<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  }
  const ipodFill = $('.ipod-volume-fill');
  if (ipodFill) ipodFill.style.width = state.volume + '%';
}
$('#fs-volume').addEventListener('input', (e) => applyVolume(e.target.value));
let volumeBeforeMute = state.volume || 80;
$('#fs-mute-btn').addEventListener('click', () => {
  if (state.volume > 0) { volumeBeforeMute = state.volume; applyVolume(0); }
  else applyVolume(volumeBeforeMute || 80);
});
syncVolumeUI();

/* ------------------------------------------------------------------ *
 *  RETRO iPod GÖRÜNÜMÜ — klasik click-wheel iPod'un çalışan taklidi.
 *  Tekerleği çevirerek listede gezinilir / ses ayarlanır (Şimdi Çalıyor
 *  ekranında), ortadaki düğme "seç", üstteki "MENU" bir üst ekrana döner.
 * ------------------------------------------------------------------ */
const retro = {
  stack: [{ screen: 'menu' }],
  sel: {},           // ekran anahtarı -> seçili satır index'i
  lists: {},         // ekran anahtarı -> o an render edilen satır listesi
  searchQuery: '',
  lastResults: [],
  volTimer: null,
};
const IPOD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').concat([' ', '⌫', 'ARA']);
let ipodCharIndex = 0;

function retroActiveKey(top) {
  if (top.screen === 'playlist') return 'playlist:' + top.param;
  return top.screen;
}

function pushRetroScreen(screen, param) {
  retro.stack.push({ screen, param });
  renderRetroScreen();
}
function popRetroScreen() {
  if (retro.stack.length > 1) retro.stack.pop();
  renderRetroScreen();
}
function enterRetro() {
  $('#retro-overlay').hidden = false;
  retro.stack = [{ screen: 'menu' }];
  renderRetroScreen();
}
function exitRetro() { $('#retro-overlay').hidden = true; }
$('#retro-enter-btn').addEventListener('click', enterRetro);
$('#retro-exit-btn').addEventListener('click', exitRetro);

function menuItems() {
  return [
    { label: 'Ara', onSelect: () => pushRetroScreen('search') },
    { label: 'Kitaplığım', chevron: true, onSelect: () => pushRetroScreen('library') },
    { label: 'Geçmiş', chevron: true, onSelect: () => pushRetroScreen('history') },
    { label: 'Şimdi Çalıyor', onSelect: () => pushRetroScreen('nowplaying'), disabled: !currentTrack() },
  ];
}

function renderRetroScreen() {
  const top = retro.stack[retro.stack.length - 1];
  const body = $('#ipod-screen-body');
  const title = $('#ipod-title');
  $('#ipod-status-play').classList.toggle('is-on', state.isPlaying);

  if (top.screen === 'menu') {
    title.textContent = 'Retro';
    renderIpodList(body, 'menu', menuItems());
  } else if (top.screen === 'search') {
    title.textContent = 'Ara';
    renderIpodTextEntry(body);
  } else if (top.screen === 'search-results') {
    title.textContent = 'Sonuçlar';
    const items = retro.lastResults.length
      ? retro.lastResults.map(t => ({ label: t.title, sub: t.author, onSelect: () => { playFromContext(t, retro.lastResults); pushRetroScreen('nowplaying'); } }))
      : null;
    renderIpodList(body, 'search-results', items, 'Sonuç bulunamadı.');
  } else if (top.screen === 'library') {
    title.textContent = 'Kitaplığım';
    const items = state.playlists.length
      ? state.playlists.map(pl => ({ label: `${pl.name} (${pl.tracks.length})`, chevron: true, onSelect: () => pushRetroScreen('playlist', pl.id) }))
      : null;
    renderIpodList(body, 'library', items, 'Henüz çalma listen yok.');
  } else if (top.screen === 'playlist') {
    const pl = state.playlists.find(p => p.id === top.param);
    title.textContent = pl ? pl.name : 'Liste';
    const items = pl && pl.tracks.length
      ? pl.tracks.map(t => ({ label: t.title, sub: t.author, onSelect: () => { playFromContext(t, pl.tracks); pushRetroScreen('nowplaying'); } }))
      : null;
    renderIpodList(body, 'playlist:' + top.param, items, 'Bu liste boş.');
  } else if (top.screen === 'history') {
    title.textContent = 'Geçmiş';
    const items = state.history.length
      ? state.history.map(t => ({ label: t.title, sub: t.author, onSelect: () => { playFromContext(t, state.history); pushRetroScreen('nowplaying'); } }))
      : null;
    renderIpodList(body, 'history', items, 'Henüz dinleme geçmişin yok.');
  } else if (top.screen === 'nowplaying') {
    title.textContent = 'Şimdi Çalıyor';
    renderIpodNowPlaying(body);
  }
}

function renderIpodList(container, key, items, emptyMsg) {
  retro.lists[key] = items || [];
  if (!items || !items.length) {
    container.innerHTML = `<div class="ipod-empty-msg">${escapeHtml(emptyMsg || 'Boş.')}</div>`;
    return;
  }
  if (retro.sel[key] === undefined) retro.sel[key] = 0;
  const sel = Math.min(retro.sel[key], items.length - 1);
  retro.sel[key] = sel;

  const list = document.createElement('div');
  list.className = 'ipod-list';
  items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'ipod-row' + (i === sel ? ' is-sel' : '') + (item.disabled ? ' is-disabled' : '');
    row.innerHTML = `<span>${escapeHtml(item.label)}${item.sub ? ` <span style="opacity:.55;font-weight:500;">— ${escapeHtml(item.sub)}</span>` : ''}</span>${item.chevron ? '<span class="ipod-row-chev">›</span>' : ''}`;
    row.addEventListener('click', () => {
      if (item.disabled) return;
      retro.sel[key] = i;
      item.onSelect && item.onSelect();
    });
    list.appendChild(row);
  });
  container.innerHTML = '';
  container.appendChild(list);
  const selRow = list.children[sel];
  if (selRow) selRow.scrollIntoView({ block: 'nearest' });
}

function renderIpodTextEntry(container) {
  container.innerHTML = `
    <div class="ipod-textentry">
      <div class="ipod-textentry-buffer">${escapeHtml(retro.searchQuery)}<span class="caret">|</span></div>
      <div class="ipod-textentry-picker">${escapeHtml(IPOD_ALPHABET[ipodCharIndex])}</div>
      <div class="ipod-textentry-hint">Tekerleği çevir, harf/işaret seç için ortadaki düğmeye bas</div>
    </div>`;
}

function renderIpodNowPlaying(container) {
  const t = currentTrack();
  if (!t) {
    container.innerHTML = `<div class="ipod-nowplaying"><div class="ipod-np-empty">Henüz bir şey çalmıyor.<br/>"Ara"dan bir şarkı seç.</div></div>`;
    return;
  }
  container.innerHTML = `
    <div class="ipod-nowplaying">
      <div class="ipod-np-art" style="background-image:url(${t.thumbnail})"></div>
      <div class="ipod-np-title">${escapeHtml(t.title)}</div>
      <div class="ipod-np-author">${escapeHtml(t.author)}</div>
      <div class="ipod-np-progress"><div class="ipod-np-progress-fill" id="ipod-np-progress-fill"></div></div>
      <div class="ipod-np-time"><span id="ipod-np-time-current">0:00</span><span id="ipod-np-time-total">0:00</span></div>
      <div class="ipod-volume-overlay">
        <svg class="ipod-volume-icon" viewBox="0 0 24 24" width="14" height="14"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/></svg>
        <div class="ipod-volume-track"><div class="ipod-volume-fill" style="width:${state.volume}%"></div></div>
      </div>
    </div>`;
}

async function runRetroSearch(q) {
  retro.stack.push({ screen: 'search-results' });
  $('#ipod-title').textContent = 'Sonuçlar';
  $('#ipod-screen-body').innerHTML = `<div class="ipod-empty-msg">Aranıyor…</div>`;
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    retro.lastResults = data.results || [];
  } catch {
    retro.lastResults = [];
  }
  renderRetroScreen();
}

function showIpodVolumeOverlay() {
  const el = $('.ipod-volume-overlay');
  if (!el) return;
  const fill = $('.ipod-volume-fill', el);
  if (fill) fill.style.width = state.volume + '%';
  el.classList.add('is-visible');
  clearTimeout(retro.volTimer);
  retro.volTimer = setTimeout(() => el.classList.remove('is-visible'), 900);
}

function retroScroll(dir) {
  const top = retro.stack[retro.stack.length - 1];
  if (top.screen === 'nowplaying') {
    applyVolume(state.volume + dir * 4);
    showIpodVolumeOverlay();
    return;
  }
  if (top.screen === 'search') {
    ipodCharIndex = (ipodCharIndex + dir + IPOD_ALPHABET.length) % IPOD_ALPHABET.length;
    renderRetroScreen();
    return;
  }
  const key = retroActiveKey(top);
  const items = retro.lists[key];
  if (!items || !items.length) return;
  let sel = (retro.sel[key] ?? 0) + dir;
  sel = Math.max(0, Math.min(items.length - 1, sel));
  retro.sel[key] = sel;
  renderRetroScreen();
}

function retroSelect() {
  const top = retro.stack[retro.stack.length - 1];
  if (top.screen === 'search') {
    const ch = IPOD_ALPHABET[ipodCharIndex];
    if (ch === 'ARA') {
      if (retro.searchQuery.trim()) runRetroSearch(retro.searchQuery.trim());
    } else if (ch === '⌫') {
      retro.searchQuery = retro.searchQuery.slice(0, -1);
      renderRetroScreen();
    } else {
      retro.searchQuery += ch;
      renderRetroScreen();
    }
    return;
  }
  if (top.screen === 'nowplaying') return;
  const key = retroActiveKey(top);
  const items = retro.lists[key];
  if (!items || !items.length) return;
  const item = items[retro.sel[key] ?? 0];
  if (item && !item.disabled && item.onSelect) item.onSelect();
}

/* fiziksel tuşlar: MENU / ⏮ / ⏯ / ⏭ */
$$('.wheel-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const action = btn.dataset.action;
    if (action === 'menu') popRetroScreen();
    else if (action === 'prev') playPrev();
    else if (action === 'next') playNext(false);
    else if (action === 'play') togglePlay();
  });
});
$('#ipod-select').addEventListener('click', (e) => { e.stopPropagation(); retroSelect(); });

/* tekerleği çevirme (rotate) algılama — dört tuşun dışında kalan halka */
(function setupWheelRotation() {
  const wheel = $('#ipod-wheel');
  let dragging = false, lastAngle = null, accum = 0;
  const STEP = 16; // derece / adım

  function angleFromEvent(e) {
    const rect = wheel.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
  }
  wheel.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.wheel-btn, .wheel-center')) return;
    dragging = true; accum = 0;
    lastAngle = angleFromEvent(e);
    try { wheel.setPointerCapture(e.pointerId); } catch { /* yoksay */ }
  });
  wheel.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const angle = angleFromEvent(e);
    let delta = angle - lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    accum += delta;
    lastAngle = angle;
    while (accum >= STEP) { retroScroll(1); accum -= STEP; }
    while (accum <= -STEP) { retroScroll(-1); accum += STEP; }
  });
  const stop = () => { dragging = false; lastAngle = null; accum = 0; };
  wheel.addEventListener('pointerup', stop);
  wheel.addEventListener('pointercancel', stop);
  wheel.addEventListener('pointerleave', stop);
})();

/* ------------------------------------------------------------------ *
 *  Klavye kısayolları (masaüstü)
 * ------------------------------------------------------------------ */
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.code === 'ArrowRight' && e.shiftKey) playNext(false);
  else if (e.code === 'ArrowLeft' && e.shiftKey) playPrev();
  else if (e.code === 'Escape') closeFullscreen();
});

/* ------------------------------------------------------------------ *
 *  Başlangıç
 * ------------------------------------------------------------------ */
setView('search');
