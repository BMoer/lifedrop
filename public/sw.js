const CACHE_NAME = 'livedrop-v2';

const STATIC_ASSETS = [
  '/',
  '/broadcast',
  '/listener.html',
  '/js/sender/main.js',
  '/js/sender/audio-capture.js',
  '/js/sender/websocket-sender.js',
  '/js/listener/main.js',
  '/js/listener/audio-playback.js',
  '/js/listener/opus-decoder.js',
  '/js/listener/websocket-listener.js',
  '/js/listener/background-audio.js',
  '/js/listener/visualizer.js',
  '/js/lobby/main.js',
  '/js/shared/constants.js',
  '/js/vendor/qr.js',
  '/js/worklets/sender-worklet.js',
  '/js/worklets/listener-worklet.js',
  '/manifest.json',
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for HTML (get updates), cache-first for JS/static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip WebSocket and non-GET requests
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // Network-first for HTML pages (always get latest)
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets (JS, icons, manifest)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
