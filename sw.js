// Service Worker for Piano Note Quiz
// Provides offline support and caching for better Android stability

const CACHE_NAME = 'piano-quiz-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// External resources to cache (CDN libraries)
const EXTERNAL_ASSETS = [
  'https://unpkg.com/vexflow@4.2.5/build/cjs/vexflow.js',
  'https://cdnjs.cloudflare.com/ajax/libs/tone/15.0.4/Tone.js'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cache local assets first
        return cache.addAll(STATIC_ASSETS)
          .then(() => {
            // Try to cache external assets but don't fail if they're unavailable
            return Promise.allSettled(
              EXTERNAL_ASSETS.map(url =>
                fetch(url, { mode: 'cors' })
                  .then(response => {
                    if (response.ok) {
                      return cache.put(url, response);
                    }
                  })
                  .catch(() => {/* Ignore external fetch failures */})
              )
            );
          });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // For audio samples from tonejs CDN - network first, then cache
  if (url.hostname === 'tonejs.github.io') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache audio samples for offline use
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, responseClone))
              .catch(() => {/* Ignore cache errors */});
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // For other requests - cache first, then network
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Return cached version, but also update cache in background
          fetch(request)
            .then(response => {
              if (response.ok) {
                caches.open(CACHE_NAME)
                  .then(cache => cache.put(request, response))
                  .catch(() => {/* Ignore cache errors */});
              }
            })
            .catch(() => {/* Ignore network errors during background update */});
          return cachedResponse;
        }

        // Not in cache - fetch from network
        return fetch(request)
          .then(response => {
            // Cache successful responses
            if (response.ok && (url.origin === self.location.origin || EXTERNAL_ASSETS.includes(request.url))) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(request, responseClone))
                .catch(() => {/* Ignore cache errors */});
            }
            return response;
          });
      })
  );
});

// Handle messages from the main app
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
