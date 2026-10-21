// Message textarea, expand (+) button, panel closing
import { closeAllPanels } from "./helpers.js";

// ── AUTO-RESIZE TEXTAREA ──────────────────────────────────
export const msgInput = document.getElementById("message-input");
msgInput.addEventListener("input", () => {
  msgInput.style.height = "auto";
  const maxH = window.innerWidth <= 767 ? 100 : 120;
  msgInput.style.height = Math.min(msgInput.scrollHeight, maxH) + "px";
});
msgInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); document.getElementById("send-btn").click(); }
});


// ── MOBILE + EXPAND BUTTON ────────────────────────────────
const expandBtn = document.getElementById("expand-btn");
const inputBar  = document.getElementById("input-bar");
expandBtn.addEventListener("click", e => {
  e.stopPropagation();
  const isOpen = inputBar.classList.toggle("actions-expanded");
  expandBtn.classList.toggle("open", isOpen);
  if (!isOpen) closeAllPanels();
});

// Close panels when clicking outside — panels use stopPropagation on their own clicks
document.addEventListener("click", e => {
  const inInputArea = e.target.closest("#input-area");
  if (!inInputArea) closeAllPanels();
});


// Auto-collapse menus when tapping the text input
msgInput.addEventListener("focus", () => {
  document.getElementById("input-bar").classList.remove("actions-expanded");
  document.getElementById("expand-btn").classList.remove("open");
  closeAllPanels();
});
