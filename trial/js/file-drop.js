// Paste screenshots (Ctrl+V) and drag & drop files onto the chat.
import { addFiles } from "./attachments.js";

const chatUi = document.getElementById("chat-ui");
const column = document.getElementById("chat-column");

// ── PASTE ────────────────────────────────────────────────
// Works for screenshots (Win+Shift+S, PrtSc, Cmd+Shift+4), "Copy image", and files copied in Explorer/Finder.
document.addEventListener("paste", (e) => {
  if (!chatUi.classList.contains("active")) return;
  const t = e.target;
  // Don't hijack pasting into other text boxes (settings, search, GIF search …) — only the message box
  if (t && t !== document.getElementById("message-input") && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
  if (t && t.isContentEditable) return;

  const cd = e.clipboardData;
  if (!cd) return;
  const files = Array.from(cd.files || []);
  if (!files.length) return;                                    // plain text → normal paste

  const hasImage = files.some(f => f.type.startsWith("image/"));
  const hasText = (cd.getData("text/plain") || "").trim().length > 0;
  if (!hasImage && hasText) return;                             // e.g. text copied from a spreadsheet — keep the text

  e.preventDefault();
  const { added, skipped } = addFiles(files);
  if (added && !skipped) flash(`📎 ${added} file${added > 1 ? "s" : ""} added — press send`);
});

// ── DRAG & DROP ──────────────────────────────────────────
const overlay = document.createElement("div");
overlay.id = "drop-overlay";
overlay.innerHTML = `<div class="drop-card"><div class="drop-emoji">📎</div><div class="drop-title">Drop to attach</div><div class="drop-sub">Photos, videos, documents — anything 💕</div></div>`;
column.appendChild(overlay);

let depth = 0;
const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");

window.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (!chatUi.classList.contains("active")) return;
  depth++; overlay.classList.add("show");
});
window.addEventListener("dragover", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();                                            // required, or the browser would open the file
  e.dataTransfer.dropEffect = "copy";
});
window.addEventListener("dragleave", (e) => {
  if (!hasFiles(e)) return;
  depth = Math.max(0, depth - 1);
  if (depth === 0) overlay.classList.remove("show");
});
window.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();                                            // never navigate away to the dropped file
  depth = 0; overlay.classList.remove("show");
  if (!chatUi.classList.contains("active")) return;
  const { added, skipped } = addFiles(e.dataTransfer.files);
  if (added && !skipped) flash(`📎 ${added} file${added > 1 ? "s" : ""} added — press send`);
});

function flash(msg) {
  const el = document.getElementById("status-text");
  if (!el) return;
  el.textContent = msg;
  clearTimeout(flash._t);
  flash._t = setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 3500);
}
