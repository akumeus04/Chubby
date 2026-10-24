// Small shared helpers

// ── HELPERS ──────────────────────────────────────────────
export function getDirectImageUrl(url) {
  if (url && url.includes("drive.google.com")) {
    const m1 = url.match(/\/file\/d\/([^\/]+)/);
    const m2 = url.match(/[?&]id=([^&]+)/);
    const id = m1 ? m1[1] : (m2 ? m2[1] : "");
    if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
  }
  return url;
}

export function closeAllPanels(except) {
  if (except !== "emoji") document.getElementById("emoji-panel").classList.remove("visible");
  if (except !== "gif")   document.getElementById("gif-panel").classList.remove("visible");
  if (except !== "saved") document.getElementById("saved-replies-panel").classList.remove("visible");
  document.getElementById("emoji-btn").classList.toggle("active", false);
  document.getElementById("gif-btn").classList.toggle("active", false);
  document.getElementById("saved-btn").classList.toggle("active", false);
}

export function removeContextMenu() {
  document.querySelectorAll(".context-menu").forEach(el => el.remove());
}
