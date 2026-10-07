const CACHE_NAME = 'shoprateio-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  'https://cdn.tailwindcss.com',
  'https://cdn-icons-png.flaticon.com/512/3144/3144456.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
