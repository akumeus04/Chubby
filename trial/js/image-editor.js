// Image editing / annotate hooks and lightbox editing with Firebase temporary staging
import { collection, addDoc, serverTimestamp, doc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, set, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { appsScriptUrl } from "./config.js";
import { db, rtdb } from "./firebase.js";
import { state } from "./state.js";
import { notifyPartner } from "./notifications.js";

/**
 * Ensures data URLs do not exceed max dimensions to prevent memory strain on mobile devices
 * and stay well under Firebase document size limits.
 */
function resizeDataUrlIfNeeded(dataUrl, maxDim = 1600) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w <= maxDim && h <= maxDim) {
        resolve(dataUrl);
        return;
      }
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Robustly converts any image URL (data:, blob:, Google Drive, or remote web URL)
 * into a clean, un-tainted base64 Data URL so the Canvas Paint Editor can draw,
 * annotate, read pixel data, and export without SecurityError / JS Crash on mobile.
 */
export async function fetchImageAsDataUrl(url) {
  if (!url) throw new Error("No image URL provided");

  // 1. If already a data URL, return immediately (resized if needed)
  if (url.startsWith("data:")) {
    return await resizeDataUrlIfNeeded(url, 1600);
  }

  // 2. If a blob URL, read cleanly with FileReader
  if (url.startsWith("blob:")) {
    const res = await fetch(url);
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return await resizeDataUrlIfNeeded(dataUrl, 1600);
  }

  // 3. Extract Google Drive ID if present
  let driveId = "";
  if (url.includes("drive.google.com") || url.includes("googleusercontent.com")) {
    const m1 = url.match(/\/file\/d\/([^\/\?]+)/);
    const m2 = url.match(/[?&]id=([^&]+)/);
    const m3 = url.match(/\/d\/([^=\/\?]+)/);
    driveId = m1 ? m1[1] : (m2 ? m2[1] : (m3 ? m3[1] : ""));
  }

  const candidateUrls = [];
  if (driveId) {
    candidateUrls.push(`https://lh3.googleusercontent.com/d/${driveId}=w1600`);
    candidateUrls.push(`https://drive.google.com/thumbnail?id=${driveId}&sz=w1600`);
    candidateUrls.push(`https://drive.google.com/uc?export=view&id=${driveId}`);
  }
  candidateUrls.push(url);

  const proxyGenerators = [
    (u) => `https://wsrv.nl/?url=${encodeURIComponent(u)}&output=jpg&q=88`,
    (u) => `https://images.weserv.nl/?url=${encodeURIComponent(u)}&output=jpg&q=88`,
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u) => u // Direct fetch
  ];

  for (const candidate of candidateUrls) {
    for (const makeProxy of proxyGenerators) {
      try {
        const proxyUrl = makeProxy(candidate);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const blob = await res.blob();
          if (blob && blob.size > 100) {
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            if (typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
              return await resizeDataUrlIfNeeded(dataUrl, 1600);
            }
          }
        }
      } catch (_) {
        // Try next proxy
      }
    }
  }

  // 4. Last fallback: Image element with crossOrigin
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const MAX = 1600;
        let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round((h * MAX) / w); w = MAX; }
          else { w = Math.round((w * MAX) / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Could not load image through proxy or direct connection"));
    img.src = candidateUrls[0] || url;
  });
}

/**
 * Temporarily stages the photo in Firebase (both Firestore & Realtime Database)
 * so mobile browsers have a clean, trusted first-party base64 source for the canvas.
 */
async function stagePhotoInFirebase(cleanDataUrl, originalUrl, user) {
  const uid = user.uid;
  let stagedUrl = cleanDataUrl;

  // Staging in Firestore
  try {
    const tempDocRef = doc(db, "temp_edits", uid);
    await setDoc(tempDocRef, {
      dataUrl: cleanDataUrl,
      originalUrl: originalUrl || "",
      userId: uid,
      timestamp: serverTimestamp()
    });

    const snap = await getDoc(tempDocRef);
    if (snap.exists() && snap.data()?.dataUrl) {
      stagedUrl = snap.data().dataUrl;
    }
  } catch (fsErr) {
    console.warn("Firestore temp_edits staging notice:", fsErr);
  }

  // Staging in Realtime Database as instant fallback
  try {
    const tempRtdbRef = ref(rtdb, "temp_edits/" + uid);
    await set(tempRtdbRef, {
      dataUrl: cleanDataUrl,
      originalUrl: originalUrl || "",
      updatedAt: Date.now()
    });
  } catch (rtdbErr) {
    console.warn("RTDB temp_edits staging notice:", rtdbErr);
  }

  return stagedUrl;
}

/**
 * Removes temporary staging photo record from Firebase after save or cancel.
 */
async function cleanupPhotoFromFirebase(user) {
  if (!user || !user.uid) return;
  try {
    await deleteDoc(doc(db, "temp_edits", user.uid));
  } catch (_) {}
  try {
    await set(ref(rtdb, "temp_edits/" + user.uid), null);
  } catch (_) {}
}

