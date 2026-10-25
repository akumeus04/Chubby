// chatBridge for chat.js, reply state, client-side photo compression and send-message logic
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { appsScriptUrl } from "./config.js";
import { db, rtdb } from "./firebase.js";
import { getDirectImageUrl, playConfetti, playKissAnimation, triggerEmojiAnimation } from "./helpers.js";
import { getSavedReplies, renderSavedRepliesPanel, renderSavedRepliesSettings, saveSavedReplies } from "./saved-replies.js";
import { addLongPressAndRightClick, addReaction, showContextMenu, addSwipeToReply, triggerReplyState } from "./message-actions.js";
import { msgInput } from "./input-bar.js";
import { renderHeaderStatus } from "./presence.js";
import { mediaUpload, renderAttachmentGallery } from "./attachments.js";
import { getSound, showInAppBanner, notifyPartner } from "./notifications.js";
import { formatMessageText } from "./formatter.js";
import { buildMediaHtml } from "./media.js";
import { state } from "./state.js";

// ── CLIENT-SIDE IMAGE COMPRESSION (HTML5 CANVAS) ──────────
/**
 * Compresses and optimizes an image file before upload.
 * - Resizes multi-megapixel photos to max 1600px (maintaining aspect ratio).
 * - Re-encodes as a crisp JPEG at ~82% quality.
 * - Shrinks 5MB-15MB phone photos down to ~200KB-400KB in milliseconds.
 * - Non-images (videos, PDFs, animated GIFs) are preserved without re-encoding.
 */
export async function compressImageForUpload(file, maxDimension = 1600, quality = 0.82) {
  const isImage = file.type && file.type.startsWith("image/");
  const isGif = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");

  // Non-images and animated GIFs should not be rendered to 2D canvas
  if (!isImage || isGif) {
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return {
      base64Data,
      mimeType: file.type || "application/octet-stream",
      fileName: file.name,
      fileSize: file.size,
      wasCompressed: false
    };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Proportional resize down to maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { alpha: false });

        if (ctx) {
          // White background fallback for transparent PNGs converting to JPEG
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);
        }

        // Export as JPEG at targeted quality
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const base64Data = dataUrl.split(",")[1];
        const approxBytes = Math.round((base64Data.length * 3) / 4);

        let newName = file.name;
        if (!/\.(jpe?g)$/i.test(newName)) {
          newName = newName.replace(/\.[^/.]+$/, "") + ".jpg";
        }

        console.log(`📸 Compressed ${file.name}: ${(file.size / 1024).toFixed(0)} KB ➔ ${(approxBytes / 1024).toFixed(0)} KB (${width}x${height} @ ${Math.round(quality * 100)}%)`);

        resolve({
          base64Data,
          mimeType: "image/jpeg",
          fileName: newName,
          fileSize: approxBytes,
          wasCompressed: true
        });
      };

      img.onerror = () => {
        // Fallback to raw base64 if image decoding fails
        const rawBase64 = (event.target.result || "").split(",")[1];
        resolve({
          base64Data: rawBase64,
          mimeType: file.type || "image/jpeg",
          fileName: file.name,
          fileSize: file.size,
          wasCompressed: false
        });
      };

      img.src = event.target.result;
    };

    reader.onerror = () => {
      resolve({
        base64Data: "",
        mimeType: file.type || "application/octet-stream",
        fileName: file.name,
        fileSize: file.size,
        wasCompressed: false
      });
    };

    reader.readAsDataURL(file);
  });
}

if (typeof window !== "undefined") {
  window.compressImageForUpload = compressImageForUpload;
}

