// Push notifications, sound and in-app banner
import { serverTimestamp, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { app, db } from "./firebase.js";

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


// ── NOTIFICATIONS ─────────────────────────────────────────
function updateNotifBtn() {
  const btn = document.getElementById("notif-permission-btn");
  if (!btn) return;
  
  // ✨ FIX: If we are in a native app, disable the web notification button safely
  if (!('Notification' in window)) { 
    btn.textContent = "App Handles Notifs"; 
    btn.disabled = true; 
    return; 
  }
  
  if (Notification.permission === "granted")       { btn.textContent = "✓ Enabled"; btn.style.background = "var(--online)"; btn.disabled = true; }
  else if (Notification.permission === "denied")   { btn.textContent = "Blocked"; btn.style.background = "var(--danger)"; btn.disabled = true; }
  else { btn.textContent = "Enable"; btn.disabled = false; }
}

document.getElementById("notif-permission-btn").addEventListener("click", () => {
  if ('Notification' in window) Notification.requestPermission().then(updateNotifBtn);
});
updateNotifBtn();

document.addEventListener("click", () => { 
  if ('Notification' in window && Notification.permission === "default") Notification.requestPermission(); 
}, { once: true });


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