/**
 * Handles uploading the edited photo to Google Drive via Apps Script
 * and posting the message to Firestore.
 */
async function uploadEditedPhotoToDriveAndChat(editedBase64, user, statusEl) {
  if (statusEl) statusEl.innerHTML = '<span class="loader"></span> Saving edited photo to Google Drive…';

  try {
    const base64Data = editedBase64.includes(",") ? editedBase64.split(",")[1] : editedBase64;
    const fileName = "edited_" + Date.now() + ".jpg";

    const res = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: state.uploadSecret,
        action: "upload",
        base64: base64Data,
        mimeType: "image/jpeg",
        fileName: fileName
      })
    });

    const result = await res.json();
    if (result.status === "success") {
      // Post to Firestore messages
      await addDoc(collection(db, "messages"), {
        senderId: user.uid,
        senderName: user.displayName || user.email.split("@")[0],
        senderPhoto: user.photoURL || "",
        mediaUrl: result.url,
        mimeType: "image/jpeg",
        fileName: fileName,
        timestamp: serverTimestamp()
      });

      // Cleanup temporary Firebase staging document
      await cleanupPhotoFromFirebase(user);

      notifyPartner("🎨 Sent an edited photo");
      if (statusEl) statusEl.innerText = "✓ Edited photo saved to Google Drive!";
    } else {
      console.error("Google Drive upload error:", result);
      if (statusEl) statusEl.innerText = "Upload failed: " + (result.error || "Server error");
    }
  } catch (e) {
    console.error("Network error uploading edited image to Google Drive:", e);
    if (statusEl) statusEl.innerText = "Network error saving to Google Drive.";
  }
  setTimeout(() => { if (statusEl) statusEl.innerText = ""; }, 4000);
}

// ── EDIT AN EXISTING CHAT IMAGE FROM LIGHTBOX ─────────────
window.lightboxEditImage = async function() {
  const currentUrl = state._lightboxCurrentUrl;
  if (!currentUrl) return;

  const user = state.currentUser;
  if (!user) {
    alert("Please sign in first.");
    return;
  }

  // 1. Immediately close the lightbox with `fromHashChange = true`
  // This skips `history.back()` and prevents mobile navigation exit races!
  if (typeof window.closeLightbox === "function") {
    window.closeLightbox(true);
  }

  // Set the hash to #paint-editor to prepare the Android back button intercept
  window.location.hash = "paint-editor";

  const statusEl = document.getElementById("status-text");
  if (statusEl) statusEl.innerHTML = '<span class="loader"></span> Staging photo in Firebase for editing…';

  try {
    // 2. Convert to clean base64 data URL
    const cleanDataUrl = await fetchImageAsDataUrl(currentUrl);

    // 3. Staging in Firebase (Firestore & RTDB)
    const stagedDataUrl = await stagePhotoInFirebase(cleanDataUrl, currentUrl, user);

    if (statusEl) statusEl.innerHTML = '';

    // 4. Open Paint Editor with clean, first-party staged image
    window.openPaintEditor(stagedDataUrl, async (editedBase64) => {
      await uploadEditedPhotoToDriveAndChat(editedBase64, user, statusEl);
    });

  } catch (err) {
    console.error("Could not stage photo in Firebase for editing:", err);
    if (statusEl) statusEl.innerHTML = '';
    alert("Could not load image for editing: " + (err.message || err));
  }
};

window.lightboxDownload = function() {
  if (!state._lightboxCurrentUrl) return;
  const a = document.createElement("a");
  a.href = state._lightboxCurrentUrl;
  a.download = "image_" + Date.now() + ".jpg";
  a.target = "_blank";
  a.click();
};

window.openImageEditor = async function(imageUrl, onSaveCallback) {
  try {
    const cleanDataUrl = await fetchImageAsDataUrl(imageUrl);
    window.openPaintEditor(cleanDataUrl, onSaveCallback);
  } catch (err) {
    console.warn("fetchImageAsDataUrl fallback in openImageEditor:", err);
    window.openPaintEditor(imageUrl, onSaveCallback);
  }
};

// ── ANNOTATE IMAGE (long-press context menu on any image bubble) ──
window.openAnnotateEditor = async function(imageUrl) {
  const user = state.currentUser;
  if (!user) {
    alert("Please sign in first.");
    return;
  }

  const statusEl = document.getElementById("status-text");
  if (statusEl) statusEl.innerHTML = '<span class="loader"></span> Staging photo in Firebase…';

  try {
    const cleanDataUrl = await fetchImageAsDataUrl(imageUrl);
    const stagedDataUrl = await stagePhotoInFirebase(cleanDataUrl, imageUrl, user);
    if (statusEl) statusEl.innerHTML = '';

    window.openPaintEditor(stagedDataUrl, async (editedBase64) => {
      await uploadEditedPhotoToDriveAndChat(editedBase64, user, statusEl);
    });

  } catch (err) {
    console.error("Could not load image for annotation:", err);
    if (statusEl) statusEl.innerHTML = '';
    alert("Could not load image for editing: " + (err.message || err));
  }
};
