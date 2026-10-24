// Service worker update flow and install banner
import { app } from "./firebase.js";

// ── PWA SERVICE WORKER REGISTRATION & UPDATE LOGIC ──────────────
let newWorker;
const updateBanner = document.getElementById('update-banner');
const updateBtn = document.getElementById('apply-update-btn');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // 1. Register the Service Worker
    navigator.serviceWorker.register('./sw.js').then(reg => {
      
      // If an update is found, prep the new worker
      reg.addEventListener('updatefound', () => {
        newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            updateBanner.classList.add('visible'); // Show banner
          }
        });
      });

      // If an update is already waiting, show the banner
      if (reg.waiting) {
        newWorker = reg.waiting;
        updateBanner.classList.add('visible');
      }
    }).catch(err => console.error("Service Worker Error:", err));

    // 2. Listen for the worker to take over, then reload
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}

// 3. Bulletproof Button Click
if (updateBtn) {
  updateBtn.addEventListener('click', () => {
    updateBtn.textContent = "Updating..."; // Give visual feedback
    
    if (newWorker) {
      // Tell the new worker to take over
      newWorker.postMessage({ type: 'SKIP_WAITING' });
      
      // Fallback: If the page doesn't reload in 1 second, force it
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      // Absolute fallback if worker is missing
      window.location.reload();
    }
  });
}

// ── APP INSTALLATION (PWA) ────────────────────────────────
let deferredPrompt;
const installBanner = document.getElementById('install-banner');
const installBtn = document.getElementById('install-btn');
const closeInstallBtn = document.getElementById('close-install-btn');

// 1. Detect if the device is iOS (Apple)
const isIos = () => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
};

// 2. Detect if the app is already installed and running standalone
const isInStandaloneMode = () => ('standalone' in window.navigator) && (window.navigator.standalone);

// 3. Android / Chrome - Intercept the install prompt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // Prevent default mini-infobar
  deferredPrompt = e; // Stash the event so it can be triggered later
  installBanner.classList.add('visible'); // Show our custom banner
});

// 4. Handle the Install Button Click (Android)
if (installBtn) {
  installBtn.addEventListener('click', async () => {
    installBanner.classList.remove('visible');
    if (deferredPrompt) {
      deferredPrompt.prompt(); // Show the native browser install prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to install prompt: ${outcome}`);
      deferredPrompt = null;
    }
  });
}

// 5. Handle iOS Apple Users (Since Apple blocks the prompt button)
if (isIos() && !isInStandaloneMode()) {
  installBanner.classList.add('visible');
  installBtn.style.display = 'none'; // Hide the button
  document.getElementById('install-text').innerHTML = 'To install: Tap the <b>Share</b> icon at the bottom, then scroll down to <b>Add to Home Screen</b>.';
}

// 6. Close Button & Cleanup
if (closeInstallBtn) {
  closeInstallBtn.addEventListener('click', () => {
    installBanner.classList.remove('visible');
  });
}

window.addEventListener('appinstalled', () => {
  installBanner.classList.remove('visible'); // Hide if successfully installed
  deferredPrompt = null;
});
