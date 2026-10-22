// Push notifications (Android Chrome / installed app via Firebase Cloud Messaging), sound and in-app banner
import { serverTimestamp, doc, setDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getMessaging, getToken, isSupported } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";
import { app, db } from "./firebase.js";
import { appsScriptUrl, VAPID_KEY } from "./config.js";
import { state } from "./state.js";

const isNative = () => !!(window.Capacitor && Capacitor.getPlatform && Capacitor.getPlatform() !== 'web');
let lastResult = null;       // result of the latest registration attempt
let promptShown = false;

// ── NOTIFICATIONS (FULL NATIVE) ───────────────────────────
export async function setupNativeNotifications(user) {
  if (!user) return;

  // 1. Check if we are running on a Native Phone (Capacitor)
  if (window.Capacitor && Capacitor.getPlatform() !== 'web') {
    try {
      // 2. Request Android System Permissions
      let permStatus = await window.Capacitor.Plugins.PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await window.Capacitor.Plugins.PushNotifications.requestPermissions();
      }

      if (permStatus.receive === 'granted') {
        console.log('Native notification permission granted!');

        await window.Capacitor.Plugins.PushNotifications.createChannel({
          id: 'fcm_default_channel',
          name: 'Default',
          description: 'General Notifications',
          importance: 5,
          visibility: 1
        });

        await window.Capacitor.Plugins.PushNotifications.register();

        await window.Capacitor.Plugins.PushNotifications.addListener('registration', async (token) => {
          console.log('Native Device Token:', token.value);
          
          const userTokenRef = doc(db, "fcm_tokens", user.uid);
          await setDoc(userTokenRef, {
            token: token.value,
            lastUpdated: serverTimestamp()
          });
        });

      } else {
        console.log('User denied native push permissions.');
      }
    } catch (error) {
      console.error('Error setting up native push:', error);
    }
  } else {
    console.log("Running in Chrome Browser - Native Push skipped.");
  }
}



// ── WEB PUSH (Android Chrome / installed PWA) ─────────────
function getDeviceId() {
  let id = localStorage.getItem("chubby-device-id");
  if (!id) {
    id = ((crypto.randomUUID && crypto.randomUUID()) || (Date.now() + Math.random().toString(36))).replace(/[^a-z0-9]/gi, "").slice(0, 16);
    localStorage.setItem("chubby-device-id", id);
  }
  return id;
}
function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "Mac" : "Web";
  const standalone = window.matchMedia("(display-mode: standalone)").matches ? " (app)" : "";
  return os + standalone;
}
const appUrl = () => new URL("./", location.href).href;

function getSwRegistration() {
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("Service worker not ready — is sw.js uploaded next to index.html?")), 12000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

// Gets this phone's FCM token and saves it to Firestore so your partner's messages can reach it.
export async function registerWebPush(user) {
  if (!user) return { ok: false, reason: "no-user" };
  if (isNative()) return { ok: false, reason: "native" };
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return { ok: false, reason: "unsupported" };
  if (Notification.permission !== "granted") return { ok: false, reason: Notification.permission };
  try {
    if (!(await isSupported())) return { ok: false, reason: "unsupported" };
    if (!state.messaging) state.messaging = getMessaging(app);
    const reg = await getSwRegistration();
    const token = await getToken(state.messaging, { serviceWorkerRegistration: reg, ...(VAPID_KEY ? { vapidKey: VAPID_KEY } : {}) });
    if (!token) return { ok: false, reason: "no-token" };

    // One entry per device, so your phone and your PC never overwrite each other.
    await setDoc(doc(db, "fcm_tokens", user.uid), {
      token,                                   // latest device (kept for older code / Apps Script)
      devices: { [getDeviceId()]: { token, label: deviceLabel(), updated: serverTimestamp() } },
      lastUpdated: serverTimestamp()
    }, { merge: true });

    localStorage.setItem("chubby-push-token", token);
    window.chubbyPushReady = true;
    return { ok: true, token };
  } catch (err) {
    console.error("Push registration failed:", err);
    return { ok: false, reason: "error", error: err };
  }
}

function tokensOf(data) {
  const set = new Set();
  if (data && data.token) set.add(data.token);
  Object.values((data && data.devices) || {}).forEach(d => d && d.token && set.add(d.token));
  return [...set];
}

function sendPush(token, title, body) {
  return fetch(appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      secret: state.uploadSecret,
      action: "notify",
      targetToken: token,
      title: title || (state.currentUser && state.currentUser.displayName) || "Partner",
      body,
      url: appUrl()
    })
  });
}

// Push a notification to every device of your partner (called after each message you send).
export async function notifyPartner(body, title) {
  if (!state.currentUser || !appsScriptUrl) return;
  try {
    const snap = await getDocs(collection(db, "fcm_tokens"));
    snap.forEach(d => {
      if (d.id === state.currentUser.uid) return;
      tokensOf(d.data()).forEach(t => sendPush(t, title, body).catch(e => console.error("Apps Script Ping Error:", e)));
    });
  } catch (e) {
    console.error("Failed to fetch tokens for push:", e);
  }
}

