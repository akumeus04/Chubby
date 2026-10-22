// Keeps the app exactly as tall as the VISIBLE area, so the phone keyboard never
// covers the message box / send button, and keeps the chat pinned to the newest message.
const root = document.documentElement;
const vv = window.visualViewport;

function chatEl() { return document.getElementById("chat-window"); }

function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
}

function scrollToBottom() {
  const cw = chatEl();
  if (cw) cw.scrollTop = cw.scrollHeight;
}

function updateViewport() {
  const cw = chatEl();
  const stick = cw ? isNearBottom(cw) : false;   // were we reading the latest messages?

  const h = vv ? vv.height : window.innerHeight;
  const top = vv ? vv.offsetTop : 0;
  root.style.setProperty("--app-height", h + "px");
  root.style.setProperty("--app-top", top + "px");

  // iOS may scroll the whole page up when the keyboard opens - put it back.
  if (window.scrollY !== 0) window.scrollTo(0, 0);

  if (stick) requestAnimationFrame(scrollToBottom);
}

if (vv) {
  vv.addEventListener("resize", updateViewport);
  vv.addEventListener("scroll", updateViewport);
}
window.addEventListener("resize", updateViewport);
window.addEventListener("orientationchange", () => setTimeout(updateViewport, 250));
updateViewport();

// Tapping the box: once the keyboard has finished animating, show the newest message.
const input = document.getElementById("message-input");
if (input) {
  input.addEventListener("focus", () => {
    setTimeout(() => { updateViewport(); scrollToBottom(); }, 320);
  });
}
