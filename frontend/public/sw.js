// Smart Home IoT Service Worker v1.0.0
const CACHE_NAME = 'smarthome-cache-v1'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg',
  '/3d/dashboard_3d.jpg',
  '/3d/automations_3d.jpg'
]

// Instant activation on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => console.log('Pre-cache partial fail:', err))
    }).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    }).then(() => self.clients.claim())
  )
})

// High-speed Stale-While-Revalidate for app assets, Network-First for dynamic IoT telemetry
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Direct bypass for API calls and ESP32 direct requests
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/devices') || url.pathname.startsWith('/ws')) {
    return
  }

  // Handle static assets & navigation
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })
        }
        return networkResponse
      }).catch(() => cachedResponse)

      return cachedResponse || fetchPromise
    })
  )
})

