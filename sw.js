const CACHE_NAME = 'our-face-v1-global';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/world-data.js',
  '/js/app.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