// Sends a notification to THIS phone so you can see it working.
async function sendTestPush() {
  const token = localStorage.getItem("chubby-push-token");
  const status = document.getElementById("notif-status");
  if (!token) { if (status) status.textContent = "Turn notifications on first."; return; }
  try {
    status.textContent = "Sending test…";
    await sendPush(token, "Chubby Chat 🌸", "Notifications are working on this phone! 💕");
    status.textContent = "Test sent — it should pop up in a few seconds. Switch to another app to see it.";
  } catch (e) {
    status.textContent = "Couldn't send the test: " + (e && e.message ? e.message : e);
  }
}

// ── SETTINGS BUTTON + STATUS ──────────────────────────────
function setStatus(text) { const el = document.getElementById("notif-status"); if (el) el.textContent = text; }

function updateNotifBtn() {
  const btn = document.getElementById("notif-permission-btn");
  const test = document.getElementById("notif-test-btn");
  if (!btn) return;
  btn.style.background = "";
  if (test) test.style.display = "none";

  if (isNative() || !("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    btn.textContent = isNative() ? "App Handles Notifs" : "Not supported";
    btn.disabled = true;
    setStatus(isNative() ? "" : "This browser can't receive push. On Android, open the site in Chrome (or install it from the menu → Add to Home screen).");
    return;
  }
  if (Notification.permission === "denied") {
    btn.textContent = "Blocked"; btn.style.background = "var(--danger)"; btn.disabled = true;
    setStatus("Blocked. On Android: tap the 🔒 next to the address bar → Permissions → Notifications → Allow, then reload.");
    return;
  }
  if (Notification.permission === "granted") {
    if (window.chubbyPushReady) {
      btn.textContent = "✓ Enabled"; btn.style.background = "var(--online)"; btn.disabled = true;
      setStatus("Connected to this " + deviceLabel() + " device 💕");
      if (test) test.style.display = "";
    } else {
      btn.textContent = lastResult ? "Reconnect" : "Connecting…"; btn.disabled = false;
      const why = lastResult && lastResult.error ? lastResult.error.message : (lastResult && lastResult.reason) || "";
      setStatus(lastResult ? "Couldn't connect this device" + (why ? " (" + why + ")" : "") + ". Tap Reconnect." : "Connecting this device…");
    }
    return;
  }
  btn.textContent = "Enable"; btn.disabled = false;
  setStatus("Get a ping on your phone whenever a new message arrives.");
}

async function enableFlow() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") await Notification.requestPermission();
  if (Notification.permission === "granted") {
    setStatus("Connecting this device…");
    lastResult = await registerWebPush(state.currentUser);
  }
  updateNotifBtn();
  return lastResult;
}

document.getElementById("notif-permission-btn").addEventListener("click", enableFlow);
const testBtn = document.getElementById("notif-test-btn");
if (testBtn) testBtn.addEventListener("click", sendTestPush);
updateNotifBtn();

// Friendly one-time prompt (browsers only allow the permission popup after a tap)
function showSoftPrompt() {
  if (promptShown || document.getElementById("notif-soft-prompt")) return;
  promptShown = true;
  const box = document.createElement("div");
  box.id = "notif-soft-prompt";
  box.style.cssText = "position:fixed;left:12px;right:12px;bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:9000;max-width:420px;margin:0 auto;background:var(--surface);color:var(--text-primary);border:1px solid var(--border);border-radius:22px;padding:16px;box-shadow:var(--shadow);font-family:var(--font);";
  box.innerHTML = `
    <div style="display:flex;gap:12px;align-items:center;">
      <div style="font-size:30px">🔔</div>
      <div><div style="font-weight:800;font-size:15px">Never miss a message 💕</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-top:2px">Turn on notifications to get a ping on this phone.</div></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:14px">
      <button id="notif-soft-yes" style="flex:1;border:none;border-radius:14px;padding:12px;font-weight:800;font-size:14px;color:#fff;background:var(--my-bubble-bg);cursor:pointer">Turn on</button>
      <button id="notif-soft-no" style="flex:0 0 auto;border:1px solid var(--border);border-radius:14px;padding:12px 16px;font-weight:700;font-size:14px;color:var(--text-secondary);background:transparent;cursor:pointer">Not now</button>
    </div>`;
  document.body.appendChild(box);
  document.getElementById("notif-soft-no").onclick = () => { localStorage.setItem("chubby-notif-dismissed", String(Date.now())); box.remove(); };
  document.getElementById("notif-soft-yes").onclick = async () => {
    box.remove();
    const r = await enableFlow();
    if (r && r.ok) showInAppBanner("Notifications on 🎉", "You'll get a ping when a message arrives.");
  };
}

// Called after login
export function initNotifications(user) {
  setupNativeNotifications(user);              // Capacitor Android-app path (unchanged)
  if (isNative() || !("Notification" in window)) { updateNotifBtn(); return; }

  if (Notification.permission === "granted") {
    registerWebPush(user).then(r => { lastResult = r; updateNotifBtn(); });   // also refreshes the token each launch
  } else if (Notification.permission === "default") {
    const dismissed = Number(localStorage.getItem("chubby-notif-dismissed") || 0);
    if (Date.now() - dismissed > 7 * 24 * 3600 * 1000) setTimeout(showSoftPrompt, 3500);
  }
  updateNotifBtn();
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
