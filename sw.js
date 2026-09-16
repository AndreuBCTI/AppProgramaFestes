const CACHE_NAME = 'santa-tecla-v1.0.1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './data/locations.js',
  './data/program.js',
  './img/favicon.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/icon-maskable-192.png',
  './img/icon-maskable-512.png',
  './img/image.jpeg',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'
];

// Instal·lació del Service Worker i precàrrega de recursos estàtics
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precargant recursos per a mode offline...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activació del Service Worker i neteja de memòries cau antigues
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Netejant memòria cau antiga:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepció de peticions: Cache First amb actualització en segon pla (Stale-while-revalidate)
self.addEventListener('fetch', (event) => {
  // Ignora peticions no-GET o esquemes no-http/https (com chrome-extension)
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // En cas d'error de xarxa o sense connexió, es manté la resposta en memòria cau
      });

      return cachedResponse || fetchPromise;
    })
  );
});
