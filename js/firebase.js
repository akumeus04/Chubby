// Firebase initialisation
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getMessaging, isSupported } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";
import { firebaseConfig } from "./config.js";
import { state } from "./state.js";

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);

// Safely initialize Web Messaging (for when you use Chrome on your PC)
isSupported().then((supported) => {
  if (supported) {
    state.messaging = getMessaging(app);
  } else {
    console.log("Web push notifications are not supported in this environment.");
  }
}).catch((err) => {
  console.log("Failed to check messaging support:", err);
});
