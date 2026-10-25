// Settings panel, profile save and avatar upload
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { appsScriptUrl } from "./config.js";
import { auth } from "./firebase.js";
import { getDirectImageUrl } from "./helpers.js";
import { renderSavedRepliesSettings } from "./saved-replies.js";
import { state } from "./state.js";

// ── SETTINGS ─────────────────────────────────────────────
document.getElementById("settings-toggle-btn").addEventListener("click", () => {
  renderSavedRepliesSettings();
  document.getElementById("settings-panel").style.display = "flex";
  window.location.hash = "settings"; // push for back-button intercept
  
  // ➔ CHANGED: Read from state.currentUser for Google Sign-In compatibility
  const currentUser = state.currentUser || auth.currentUser;
  
  if (currentUser) {
    document.getElementById("profile-nickname").value = currentUser.displayName || "";
    document.getElementById("profile-photo").value = currentUser.photoURL || "";
    
    // Fill avatar preview
    const photo = getDirectImageUrl(currentUser.photoURL || "");
    const img = document.getElementById("avatar-preview-img"), em = document.getElementById("avatar-preview-emoji");
    if (photo && (photo.startsWith("http") || photo.startsWith("data:"))) { 
      img.src = photo; 
      img.style.display = "block"; 
      em.style.display = "none"; 
    } else { 
      em.textContent = photo || "👤"; 
      em.style.display = "block"; 
      img.style.display = "none"; 
    }
  }
}, true);

document.getElementById("close-settings-btn").addEventListener("click", () => {
  document.getElementById("settings-panel").style.display = "none";
  if (window.location.hash === "#settings") window.history.back();
});

document.getElementById("save-profile-btn").addEventListener("click", async () => {
  const name = document.getElementById("profile-nickname").value;
  const photo = document.getElementById("profile-photo").value;
  const currentUser = state.currentUser || auth.currentUser;
  
  if (!currentUser) return;
  
  try {
    await updateProfile(currentUser, { displayName: name, photoURL: photo });
    document.getElementById("header-name").innerText = name;
    document.getElementById("sidebar-name").textContent = name;
    document.getElementById("settings-status").innerText = "✓ Profile updated";
    setTimeout(() => document.getElementById("settings-status").innerText = "", 3000);
  } catch(e) { console.error(e); }
});

// ── AVATAR UPLOAD ─────────────────────────────────────────
document.getElementById("avatar-file-input").addEventListener("change", async () => {
  const file = document.getElementById("avatar-file-input").files[0];
  const currentUser = state.currentUser || auth.currentUser;
  if (!currentUser) return;
  
  if (!file || file.size > 5 * 1024 * 1024) { document.getElementById("settings-status").innerText = "⚠ Max 5MB."; return; }
  const localUrl = URL.createObjectURL(file);
  document.getElementById("avatar-preview-img").src = localUrl;
  document.getElementById("avatar-preview-img").style.display = "block";
  document.getElementById("avatar-preview-emoji").style.display = "none";
  
  if (!appsScriptUrl) {
    const reader = new FileReader();
    reader.onload = async () => {
      await updateProfile(currentUser, { photoURL: reader.result });
      document.getElementById("profile-photo").value = reader.result;
      document.getElementById("settings-status").innerText = "✓ Photo updated";
      setTimeout(() => document.getElementById("settings-status").innerText = "", 3000);
    };
    reader.readAsDataURL(file);
    return;
  }
  document.getElementById("avatar-progress").classList.add("visible");
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await fetch(appsScriptUrl, { 
        method: "POST", 
        headers: { "Content-Type": "text/plain;charset=utf-8" }, 
        body: JSON.stringify({ 
          secret: state.uploadSecret, 
          base64: reader.result.split(",")[1], 
          mimeType: file.type, 
          fileName: "avatar_" + file.name 
        }) 
      });
      const result = await res.json();
      document.getElementById("avatar-progress").classList.remove("visible");
      if (result.status === "success") {
        await updateProfile(currentUser, { photoURL: result.url });
        document.getElementById("avatar-preview-img").src = getDirectImageUrl(result.url);
        document.getElementById("profile-photo").value = result.url;
        document.getElementById("settings-status").innerText = "✓ Photo updated";
        setTimeout(() => document.getElementById("settings-status").innerText = "", 3000);
      }
    } catch(e) { document.getElementById("avatar-progress").classList.remove("visible"); }
  };
  reader.readAsDataURL(file);
});