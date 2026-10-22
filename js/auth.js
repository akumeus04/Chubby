// Login, logout and auth-state handling
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { auth, rtdb } from "./firebase.js";
import { getDirectImageUrl } from "./helpers.js";
import { buildEmojiPicker } from "./emoji.js";
import { renderSavedRepliesSettings } from "./saved-replies.js";
import { setupPresence, setupTypingIndicator } from "./presence.js";
import { initNotifications } from "./notifications.js";
import { applyTheme } from "./theme.js";
import { state } from "./state.js";

// ── LOGIN ─────────────────────────────────────────────────
document.getElementById("login-btn").addEventListener("click", () => {
  const btn = document.getElementById("login-btn");
  const email = document.getElementById("email").value.trim();
  const pass  = document.getElementById("password").value;
  
  if (!email || !pass) { 
    document.getElementById("login-error").innerText = "Please fill in all fields."; 
    return; 
  }
  
  btn.disabled = true; 
  btn.textContent = "Signing in…";
  
  signInWithEmailAndPassword(auth, email, pass).catch(err => {
    let friendlyError = err.message; // Default fallback
    
    // Check Firebase's specific error codes and translate them
    if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      friendlyError = "Password is wrong, try again.";
    } else if (err.code === "auth/user-not-found") {
      friendlyError = "No account found with this email.";
    } else if (err.code === "auth/invalid-email") {
      friendlyError = "Please enter a valid email address.";
    } else if (err.code === "auth/too-many-requests") {
      friendlyError = "Too many failed attempts. Try again later.";
    }

    document.getElementById("login-error").innerText = friendlyError;
    btn.disabled = false; 
    btn.textContent = "Sign In";
  });
});

document.getElementById("password").addEventListener("keydown", e => { 
  if (e.key === "Enter") document.getElementById("login-btn").click(); 
});

document.getElementById("forgot-password-btn").addEventListener("click", () => {
  const email = document.getElementById("email").value.trim();
  const errEl = document.getElementById("login-error");
  if (!email) { 
    errEl.style.color = "var(--danger)"; 
    errEl.innerText = "Enter your email above first."; 
    return; 
  }
  sendPasswordResetEmail(auth, email).then(() => { 
    errEl.style.color = "var(--online)"; 
    errEl.innerText = "Reset email sent! Check your inbox."; 
  }).catch(err => { 
    errEl.style.color = "var(--danger)"; 
    errEl.innerText = err.message; 
  });
});

// ── LOGOUT ────────────────────────────────────────────────
async function doLogout() {
  // 1. Ask the user for confirmation first
  const isSure = confirm("Are you sure you want to log out?");
  
  // 2. If they click "Cancel", stop the function right here
  if (!isSure) return; 

  // 3. If they click "OK", proceed with the logout
  if (state.currentUser) {
    await set(ref(rtdb, "/status/" + state.currentUser.uid), { state: "offline" });
  }
  await signOut(auth);
  window.location.reload();
}
document.getElementById("logout-btn").addEventListener("click", doLogout);
document.getElementById("sidebar-logout-btn")?.addEventListener("click", doLogout);


// ── AUTH STATE ────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    state.currentUser = user;
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("chat-ui").classList.add("active");
    const name = user.displayName || user.email.split("@")[0];
    document.getElementById("header-name").innerText = name;
    document.getElementById("profile-nickname").value = user.displayName || "";
    document.getElementById("profile-photo").value    = user.photoURL || "";
    document.getElementById("sidebar-name").textContent = name;

    // 🔒 NEW: Fetch the secret passcode from Firebase privately
    // This stays in the computer's memory and isn't visible in the source code.
    onValue(ref(rtdb, "upload_config/passcode"), (snap) => {
      state.uploadSecret = snap.val();
    });

    // Sidebar avatar
    const photo = getDirectImageUrl(user.photoURL || "");
    const sa = document.getElementById("sidebar-avatar");
    if (photo && (photo.startsWith("http") || photo.startsWith("data:"))) {
      sa.innerHTML = `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else { sa.textContent = user.photoURL || "👤"; }

    setupPresence(user.uid);
    setupTypingIndicator(user.uid);
    buildEmojiPicker();
    renderSavedRepliesSettings();
    
    // chat.js is a separate module; if it hasn't finished loading yet, wait for it.
    startChatWhenReady();

    applyTheme(localStorage.getItem("messenger-theme") === "light");
	
// Trigger the Native notification prompt!
initNotifications(user);
	
  } else {
    state.currentUser = null;
    state.uploadSecret = ""; // 🔒 SECURITY: Wipe the secret from memory on logout
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("chat-ui").classList.remove("active");
    document.getElementById("login-btn").disabled = false;
    document.getElementById("login-btn").textContent = "Sign In";
  }
});

function startChatWhenReady(tries = 0) {
  if (typeof window.loadChat === "function") {
    try { window.loadChat(); } catch (e) { console.error("loadChat failed:", e); }
  } else if (tries < 100) {
    setTimeout(() => startChatWhenReady(tries + 1), 100);   // retry for up to ~10s
  } else {
    console.error("chat.js did not load - messages cannot be shown.");
  }
}
