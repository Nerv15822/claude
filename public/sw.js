/*
 * Service worker di CardioSim 3D: uso offline dopo la prima apertura.
 * - Navigazione (index.html): rete prima, cache come ripiego (gli aggiornamenti arrivano subito).
 * - /assets/ (nomi con hash, immutabili): cache prima.
 * - Modello anatomico e icone: cache, aggiornata in background (stale-while-revalidate).
 */
const VERSION = 'cardiosim-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon.svg'];
const MAX_ASSETS = 80;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  const assets = keys.filter((r) => new URL(r.url).pathname.includes('/assets/'));
  for (let i = 0; i < assets.length - MAX_ASSETS; i++) await cache.delete(assets[i]);
}

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request)) ?? (await cache.match('./index.html')) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    trim(cache);
  }
  return res;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit ?? Response.error());
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  return update;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') event.respondWith(networkFirst(req));
  else if (url.pathname.includes('/assets/')) event.respondWith(cacheFirst(req));
  else event.respondWith(staleWhileRevalidate(req, event));
});
