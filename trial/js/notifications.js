import { serverTimestamp, doc, setDoc, getDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { appsScriptUrl } from "./config.js";
import { state } from "./state.js";

const appUrl = () => new URL("./", location.href).href;
const $ = (id) => document.getElementById(id);
let mySound = "pushover";

function setStatus(text, kind) {
  const el = $("notif-status"); if (!el) return;
  el.textContent = text;
  el.style.color = kind === "ok" ? "var(--online)" : kind === "bad" ? "var(--danger)" : "var(--text-secondary)";
}

// ── Talk to Apps Script ──────────────────────────────────
async function callPushover(targetUid, title, message, sound) {
  const res = await fetch(appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      secret: state.uploadSecret,
      action: "pushover",
      userKey: targetUid, // Send the UID instead of a real key! GAS will translate it.
      title: title || (state.currentUser && state.currentUser.displayName) || "Partner",
      message,
      sound: sound || "pushover", 
      url: appUrl()
    })
  });
  return res.json(); 
}

// Send a Pushover notification to your partner
export async function notifyPartner(body, title) {
  if (!state.currentUser || !appsScriptUrl) return;
  try {
    const snap = await getDocs(collection(db, "users"));
    snap.forEach(d => {
      if (d.id === state.currentUser.uid) return; // Skip our own profile
      
      const sound = (d.data() && d.data().pushoverSound) || "pushover";
      
      callPushover(d.id, title, body, sound)
        .catch(e => console.error("GAS Fetch Error:", e));
    });
  } catch (e) {
    console.error("🚨 FIREBASE ERROR:", e);
  }
}

// ── Save / Test (Settings screen) ────────────────────────
async function saveSound() {
  if (!state.currentUser) return false;
  const sound = $("pushover-sound-select") ? $("pushover-sound-select").value : "pushover"; 

  try {
    await setDoc(doc(db, "users", state.currentUser.uid), { 
      pushoverSound: sound, 
      pushoverUpdated: serverTimestamp() 
    }, { merge: true });

    mySound = sound;
    setStatus("Ringtone saved ✓ — tap “Test Sound” to check.", "ok");
    return true;
  } catch (e) {
    setStatus("Couldn't save sound (" + (e.message || e) + ").", "bad");
    return false;
  }
}

async function sendTest() {
  if (!state.currentUser) return;
  setStatus("Sending test…");
  try {
    // Send our own UID to GAS. GAS will magically swap it for our real Pushover Key!
    const r = await callPushover(state.currentUser.uid, "Chubby Chat 🌸", "This is your new ringtone! 🎵", mySound);
    if (r && r.status === "success") setStatus("Test sent ✓ — check your phone.", "ok");
    else setStatus("Error: Check Apps Script setup.", "bad");
  } catch (e) {
    setStatus("Couldn't reach Apps Script.", "bad");
  }
}

if ($("pushover-save-btn")) $("pushover-save-btn").addEventListener("click", () => saveSound());
if ($("pushover-test-btn")) $("pushover-test-btn").addEventListener("click", () => sendTest());

// Called automatically right after login
export async function initNotifications(user) {
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    mySound = (snap.exists() && snap.data().pushoverSound) || "pushover";
    if ($("pushover-sound-select")) $("pushover-sound-select").value = mySound;
    setStatus("Push notifications are active ✓", "ok");
  } catch (e) { 
    console.error("Could not load sound preference:", e); 
  }
}

// ── IN-APP SOUND & NOTIFICATIONS (Banner) ────────────────
let notifSound = null;
export function getSound() {
  if (!notifSound) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      notifSound = { play() {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.28);
        return Promise.resolve();
      }};
    } catch(e) { notifSound = { play: () => Promise.resolve() }; }
  }
  return notifSound;
}

export function showInAppBanner(title, body) {
  let banner = document.getElementById("notif-banner");
  if (!banner) {
    banner = document.createElement("div"); banner.id = "notif-banner";
    banner.style.cssText = "position:fixed;top:14px;left:50%;transform:translateX(-50%) translateY(-80px);background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 30px rgba(0,0,0,.4);z-index:9999;max-width:320px;width:90%;transition:transform .3s cubic-bezier(.34,1.56,.64,1);font-family:var(--font);";
    document.body.appendChild(banner);
  }
  banner.innerHTML = `<span style="font-size:20px">💬</span><div><div style="font-size:13px;font-weight:600;color:var(--text-primary)">${title}</div><div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${body}</div></div>`;
  banner.style.transform = "translateX(-50%) translateY(0)";
  clearTimeout(banner._t);
  banner._t = setTimeout(() => { banner.style.transform = "translateX(-50%) translateY(-80px)"; }, 3500);
}