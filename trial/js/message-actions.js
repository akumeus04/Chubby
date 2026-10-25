// Context menu, long-press, swipe-to-reply, reactions, edit & delete
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { getDirectImageUrl, removeContextMenu } from "./helpers.js";
import { state } from "./state.js";

// ── TRIGGER REPLY HELPER ──────────────────────────────────
export function triggerReplyState(docId, msgData) {
  if (!docId || !msgData) return;

  const currentText = msgData.text || "";
  const mediaUrl = msgData.mediaUrl || "";
  const mime = msgData.mimeType || "";

  const repText = currentText || (mediaUrl ? "Photo/Video" : "Media");
  const repName = msgData.senderName || state.partnerName || "Partner";
  const repMedia = mediaUrl ? getDirectImageUrl(mediaUrl) : "";

  // Set global state variables for the reply payload
  state.replyingToDocId = docId;
  state.replyingToText = repText;
  state.replyingToName = repName;
  state.replyingToMedia = repMedia;
  state.replyingToMime = mime;

  const nameEl = document.getElementById("reply-to-name");
  if (nameEl) nameEl.textContent = repName;

  const textEl = document.getElementById("reply-to-text");
  if (textEl) textEl.textContent = repText;

  const bannerMedia = document.getElementById("reply-banner-media");
  if (bannerMedia) {
    if (repMedia) {
      bannerMedia.src = repMedia;
      bannerMedia.style.display = "block";
    } else {
      bannerMedia.src = "";
      bannerMedia.style.display = "none";
    }
  }

  const banner = document.getElementById("reply-banner");
  if (banner) banner.classList.add("visible");

  const input = document.getElementById("message-input");
  if (input) input.focus();

  // Also bridge state if available
  if (window.chatBridge && window.chatBridge.setReplyState) {
    window.chatBridge.setReplyState(docId, repText, repName, repMedia, mime);
  }
}

// ── SWIPE TO REPLY LOGIC ──────────────────────────────────
/**
 * Attaches swipe-to-reply gesture listeners to a message element
 * Calculates horizontal drag distance, provides spring animation, haptics, and reveals a reply indicator.
 */
