// Lightbox, multi-photo album carousel, zoom/pan engine and Android back-button handling
import { appsScriptUrl } from "./config.js";
import { app } from "./firebase.js";
import { state } from "./state.js";

// ── LIGHTBOX ZOOM & PAN STATE ─────────────────────────────
let _lbScale = 1;
let _lbPointX = 0;
let _lbPointY = 0;

// ── ENSURE LIGHTBOX DOM ELEMENTS EXIST ─────────────────────
function ensureLightboxElements() {
  let lb = document.getElementById("lightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "lightbox";
    lb.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.92);backdrop-filter:blur(10px);z-index:99999;flex-direction:column;align-items:center;justify-content:center;user-select:none;touch-action:none;";
    lb.innerHTML = `
      <div id="lightbox-topbar" style="position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:14px 20px;z-index:100;pointer-events:none;">
        <div id="lightbox-counter" style="pointer-events:auto;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);color:#fff;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600;letter-spacing:0.5px;border:1px solid rgba(255,255,255,0.18);display:none;"></div>
        <div style="display:flex;align-items:center;gap:10px;pointer-events:auto;margin-left:auto;">
          <button id="lightbox-edit-btn" style="display:none;align-items:center;gap:6px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.22);padding:6px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;backdrop-filter:blur(6px);">✏ Edit</button>
          <button id="lightbox-download-btn" style="display:none;align-items:center;gap:6px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.22);padding:6px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;backdrop-filter:blur(6px);">⬇ Download</button>
          <button id="lightbox-close-btn" onclick="window.closeLightbox()" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.18);color:#fff;border:none;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);" title="Close">✕</button>
        </div>
      </div>
      <button id="lightbox-prev-btn" style="position:absolute;left:18px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;background:rgba(0,0,0,0.65);color:#fff;border:1px solid rgba(255,255,255,0.2);cursor:pointer;display:none;align-items:center;justify-content:center;font-size:24px;z-index:100;backdrop-filter:blur(8px);transition:transform 0.15s, background 0.15s;" title="Previous photo (‹)">‹</button>
      <button id="lightbox-next-btn" style="position:absolute;right:18px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;background:rgba(0,0,0,0.65);color:#fff;border:1px solid rgba(255,255,255,0.2);cursor:pointer;display:none;align-items:center;justify-content:center;font-size:24px;z-index:100;backdrop-filter:blur(8px);transition:transform 0.15s, background 0.15s;" title="Next photo (›)">›</button>
      <div id="lightbox-body" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;position:relative;"></div>
    `;
    document.body.appendChild(lb);
  } else {
    // If #lightbox already exists in host HTML, inject prev/next/counter if missing
    if (!document.getElementById("lightbox-counter")) {
      const counter = document.createElement("div");
      counter.id = "lightbox-counter";
      counter.style.cssText = "position:absolute;top:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);color:#fff;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600;letter-spacing:0.5px;border:1px solid rgba(255,255,255,0.18);z-index:100;display:none;";
      lb.appendChild(counter);
    }
    if (!document.getElementById("lightbox-prev-btn")) {
      const prev = document.createElement("button");
      prev.id = "lightbox-prev-btn";
      prev.innerHTML = "‹";
      prev.title = "Previous photo (‹)";
      prev.style.cssText = "position:absolute;left:18px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;background:rgba(0,0,0,0.65);color:#fff;border:1px solid rgba(255,255,255,0.2);cursor:pointer;display:none;align-items:center;justify-content:center;font-size:24px;z-index:100;backdrop-filter:blur(8px);transition:transform 0.15s, background 0.15s;";
      lb.appendChild(prev);
    }
    if (!document.getElementById("lightbox-next-btn")) {
      const next = document.createElement("button");
      next.id = "lightbox-next-btn";
      next.innerHTML = "›";
      next.title = "Next photo (›)";
      next.style.cssText = "position:absolute;right:18px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;background:rgba(0,0,0,0.65);color:#fff;border:1px solid rgba(255,255,255,0.2);cursor:pointer;display:none;align-items:center;justify-content:center;font-size:24px;z-index:100;backdrop-filter:blur(8px);transition:transform 0.15s, background 0.15s;";
      lb.appendChild(next);
    }
  }

  // Wire up prev & next button clicks
  const prevBtn = document.getElementById("lightbox-prev-btn");
  const nextBtn = document.getElementById("lightbox-next-btn");
  if (prevBtn) prevBtn.onclick = (e) => { e.stopPropagation(); window.lightboxPrev(); };
  if (nextBtn) nextBtn.onclick = (e) => { e.stopPropagation(); window.lightboxNext(); };

  // Wire up background click to close
  lb.onclick = (e) => {
    if (e.target.id === "lightbox" || e.target.id === "lightbox-body") {
      window.closeLightbox();
    }
  };
}

