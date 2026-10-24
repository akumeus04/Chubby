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


// ── "+" BUTTON: opens the tray UNDER the message box ──────
const expandBtn = document.getElementById("expand-btn");
const inputArea = document.getElementById("input-area");
const isPhone = () => window.matchMedia("(max-width: 767px)").matches;

export function setTray(open) {
  inputArea.classList.toggle("tray-open", open);
  expandBtn.classList.toggle("open", open);
  expandBtn.setAttribute("aria-expanded", String(open));
  if (!open) closeAllPanels();
}
expandBtn.addEventListener("click", e => {
  e.stopPropagation();
  setTray(!inputArea.classList.contains("tray-open"));
});

// Close panels when clicking outside — panels use stopPropagation on their own clicks
document.addEventListener("click", e => {
  const inInputArea = e.target.closest("#input-area");
  if (!inInputArea) closeAllPanels();
});

// On phones, tapping the text box hides the tray so the keyboard has room
msgInput.addEventListener("focus", () => {
  if (isPhone()) setTray(false);
});
