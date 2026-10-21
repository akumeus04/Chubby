// Lightbox, zoom/pan engine and Android back-button handling
import { appsScriptUrl } from "./config.js";
import { app } from "./firebase.js";
import { state } from "./state.js";

// ── LIGHTBOX ──────────────────────────────────────────────
// Zoom & Pan state variables
let _lbScale = 1;
let _lbPointX = 0;
let _lbPointY = 0;

window.openLightbox = function(url, type) {
  const lb = document.getElementById("lightbox");
  const lbBody = document.getElementById("lightbox-body");
  const editBtn = document.getElementById("lightbox-edit-btn");
  const dlBtn   = document.getElementById("lightbox-download-btn");

  const goBtn = document.getElementById("go-present-btn");
  if (goBtn) goBtn.style.visibility = "hidden";

  state._lightboxCurrentUrl  = url;
  state._lightboxCurrentType = type;

  _lbScale = 1; _lbPointX = 0; _lbPointY = 0;

  if ((url.includes("drive.google.com") && type === "video") || type === "youtube") {
    lbBody.innerHTML = `<iframe src="${url}" style="width:95vw;height:80vh;max-width:1000px;border:none;border-radius:12px;background:#000;" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
    if (editBtn) editBtn.style.display = "none";
    if (dlBtn) dlBtn.style.display   = "none";
  } else if (type === "image") {
    // Note: Added translate3d to transform for smoother hardware acceleration
    lbBody.innerHTML = `<img id="lightbox-img" src="${url}" style="max-width:95vw;max-height:80vh;border-radius:10px;object-fit:contain;display:block;cursor:grab;transition:transform 0.15s ease-out;transform-origin:center; transform: translate3d(0px, 0px, 0) scale(1);">`;
    if (editBtn) editBtn.style.display = typeof appsScriptUrl !== 'undefined' && appsScriptUrl ? "inline-flex" : "none";
    if (dlBtn) dlBtn.style.display   = "inline-flex";
    setTimeout(setupLightboxZoom, 50);
  } else if (type === "video") {
    // Use createElement (not innerHTML) so the user-gesture context is still
    // alive when play() is called — innerHTML parsing breaks the gesture chain
    // on Android WebView and causes the "press twice to play" bug.
    lbBody.innerHTML = "";
    const vid = document.createElement("video");
    vid.id = "lightbox-vid";
    vid.src = url;
    vid.controls = true;
    vid.playsInline = true;
    vid.setAttribute("playsinline", "");
    vid.setAttribute("webkit-playsinline", "");
    vid.preload = "auto";
    vid.style.cssText = "max-width:95vw;max-height:90vh;border-radius:10px;display:block;background:#000;";
    lbBody.appendChild(vid);

    if (editBtn) editBtn.style.display = "none";
    if (dlBtn)   dlBtn.style.display   = "none";

    // Play immediately (still within the user-gesture call stack)
    const playPromise = vid.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.log("WebView blocked auto-play:", err);
        // If autoplay is blocked, make sure controls are visible so one tap plays
        vid.controls = true;
      });
    }
  }
  
  // Push a hash so the Android back button intercepts this layer
  window.location.hash = "lightbox";

  lb.style.zIndex = "99999";
  lb.style.display = "flex";
};

window.closeLightbox = function(fromHashChange = false) {
  const lb = document.getElementById("lightbox");
  const lbBody = document.getElementById("lightbox-body");

  lb.style.display = "none";

  const goBtn = document.getElementById("go-present-btn");
  if (goBtn) goBtn.style.visibility = "visible";

  state._lightboxCurrentUrl  = "";
  state._lightboxCurrentType = "";

  const vid = lbBody.querySelector("video");
  if (vid) vid.pause();
  lbBody.innerHTML = "";

  if (!fromHashChange && window.location.hash === "#lightbox") {
    window.history.back();
  }
};

// ── UNIFIED ANDROID BACK BUTTON HANDLER ──────────────────
// Push a base hash on load so there is always a history entry
// between the app and "exit". The back button will land here
// instead of closing the app.
window.addEventListener("load", () => {
  // Replace so this doesn't add a spurious extra entry
  if (!window.location.hash) window.location.replace("#app");
});

window.addEventListener("hashchange", () => {
  const hash = window.location.hash;
  const lb = document.getElementById("lightbox");
  const settingsPanel = document.getElementById("settings-panel");

  // 1. Lightbox is open and back button was pressed
  if (hash !== "#lightbox" && lb && lb.style.display === "flex") {
    window.closeLightbox(true);
    return;
  }

  // 2. Settings panel is open and back button was pressed
  if (hash === "#app" && settingsPanel && settingsPanel.style.display === "flex") {
    settingsPanel.style.display = "none";
    return;
  }

  // 3. Paint editor is open — paint-editor.js handles its own #paint-editor hash,
  //    but if it's somehow still open when we land on #app, close it.
  const paintModal = document.getElementById("paint-editor-modal");
  if (hash === "#app" && paintModal && paintModal.style.display !== "none") {
    paintModal.style.display = "none";
    return;
  }

  // 4. We've reached the base #app hash with nothing open —
  //    push it again so the NEXT back press also stays in the app.
  //    This creates a soft "you're at the root" trap that prevents exit.
  if (hash === "#app" || hash === "") {
    // Small delay avoids an instant double-push loop
    setTimeout(() => {
      if (!window.location.hash || window.location.hash === "#app") {
        window.location.replace("#app");
      }
    }, 50);
  }
});

// ── THE ZOOM ENGINE (SMOOTHER FIX) ──
function setupLightboxZoom() {
  const img = document.getElementById("lightbox-img");
  if (!img) return;

  let panning = false;
  let startX = 0, startY = 0;
  let lastTouchX = 0, lastTouchY = 0;
  let initialDistance = null;
  let initialScale = 1;

  // ✨ FIX 2: Use GPU Acceleration (translate3d) + requestAnimationFrame for buttery smoothness
  const setTransform = () => {
    requestAnimationFrame(() => {
      img.style.transform = `translate3d(${_lbPointX}px, ${_lbPointY}px, 0) scale(${_lbScale})`;
    });
  };

  // 1. Mouse Wheel Zoom (Desktop)
  img.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY) * -1;
    _lbScale *= (delta > 0 ? 1.15 : 0.85);
    _lbScale = Math.max(0.5, Math.min(_lbScale, 8));
    setTransform();
  }, { passive: false });

  // 2. Desktop Mouse Drag (Disabled for Touch screens to prevent stutter)
  img.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return; // Ignore touches here, handled below
    e.preventDefault();
    startX = e.clientX - _lbPointX;
    startY = e.clientY - _lbPointY;
    panning = true;
    img.style.cursor = "grabbing";
    img.style.transition = "none";
    img.setPointerCapture(e.pointerId);
  });

  img.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" || !panning) return;
    _lbPointX = e.clientX - startX;
    _lbPointY = e.clientY - startY;
    setTransform();
  });

  const endPan = (e) => {
    if (e && e.pointerType === "touch") return;
    panning = false;
    img.style.cursor = "grab";
    img.style.transition = "transform 0.15s ease-out";
  };
  img.addEventListener("pointerup", endPan);
  img.addEventListener("pointercancel", endPan);

  // 3. Pinch-to-Zoom & Mobile Drag (Dedicated Touch Handlers)
  img.addEventListener('touchstart', (e) => {
    e.preventDefault();
    img.style.transition = "none";
    
    if (e.touches.length === 1) {
      // Single finger drag
      panning = true;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      // Two finger pinch
      panning = false; 
      initialDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialScale = _lbScale;
    }
  }, { passive: false });

  img.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && panning) {
      // Dragging
      _lbPointX += (e.touches[0].clientX - lastTouchX);
      _lbPointY += (e.touches[0].clientY - lastTouchY);
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      setTransform();
    } else if (e.touches.length === 2 && initialDistance !== null) {
      // Zooming
      const currentDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      _lbScale = Math.max(0.5, Math.min(initialScale * (currentDistance / initialDistance), 8));
      setTransform();
    }
  }, { passive: false });

  img.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) initialDistance = null;
    if (e.touches.length === 0) {
      panning = false;
      img.style.transition = "transform 0.15s ease-out";
    } else if (e.touches.length === 1) {
      // Smoothly resume dragging if one finger is lifted during a pinch
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      panning = true;
    }
  });

  // 4. Double-tap to reset
  img.addEventListener("dblclick", () => {
    _lbScale = 1; _lbPointX = 0; _lbPointY = 0;
    img.style.transition = "transform 0.2s ease-out";
    setTransform();
  });
}

// Close lightbox if clicking strictly outside the image
document.getElementById("lightbox").addEventListener("click", e => {
  if (e.target.id === "lightbox" || e.target.id === "lightbox-body") {
    window.closeLightbox();
  }
});
