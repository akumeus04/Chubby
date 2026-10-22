// Notifications via Pushover (User Key), plus in-app sound and banner.
//
// How it works:
//   • Each person pastes their own Pushover USER KEY in Settings. It is saved in Firestore (fcm_tokens/{uid}.pushoverUserKey).
//   • When you send a message, this site asks your Google Apps Script to call Pushover for your PARTNER's user key.
//   • The Pushover API TOKEN lives only inside Apps Script (Script Properties) — never in this public website code.
import { serverTimestamp, doc, setDoc, getDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { appsScriptUrl } from "./config.js";
import { state } from "./state.js";

const KEY_RE = /^[A-Za-z0-9]{30}$/;          // Pushover user/group keys are 30 letters+digits
const appUrl = () => new URL("./", location.href).href;
const $ = (id) => document.getElementById(id);
let myKey = "";                              // this user's saved Pushover key
let mySound = "pushover";

function maskKey(k) { return k ? k.slice(0, 3) + "••••••••••••••••••••••" + k.slice(-3) : ""; }
function setStatus(text, kind) {
  const el = $("notif-status"); if (!el) return;
  el.textContent = text;
  el.style.color = kind === "ok" ? "var(--online)" : kind === "bad" ? "var(--danger)" : "var(--text-secondary)";
}

// ── Talk to Apps Script ──────────────────────────────────
async function callPushover(userKey, title, message, sound) {
  const res = await fetch(appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      secret: state.uploadSecret,
      action: "pushover",
      userKey,
      title: title || (state.currentUser && state.currentUser.displayName) || "Partner",
      message,
      sound: sound || "pushover", // Pass the sound!
      url: appUrl()
    })
  });
  return res.json();           // { status: "success" } or { status: "error", message }
}

// Send a Pushover notification to your partner's phone (called after every message you send).
export async function notifyPartner(body, title) {
  if (!state.currentUser || !appsScriptUrl) return;
  try {
    // 1. Get all tokens from the database
    const snap = await getDocs(collection(db, "fcm_tokens"));
    
    // 2. Loop through them
    snap.forEach(d => {
      // 3. Skip our own ID so we don't ping ourselves
      if (d.id === state.currentUser.uid) return;
      
      // 4. Extract the partner's data and sound preference
      const data = d.data() || {};
      const key = data.pushoverUserKey;
      const sound = data.pushoverSound || "pushover";
      
      if (!key) return; // Partner hasn't set Pushover up yet
      
      // 5. Send the ping with the custom sound!
      callPushover(key, title, body, sound)
        .then(r => { if (r && r.status !== "success") console.error("Pushover error:", r.message); })
        .catch(e => console.error("Pushover ping error:", e));
    });
  } catch (e) {
    console.error("Failed to look up partner's Pushover key:", e);
  }
}

// ── Save / test (Settings screen) ────────────────────────
async function saveKey(raw, { quiet } = {}) {
  let key = (raw || "").trim();
  const sound = $("pushover-sound-select") ? $("pushover-sound-select").value : "pushover"; 

  // If the input is empty but we already have a saved key, preserve the existing key!
  if (!key && myKey) {
    key = myKey;
  }

  if (!state.currentUser) return false;
  if (key && !KEY_RE.test(key)) { 
    setStatus("That doesn't look right — a Pushover User Key is 30 letters/numbers (shown on pushover.net's dashboard).", "bad"); 
    return false; 
  }

  try {
    // Save both the key and sound to Firestore
    await setDoc(doc(db, "fcm_tokens", state.currentUser.uid), { 
      pushoverUserKey: key, 
      pushoverSound: sound, 
      pushoverUpdated: serverTimestamp() 
    }, { merge: true });

    myKey = key;
    mySound = sound;
    window.chubbyPushReady = !!key;
    refreshUI();

    if (!quiet) setStatus(key ? "Saved ✓ — tap “Send test” to check your phone." : "Pushover turned off.", key ? "ok" : "");
    return true;
  } catch (e) {
    console.error("Could not save Pushover key:", e);
    setStatus("Couldn't save the key (" + (e.message || e) + ").", "bad");
    return false;
  }
}

async function sendTest() {
  if (!myKey) { setStatus("Save your User Key first.", "bad"); return; }
  setStatus("Sending test…");
  try {
    const r = await callPushover(myKey, "Chubby Chat 🌸", "Pushover is connected! You'll get pings like this when your partner messages you 💕", mySound);
    if (r && r.status === "success") setStatus("Test sent ✓ — check your phone's Pushover notification.", "ok");
    else setStatus("Pushover said: " + ((r && r.message) || "unknown error") + " — check the User Key and your Apps Script setup.", "bad");
  } catch (e) {
    setStatus("Couldn't reach Apps Script (" + (e.message || e) + "). Did you deploy a new version?", "bad");
  }
}

