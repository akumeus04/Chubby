// Chubby Chat service worker — offline cache + notification taps.
// (Push notifications now come from Pushover, so Firebase Cloud Messaging is no longer used here.)

const CACHE_NAME = 'chubby-chat-v5.1';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './chat.js',
  './paint-editor.js',
  './css/themes.css',
  './css/chat-extras.css',
  './css/layout.css',
  './css/messages.css',
  './css/input.css',
  './css/banners.css',
  './css/revamp.css',
  './css/features.css',
  './js/main.js',
  './js/config.js',
  './js/state.js',
  './js/firebase.js',
  './js/helpers.js',
  './js/background.js',
  './js/emoji.js',
  './js/gif.js',
  './js/saved-replies.js',
  './js/message-actions.js',
  './js/input-bar.js',
  './js/attachments.js',
  './js/image-editor.js',
  './js/lightbox.js',
  './js/auth.js',
  './js/presence.js',
  './js/notifications.js',
  './js/settings.js',
  './js/theme.js',
  './js/formatter.js',
  './js/media.js',
  './js/chat-send.js',
  './js/pwa.js',
  './js/native-media.js',
  './js/viewport.js',
  './js/emoji-data.js',
  './js/file-drop.js',
  './js/touch-guard.js',
  './js/debug-console.js'
];

const APP_URL = self.registration.scope;

// Tapping an in-app notification opens (or focuses) the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || APP_URL;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const c of windowClients) {
        if (c.url.startsWith(APP_URL) && 'focus' in c) return c.focus();
      }
      return clients.openWindow(target);
    })
  );
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  // Keep the Google Drive / Cross-origin fix
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
