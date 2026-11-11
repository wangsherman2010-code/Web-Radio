'use strict';
const VERSION = 'v4';
const SHELL = `shell-${VERSION}`;
const API = `api-${VERSION}`;
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => ![SHELL, API].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;       // never touch audio/range requests
  const url = new URL(req.url);
  if (url.hostname.endsWith('api.radio-browser.info')) {
    if (url.pathname.startsWith('/json/url/')) return;                // click-count pings
    e.respondWith(staleWhileRevalidate(req, API));                   // directory data: fast + offline
  } else if (url.origin === location.origin) {
    e.respondWith(networkFirst(req));                                // app files: always fresh when online
  }
  // anything else (station streams, logos, hls.js) goes straight to the network
});

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const net = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; });
  return hit || net;
}

async function networkFirst(req) {
  try {
    const r = await fetch(req);
    if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
    return r;
  } catch { return (await caches.match(req)) || Response.error(); }
}
