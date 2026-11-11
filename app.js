'use strict';
/* Web Radio – data comes from the community Radio Browser directory (radio-browser.info). */
const API_HOSTS = [
  'https://all.api.radio-browser.info', 'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'
];
const GENRES = ['news', 'talk', 'music', 'pop', 'rock', 'jazz', 'classical', 'country', 'sport', 'maori', 'dance', 'christian'];
const HLS_SRC = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';

const $ = (id) => document.getElementById(id);
const audio = $('audio');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } }
};

const state = {
  country: store.get('country', 'NZ'),
  view: 'browse', query: '', tag: '',
  stations: [], favs: store.get('favs', {}), current: null,
  host: 0, hls: null, sleepTimer: null
};

/* ---------- API ---------- */
async function api(path) {
  let lastErr;
  for (let i = 0; i < API_HOSTS.length; i++) {
    const host = API_HOSTS[(state.host + i) % API_HOSTS.length];
    try {
      const r = await fetch(host + path, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      state.host = (state.host + i) % API_HOSTS.length;
      return await r.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const flag = (cc) => cc && cc.length === 2
  ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐';

async function loadCountries() {
  let list = store.get('countries', null);
  if (!list) {
    try {
      const raw = await api('/json/countries?hidebroken=true&order=stationcount&reverse=true');
      list = raw.filter((c) => c.iso_3166_1 && c.stationcount > 0).map((c) => ({ cc: c.iso_3166_1, name: c.name, n: c.stationcount }));
      store.set('countries', list);
    } catch { list = []; }
  }
  const sel = $('country');
  sel.textContent = '';
  const add = (v, label) => { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.append(o); };
  add('NZ', '🇳🇿 New Zealand');
  add('', '🌍 Worldwide (top stations)');
  list.filter((c) => c.cc !== 'NZ').sort((a, b) => a.name.localeCompare(b.name))
    .forEach((c) => add(c.cc, `${flag(c.cc)} ${c.name} (${c.n})`));
  sel.value = [...sel.options].some((o) => o.value === state.country) ? state.country : 'NZ';
}

async function loadStations() {
  const params = new URLSearchParams({ hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '150', is_https: 'true' });
  if (state.country) params.set('countrycode', state.country);
  if (state.query) params.set('name', state.query);
  if (state.tag) params.set('tag', state.tag);
  const key = 'cache:' + params;
  setStatus('Loading stations…');
  try {
    const raw = await api('/json/stations/search?' + params);
    state.stations = raw.map(slim).filter((s) => s.url);
    store.set(key, state.stations);
  } catch {
    const cached = store.get(key, null);
    if (cached) { state.stations = cached; setStatus('Offline – showing saved list.'); render(true); return; }
    state.stations = [];
    showFailure();
    render(true); return;
  }
  render();
}

const slim = (s) => ({
  id: s.stationuuid, name: (s.name || '').trim() || 'Unnamed station', url: s.url_resolved || s.url,
  icon: s.favicon, tags: s.tags, codec: s.codec, bitrate: s.bitrate, cc: s.countrycode, hls: s.hls === 1
});

/* ---------- Rendering ---------- */
function setStatus(t) { $('status').textContent = t; }

/* Explain a failed directory load so the cause can be found on old phones. */
function showFailure() {
  const box = $('status'); box.textContent = '';
  const p = (t) => { const e = document.createElement('div'); e.textContent = t; box.append(e); return e; };
  p('Couldn’t reach the station directory.');
  p('Phone date and time: ' + new Date().toLocaleString() + ' (a wrong clock breaks secure connections)');
  p('Online: ' + (navigator.onLine ? 'yes' : 'no – check Wi-Fi and airplane mode'));
  p('Tap to test the connection. A text page means it works; a security warning means this phone doesn’t trust the server:');
  for (const h of API_HOSTS.slice(1, 3)) {
    const a = document.createElement('a'); a.href = h + '/json/countries?limit=1'; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = h.replace('https://', ''); a.style.display = 'block'; box.append(a);
  }
  const b = document.createElement('button'); b.className = 'ghost'; b.textContent = 'Try again'; b.onclick = loadStations; box.append(b);
}

function visible() {
  if (state.view === 'favs') {
    const q = state.query.toLowerCase();
    return Object.values(state.favs).filter((s) => !q || s.name.toLowerCase().includes(q));
  }
  return state.stations;
}

function render(keepStatus) {
  const list = $('list'); list.textContent = '';
  const items = visible();
  if (!keepStatus) {
    setStatus(items.length ? `${items.length} station${items.length === 1 ? '' : 's'}`
      : state.view === 'favs' ? 'No favourites yet – tap ☆ on a station.' : 'No stations found.');
  }
  const frag = document.createDocumentFragment();
  for (const s of items) frag.append(row(s));
  list.append(frag);
  $('favcount').textContent = Object.keys(state.favs).length || '';
}

function iconEl(img, s) {
  img.alt = ''; img.width = 48; img.height = 48; img.loading = 'lazy';
  const fallback = 'icons/icon.svg';
  img.onerror = () => { img.onerror = null; img.src = fallback; };
  img.src = /^https:\/\//.test(s.icon || '') ? s.icon : fallback;
}

function row(s) {
  const li = document.createElement('li');
  li.className = 'item' + (state.current && state.current.id === s.id ? ' playing' : '');
  li.dataset.id = s.id;
  const go = document.createElement('button'); go.className = 'go';
  go.setAttribute('aria-label', 'Play ' + s.name);
  const img = document.createElement('img'); iconEl(img, s);
  const t = document.createElement('span'); t.className = 't';
  const n = document.createElement('span'); n.className = 'n'; n.textContent = s.name;
  const sub = document.createElement('span'); sub.className = 's';
  sub.textContent = [s.codec, s.bitrate ? s.bitrate + 'k' : '', (s.tags || '').split(',').slice(0, 3).join(', ')].filter(Boolean).join(' · ');
  t.append(n, sub); go.append(img, t);
  go.onclick = () => play(s);
  const fav = document.createElement('button'); fav.className = 'fav';
  const paint = () => { const on = !!state.favs[s.id]; fav.textContent = on ? '★' : '☆'; fav.setAttribute('aria-pressed', on); fav.setAttribute('aria-label', (on ? 'Remove ' : 'Add ') + s.name + (on ? ' from' : ' to') + ' favourites'); };
  paint();
  fav.onclick = () => {
    if (state.favs[s.id]) delete state.favs[s.id]; else state.favs[s.id] = s;
    store.set('favs', state.favs);
    if (state.view === 'favs') render(); else { paint(); $('favcount').textContent = Object.keys(state.favs).length || ''; }
  };
  li.append(go, fav);
  return li;
}

/* ---------- Playback ---------- */
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3500);
}
const setSub = (txt, err) => { const el = $('p-sub'); el.textContent = txt; el.className = err ? 'err' : ''; };

function teardownHls() { if (state.hls) { state.hls.destroy(); state.hls = null; } }

function loadHlsLib() {
  if (window.Hls) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = HLS_SRC; s.onload = res; s.onerror = rej; document.head.append(s);
  });
}

