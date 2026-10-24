// App-wide configuration (Firebase, Apps Script, Giphy)
import { rtdb } from "./firebase.js";

export const firebaseConfig = {
  apiKey: "AIzaSyA3iIqEl718iLfHKfn9S0d_60PAN4BtcS0",
  authDomain: "ourmessenger-76636.firebaseapp.com",
  databaseURL: "https://ourmessenger-76636-default-rtdb.firebaseio.com",
  projectId: "ourmessenger-76636",
  storageBucket: "ourmessenger-76636.firebasestorage.app",
  messagingSenderId: "541588910843",
  appId: "1:541588910843:web:221fd00e69a4711624b65e"
};


export const appsScriptUrl = "https://script.google.com/macros/s/AKfycbwAWOQoiaNOo51dL9_s04D9L8waDNV--Euoz8NR_csyhJX635jf48oOZyYoxDyCf6vr/exec"; 

export const GIPHY_API_KEY = "CUKuNGhZYEuz3HWS5ybpViRmpoDWm8P2";

// Web Push (Android Chrome / installed app) key pair.
// Optional: Firebase Console → Project settings → Cloud Messaging → Web Push certificates → "Generate key pair".
// Leave "" to use Firebase's default key.
export const VAPID_KEY = "";
