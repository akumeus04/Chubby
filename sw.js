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
const CACHE_NAME = 'chubby-chat-v4.0';
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
  './js/debug-console.js'
];

// 4. BACKGROUND NOTIFICATION HANDLER
messaging.onBackgroundMessage((payload) => {
  console.log('[sw.js] Background message received:', payload);

  // ✨ Read from payload.DATA instead of payload.NOTIFICATION
  const title = payload.data?.title || "New Message";
  const options = {
    body: payload.data?.body || "Check your chat! 🌸",
    
    // ⚡ CRITICAL FIX: Absolute URLs for the Android OS
    icon: 'https://ourmessenger-76636.web.app/icon-192.png',
    badge: 'https://ourmessenger-76636.web.app/icon-192.png',
    
    // ⚡ This array triggers the native hardware vibration motor! (Pause, Buzz, Pause)
    vibrate: [300, 100, 300, 100, 300], 
    
    tag: 'chubby-chat-notification',
    renotify: true,
    requireInteraction: true, // Forces banner to stay on screen until interacted with
    
    // Absolute fallback URL for the click handler
    data: { url: payload.data?.url || 'https://ourmessenger-76636.web.app/' } 
  };

  // This command forces the Android OS to physically draw the banner and play the sound
  return self.registration.showNotification(title, options);
});

// Handle notification click to re-open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      if (windowClients.length > 0) return windowClients[0].focus();
      return clients.openWindow(event.notification.data.url);
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