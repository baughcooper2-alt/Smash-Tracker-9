const CACHE = 'smash-tracker-v41';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './roster-seed.json',
  './remote.html', './sync.js', './fx.js', './photolog.js', './vendor/supabase.js', './vendor/qrcode.js',
  './fonts/mplus-rounded-500.woff2', './fonts/mplus-rounded-700.woff2', './fonts/mplus-rounded-800.woff2', './fonts/mplus-rounded-900.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first: every open gets the newest app (a fix reaches phones on the next open, not the one after),
// and the saved copy is only used when there's no connection.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Only this site's own files. Cloud sync calls (Supabase) and /api/ must always hit the network.
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request, {cache: 'no-cache'})
      .then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});
