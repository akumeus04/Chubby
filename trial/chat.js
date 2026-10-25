// chat.js - Handles Chat History, Date-Based Pagination, Smart Scrolling, and Background Sync

import { collection, query, orderBy, where, onSnapshot, updateDoc, doc, getDocs, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let initialLoad = true;
let unsubscribeChat = null; 

// State Trackers
window.daysBack = 0; // 0 = Today, 1 = Yesterday, 2 = Day Before, etc.
window.isSearchingJump = false; 
window.isLoadingOlderMessages = false;
window.lastTopMessageId = null;


// ── 1. INJECT "GO TO PRESENT" BUTTON ──
function setupGoToPresentButton() {
  if (document.getElementById("go-present-btn")) return;
  
  const goPresentBtn = document.createElement("button");
  goPresentBtn.id = "go-present-btn";
  goPresentBtn.innerHTML = "⬇️";
  goPresentBtn.title = "Jump to newest messages";
  goPresentBtn.style.cssText = "display:none; position:fixed; bottom:100px; right:20px; width:45px; height:45px; border-radius:50%; background:var(--accent, #007bff); color:#fff; border:none; box-shadow:0 4px 12px rgba(0,0,0,0.4); font-size:20px; cursor:pointer; z-index:9999; align-items:center; justify-content:center; padding:0;";
  document.body.appendChild(goPresentBtn);
  
  goPresentBtn.onclick = () => {
    const cw = document.getElementById("chat-window");
    if (cw) cw.scrollTo({ top: cw.scrollHeight, behavior: "smooth" });
  };

  const cw = document.getElementById("chat-window");
  if (cw) {
    cw.addEventListener("scroll", () => {
      // Show button if we scroll up more than 250px from the bottom
      const distanceToBottom = cw.scrollHeight - cw.scrollTop - cw.clientHeight;
      goPresentBtn.style.display = (distanceToBottom > 250) ? "flex" : "none";
    });
  }
}
document.addEventListener("DOMContentLoaded", setupGoToPresentButton);
setTimeout(setupGoToPresentButton, 1000); 

// ── 2. DATE CALCULATION HELPER ──
function getLoadLabel() {
  const target = new Date();
  target.setHours(0,0,0,0);
  target.setDate(target.getDate() - (window.daysBack + 1));

  if (window.daysBack === 0) return "Yesterday's Messages";
  if (window.daysBack === 1) return target.toLocaleDateString([], {weekday: 'long'}) + "'s Messages"; 
  
  return "Messages from " + target.toLocaleDateString([], {month: 'short', day: 'numeric'});
}

// ── 3. PAGINATION & TELEPORTATION ──
window.loadMoreMessages = function() {
  const topBubble = document.querySelector('.message-bubble');
  if (topBubble) window.lastTopMessageId = topBubble.getAttribute('data-docid');
  
  window.isLoadingOlderMessages = true;
  window.daysBack++; // Go back exactly one more day
  window.loadChat();
};

window.goToMessage = async function(docId) {
  document.getElementById("search-panel").style.display = "none";
  document.getElementById("search-input").value = "";
  window.isSearchingJump = true; 
  
  const tryScroll = () => {
    const el = document.querySelector(`[data-docid="${docId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.transition = "all 0.5s";
      el.style.transform = "scale(1.05)";
      el.style.boxShadow = "0 0 15px var(--accent)";
      setTimeout(() => {
        el.style.transform = "scale(1)";
        el.style.boxShadow = "none";
        window.isSearchingJump = false; 
      }, 1500);
      return true;
    }
    return false;
  };

  // If the message isn't currently on the screen, teleport to it!
  if (!tryScroll()) {
    const db = window.chatBridge.getDb();
    
    // Show a loading indicator so the user knows it's working
    const statusEl = document.getElementById("status-text");
    if (statusEl) statusEl.innerHTML = '<span class="loader"></span> Teleporting to message...';
    
    const docSnap = await getDoc(doc(db, "messages", docId));
    
    if (docSnap.exists() && docSnap.data().timestamp) {
       const msgTime = docSnap.data().timestamp.toDate();
       const today = new Date();
       today.setHours(0,0,0,0);
       
       const diffTime = today.getTime() - msgTime.getTime();
       const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
       
       if (diffDays > window.daysBack) {
          window.daysBack = diffDays; // Jump the calendar back instantly!
          window.loadChat();
          
          // 🔥 SMART POLLING: Check every 100ms for up to 5 seconds
          let attempts = 0;
          const searchInterval = setInterval(() => {
            attempts++;
            if (tryScroll()) {
              // We found it! Stop looking and clear the loading text.
              clearInterval(searchInterval);
              if (statusEl) statusEl.innerHTML = '';
            } else if (attempts > 50) { 
              // Gave up after 5 seconds of waiting for the network
              clearInterval(searchInterval);
              alert("Network is slow or message could not be loaded.");
              window.isSearchingJump = false;
              if (statusEl) statusEl.innerHTML = '';
            }
          }, 100);
          
       } else {
          // Fallback just in case
          if (statusEl) statusEl.innerHTML = '';
          window.isSearchingJump = false;
       }
    } else {
       if (statusEl) statusEl.innerHTML = '';
       window.isSearchingJump = false;
    }
  }
};

// ── 4. MAIN CHAT LOADER ──
window.loadChat = function() {
  const bridge = window.chatBridge;
  const db = bridge.getDb();
  const currentUser = bridge.getCurrentUser();
  let partnerName = bridge.getPartnerName();

  if (unsubscribeChat) unsubscribeChat();

  // 🗓 Set the cutoff date based on how many days back we are loading
  const targetDate = new Date();
  targetDate.setHours(0, 0, 0, 0); // Midnight today
  targetDate.setDate(targetDate.getDate() - window.daysBack);

  // Ask Firebase for everything from that specific date onwards
  const q = query(collection(db, "messages"), where("timestamp", ">=", targetDate), orderBy("timestamp", "asc"));

  // Track whether this is the very first snapshot for this subscription
  let isFirstSnapshot = true;
  
  unsubscribeChat = onSnapshot(q, snapshot => {
    
    const messages = [];
    snapshot.forEach(docSnap => messages.push(docSnap));

    // 🧠 SMART FALLBACK: If there are 0 messages today, auto-load yesterday behind the scenes so the screen isn't blank!
    if (initialLoad && messages.length === 0 && window.daysBack < 3) {
      window.daysBack++;
      window.loadChat();
      return; 
    }

    // Only fire notification/sound logic on subsequent real-time updates (not on initial batch load)
    if (!initialLoad && !isFirstSnapshot) {
      snapshot.docChanges().forEach(change => {
        if (change.type === "added") {
          const newMsgData = change.doc.data();
          const newMsgText = newMsgData.text || "";

          // 🎉 Trigger Confetti or 💋 Kiss Animation on incoming messages
          if (bridge.triggerEmojiAnimation) {
            bridge.triggerEmojiAnimation(newMsgText);
          } else if (typeof window.triggerEmojiAnimation === "function") {
            window.triggerEmojiAnimation(newMsgText);
          }

          if (newMsgData.senderId !== currentUser.uid) {
            bridge.getSound().play().catch(()=>{});
            const title = "New message from " + (newMsgData.senderName || "Partner");
            const body  = newMsgText || "Sent a media file 📩";
            // If real push (FCM) is connected on this device, the service worker already shows the notification — skip the local one to avoid a double ping.
            if ('Notification' in window && Notification.permission === "granted" && document.hidden && !window.chubbyPushReady) {
              navigator.serviceWorker?.ready.then(reg => {
                const iconUrl = new URL('icon-192.png', reg.scope).href;
                reg.showNotification(title, { body: body, icon: iconUrl, badge: iconUrl, vibrate: [200, 100, 200], tag: 'chubby-chat-notification', renotify: true });
              }).catch(()=>{});
            }
            if (!document.hidden) bridge.showInAppBanner(title, body);
          }
        }
      });
    }

    isFirstSnapshot = false;

    const chatWindow = document.getElementById("chat-window");
    
    // Save state for smooth scroll anchoring — must happen before any DOM wipe
    const prevScrollHeight = chatWindow.scrollHeight;
    const prevScrollTop = chatWindow.scrollTop;
    const isAtBottom = Math.abs(prevScrollHeight - prevScrollTop - chatWindow.clientHeight) <= 50;

    // ⚠️  Grab the load button BEFORE wiping innerHTML — it lives inside chatWindow
    let loadBtn = chatWindow.querySelector("#load-older-btn");
    const isLoadBtnLoading = loadBtn && loadBtn.disabled; // preserve spinner state
    if (!loadBtn) {
      loadBtn = document.createElement("button");
      loadBtn.id = "load-older-btn";
    } else {
      chatWindow.removeChild(loadBtn); // detach before wipe
    }

    chatWindow.innerHTML = "";
    let lastDate = "";

    // Update label only if not mid-load (preserve the spinner)
    if (!isLoadBtnLoading) {
      loadBtn.innerText = "↻ Load " + getLoadLabel();
      loadBtn.style.cssText = "display:block; margin: 10px auto 20px; padding: 8px 16px; border-radius: 20px; background: var(--surface2); color: var(--text-primary); border: 1px solid var(--border); font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.2s;";
      loadBtn.disabled = false;
      loadBtn.onmouseover = () => loadBtn.style.background = "var(--surface3)";
      loadBtn.onmouseout = () => loadBtn.style.background = "var(--surface2)";
      loadBtn.onclick = () => {
        loadBtn.innerHTML = '<span class="loader" style="width:12px;height:12px;border-width:2px;border-top-color:var(--text-primary);display:inline-block;"></span> Loading...';
        loadBtn.disabled = true;
        window.loadMoreMessages();
      };
    }
    chatWindow.appendChild(loadBtn);

    messages.forEach(docSnap => {
      const data  = docSnap.data();
      const docId = docSnap.id;
      const isMe  = data.senderId === currentUser.uid;

      if (!isMe && !data.isRead && !data.isDeleted) {
        updateDoc(doc(db, "messages", docId), { isRead: true }).catch(()=>{});
      }

      const rawPhoto = data.senderPhoto || "👤";
      const finalPhoto = bridge.getDirectImageUrl(rawPhoto);
      if (!isMe && data.senderName) {
         partnerName = data.senderName;
         bridge.setPartnerName(partnerName);
      }

      if (data.timestamp) {
        const d = data.timestamp.toDate(), today = new Date(), yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        let dl = d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === yesterday.toDateString() ? "Yesterday" : d.toLocaleDateString([],{month:"short",day:"numeric"});
        if (dl !== lastDate) { lastDate = dl; const _dd = document.createElement("div"); _dd.className = "date-divider"; _dd.textContent = dl; chatWindow.appendChild(_dd); }
      }

      const avatarHtml = (finalPhoto.startsWith("http") || finalPhoto.startsWith("data:")) ? `<div class="avatar"><img src="${finalPhoto}" alt="avatar"></div>` : `<div class="avatar">${finalPhoto}</div>`;
      const reactions = data.reactions || {};
      let reactHtml = "";
      const reactKeys = Object.keys(reactions).filter(k => reactions[k]?.length > 0);
      if (reactKeys.length) {
        reactHtml = `<div class="reactions-row">${reactKeys.map(em => {
          const users = reactions[em]; const mine = users.includes(currentUser.uid);
          return `<span class="reaction-bubble${mine?" mine":""}" data-docid="${docId}" data-em="${em}">${em}<span class="reaction-count">${users.length}</span></span>`;
        }).join("")}</div>`;
      }

      const timeStr = data.timestamp ? data.timestamp.toDate().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : "…";
      const editedLabel = data.edited ? `<span class="edited-label">(edited)</span>` : "";
      let checkMarks = "";
      if (isMe) checkMarks = data.isRead ? `<span style="color: var(--online); margin-left: 4px; font-weight: 700;">✓✓</span>` : `<span style="opacity: 0.6; margin-left: 4px;">✓</span>`;

      const rowEl = document.createElement("div");
      rowEl.className = `message-row ${isMe ? "my-message-row" : "their-message-row"}`;
      const bubbleClass = `message-bubble ${isMe ? "my-message" : "their-message"}${reactKeys.length ? " bubble-with-reactions" : ""}`;
      
      let bubbleContent = data.isDeleted ? `<div class="deleted-message-text">🚫 This message was deleted</div>` : `${data.text ? `<div>${bridge.formatMessageText(data.text)}</div>` : ""}${bridge.buildMediaHtml(data)}${reactHtml}`;

      rowEl.innerHTML = `
        ${isMe ? '<div class="avatar-spacer"></div>' : avatarHtml}
        <div class="bubble-wrap">
          ${!isMe ? `<div class="sender-name">${data.senderName || "Unknown"}</div>` : ""}
          <div class="${bubbleClass}" data-docid="${docId}">
            ${bubbleContent}
          </div>
          <div class="time-stamp" style="${reactKeys.length && !data.isDeleted ? "margin-top:18px;" : ""}">${timeStr}${checkMarks}${editedLabel}</div>
        </div>
        ${isMe ? avatarHtml : '<div class="avatar-spacer"></div>'}`;

      if (!data.isDeleted) {
        const bubble = rowEl.querySelector(".message-bubble"); 
        
        // ✨ Passes the FULL 'data' object to the menu so the Reply button knows what it's replying to
        bridge.addLongPressAndRightClick(bubble, e => bridge.showContextMenu(e, docId, isMe, data));

        // 💫 NEW: Attach Swipe-to-Reply gesture to every message bubble!
        if (bridge.addSwipeToReply) {
          bridge.addSwipeToReply(bubble, docId, isMe, data);
        }

        // Reaction bubble click toggle
        rowEl.querySelectorAll(".reaction-bubble").forEach(rb => {
          rb.addEventListener("click", () => bridge.addReaction(rb.dataset.docid, rb.dataset.em));
        });

        // ── 1. RENDER QUOTED REPLY INSIDE THE BUBBLE ──
        if (data.replyToText || data.replyToMedia) {
          let mediaThumb = "";
          if (data.replyToMedia) {
            const directUrl = bridge.getDirectImageUrl(data.replyToMedia);
            const isVid = data.replyToMime && data.replyToMime.startsWith("video/");
            if (isVid) {
              mediaThumb = `<video class="quoted-media" src="${directUrl}"></video>`;
            } else {
              mediaThumb = `<img class="quoted-media" src="${directUrl}">`;
            }
          }
          
          const replyHtml = `
            <div class="quoted-message">
              ${mediaThumb}
              <div class="quoted-message-content">
                <div class="quoted-sender">${data.replyToName}</div>
                <div class="quoted-text">${data.replyToText}</div>
              </div>
            </div>
          `;
          bubble.innerHTML = replyHtml + bubble.innerHTML; 
          
          // CLICK TO SCROLL/TELEPORT TO ORIGINAL MESSAGE
          const quotedEl = bubble.querySelector(".quoted-message");
          if (quotedEl && data.replyToId) {
            quotedEl.addEventListener("click", (e) => {
              e.stopPropagation(); 
              const originalMsg = document.querySelector(`[data-docid="${data.replyToId}"]`);
              if (originalMsg) {
                // If it's already on screen, smooth scroll to it
                originalMsg.scrollIntoView({ behavior: "smooth", block: "center" });
                originalMsg.style.transition = "filter 0.3s, transform 0.3s";
                originalMsg.style.filter = "brightness(1.5)";
                originalMsg.style.transform = "scale(1.02)";
                setTimeout(() => {
                  originalMsg.style.filter = "";
                  originalMsg.style.transform = "";
                }, 400);
              } else {
                // If it's off-screen, use the teleport function
                window.goToMessage(data.replyToId);
              }
            });
          }
        }
      }
      chatWindow.appendChild(rowEl);
    });

    // ── THE ULTIMATE SCROLL ANCHOR ──
    if (window.isSearchingJump) {
      // Let the teleport timeout handle it
    } else if (window.isLoadingOlderMessages) {
      // Freeze the screen on the message that was previously at the top
      const anchorMsg = window.lastTopMessageId
        ? chatWindow.querySelector(`[data-docid="${window.lastTopMessageId}"]`)
        : null;
      if (anchorMsg) {
        anchorMsg.scrollIntoView({ block: "start" });
        chatWindow.scrollTop -= 60; // reveal a sliver of newly loaded content above
      } else {
        // No anchor found — just stay at the top so user sees new older messages
        chatWindow.scrollTop = 0;
      }
      clearTimeout(window.olderMsgTimeout);
      window.olderMsgTimeout = setTimeout(() => {
        window.isLoadingOlderMessages = false;
        const btn = chatWindow.querySelector("#load-older-btn");
        if (btn) { btn.disabled = false; btn.innerText = "↻ Load " + getLoadLabel(); }
      }, 400);
    } else if (initialLoad || isAtBottom) {
      chatWindow.scrollTop = chatWindow.scrollHeight;
    } else {
      chatWindow.scrollTop = prevScrollTop + (chatWindow.scrollHeight - prevScrollHeight);
    }
    
    initialLoad = false;

    // Resolve any proxy-URL media
    if (bridge.resolveProxyMedia) {
      bridge.resolveProxyMedia(chatWindow);
    }
  });
};

// ── 5. SEARCH LOGIC ────────────────────────────────────────
document.getElementById("search-toggle-btn").addEventListener("click", () => {
  const p = document.getElementById("search-panel");
  p.style.display = p.style.display === "flex" ? "none" : "flex";
  if (p.style.display === "flex") {
    document.getElementById("search-input").focus();
    document.getElementById("search-results").innerHTML = ""; 
  }
});

async function runSearch() {
  const keyword = document.getElementById("search-input").value.toLowerCase().trim();
  const resultsBox = document.getElementById("search-results");
  const goBtn = document.getElementById("search-go-btn");
  if (goBtn) { goBtn.textContent = "…"; goBtn.disabled = true; }
    
  if (!keyword) { resultsBox.innerHTML = ""; if (goBtn) { goBtn.textContent = "Search"; goBtn.disabled = false; } return; }
  resultsBox.innerHTML = '<div style="text-align:center; padding:16px;"><span class="loader"></span></div>';

  try {
    const db = window.chatBridge.getDb();
    const snap = await getDocs(collection(db, "messages"));
    const matches = [];

    snap.forEach(doc => {
      const data = doc.data();
      if (data.text && data.text.toLowerCase().includes(keyword)) {
         data.docId = doc.id;
         matches.push(data);
      }
    });

    if (matches.length === 0) {
       resultsBox.innerHTML = '<div style="font-size:13px; color:var(--text-muted); text-align:center; padding:10px;">No messages found.</div>';
       return;
    }

    matches.reverse();

    resultsBox.innerHTML = matches.map(m => {
      const date = m.timestamp ? m.timestamp.toDate().toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'}) : "";
      return `
      <div onclick="window.goToMessage('${m.docId}')" style="background:var(--surface2); padding:12px; border-radius:8px; font-size:13px; border-left: 3px solid var(--accent); cursor:pointer; margin-bottom:8px; transition: background 0.2s;" onmouseover="this.style.background='var(--surface3)'" onmouseout="this.style.background='var(--surface2)'">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <b style="color:var(--accent); font-size:12px;">${m.senderName}</b>
          <span style="font-size:11px; color:var(--text-muted);">${date}</span>
        </div>
        <div style="color:var(--text-primary); line-height:1.4;">${m.text}</div>
      </div>`;
    }).join("");

  } catch(err) {
    console.error(err);
    resultsBox.innerHTML = '<div style="color:var(--danger); font-size:13px; text-align:center;">Error searching messages.</div>';
  } finally {
    if (goBtn) { goBtn.textContent = "Search"; goBtn.disabled = false; }
  }
}

document.getElementById("search-input").addEventListener("keydown", e => {
  if (e.key === "Enter") runSearch();
});
document.getElementById("search-go-btn")?.addEventListener("click", runSearch);

document.addEventListener("click", (e) => {
  const panel = document.getElementById("search-panel");
  const btn = document.getElementById("search-toggle-btn");
  if (panel && panel.style.display === "flex" && !panel.contains(e.target) && !btn.contains(e.target)) {
    panel.style.display = "none";
  }
});

// ── 6. NATIVE CAMERA + PAINT EDITOR ──────────────────────────
window.triggerNativeBackgroundPicker = async function() {
  if (window.Capacitor && Capacitor.getPlatform() !== 'web') {
    try {
      const image = await window.Capacitor.Plugins.Camera.getPhoto({
        quality: 60,
        allowEditing: false,
        resultType: 'base64',
        source: 'PHOTOS',
        width: 1000 
      });

      const safeFormat = (image.format || 'jpeg').toLowerCase();
      const base64Data = `data:image/${safeFormat};base64,${image.base64String}`;

      window.openPaintEditor(base64Data, async (editedBase64) => {
        const previewImg = document.getElementById('bg-preview-img');
        if (previewImg) {
          previewImg.src = editedBase64;
          previewImg.style.display = 'block';
          document.getElementById('bg-preview-placeholder').style.display = 'none';
        }
        await saveGlobalBackground(editedBase64);
      });

    } catch (error) {
      console.log("User cancelled gallery picker or error:", error);
    }
  } else {
    alert("Native picking is only available inside the Android app.");
  }
};

// Save to Firebase
async function saveGlobalBackground(imageBase64) {
  try {
    const db = window.chatBridge ? window.chatBridge.getDb() : window.db;
    const settingsRef = doc(db, "settings", "global_preferences");
    
    await setDoc(settingsRef, {
      chatBackgroundUrl: imageBase64,
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    console.log("Global background updated!");
  } catch (error) {
    console.error("Error saving background:", error);
    alert("Failed to save background. Ensure your Firebase rules allow this.");
  }
}

// Remove Background Function
window.removeGlobalBackground = async function() {
  const previewImg = document.getElementById('bg-preview-img');
  if (previewImg) {
    previewImg.src = "";
    previewImg.style.display = 'none';
    const placeholder = document.getElementById('bg-preview-placeholder');
    if (placeholder) placeholder.style.display = 'block';
  }

  try {
    const db = window.chatBridge ? window.chatBridge.getDb() : window.db;
    const settingsRef = doc(db, "settings", "global_preferences");
    await setDoc(settingsRef, {
      chatBackgroundUrl: null, 
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("Error removing background:", error);
  }
};

// Listen to the global preferences document
setTimeout(() => {
  const db = window.chatBridge ? window.chatBridge.getDb() : window.db;
  if (!db) return; 
  
  const globalSettingsRef = doc(db, "settings", "global_preferences");

  onSnapshot(globalSettingsRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      
      if (data.chatBackgroundUrl) {
        document.body.style.backgroundImage = `url('${data.chatBackgroundUrl}')`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
        document.body.style.backgroundAttachment = "fixed";
        
        const previewImg = document.getElementById('bg-preview-img');
        if (previewImg) {
          previewImg.src = data.chatBackgroundUrl;
          previewImg.style.display = 'block';
          const placeholder = document.getElementById('bg-preview-placeholder');
          if (placeholder) placeholder.style.display = 'none';
        }
      } else {
        document.body.style.backgroundImage = "none";
      }
    }
  });
}, 1000);

// Automatically scroll to bottom when input is focused
const msgInput = document.getElementById("message-input");
if (msgInput) {
  msgInput.addEventListener("focus", () => {
    setTimeout(() => {
      const cw = document.getElementById("chat-window");
      if (cw) cw.scrollTo({ top: cw.scrollHeight, behavior: 'smooth' });
    }, 300);
  });
}