async function play(s) {
  state.current = s;
  $('player').hidden = false;
  $('p-name').textContent = s.name;
  iconEl($('p-icon'), s);
  setSub('Connecting…');
  document.querySelectorAll('.item').forEach((el) => el.classList.toggle('playing', el.dataset.id === s.id));
  teardownHls();
  const isHls = s.hls || /\.m3u8(\?|$)/i.test(s.url);
  try {
    if (isHls && !audio.canPlayType('application/vnd.apple.mpegurl')) {
      await loadHlsLib();
      if (!window.Hls.isSupported()) throw new Error('HLS unsupported');
      state.hls = new window.Hls(); state.hls.loadSource(s.url); state.hls.attachMedia(audio);
      state.hls.on(window.Hls.Events.ERROR, (_, d) => { if (d.fatal) streamFailed(); });
    } else {
      audio.src = s.url;
    }
    await audio.play();
  } catch (e) {
    if (e && e.name === 'AbortError') return; // superseded by a newer play()
    streamFailed();
  }
  updateMediaSession(s);
  fetch(API_HOSTS[state.host] + '/json/url/' + encodeURIComponent(s.id), { mode: 'no-cors' }).catch(() => {}); // polite click count
}

function streamFailed() {
  setSub('Stream unavailable – try another station', true);
  toast('That stream isn’t responding.');
  syncPlayBtn();
}

