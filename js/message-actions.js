// Context menu, long-press, reactions, edit & delete
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { getDirectImageUrl, removeContextMenu } from "./helpers.js";
import { state } from "./state.js";

// ── CONTEXT MENU (right-click / long-press) ───────────────
const REACTION_EMOJIS = ["😍","😂","😮","😭","👍","👎","🤭","🎉"];

export function showContextMenu(e, docId, isMe, msgData) {
  e.preventDefault();
  e.stopPropagation();
  removeContextMenu();

  // Extract data safely
  const currentText = msgData.text || "";
  const mediaUrl = msgData.mediaUrl || "";
  const mime = msgData.mimeType || "";

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.setAttribute("data-menu", "true");

  menu.innerHTML = `<div class="context-menu-reactions">${REACTION_EMOJIS.map(em =>
    `<span class="ctx-reaction-btn" data-em="${em}">${em}</span>`).join("")}</div>`;

  const items = [];

  // ✨ THE NEW REPLY BUTTON
  items.push({ icon: "↩️", label: "Reply", action: () => {
    const repText = currentText || (mediaUrl ? "Photo/Video" : "Media");
    const repName = msgData.senderName || state.partnerName;
    const repMedia = mediaUrl ? getDirectImageUrl(mediaUrl) : "";
    
    // Set global variables for the reply payload
    state.replyingToDocId = docId; state.replyingToText = repText; state.replyingToName = repName; state.replyingToMedia = repMedia; state.replyingToMime = mime;
    
    document.getElementById("reply-to-name").textContent = repName;
    document.getElementById("reply-to-text").textContent = repText;
    
    const bannerMedia = document.getElementById("reply-banner-media");
    if (repMedia) { bannerMedia.src = repMedia; bannerMedia.style.display = "block"; } 
    else { bannerMedia.src = ""; bannerMedia.style.display = "none"; }
    
    document.getElementById("reply-banner").classList.add("visible");
    document.getElementById("message-input").focus();
  }});

  if (isMe && currentText) items.push({ icon: "✏️", label: "Edit Message", action: () => startEdit(docId, currentText) });
  items.push({ icon: "📋", label: "Copy Text", action: () => {
    try { navigator.clipboard.writeText(currentText || ""); } catch(_) {}
  }});
  if (mediaUrl && (mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)/i.test(mediaUrl))) {
    items.push({ icon: "🎨", label: "Annotate Image", action: () => window.openAnnotateEditor(mediaUrl) });
  }
  if (isMe) items.push({ icon: "🗑️", label: "Delete", danger: true, action: () => deleteMessage(docId) });

  items.forEach(it => {
    const div = document.createElement("div");
    div.className = "context-menu-item" + (it.danger ? " danger" : "");
    div.innerHTML = `<span class="ctx-icon">${it.icon}</span>${it.label}`;
    div.addEventListener("mousedown", ev => { ev.stopPropagation(); removeContextMenu(); it.action(); });
    menu.appendChild(div);
  });

  menu.querySelectorAll(".ctx-reaction-btn").forEach(btn => {
    btn.addEventListener("mousedown", ev => { ev.stopPropagation(); removeContextMenu(); addReaction(docId, btn.dataset.em); });
  });

  document.body.appendChild(menu);
  const vw = window.innerWidth, vh = window.innerHeight;
  let x = e.clientX !== undefined ? e.clientX : (e.changedTouches?.[0]?.clientX ?? vw / 2);
  let y = e.clientY !== undefined ? e.clientY : (e.changedTouches?.[0]?.clientY ?? vh / 2);
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(x, vw - mw - 8)) + "px";
  menu.style.top  = Math.max(8, Math.min(y, vh - mh - 8)) + "px";

  function onDismiss(ev) {
    if (!ev.target.closest("[data-menu]")) {
      removeContextMenu();
      document.removeEventListener("mousedown", onDismiss, true);
      document.removeEventListener("touchstart", onDismiss, true);
    }
  }
  setTimeout(() => {
    document.addEventListener("mousedown", onDismiss, true);
    document.addEventListener("touchstart", onDismiss, true);
  }, 50);
}

// Long-press + right-click helper
export function addLongPressAndRightClick(element, callback) {
  let timer, startX, startY;

  // Desktop: right-click
  element.addEventListener("contextmenu", e => callback(e));

  // Mobile AND desktop: long press (pointerdown works for both mouse and touch)
  element.addEventListener("pointerdown", e => {
    if (e.button === 2) return; // right click handled by contextmenu
    startX = e.clientX; startY = e.clientY;
    timer = setTimeout(() => {
      callback(e);
    }, 600);
  });
  element.addEventListener("pointermove", e => {
    if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) clearTimeout(timer);
  });
  element.addEventListener("pointerup",   () => clearTimeout(timer));
  element.addEventListener("pointercancel", () => clearTimeout(timer));
}

// ── REACTIONS ──────────────────────────────────────────────
export async function addReaction(docId, emoji) {
  if (!state.currentUser || !docId) return;
  try {
    const msgRef  = doc(db, "messages", docId);
    const snap    = await getDoc(msgRef);
    if (!snap.exists()) return;
    const data      = snap.data();
    const reactions = { ...(data.reactions || {}) };
    const uid       = state.currentUser.uid;
    const current   = reactions[emoji] ? [...reactions[emoji]] : [];
    if (current.includes(uid)) {
      reactions[emoji] = current.filter(u => u !== uid);
      if (!reactions[emoji].length) delete reactions[emoji];
    } else {
      reactions[emoji] = [...current, uid];
    }
    await updateDoc(msgRef, { reactions });
  } catch(e) { console.error("Reaction error", e); }
}

// ── EDIT MESSAGE ──────────────────────────────────────────
function startEdit(docId, currentText) {
  state.editingDocId = docId;
  const inp = document.getElementById("message-input");
  inp.value = currentText;
  inp.dispatchEvent(new Event("input"));
  inp.focus();
  document.getElementById("edit-banner").classList.add("visible");
}

document.getElementById("cancel-edit-btn").addEventListener("click", () => {
  state.editingDocId = null;
  document.getElementById("message-input").value = "";
  document.getElementById("edit-banner").classList.remove("visible");
});

// ── DELETE MESSAGE ────────────────────────────────────────
async function deleteMessage(docId) {
  if (!docId) return;
  try { 
    // Instead of deleting the document, we wipe the content and mark it deleted
    await updateDoc(doc(db, "messages", docId), { 
      isDeleted: true, 
      text: "", 
      mediaUrl: "", 
      mimeType: "",
      reactions: {} // Clear any reactions attached to it
    }); 
  } catch(e) { console.error(e); }
}
