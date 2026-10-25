// Saved / quick replies
import { closeAllPanels } from "./helpers.js";

// ── SAVED REPLIES ─────────────────────────────────────────
export function getSavedReplies() {
  try { return JSON.parse(localStorage.getItem("saved-replies") || "[]"); } catch { return []; }
}
export function saveSavedReplies(arr) { localStorage.setItem("saved-replies", JSON.stringify(arr)); }

export function renderSavedRepliesPanel() {
  const replies = getSavedReplies();
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
  const replies = getSavedReplies();
  const list    = document.getElementById("settings-saved-list");
  if (!replies.length) { list.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:4px 0;">No saved replies yet.</div>'; return; }
  list.innerHTML = replies.map((r,i) => `
    <div class="saved-reply-settings-item">
      <span class="saved-reply-settings-text">${r}</span>
      <button class="saved-reply-delete-btn" data-i="${i}">🗑</button>
    </div>`).join("");
  list.querySelectorAll(".saved-reply-delete-btn").forEach(btn => btn.addEventListener("click", () => {
    const arr = getSavedReplies(); arr.splice(+btn.dataset.i, 1); saveSavedReplies(arr); renderSavedRepliesSettings(); renderSavedRepliesPanel();
  }));
}

document.getElementById("add-saved-reply-btn").addEventListener("click", () => {
  const val = document.getElementById("new-saved-reply-input").value.trim();
  if (!val) return;
  const arr = getSavedReplies(); arr.push(val); saveSavedReplies(arr);
  document.getElementById("new-saved-reply-input").value = "";
  renderSavedRepliesSettings(); renderSavedRepliesPanel();
});
document.getElementById("new-saved-reply-input").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("add-saved-reply-btn").click();
});

document.getElementById("saved-btn").addEventListener("click", e => {
  e.stopPropagation();
  const p = document.getElementById("saved-replies-panel");
  const isVisible = p.classList.contains("visible");
  closeAllPanels();
  if (!isVisible) { renderSavedRepliesPanel(); p.classList.add("visible"); document.getElementById("saved-btn").classList.add("active"); }
});
document.getElementById("saved-replies-panel").addEventListener("click", e => e.stopPropagation());

// Sidebar saved replies shortcut
document.getElementById("sidebar-saved-btn")?.addEventListener("click", () => {
  document.getElementById("saved-btn").click();
});