// ── UPDATE ALBUM NAVIGATION CONTROLS (COUNTER & ARROWS) ───
function updateAlbumControls() {
  const counter = document.getElementById("lightbox-counter");
  const prevBtn = document.getElementById("lightbox-prev-btn");
  const nextBtn = document.getElementById("lightbox-next-btn");
  const dlBtn   = document.getElementById("lightbox-download-btn");
  const editBtn = document.getElementById("lightbox-edit-btn");

  const album = state._lightboxAlbum || [];
  const count = album.length;
  const idx = state._lightboxAlbumIndex || 0;

  if (count > 1) {
    if (counter) {
      counter.textContent = `${idx + 1} / ${count}`;
      counter.style.display = "block";
    }
    if (prevBtn) prevBtn.style.display = "flex";
    if (nextBtn) nextBtn.style.display = "flex";
  } else {
    if (counter) counter.style.display = "none";
    if (prevBtn) prevBtn.style.display = "none";
    if (nextBtn) nextBtn.style.display = "none";
  }

  // Hook up download button to active URL
  if (dlBtn && state._lightboxCurrentUrl) {
    dlBtn.onclick = (e) => {
      e.stopPropagation();
      const a = document.createElement("a");
      a.href = state._lightboxCurrentUrl;
      a.download = `photo_${idx + 1}.jpg`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
  }

  // Hook up paint edit button to active URL
  if (editBtn && state._lightboxCurrentUrl) {
    editBtn.onclick = (e) => {
      e.stopPropagation();
      if (typeof window.openPaintEditor === "function") {
        window.openPaintEditor(state._lightboxCurrentUrl, (savedUrl) => {
          console.log("Saved annotated photo", savedUrl);
        });
      }
    };
  }
}

// ── ALBUM NAVIGATION FUNCTIONS ─────────────────────────────
window.lightboxGoTo = function(newIndex) {
  const album = state._lightboxAlbum || [];
  if (!album.length) return;

  const total = album.length;
  const targetIndex = (newIndex + total) % total;

  state._lightboxAlbumIndex = targetIndex;
  state._lightboxCurrentUrl = album[targetIndex];

  _lbScale = 1;
  _lbPointX = 0;
  _lbPointY = 0;

  const img = document.getElementById("lightbox-img");
  if (img) {
    img.style.transition = "opacity 0.15s ease, transform 0.15s ease";
    img.style.opacity = "0.2";
    img.style.transform = "translate3d(0px, 0px, 0) scale(0.96)";

    const tempImg = new Image();
    tempImg.onload = () => {
      img.src = state._lightboxCurrentUrl;
      img.style.opacity = "1";
      img.style.transform = "translate3d(0px, 0px, 0) scale(1)";
    };
    tempImg.onerror = () => {
      img.src = state._lightboxCurrentUrl;
      img.style.opacity = "1";
    };
    tempImg.src = state._lightboxCurrentUrl;
  }

  updateAlbumControls();
};

window.lightboxNext = function() {
  const album = state._lightboxAlbum || [];
  if (album.length <= 1) return;
  window.lightboxGoTo((state._lightboxAlbumIndex || 0) + 1);
};

window.lightboxPrev = function() {
  const album = state._lightboxAlbum || [];
  if (album.length <= 1) return;
  window.lightboxGoTo((state._lightboxAlbumIndex || 0) - 1);
};

// ── OPEN LIGHTBOX (SUPPORTS SINGLE URL OR PHOTO ALBUM ARRAY) ──
window.openLightbox = function(urlOrUrls, type = "image", startIndex = 0) {
  ensureLightboxElements();

  const lb = document.getElementById("lightbox");
  const lbBody = document.getElementById("lightbox-body");
  const editBtn = document.getElementById("lightbox-edit-btn");
  const dlBtn   = document.getElementById("lightbox-download-btn");

  const goBtn = document.getElementById("go-present-btn");
  if (goBtn) goBtn.style.visibility = "hidden";

  // Parse single URL vs array of URLs for album carousel
  let album = [];
  let currentUrl = "";

  if (Array.isArray(urlOrUrls)) {
    album = urlOrUrls.map(item => (typeof item === "string" ? item : (item && item.url) ? item.url : ""));
    const initialIndex = typeof startIndex === "number" ? Math.max(0, Math.min(startIndex, album.length - 1)) : 0;
    state._lightboxAlbum = album;
    state._lightboxAlbumIndex = initialIndex;
    currentUrl = album[initialIndex] || "";
  } else if (typeof urlOrUrls === "string") {
    album = [urlOrUrls];
    state._lightboxAlbum = album;
    state._lightboxAlbumIndex = 0;
    currentUrl = urlOrUrls;
  }

  state._lightboxCurrentUrl  = currentUrl;
  state._lightboxCurrentType = type;

  _lbScale = 1; _lbPointX = 0; _lbPointY = 0;

  if ((currentUrl.includes("drive.google.com") && type === "video") || type === "youtube") {
    lbBody.innerHTML = `<iframe src="${currentUrl}" style="width:95vw;height:80vh;max-width:1000px;border:none;border-radius:12px;background:#000;" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
    if (editBtn) editBtn.style.display = "none";
    if (dlBtn) dlBtn.style.display   = "none";
  } else if (type === "image") {
    lbBody.innerHTML = `<img id="lightbox-img" src="${currentUrl}" style="max-width:95vw;max-height:80vh;border-radius:10px;object-fit:contain;display:block;cursor:grab;transition:transform 0.15s ease-out;transform-origin:center; transform: translate3d(0px, 0px, 0) scale(1);">`;
    if (editBtn) editBtn.style.display = "inline-flex";
    if (dlBtn) dlBtn.style.display   = "inline-flex";
    setTimeout(setupLightboxZoom, 50);
  } else if (type === "video") {
    lbBody.innerHTML = "";
    const vid = document.createElement("video");
    vid.id = "lightbox-vid";
    vid.src = currentUrl;
    vid.controls = true;
    vid.playsInline = true;
    vid.setAttribute("playsinline", "");
    vid.setAttribute("webkit-playsinline", "");
    vid.preload = "auto";
    vid.style.cssText = "max-width:95vw;max-height:90vh;border-radius:10px;display:block;background:#000;";
    lbBody.appendChild(vid);

    if (editBtn) editBtn.style.display = "none";
    if (dlBtn)   dlBtn.style.display   = "none";

    const playPromise = vid.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.log("WebView blocked auto-play:", err);
        vid.controls = true;
      });
    }
  }

  updateAlbumControls();

  // Push a hash so the Android back button intercepts this layer
  window.location.hash = "lightbox";

  lb.style.zIndex = "99999";
  lb.style.display = "flex";
};

// ── CLOSE LIGHTBOX ─────────────────────────────────────────
window.closeLightbox = function(fromHashChange = false) {
  const lb = document.getElementById("lightbox");
  const lbBody = document.getElementById("lightbox-body");

  if (lb) lb.style.display = "none";

  const goBtn = document.getElementById("go-present-btn");
  if (goBtn) goBtn.style.visibility = "visible";

  state._lightboxCurrentUrl  = "";
  state._lightboxCurrentType = "";
  state._lightboxAlbum       = [];
  state._lightboxAlbumIndex  = 0;

  if (lbBody) {
    const vid = lbBody.querySelector("video");
    if (vid) vid.pause();
    lbBody.innerHTML = "";
  }

  if (!fromHashChange && window.location.hash === "#lightbox") {
    window.history.back();
  }
};

// ── KEYBOARD NAVIGATION (ARROWS & ESCAPE) ──────────────────
window.addEventListener("keydown", (e) => {
  const lb = document.getElementById("lightbox");
  if (!lb || lb.style.display !== "flex") return;

  if (e.key === "ArrowRight") {
    window.lightboxNext();
  } else if (e.key === "ArrowLeft") {
    window.lightboxPrev();
  } else if (e.key === "Escape") {
    window.closeLightbox();
  }
});

// ── UNIFIED ANDROID BACK BUTTON HANDLER ──────────────────
window.addEventListener("load", () => {
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

  // 3. Paint editor is open
  const paintModal = document.getElementById("paint-editor-modal");
  if (hash === "#app" && paintModal && paintModal.style.display !== "none") {
    paintModal.style.display = "none";
    return;
  }

  // 4. Stay at base #app
  if (hash === "#app" || hash === "") {
    setTimeout(() => {
      if (!window.location.hash || window.location.hash === "#app") {
        window.location.replace("#app");
      }
    }, 50);
  }
});

// ── THE ZOOM ENGINE (SMOOTH GPU + SWIPE TO NEXT/PREV) ──────
function setupLightboxZoom() {
  const img = document.getElementById("lightbox-img");
  if (!img) return;

  let panning = false;
  let startX = 0, startY = 0;
  let lastTouchX = 0, lastTouchY = 0;
  let touchStartX = 0, touchStartY = 0;
  let touchStartTime = 0;
  let initialDistance = null;
  let initialScale = 1;

  // GPU Acceleration (translate3d) + requestAnimationFrame
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

  // 2. Desktop Mouse Drag (Disabled for Touch screens)
  img.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return;
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

  // 3. Pinch-to-Zoom, Mobile Drag & Swipe to Next/Prev Photo
  img.addEventListener("touchstart", (e) => {
    img.style.transition = "none";

    if (e.touches.length === 1) {
      panning = true;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      touchStartX = lastTouchX;
      touchStartY = lastTouchY;
      touchStartTime = Date.now();
    } else if (e.touches.length === 2) {
      panning = false;
      initialDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialScale = _lbScale;
    }
  }, { passive: true });

  img.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1 && panning) {
      const curX = e.touches[0].clientX;
      const curY = e.touches[0].clientY;

      if (_lbScale > 1.05) {
        // Zoomed in: pan image
        if (e.cancelable) e.preventDefault();
        _lbPointX += (curX - lastTouchX);
        _lbPointY += (curY - lastTouchY);
        setTransform();
      }
      lastTouchX = curX;
      lastTouchY = curY;
    } else if (e.touches.length === 2 && initialDistance !== null) {
      // Zooming
      if (e.cancelable) e.preventDefault();
      const currentDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      _lbScale = Math.max(0.5, Math.min(initialScale * (currentDistance / initialDistance), 8));
      setTransform();
    }
  }, { passive: false });

  img.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) initialDistance = null;
    if (e.touches.length === 0) {
      panning = false;
      img.style.transition = "transform 0.15s ease-out";

      // Check for horizontal swipe gesture when NOT zoomed in
      if (_lbScale <= 1.05 && state._lightboxAlbum && state._lightboxAlbum.length > 1) {
        const deltaX = lastTouchX - touchStartX;
        const deltaY = lastTouchY - touchStartY;
        const elapsed = Date.now() - touchStartTime;

        if (elapsed < 600 && Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
          if (deltaX < 0) {
            window.lightboxNext();
          } else {
            window.lightboxPrev();
          }
        }
      }
    } else if (e.touches.length === 1) {
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      panning = true;
    }
  });

  // 4. Double-tap to reset zoom
  img.addEventListener("dblclick", () => {
    _lbScale = 1; _lbPointX = 0; _lbPointY = 0;
    img.style.transition = "transform 0.2s ease-out";
    setTransform();
  });
}
