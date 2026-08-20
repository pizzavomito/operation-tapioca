// Service worker : cache de la coquille applicative (§7.3 du PRD) + notifications push.
// Les données de partie passent exclusivement par WebSocket, jamais par le cache.
const CACHE_NAME = 'tapioca-shell-v17';
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
  '/ui/challenges.js',
  '/ui/dossier.js',
  '/ui/spectator.js',
  '/ui/chat.js',
  '/ui/history.js',
  '/ui/tutorial.js',
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

// Notification push : le seul moyen de prévenir un joueur dont la page est en arrière-plan
// (téléphone en poche) ou fermée — navigator.vibrate() ne se déclenche jamais dans ce cas,
// le navigateur suspend le JS de la page tant qu'elle n'est pas au premier plan.
// Choix assumé : la vibration prime sur le risque de son (voir server/index.js#maybeSendPush).
// silent:true supprimerait aussi la vibration, ce n'est pas ce qu'on veut ici.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* payload illisible, on affiche quand même quelque chose */
  }
  const title = data.title || 'Opération Tapioca';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: data.tag || 'tapioca',
      renotify: true,
      requireInteraction: false,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    })
  );
});
