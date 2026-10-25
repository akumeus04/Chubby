// Long-press belongs to the app, not the browser.
// On Android (Chrome / WebView) a long-press on text normally starts text selection and shows
// Google's "Search / Copy / Share" bar (and a link/image menu). We switch that off inside the
// chat so a long-press only opens OUR message menu (reply, react, copy, edit, delete).
const chat = document.getElementById("chat-window");

// 1) No native context menu inside the chat (right-click still opens our own menu)
chat.addEventListener("contextmenu", (e) => { e.preventDefault(); }, true);

// 2) No text-selection handles / Google popup when pressing and holding on a message
chat.addEventListener("selectstart", (e) => {
  if (window.matchMedia("(pointer: coarse)").matches) e.preventDefault();
}, true);

// 3) No image/link dragging ghost on long-press
chat.addEventListener("dragstart", (e) => { e.preventDefault(); }, true);

// 4) If a selection sneaks in anyway (some Android builds), clear it right away
document.addEventListener("selectionchange", () => {
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  const sel = window.getSelection && window.getSelection();
  if (!sel || sel.isCollapsed || !sel.anchorNode) return;
  const node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
  if (node && node.closest && node.closest("#chat-window")) sel.removeAllRanges();
});
