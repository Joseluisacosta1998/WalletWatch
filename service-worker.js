const CACHE_NAME = 'whalewatch-cache-v9-3c';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

// Instala el service worker y guarda en cache los archivos base de la app.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).then(() =>
        // Librerías externas (gráfico): se guardan para que el gráfico funcione sin conexión.
        Promise.all(['https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js']
          .map((u) => fetch(new Request(u, { mode: 'no-cors' })).then((r) => cache.put(u, r)).catch(() => {})))
      ))
      .then(() => self.skipWaiting())
  );
});

// Limpia caches antiguas cuando se activa una nueva versión.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Estrategia: intenta red primero (para precios en vivo vía API),
// y si falla (sin conexión) sirve lo que haya en cache.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // No cachear llamadas a la API de Hyperliquid: siempre deben ir a la red.
  if (url.hostname.includes('hyperliquid.xyz')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});

// Sincronización en segundo plano (Background Sync, "one-off").
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-market-data') {
    event.waitUntil(
      fetch('./index.html')
        .then((response) => caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', response)))
        .catch(() => {})
    );
  }
});

// Sincronización periódica en segundo plano (si el navegador la soporta).
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-market-data') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.add('./index.html'))
    );
  }
});

// Notificaciones push.
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'WhaleWatch';
  const options = {
    body: data.body || 'Tienes una alerta activa.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
