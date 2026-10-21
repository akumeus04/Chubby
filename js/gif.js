// GIF search (Giphy)
import { collection, addDoc, query, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { GIPHY_API_KEY } from "./config.js";
import { db } from "./firebase.js";
import { closeAllPanels } from "./helpers.js";
import { state } from "./state.js";

function buildGifGrid(results) {
  const grid = document.getElementById("gif-grid");
  if (!results || !results.length) { grid.innerHTML = '<div class="gif-loading">No results found</div>'; return; }
  
  grid.innerHTML = results.map(r => {
    const animUrl    = r.images?.original?.url || "";
    const previewUrl = r.images?.fixed_height_small?.url || animUrl;
    if (!animUrl) return "";
    return `<div class="gif-item" data-anim="${animUrl}">
      <img src="${previewUrl}" loading="lazy" alt="${r.title || "gif"}">
    </div>`;
  }).filter(Boolean).join("");
  
  grid.querySelectorAll(".gif-item").forEach(item => {
    item.addEventListener("click", e => { 
      e.stopPropagation(); 
      sendGif(item.dataset.anim); 
    });
  });
}

async function searchGifs(query) {
  const grid = document.getElementById("gif-grid");
  grid.innerHTML = '<div class="gif-loading"><span class="loader"></span></div>';
  try {
    // Increased limit to 50 for plenty of scrolling!
    const res  = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&limit=50&q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    buildGifGrid(data.data);
  } catch(e) {
    console.error("GIF search:", e);
    grid.innerHTML = `<div class="gif-loading" style="color:var(--danger);">Error: ${e.message}</div>`;
  }
}

async function loadTrendingGifs() {
  const grid = document.getElementById("gif-grid");
  grid.innerHTML = '<div class="gif-loading"><span class="loader"></span></div>';
  try {
    // Increased limit to 50 for plenty of scrolling!
    const res  = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=50`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    buildGifGrid(data.data);
  } catch(e) {
    console.error("GIF trending:", e);
    grid.innerHTML = `<div class="gif-loading" style="color:var(--danger);">Error: ${e.message}</div>`;
  }
}

async function sendGif(gifUrl) {
  if (!state.currentUser || !gifUrl) return;
  closeAllPanels();
  await addDoc(collection(db, "messages"), {
    senderId: state.currentUser.uid,
    senderName: state.currentUser.displayName || state.currentUser.email.split("@")[0],
    senderPhoto: state.currentUser.photoURL || "",
    mediaUrl: gifUrl,
    mimeType: "image/gif",
    timestamp: serverTimestamp()
  });
}

document.getElementById("gif-btn").addEventListener("click", e => {
  e.stopPropagation();
  const p = document.getElementById("gif-panel");
  const isVisible = p.classList.contains("visible");
  closeAllPanels();
  if (!isVisible) {
    p.classList.add("visible");
    document.getElementById("gif-btn").classList.add("active");
    loadTrendingGifs();
  }
});

document.getElementById("gif-panel").addEventListener("click", e => e.stopPropagation());

document.getElementById("gif-search-btn").addEventListener("click", e => {
  e.stopPropagation();
  const q = document.getElementById("gif-search-input").value.trim();
  if (q) searchGifs(q); else loadTrendingGifs();
});

document.getElementById("gif-search-input").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("gif-search-btn").click();
});
