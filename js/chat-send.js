// chatBridge for chat.js, reply state and send-message logic
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { appsScriptUrl } from "./config.js";
import { db, rtdb } from "./firebase.js";
import { getDirectImageUrl } from "./helpers.js";
import { getSavedReplies, renderSavedRepliesPanel, renderSavedRepliesSettings, saveSavedReplies } from "./saved-replies.js";
import { addLongPressAndRightClick, addReaction, showContextMenu } from "./message-actions.js";
import { msgInput } from "./input-bar.js";
import { mediaUpload, renderAttachmentGallery } from "./attachments.js";
import { getSound, showInAppBanner } from "./notifications.js";
import { formatMessageText } from "./formatter.js";
import { buildMediaHtml } from "./media.js";
import { state } from "./state.js";

// ── BRIDGE FOR CHAT.JS ────────────────────────────────────
// This allows our separate chat file to securely talk to the main database and helper functions
window.chatBridge = {
  getDb: () => db,
  getCurrentUser: () => state.currentUser,
  getPartnerName: () => state.partnerName,
  setPartnerName: (name) => { state.partnerName = name; },
  getSound: () => getSound(),
  showInAppBanner: (title, body) => showInAppBanner(title, body),
  getDirectImageUrl: (url) => getDirectImageUrl(url),
  formatMessageText: (txt) => formatMessageText(txt),
  buildMediaHtml: (data) => buildMediaHtml(data),
  addLongPressAndRightClick: (el, cb) => addLongPressAndRightClick(el, cb),
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
  const filesToSend = [...selectedFiles]; // Make a copy of the selected files array
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
    // NEW: Attach the media thumbnail to the payload
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
    // Save to Firestore first
    await addDoc(collection(db, "messages"), { ...basePayload, text: textVal });
    
    // ✨ NEW: Trigger the HTTP v1 Background Push Notification
    try {
      // Find the partner's token (grab any token that doesn't belong to the current user)
      const tokensSnap = await getDocs(collection(db, "fcm_tokens"));
      tokensSnap.forEach(tokenDoc => {
        if (tokenDoc.id !== state.currentUser.uid) {
          const partnerToken = tokenDoc.data().token;
          
          // Silently ping your Google Apps Script in the background
          fetch(appsScriptUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              secret: state.uploadSecret,
              action: "notify",
              targetToken: partnerToken,
              title: state.currentUser.displayName || "Partner",
              body: textVal
            })
          }).catch(e => console.error("Apps Script Ping Error:", e));
        }
      });
    } catch (pushErr) {
      console.error("Failed to fetch tokens for push:", pushErr);
    }
  }

  // 3. Upload files sequentially in the background
  if (filesToSend.length > 0) {
    document.getElementById("send-btn").disabled = true; // Prevent spamming the upload button
    
    for (let i = 0; i < filesToSend.length; i++) {
      const fileVal = filesToSend[i];
      if (fileVal.size > 10 * 1024 * 1024) { 
        statusEl.innerHTML = `⚠ Skipped ${fileVal.name} (too large, max 10MB).`; 
        continue; 
      }
      
      statusEl.innerHTML = `<span class="loader"></span> Uploading file ${i + 1} of ${filesToSend.length}…`;
      
      try {
        // Convert to base64
        const base64Data = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.readAsDataURL(fileVal);
        });

        // Send to Google Apps Script
        const res = await fetch(appsScriptUrl, { 
          method: "POST", 
          headers: { "Content-Type": "text/plain;charset=utf-8" }, 
          body: JSON.stringify({ 
            secret: state.uploadSecret, // 🔒 Fetched securely from Firebase
            base64: base64Data, 
            mimeType: fileVal.type, 
            fileName: fileVal.name 
          }) 
        });
        
        const result = await res.json();
        if (result.status === "success") { 
          // Post the media bubble to the chat once the upload is finished
          await addDoc(collection(db, "messages"), { 
            ...basePayload, 
            mediaUrl: result.url, 
            mimeType: fileVal.type 
          }); 
        } else {
          console.error("Upload failed for", fileVal.name, result.message);
        }
      } catch(e) { 
        console.error("Network error uploading", fileVal.name); 
      }
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