export function addSwipeToReply(element, docId, isMe, msgData) {
  if (!element) return;

  let startX = 0;
  let startY = 0;
  let currentDeltaX = 0;
  let isSwiping = false;
  let hasTriggered = false;
  let isScrolling = false;
  let replyIndicator = null;

  const THRESHOLD = 55; // pixels required to trigger reply
  const MAX_DRAG = 85;   // max drag distance with resistance

  // Ensure indicator container exists
  function getOrCreateIndicator() {
    let parent = element.parentElement;
    if (!parent) return null;

    let ind = parent.querySelector(".swipe-reply-indicator");
    if (!ind) {
      ind = document.createElement("div");
      ind.className = "swipe-reply-indicator";
      ind.style.cssText = `
        position: absolute;
        top: 50%;
        transform: translateY(-50%) scale(0.5);
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(244, 63, 94, 0.2);
        border: 1px solid rgba(244, 63, 94, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        color: #f43f5e;
        opacity: 0;
        pointer-events: none;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s, background 0.2s;
        z-index: 1;
        ${isMe ? "left: -42px;" : "right: -42px;"}
      `;
      ind.innerHTML = "↩️";
      parent.style.position = "relative";
      parent.appendChild(ind);
    }
    return ind;
  }

  function onTouchStart(e) {
    if (e.touches && e.touches.length > 1) return;
    const touch = e.touches ? e.touches[0] : e;
    startX = touch.clientX;
    startY = touch.clientY;
    currentDeltaX = 0;
    isSwiping = false;
    hasTriggered = false;
    isScrolling = false;

    element.style.transition = "none";
    replyIndicator = getOrCreateIndicator();
  }

  function onTouchMove(e) {
    if (isScrolling) return;
    const touch = e.touches ? e.touches[0] : e;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    // Check if vertical scrolling first
    if (!isSwiping) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
        isScrolling = true;
        resetPosition();
        return;
      }
      if (Math.abs(deltaX) > 10) {
        isSwiping = true;
      }
    }

    if (isSwiping) {
      // Swipe direction:
      // If message is on right (isMe), dragging left (deltaX < 0) feels natural.
      // If message is on left (!isMe), dragging right (deltaX > 0) feels natural.
      // We allow dragging towards the center or dragging horizontally.
      const direction = isMe ? -1 : 1;
      const rawSwipe = deltaX * direction;

      if (rawSwipe > 0) {
        if (e.cancelable) e.preventDefault();

        // Apply elastic resistance
        const clamped = Math.min(MAX_DRAG, Math.pow(rawSwipe, 0.88) * 2.2);
        currentDeltaX = clamped * direction;

        element.style.transform = `translateX(${currentDeltaX}px)`;

        // Indicator progress
        if (replyIndicator) {
          const progress = Math.min(1, clamped / THRESHOLD);
          replyIndicator.style.opacity = progress.toString();
          replyIndicator.style.transform = `translateY(-50%) scale(${0.5 + progress * 0.6})`;

          if (clamped >= THRESHOLD) {
            replyIndicator.style.background = "#f43f5e";
            replyIndicator.style.color = "#ffffff";
            replyIndicator.style.boxShadow = "0 0 12px rgba(244, 63, 94, 0.6)";

            if (!hasTriggered) {
              hasTriggered = true;
              if (navigator.vibrate) navigator.vibrate(18);
            }
          } else {
            replyIndicator.style.background = "rgba(244, 63, 94, 0.2)";
            replyIndicator.style.color = "#f43f5e";
            replyIndicator.style.boxShadow = "none";
            hasTriggered = false;
          }
        }
      } else {
        element.style.transform = "translateX(0px)";
      }
    }
  }

  function onTouchEnd() {
    if (isSwiping && hasTriggered) {
      triggerReplyState(docId, msgData);
    }
    resetPosition();
  }

  function resetPosition() {
    element.style.transition = "transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    element.style.transform = "translateX(0px)";

    if (replyIndicator) {
      replyIndicator.style.opacity = "0";
      replyIndicator.style.transform = "translateY(-50%) scale(0.5)";
      replyIndicator.style.background = "rgba(244, 63, 94, 0.2)";
      replyIndicator.style.boxShadow = "none";
    }

    isSwiping = false;
    hasTriggered = false;
    isScrolling = false;
  }

  // Bind touch events
  element.addEventListener("touchstart", onTouchStart, { passive: true });
  element.addEventListener("touchmove", onTouchMove, { passive: false });
  element.addEventListener("touchend", onTouchEnd, { passive: true });
  element.addEventListener("touchcancel", resetPosition, { passive: true });
}

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

  // ✨ THE REPLY BUTTON
  items.push({ icon: "↩️", label: "Reply", action: () => {
    triggerReplyState(docId, msgData);
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
  let timer = null, startX = 0, startY = 0, fired = false;
  const HOLD_MS = 450, MOVE_TOLERANCE = 10;
  const cancel = () => { clearTimeout(timer); timer = null; };

  // Desktop: right-click
  element.addEventListener("contextmenu", e => {
    e.preventDefault();
    if (fired) { fired = false; return; }
    callback(e);
  });

  element.addEventListener("pointerdown", e => {
    if (e.button === 2) return;
    fired = false;
    startX = e.clientX; startY = e.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = null; fired = true;
      if (navigator.vibrate) navigator.vibrate(14);
      callback(e);
    }, HOLD_MS);
  });
  element.addEventListener("pointermove", e => {
    if (timer && (Math.abs(e.clientX - startX) > MOVE_TOLERANCE || Math.abs(e.clientY - startY) > MOVE_TOLERANCE)) cancel();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev => element.addEventListener(ev, cancel));
  element.addEventListener("scroll", cancel, true);
  element.addEventListener("click", e => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
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
    await updateDoc(doc(db, "messages", docId), { 
      isDeleted: true, 
      text: "", 
      mediaUrl: "", 
      mimeType: "",
      reactions: {}
    }); 
  } catch(e) { console.error(e); }
}
