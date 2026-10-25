// js/auth.js — Google Authentication & SHA-256 Access Guard for Chubby Chat

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithRedirect, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAc46X6MIXI-moZ2oTy2ShiDv6IrjhVQC4",
  authDomain: "finance-app-23309.firebaseapp.com",
  projectId: "finance-app-23309",
};

// Initialize or reuse existing app instance
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// ==========================================
// SECURITY & AUTH SETUP (SHA-256 RESTRICTED)
// ==========================================
// Lowercase SHA-256 hashes of allowed email addresses
const ALLOWED_EMAIL_HASHES = [
  "24a8875545b9c0867169cc58a471fd522134a0c8ac795110f4111a9fbdae7d14",
  // Add partner's SHA-256 hash below if needed:
  // "partner_email_hash_here"
];

async function hashEmail(email) {
  if (!email) return "";
  const msgBuffer = new TextEncoder().encode(email.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

const GOOGLE_BTN_HTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" style="width: 20px; height: 20px;"> <span>Sign in with Google</span>`;

// ── AUTH STATE LISTENER ──────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  const btn = document.getElementById("googleLoginBtn");
  const errDiv = document.getElementById("login-error");
  const loginScreen = document.getElementById("login-screen");
  const chatUi = document.getElementById("chat-ui");

  if (user) {
    const userHash = await hashEmail(user.email || "");

    // 1. Check if authenticated account is authorized
    if (!ALLOWED_EMAIL_HASHES.includes(userHash)) {
      await signOut(auth);
      if (errDiv) {
        errDiv.textContent = "Access Denied: Account not authorized.";
        errDiv.style.display = "block";
      }
      if (btn) {
        btn.innerHTML = GOOGLE_BTN_HTML;
        btn.disabled = false;
      }
      return;
    }

    // 2. Hide Login Card and Reveal Chat UI
    if (loginScreen) loginScreen.style.display = "none";
    if (chatUi) {
      chatUi.style.display = "flex";
      chatUi.classList.add("visible");
    }
    if (errDiv) errDiv.style.display = "none";

    // 3. Connect User instance with chat.js bridge
    if (window.chatBridge) {
      window.chatBridge.getCurrentUser = () => auth.currentUser;
    }

    // 4. Update Sidebar with Google Profile information
    const sbName = document.getElementById("sidebar-name");
    const sbAvatar = document.getElementById("sidebar-avatar");
    if (sbName) sbName.textContent = user.displayName || user.email.split("@")[0];
    if (sbAvatar && user.photoURL) {
      sbAvatar.innerHTML = `<img src="${user.photoURL}" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }

    // 5. Trigger chat messages loading
    if (typeof window.loadChat === "function") {
      window.loadChat();
    }
  } else {
    // Show Login Card and Hide Chat UI
    if (loginScreen) loginScreen.style.display = "flex";
    if (chatUi) {
      chatUi.style.display = "none";
      chatUi.classList.remove("visible");
    }
    if (btn) {
      btn.innerHTML = GOOGLE_BTN_HTML;
      btn.disabled = false;
    }
  }
});

// ── GOOGLE SIGN-IN HANDLER ───────────────────────────────
window.handleGoogleLogin = async function () {
  const provider = new GoogleAuthProvider();
  const btn = document.getElementById("googleLoginBtn");
  const errDiv = document.getElementById("login-error");

  if (btn) {
    btn.innerHTML = "Verifying...";
    btn.disabled = true;
  }
  if (errDiv) errDiv.style.display = "none";

try {
    await signInWithRedirect(auth, provider);
  } catch (error) {
    if (errDiv) {
      errDiv.textContent = "Authentication failed: " + error.message;
      errDiv.style.display = "block";
    }
    if (btn) {
      btn.innerHTML = GOOGLE_BTN_HTML;
      btn.disabled = false;
    }
  }
};

// ── LOGOUT HANDLER ───────────────────────────────────────
window.logout = async function () {
  try {
    await signOut(auth);
  } catch (e) {
    console.error("Sign out error:", e);
  }
};

// Attach sign-out triggers to Chubby Chat buttons
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("sidebar-logout-btn")?.addEventListener("click", window.logout);
  document.getElementById("logout-btn")?.addEventListener("click", window.logout);
});