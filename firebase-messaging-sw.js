// Import the Firebase scripts needed for the background worker
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyA3iIqEl718iLfHKfn9S0d_60PAN4BtcS0",
  authDomain: "ourmessenger-76636.firebaseapp.com",
  databaseURL: "https://ourmessenger-76636-default-rtdb.firebaseio.com",
  projectId: "ourmessenger-76636",
  storageBucket: "ourmessenger-76636.firebasestorage.app",
  messagingSenderId: "541588910843",
  appId: "1:541588910843:web:221fd00e69a4711624b65e"
});

// Wrap the messaging setup in a support check to prevent crashes in Capacitor!
firebase.messaging.isSupported().then((supported) => {
  if (supported) {
    const messaging = firebase.messaging();

    // Handle incoming messages when the app is in the background
    messaging.onBackgroundMessage((payload) => {
      console.log('Received background message: ', payload);
      
      const notificationTitle = payload.notification?.title || 'Chubby Chat';
const notificationOptions = {
        body: payload.notification?.body || 'You have a new message.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'chat-message', 
        renotify: true,      
        
        // This is the "magic link" to the high-importance channel
        // It must match the ID you used in the createChannel code
        data: {
            click_action: '/',
            android_channel_id: 'fcm_default_channel' 
        },

        // Some Android versions also look for it here:
        android: {
          notification: {
            channel_id: 'fcm_default_channel'
          }
        }
      };

      self.registration.showNotification(notificationTitle, notificationOptions);
    });
  } else {
    console.log("Web push not supported in this environment, skipping background messaging.");
  }
}).catch((err) => {
  console.log("Failed to check messaging support:", err);
});