// ── BRIDGE FOR CHAT.JS ────────────────────────────────────
// This allows our separate chat file to securely talk to the main database and helper functions
window.chatBridge = {
  getDb: () => db,
  getCurrentUser: () => state.currentUser,
  getPartnerName: () => state.partnerName,
  setPartnerName: (name) => { state.partnerName = name; renderHeaderStatus(); },
  getSound: () => getSound(),
  showInAppBanner: (title, body) => showInAppBanner(title, body),
  getDirectImageUrl: (url) => getDirectImageUrl(url),
  formatMessageText: (txt) => formatMessageText(txt),
  buildMediaHtml: (dataOrUrl, mimeType) => {
    if (!dataOrUrl) return "";
    if (typeof dataOrUrl === "string") {
      return buildMediaHtml({ mediaUrl: dataOrUrl, mimeType: mimeType || "" });
    }
    return buildMediaHtml(dataOrUrl, mimeType);
  },
  compressImage: (file, maxDim, q) => compressImageForUpload(file, maxDim, q),
  addLongPressAndRightClick: (el, cb) => addLongPressAndRightClick(el, cb),
  addSwipeToReply: (el, id, isMe, data) => addSwipeToReply(el, id, isMe, data),
  triggerReplyState: (id, data) => triggerReplyState(id, data),
  playConfetti: () => playConfetti(),
  playKissAnimation: () => playKissAnimation(),
  triggerEmojiAnimation: (txt) => triggerEmojiAnimation(txt),
  showContextMenu: (e, id, isMe, data) => showContextMenu(e, id, isMe, data),
  addReaction: (id, em) => addReaction(id, em),
  setReplyState: (id, txt, name, med, mime) => {
    state.replyingToDocId = id; state.replyingToText = txt; state.replyingToName = name; state.replyingToMedia = med; state.replyingToMime = mime;
  }
};

// ── CANCEL REPLY BUTTON ──
document.getElementById("cancel-reply-btn").addEventListener("click", () => {
  state.replyingToDocId = null;
  state.replyingToMedia = "";
  state.replyingToMime = "";
  document.getElementById("reply-banner").classList.remove("visible");
});

