// 1. IMPORT FIREBASE LIBRARIES
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// 2. FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyA3iIqEl718iLfHKfn9S0d_60PAN4BtcS0",
  projectId: "ourmessenger-76636",
  messagingSenderId: "541588910843",
  appId: "1:541588910843:web:221fd00e69a4711624b65e"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 3. CACHE SETTINGS (Bumped to v4.0 for the split-file layout)
const CACHE_NAME = 'chubby-chat-v4.2';
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
  './js/debug-console.js'
];

// 4. BACKGROUND NOTIFICATION HANDLER
// URLs are built from the service-worker scope, so it works on GitHub Pages (/Chubby/), Firebase Hosting, or anywhere else.
const APP_URL  = self.registration.scope;
const ICON_URL = new URL('icon-192.png', self.registration.scope).href;

messaging.onBackgroundMessage((payload) => {
  console.log('[sw.js] Background message received:', payload);

  const data  = payload.data || {};
  const title = data.title || "New Message";

  // Only trust a link that points at this same site
  let openUrl = APP_URL;
  try { if (data.url && new URL(data.url).origin === self.location.origin) openUrl = data.url; } catch (e) {}

  const options = {
    body: data.body || "Check your chat! 🌸",
    icon: ICON_URL,
    badge: ICON_URL,
    // Buzz-pause-buzz on Android
    vibrate: [300, 100, 300, 100, 300],
    tag: 'chubby-chat-notification',
    renotify: true,
    requireInteraction: true,       // stays on screen until you tap it
    timestamp: Date.now(),
    lang: 'en',
    data: { url: openUrl }
  };

  // Forces the OS to draw the banner and play the sound
  return self.registration.showNotification(title, options);
});

// Tapping the notification opens (or focuses) the app
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

// 5. EXISTING CACHE & FETCH LOGIC
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