// Image editing / annotate hooks and lightbox editing
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { appsScriptUrl } from "./config.js";
import { db } from "./firebase.js";
import { state } from "./state.js";

// Track current lightbox image URL for in-chat editing

// Edit an existing chat image from the lightbox
window.lightboxEditImage = async function() {
  if (!state._lightboxCurrentUrl) return;

  const editBtn = document.getElementById("lightbox-edit-btn");
  const originalText = editBtn.innerHTML;
  editBtn.innerHTML = '<span class="loader" style="width:14px;height:14px;border-width:2px;border-top-color:#fff;display:inline-block;"></span>';
  editBtn.style.pointerEvents = "none";

  const targetUrl = encodeURIComponent(state._lightboxCurrentUrl);
  const proxies = [
    `https://wsrv.nl/?url=${targetUrl}&output=webp&q=85`,
    `https://api.allorigins.win/raw?url=${targetUrl}`,
    `https://corsproxy.io/?${targetUrl}`
  ];

  let safeBlobUrl = null;

  for (let proxy of proxies) {
    try {
      const res = await fetch(proxy);
      if (res.ok) {
        const blob = await res.blob();
        // FIX: Create a tiny URL from the blob so Filerobot doesn't freeze parsing it!
        safeBlobUrl = URL.createObjectURL(blob);
        break;
      }
    } catch (e) {
      console.warn("Proxy blocked, trying next server...", proxy);
    }
  }

  if (!safeBlobUrl) {
    alert("Google Drive security blocked the connection. Please download the image to edit it.");
    editBtn.innerHTML = originalText;
    editBtn.style.pointerEvents = "auto";
    return;
  }

  editBtn.innerHTML = originalText;
  editBtn.style.pointerEvents = "auto";
  window.closeLightbox();

  openImageEditor(safeBlobUrl, async (newDataUrl) => {
    URL.revokeObjectURL(safeBlobUrl); // Cleanup memory
    
    if (!state.currentUser) return;
    const statusEl = document.getElementById("status-text");
    statusEl.innerHTML = '<span class="loader"></span> Uploading edited image…';
    
    try {
      // FIX: Safely extract base64 whether Filerobot includes the prefix or not
      // This prevents the "split of undefined" error that freezes the UI
      const base64Data = newDataUrl.includes(",") ? newDataUrl.split(",")[1] : newDataUrl;
      
      const res = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          secret: state.uploadSecret,
          base64: base64Data,
          mimeType: "image/jpeg",
          fileName: "edited_" + Date.now() + ".jpg"
        })
      });
      
      const result = await res.json();
      if (result.status === "success") {
        await addDoc(collection(db, "messages"), {
          senderId: state.currentUser.uid,
          senderName: state.currentUser.displayName || state.currentUser.email.split("@")[0],
          senderPhoto: state.currentUser.photoURL || "",
          mediaUrl: result.url,
          mimeType: "image/jpeg",
          timestamp: serverTimestamp()
        });
      } else {
        statusEl.innerText = "Upload failed.";
      }
    } catch(e) {
      console.error(e);
      statusEl.innerText = "Network error uploading edited image.";
    }
    setTimeout(() => statusEl.innerText = "", 3000); 
  });
};

window.lightboxDownload = function() {
  if (!state._lightboxCurrentUrl) return;
  const a = document.createElement("a");
  a.href = state._lightboxCurrentUrl;
  a.download = "image_" + Date.now() + ".jpg";
  a.target = "_blank";
  a.click();
};

let _editorInstance = null; // kept for compatibility — no longer used

window.openImageEditor = function(imageUrl, onSaveCallback) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const tmp = document.createElement('canvas');
    tmp.width = img.naturalWidth; tmp.height = img.naturalHeight;
    tmp.getContext('2d').drawImage(img, 0, 0);
    window.openPaintEditor(tmp.toDataURL('image/jpeg', 0.92), onSaveCallback);
  };
  img.onerror = () => { window.openPaintEditor(imageUrl, onSaveCallback); };
  img.src = imageUrl;
};

// ── ANNOTATE IMAGE (long-press context menu on any image bubble) ──
window.openAnnotateEditor = async function(imageUrl) {
  const statusEl = document.getElementById("status-text");
  if (statusEl) statusEl.innerHTML = '<span class="loader"></span> Loading image…';

  const targetUrl = encodeURIComponent(imageUrl);
  const proxies = [
    imageUrl,
    `https://wsrv.nl/?url=${targetUrl}&output=webp&q=85`,
    `https://api.allorigins.win/raw?url=${targetUrl}`,
    `https://corsproxy.io/?${targetUrl}`
  ];

  let blobUrl = null;
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy);
      if (res.ok) { blobUrl = URL.createObjectURL(await res.blob()); break; }
    } catch(e) { /* try next */ }
  }

  if (statusEl) statusEl.innerHTML = '';
  if (!blobUrl) { alert("Could not load image for editing."); return; }

  const img = new Image();
  img.onload = () => {
    const tmp = document.createElement('canvas');
    tmp.width = img.naturalWidth; tmp.height = img.naturalHeight;
    tmp.getContext('2d').drawImage(img, 0, 0);
    const base64 = tmp.toDataURL('image/jpeg', 0.92);
    URL.revokeObjectURL(blobUrl);

    window.openPaintEditor(base64, async (editedBase64) => {
      if (!state.currentUser) return;
      if (statusEl) statusEl.innerHTML = '<span class="loader"></span> Uploading annotated image…';
      try {
        const base64Data = editedBase64.includes(",") ? editedBase64.split(",")[1] : editedBase64;
        const res = await fetch(appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ secret: state.uploadSecret, base64: base64Data, mimeType: "image/jpeg", fileName: "annotated_" + Date.now() + ".jpg" })
        });
        const result = await res.json();
        if (result.status === "success") {
          await addDoc(collection(db, "messages"), {
            senderId: state.currentUser.uid,
            senderName: state.currentUser.displayName || state.currentUser.email.split("@")[0],
            senderPhoto: state.currentUser.photoURL || "",
            mediaUrl: result.url,
            mimeType: "image/jpeg",
            timestamp: serverTimestamp()
          });
        } else {
          if (statusEl) statusEl.innerText = "Upload failed.";
        }
      } catch(e) {
        console.error(e);
        if (statusEl) statusEl.innerText = "Network error uploading image.";
      }
      setTimeout(() => { if (statusEl) statusEl.innerText = ""; }, 3000);
    });
  };
  img.onerror = () => { URL.revokeObjectURL(blobUrl); alert("Failed to decode image."); };
  img.src = blobUrl;
};