function refreshUI() {
  const input = $("pushover-key-input"), test = $("pushover-test-btn"), clear = $("pushover-clear-btn");
  if (input && document.activeElement !== input) input.value = "";
  if (input) input.placeholder = myKey ? "Saved: " + maskKey(myKey) : "Paste your 30-character User Key";
  if (test) test.style.display = myKey ? "" : "none";
  if (clear) clear.style.display = myKey ? "" : "none";
  if (!$("notif-status").textContent || $("notif-status").dataset.auto === "1") {
    $("notif-status").dataset.auto = "1";
    setStatus(myKey ? "Connected to Pushover ✓ (" + maskKey(myKey) + ")" : "Install the Pushover app, then paste your User Key to get pings on your phone.", myKey ? "ok" : "");
  }
}

$("pushover-save-btn").addEventListener("click", () => { 
  $("notif-status").dataset.auto = ""; 
  saveKey($("pushover-key-input").value); 
});

$("pushover-key-input").addEventListener("keydown", (e) => { 
  if (e.key === "Enter") $("pushover-save-btn").click(); 
});

$("pushover-test-btn").addEventListener("click", () => { 
  $("notif-status").dataset.auto = ""; 
  sendTest(); 
});

$("pushover-clear-btn").addEventListener("click", () => { 
  $("notif-status").dataset.auto = ""; 
  myKey = ""; // Explicitly reset local key
  if ($("pushover-sound-select")) $("pushover-sound-select").value = "pushover";
  saveKey(""); // Clears key in Firestore
});

// ── Friendly first-run prompt ────────────────────────────
let promptShown = false;
function showSetupPrompt() {
  if (promptShown || myKey || $("notif-soft-prompt")) return;
  promptShown = true;
  const box = document.createElement("div");
  box.id = "notif-soft-prompt";
  box.style.cssText = "position:fixed;left:12px;right:12px;bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:9000;max-width:420px;margin:0 auto;background:var(--surface);color:var(--text-primary);border:1px solid var(--border);border-radius:22px;padding:16px;box-shadow:var(--shadow);font-family:var(--font);";
  box.innerHTML = `
    <div style="display:flex;gap:12px;align-items:center;">
      <div style="font-size:30px">🔔</div>
      <div><div style="font-weight:800;font-size:15px">Get pings on your phone 💕</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-top:2px">Paste your Pushover User Key to get notified when a message arrives.</div></div>
    </div>
    <input id="notif-soft-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40" placeholder="30-character User Key"
      style="width:100%;margin-top:12px;padding:12px 14px;font-size:16px;border-radius:14px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text-primary);font-family:var(--font);outline:none;">
    <div id="notif-soft-msg" style="font-size:12px;color:var(--danger);min-height:0;margin-top:6px"></div>
    <div style="display:flex;gap:10px;margin-top:10px">
      <button id="notif-soft-yes" style="flex:1;border:none;border-radius:14px;padding:12px;font-weight:800;font-size:14px;color:#fff;background:var(--my-bubble-bg);cursor:pointer">Save</button>
      <button id="notif-soft-no" style="flex:0 0 auto;border:1px solid var(--border);border-radius:14px;padding:12px 16px;font-weight:700;font-size:14px;color:var(--text-secondary);background:transparent;cursor:pointer">Not now</button>
    </div>`;
  document.body.appendChild(box);
  $("notif-soft-no").onclick = () => { localStorage.setItem("chubby-notif-dismissed", String(Date.now())); box.remove(); };
  $("notif-soft-yes").onclick = async () => {
    const v = $("notif-soft-key").value.trim();
    if (!KEY_RE.test(v)) { $("notif-soft-msg").textContent = "A User Key is 30 letters/numbers."; return; }
    if (await saveKey(v, { quiet: true })) { box.remove(); showInAppBanner("Pushover connected 🎉", "Open Settings → Notifications to send a test."); }
  };
}

// Called after login
export async function initNotifications(user) {
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, "fcm_tokens", user.uid));
    myKey = (snap.exists() && snap.data().pushoverUserKey) || "";
	mySound = (snap.exists() && snap.data().pushoverSound) || "pushover";
	if ($("pushover-sound-select")) $("pushover-sound-select").value = mySound; // Set dropdown on load
  } catch (e) { console.error("Could not load Pushover key:", e); }
  window.chubbyPushReady = !!myKey;
  $("notif-status").dataset.auto = "1"; $("notif-status").textContent = "";
  refreshUI();
  if (!myKey) {
    const dismissed = Number(localStorage.getItem("chubby-notif-dismissed") || 0);
    if (Date.now() - dismissed > 7 * 24 * 3600 * 1000) setTimeout(showSetupPrompt, 3500);
  }
}

// ── SOUND & NOTIFICATIONS ─────────────────────────────────
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
