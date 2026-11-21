// Earth Diary service worker: lets the app shell open offline.
// Your memories are in IndexedDB and are never touched by this file.
const VERSION = 'earth-diary-v4';
const SHELL = [
  './', 'index.html', 'about.html', 'guide.html', 'ideas.html', 'privacy.html', 'terms.html', 'manifest.webmanifest',
  'assets/css/app.css', 'assets/css/pages.css',
  'assets/js/config.js', 'assets/js/app.js', 'assets/js/i18n.js', 'assets/js/db.js', 'assets/js/pins.js', 'assets/js/geo.js',
  'assets/js/media.js', 'assets/js/backup.js', 'assets/js/ads.js', 'assets/js/samples.js', 'assets/js/kit.js', 'assets/js/sharecard.js', 'assets/js/pages.js',
  'assets/vendor/maplibre-gl.js', 'assets/vendor/maplibre-gl.css', 'assets/vendor/fflate.js',
  'assets/fonts/fredoka-latin-wght-normal.woff2', 'assets/fonts/nunito-latin-wght-normal.woff2',
  'assets/icons/favicon.svg', 'assets/icons/icon-192.png', 'assets/data/countries.json'
];
const LONG_LIVED = /\/assets\/(vendor|fonts|icons|data|img)\//;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // map tiles, search and ads go straight to the network

  if (LONG_LIVED.test(url.pathname)) {                       // rarely-changing files: cache first
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) caches.open(VERSION).then((cache) => cache.put(req, res.clone()));
        return res.clone();
      }))
    );
    return;
  }
  event.respondWith(                                         // pages and code: network first, cache when offline
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((cache) => cache.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});
