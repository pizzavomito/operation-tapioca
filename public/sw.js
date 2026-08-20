// Service worker : cache de la coquille applicative uniquement (§7.3 du PRD).
// Les données de partie passent exclusivement par WebSocket, jamais par le cache.
const CACHE_NAME = 'tapioca-shell-v3';
const SHELL_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/ws.js',
  '/protocol.js',
  '/manifest.json',
  '/ui/home.js',
  '/ui/lobby.js',
  '/ui/mission.js',
  '/ui/validation.js',
  '/ui/dossier.js',
  '/ui/spectator.js',
  '/ui/debrief.js',
  '/ui/components.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/' || url.pathname.startsWith('/qr/')) {
    // Page racine et QR : réseau d'abord (contenu dynamique), repli sur le cache hors-ligne.
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
