// Idle/online presence and typing indicator (shown in the header next to the partner's name)
import { ref, onValue, onDisconnect, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { rtdb } from "./firebase.js";
import { msgInput } from "./input-bar.js";
import { state } from "./state.js";

// ── IDLE / PRESENCE ───────────────────────────────────────
let idleTimer, isIdle = false;
function resetIdleTimer() {
  if (!state.currentUser) return;
  if (isIdle) { isIdle = false; set(ref(rtdb, "/status/" + state.currentUser.uid), { state: "online" }); }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (state.currentUser) { isIdle = true; set(ref(rtdb, "/status/" + state.currentUser.uid), { state: "idle" }); } }, 3 * 60 * 1000);
}
['mousemove','keydown','click','touchstart','scroll'].forEach(evt => document.addEventListener(evt, resetIdleTimer, true));

export function setupPresence(uid) {
  const myRef = ref(rtdb, "/status/" + uid);
  onValue(ref(rtdb, ".info/connected"), snap => {
    if (snap.val()) onDisconnect(myRef).set({ state: "offline" }).then(() => { set(myRef, { state: "online" }); resetIdleTimer(); });
  });
  onValue(ref(rtdb, "/status"), snap => {
    const statuses = snap.val() || {};
    let st = "offline";
    for (const id in statuses) { if (id !== uid && statuses[id].state) st = statuses[id].state; }
    partnerState = st;
    renderHeaderStatus();
  });
}

// Header line under the name:  "Partner · Online"   →   "Partner · typing ●●●" while they type
let partnerState = "offline", partnerTyping = false;
const escapeHtml = (t) => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function renderHeaderStatus() {
  const el = document.getElementById("status-indicator"), txt = el.querySelector(".status-text");
  const name = `<span class="st-name">${escapeHtml(state.partnerName || "Partner")}</span>`;
  if (partnerTyping) {
    el.className = "online typing";
    txt.innerHTML = `${name}<span class="st-rest"> · typing <span class="hdr-dots"><i></i><i></i><i></i></span></span>`;
  } else if (partnerState === "online") { el.className = "online"; txt.innerHTML = `${name}<span class="st-rest"> · Online</span>`; }
  else if (partnerState === "idle")     { el.className = "idle";   txt.innerHTML = `${name}<span class="st-rest"> · Away</span>`; }
  else                                  { el.className = "";       txt.textContent = "Offline"; }
}

// ── TYPING ────────────────────────────────────────────────
export function setupTypingIndicator(uid) {
  let typingTimeout;
  let isTypingLocally = false; // ✨ NEW: Prevents database spam
  const myRef = ref(rtdb, "/typing/" + uid);
  
  msgInput.addEventListener("input", () => { 
    // Only send the network request if we aren't already typing
    if (!isTypingLocally) {
      isTypingLocally = true;
      set(myRef, true); 
    }
    
    // Reset the countdown on every keystroke
    clearTimeout(typingTimeout); 
    typingTimeout = setTimeout(() => {
      isTypingLocally = false;
      set(myRef, false);
    }, 1500); 
  });
  
  onValue(ref(rtdb, "/typing"), snap => {
    const d = snap.val() || {};
    let pt = false;
    for (const id in d) { if (id !== uid && d[id]) pt = true; }
    if (pt !== partnerTyping) { partnerTyping = pt; renderHeaderStatus(); }
  });
}