// ── SEND MESSAGE ──────────────────────────────────────────
document.getElementById("send-btn").addEventListener("click", async () => {
  const textVal = msgInput.value.trim();
  const filesToSend = [...state.selectedFiles]; // Make a copy of the selected files array
  const statusEl = document.getElementById("status-text");
  
  if (!textVal && filesToSend.length === 0) return;

  // EDIT MODE
  if (state.editingDocId) {
    try {
      await updateDoc(doc(db, "messages", state.editingDocId), { text: textVal, edited: true });
      state.editingDocId = null;
      msgInput.value = ""; msgInput.style.height = "auto";
      document.getElementById("edit-banner").classList.remove("visible");
    } catch(e) { console.error(e); }
    return;
  }

  // 1. INSTANT UI CLEAR (Makes typing feel incredibly fast)
  msgInput.value = ""; 
  msgInput.style.height = "auto";
  state.selectedFiles = []; // Clear the multiple attachments array
  renderAttachmentGallery(); // Instantly hide the preview thumbnails
  set(ref(rtdb, "/typing/" + state.currentUser.uid), false);

  const basePayload = { 
    senderId: state.currentUser.uid, 
    senderName: state.currentUser.displayName || state.currentUser.email.split("@")[0], 
    senderPhoto: state.currentUser.photoURL || "", 
    timestamp: serverTimestamp() 
  };

  // Append reply data if a reply is active
  if (state.replyingToDocId) {
    basePayload.replyToId = state.replyingToDocId;
    basePayload.replyToName = state.replyingToName;
    basePayload.replyToText = state.replyingToText;
    if (state.replyingToMedia) {
      basePayload.replyToMedia = state.replyingToMedia;
      basePayload.replyToMime = state.replyingToMime;
    }
  }

  // Clear the reply UI instantly
  state.replyingToDocId = null;
  state.replyingToMedia = "";
  state.replyingToMime = "";
  document.getElementById("reply-banner").classList.remove("visible");

  // 2. Send the text immediately
  if (textVal) {
    await addDoc(collection(db, "messages"), { ...basePayload, text: textVal });
    notifyPartner(textVal);
  }

  // 3. Upload files sequentially in the background & bundle into a single album bubble
  if (filesToSend.length > 0) {
    document.getElementById("send-btn").disabled = true; // Prevent spamming the upload button
    const uploadedMedia = [];
    
    for (let i = 0; i < filesToSend.length; i++) {
      const fileVal = filesToSend[i];
      const isImg = fileVal.type && fileVal.type.startsWith("image/");
      
      // For large non-images (videos, archives), enforce limit
      if (!isImg && fileVal.size > 25 * 1024 * 1024) { 
        statusEl.innerHTML = `⚠ Skipped ${fileVal.name} (too large, max 25MB).`; 
        continue; 
      }
      
      if (isImg) {
        statusEl.innerHTML = `<span class="loader"></span> Optimizing photo ${i + 1} of ${filesToSend.length}…`;
      } else {
        statusEl.innerHTML = `<span class="loader"></span> Preparing file ${i + 1} of ${filesToSend.length}…`;
      }
      
      try {
        // ✨ HTML5 Canvas photo compression (1600px max dimension @ 82% quality)
        const mediaPayload = await compressImageForUpload(fileVal, 1600, 0.82);
        if (!mediaPayload.base64Data) continue;

        statusEl.innerHTML = `<span class="loader"></span> Uploading ${i + 1} of ${filesToSend.length} (${(mediaPayload.fileSize / 1024).toFixed(0)} KB)…`;

        // Send optimized payload to Google Apps Script
        const res = await fetch(appsScriptUrl, { 
          method: "POST", 
          headers: { "Content-Type": "text/plain;charset=utf-8" }, 
          body: JSON.stringify({ 
            secret: state.uploadSecret, 
            action: "upload",
            base64: mediaPayload.base64Data, 
            mimeType: mediaPayload.mimeType, 
            fileName: mediaPayload.fileName 
          }) 
        });
        
        const result = await res.json();
        if (result.status === "success") { 
          uploadedMedia.push({
            url: result.url,
            mimeType: mediaPayload.mimeType,
            fileName: mediaPayload.fileName || "",
            fileSize: mediaPayload.fileSize || 0
          });
        } else {
          console.error("Upload failed for", mediaPayload.fileName, result.error);
        }
      } catch(e) { 
        console.error("Network error uploading", fileVal.name, e); 
      }
    }

    // ✨ GROUP MULTIPLE PHOTOS INTO A SINGLE BUBBLE
    if (uploadedMedia.length === 1) {
      // Single file - standard format
      const item = uploadedMedia[0];
      await addDoc(collection(db, "messages"), { 
        ...basePayload, 
        mediaUrl: item.url, 
        mediaUrls: [item.url],
        mimeType: item.mimeType,
        fileName: item.fileName,
        fileSize: item.fileSize
      }); 
      notifyPartner(item.mimeType.startsWith("image/") ? "📷 Sent you a photo" : item.mimeType.startsWith("video/") ? "🎥 Sent you a video" : "📎 " + (item.fileName || "Sent you a file"));
    } else if (uploadedMedia.length > 1) {
      // Multiple files - single album message with mediaUrls array
      const urls = uploadedMedia.map(m => m.url);
      const allImages = uploadedMedia.every(m => m.mimeType.startsWith("image/"));
      await addDoc(collection(db, "messages"), { 
        ...basePayload, 
        mediaUrl: urls[0],
        mediaUrls: urls,
        mediaItems: uploadedMedia,
        mimeType: allImages ? "image/album" : uploadedMedia[0].mimeType,
        fileName: `${uploadedMedia.length} photos`,
        fileSize: uploadedMedia.reduce((acc, m) => acc + (m.fileSize || 0), 0)
      }); 
      notifyPartner(`📷 Sent an album (${uploadedMedia.length} photos)`);
    }
    
    statusEl.innerText = "";
    document.getElementById("send-btn").disabled = false;
  }
});

// Allow adding quick replies directly from the chat popup
document.getElementById("chat-add-reply-btn").addEventListener("click", () => {
  const val = document.getElementById("chat-add-reply-input").value.trim();
  if (!val) return;
  const arr = getSavedReplies(); arr.push(val); saveSavedReplies(arr);
  document.getElementById("chat-add-reply-input").value = "";
  renderSavedRepliesSettings(); 
  renderSavedRepliesPanel();
});
document.getElementById("chat-add-reply-input").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("chat-add-reply-btn").click();
});

function resetInputs() {
  msgInput.value = ""; msgInput.style.height = "auto";
  mediaUpload.value = ""; fileTag.classList.remove("visible");
  document.getElementById("status-text").innerText = "";
  document.getElementById("send-btn").disabled = false;
}
