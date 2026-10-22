import { closeAllPanels } from "./helpers.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js"; 
import { state } from "./state.js"; 

// Local cache to keep the UI feeling instant
let currentReplies = [];

// ADD THIS MISSING FUNCTION BACK:
export function getSavedReplies() {
  return currentReplies;
}

// ── SAVED REPLIES ─────────────────────────────────────────

// 1. Fetch replies from Firebase (and migrate old local ones if needed)
export async function initSavedReplies() {
  if (!state.currentUser) return;
  try {
    const snap = await getDoc(doc(db, "users", state.currentUser.uid));
    
    if (snap.exists() && snap.data().quickReplies) {
      // ➔ A. User already has replies in Firebase, load them!
      currentReplies = snap.data().quickReplies;
    } else {
      // ➔ B. No Firebase replies yet. Check for old local storage replies.
      const oldLocalReplies = JSON.parse(localStorage.getItem("saved-replies") || "[]");
      
      if (oldLocalReplies.length > 0) {
        // Migrate them: set to current and immediately upload to Firebase
        currentReplies = oldLocalReplies;
        await saveSavedReplies(currentReplies);
        console.log("Migrated old local replies to Firebase!");
      } else {
        // Completely new profile, start empty
        currentReplies = []; 
      }
    }
    
    // Update the UI
    renderSavedRepliesSettings(); 
    renderSavedRepliesPanel();
  } catch (e) {
    console.error("Error loading quick replies from Firebase:", e);
  }
}

// 2. Save replies to Firebase when added or deleted
export async function saveSavedReplies(arr) { 
  currentReplies = arr; // Update local UI immediately
  if (!state.currentUser) return;
  
  try {
    await setDoc(doc(db, "users", state.currentUser.uid), { 
      quickReplies: arr 
    }, { merge: true });
  } catch (e) {
    console.error("Error saving quick replies to Firebase:", e);
  }
}

// 3. Render functions (now using the currentReplies array)
export function renderSavedRepliesPanel() {
  const replies = currentReplies;
  const scroll  = document.getElementById("saved-replies-scroll");
  if (!replies.length) { scroll.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:8px 0;">No saved replies yet. Add them in Settings.</div>'; return; }
  
  scroll.innerHTML = replies.map((r,i) => `<div class="saved-reply-item" data-i="${i}">${r}</div>`).join("");
  
  scroll.querySelectorAll(".saved-reply-item").forEach(item => item.addEventListener("click", () => {
    const inp = document.getElementById("message-input");
    inp.value = replies[+item.dataset.i];
    inp.dispatchEvent(new Event("input"));
    inp.focus();
    closeAllPanels();
  }));
}

export function renderSavedRepliesSettings() {
  const replies = currentReplies;
  const list    = document.getElementById("settings-saved-list");
  if (!replies.length) { list.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:4px 0;">No saved replies yet.</div>'; return; }
  
  list.innerHTML = replies.map((r,i) => `
    <div class="saved-reply-settings-item">
      <span class="saved-reply-settings-text">${r}</span>
      <button class="saved-reply-delete-btn" data-i="${i}">🗑</button>
    </div>`).join("");
    
  list.querySelectorAll(".saved-reply-delete-btn").forEach(btn => btn.addEventListener("click", () => {
    const arr = [...currentReplies]; 
    arr.splice(+btn.dataset.i, 1); 
    saveSavedReplies(arr); 
    renderSavedRepliesSettings(); 
    renderSavedRepliesPanel();
  }));
}

// 4. Event Listeners
document.getElementById("add-saved-reply-btn").addEventListener("click", () => {
  const val = document.getElementById("new-saved-reply-input").value.trim();
  if (!val) return;
  
  const arr = [...currentReplies]; 
  arr.push(val); 
  saveSavedReplies(arr);
  
  document.getElementById("new-saved-reply-input").value = "";
  renderSavedRepliesSettings(); 
  renderSavedRepliesPanel();
});

document.getElementById("new-saved-reply-input").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("add-saved-reply-btn").click();
});

document.getElementById("saved-btn").addEventListener("click", e => {
  e.stopPropagation();
  const p = document.getElementById("saved-replies-panel");
  const isVisible = p.classList.contains("visible");
  closeAllPanels();
  if (!isVisible) { 
    renderSavedRepliesPanel(); 
    p.classList.add("visible"); 
    document.getElementById("saved-btn").classList.add("active"); 
  }
});

document.getElementById("saved-replies-panel").addEventListener("click", e => e.stopPropagation());

// Sidebar saved replies shortcut
document.getElementById("sidebar-saved-btn")?.addEventListener("click", () => {
  document.getElementById("saved-btn").click();
});