function syncPlayBtn() {
  const b = $('p-play'); const playing = !audio.paused && !audio.error;
  b.textContent = playing ? '⏸' : '▶'; b.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}

function toggle() {
  if (!state.current) return;
  if (audio.paused) {
    // Live streams must reconnect rather than resume from a stale buffer.
    if (!state.hls) { audio.src = state.current.url; }
    audio.play().catch(streamFailed);
  } else audio.pause();
}

function step(dir) {
  const items = visible(); if (!items.length) return;
  const i = items.findIndex((s) => state.current && s.id === state.current.id);
  play(items[(i + dir + items.length) % items.length]);
}

function updateMediaSession(s) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: s.name, artist: 'Live radio', album: 'Web Radio',
    artwork: [{ src: /^https:\/\//.test(s.icon || '') ? s.icon : new URL('icons/icon-512.png', location.href).href, sizes: '512x512' }]
  });
}
if ('mediaSession' in navigator) {
  const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* unsupported */ } };
  h('play', toggle); h('pause', () => audio.pause()); h('stop', () => audio.pause());
  h('previoustrack', () => step(-1)); h('nexttrack', () => step(1));
}

audio.addEventListener('playing', () => { setSub('Live'); syncPlayBtn(); });
audio.addEventListener('waiting', () => setSub('Buffering…'));
audio.addEventListener('pause', syncPlayBtn);
audio.addEventListener('error', () => { if (audio.src && !state.hls) streamFailed(); });

/* ---------- Sleep timer (fades out the last 10 s) ---------- */
function setSleep(mins) {
  clearInterval(state.sleepTimer); audio.volume = +$('vol').value;
  if (!mins) return;
  const end = Date.now() + mins * 60000;
  toast(`Sleeping in ${mins} min`);
  state.sleepTimer = setInterval(() => {
    const left = end - Date.now();
    if (left <= 0) { clearInterval(state.sleepTimer); audio.pause(); audio.volume = +$('vol').value; $('sleep').value = '0'; }
    else if (left < 10000) audio.volume = +$('vol').value * (left / 10000);
  }, 250);
}

/* ---------- Wiring ---------- */
function setView(v) {
  state.view = v;
  $('tab-browse').setAttribute('aria-selected', v === 'browse');
  $('tab-favs').setAttribute('aria-selected', v === 'favs');
  $('tags').hidden = v === 'favs'; $('country').hidden = v === 'favs';
  render();
}

function buildTags() {
  const box = $('tags');
  for (const g of GENRES) {
    const b = document.createElement('button'); b.textContent = g; b.setAttribute('aria-pressed', 'false');
    b.onclick = () => {
      state.tag = state.tag === g ? '' : g;
      box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x.textContent === state.tag));
      loadStations();
    };
    box.append(b);
  }
}

let debounce;
$('search').addEventListener('input', (e) => {
  state.query = e.target.value.trim();
  clearTimeout(debounce);
  debounce = setTimeout(() => (state.view === 'favs' ? render() : loadStations()), 350);
});
$('country').addEventListener('change', (e) => { state.country = e.target.value; store.set('country', state.country); loadStations(); });
$('tab-browse').onclick = () => setView('browse');
$('tab-favs').onclick = () => setView('favs');
$('p-play').onclick = toggle;
$('p-prev').onclick = () => step(-1);
$('p-next').onclick = () => step(1);
$('vol').value = store.get('vol', 1); audio.volume = +$('vol').value;
$('vol').oninput = (e) => { audio.volume = +e.target.value; store.set('vol', +e.target.value); };
$('sleep').onchange = (e) => setSleep(+e.target.value);
$('surprise').onclick = async () => {
  try {
    const [s] = await api('/json/stations/search?hidebroken=true&is_https=true&order=random&limit=1&has_geo_info=true');
    if (s) play(slim(s)); 
  } catch { toast('Couldn’t reach the station directory.'); }
};
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); toggle(); }
});
window.addEventListener('online', () => state.view === 'browse' && loadStations());

buildTags();
loadCountries().then(loadStations);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
