// Chat background picker, overlay slider and global-preferences sync
import { onSnapshot, serverTimestamp, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { app, db } from "./firebase.js";
import { gallery } from "./attachments.js";

// 2. The function triggered when tapping the preview box
window.triggerNativeBackgroundPicker = async function() {
  if (window.Capacitor && Capacitor.getPlatform() !== 'web') {
    try {
      const image = await window.Capacitor.Plugins.Camera.getPhoto({
        quality: 60,
        allowEditing: false,
        resultType: 'base64',
        source: 'PHOTOS',
        width: 1080
      });

      const base64Data = `data:image/${image.format};base64,${image.base64String}`;

      window.openPaintEditor(base64Data, async (editedBase64) => {
        document.getElementById('bg-preview-img').src = editedBase64;
        document.getElementById('bg-preview-img').style.display = 'block';
        document.getElementById('bg-preview-placeholder').style.display = 'none';
        await saveGlobalBackground(editedBase64);
      });

    } catch (error) {
      console.log("User cancelled gallery picker or error:", error);
    }
  } else {
    alert("Native picking is only available inside the Android app.");
  }
};

// 3. Save to Firebase (image + current overlay value together)
async function saveGlobalBackground(imageBase64) {
  try {
    const overlay = parseInt(document.getElementById('bg-overlay-slider')?.value || 0);
    const settingsRef = doc(db, "settings", "global_preferences");
    await setDoc(settingsRef, {
      chatBackgroundUrl: imageBase64,
      overlayValue: overlay,
      updatedAt: serverTimestamp()
    }, { merge: true });
    console.log("Global background updated!");
  } catch (error) {
    console.error("Error saving background:", error);
  }
}

// 4. Remove Background Function
window.removeGlobalBackground = async function() {
  document.getElementById('bg-preview-img').src = "";
  document.getElementById('bg-preview-img').style.display = 'none';
  document.getElementById('bg-preview-placeholder').style.display = 'block';
  const slider = document.getElementById('bg-overlay-slider');
  const valLabel = document.getElementById('bg-overlay-val');
  if (slider) slider.value = 0;
  if (valLabel) valLabel.textContent = '0%';
  applyBackground(null, 0);

  try {
    const settingsRef = doc(db, "settings", "global_preferences");
    await setDoc(settingsRef, {
      chatBackgroundUrl: null,
      overlayValue: 0,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("Error removing background:", error);
  }
};


// Listen to the global preferences document
const globalSettingsRef = doc(db, "settings", "global_preferences");

onSnapshot(globalSettingsRef, (docSnap) => {
  if (docSnap.exists()) {
    const data = docSnap.data();
    const overlay = data.overlayValue || 0;

    if (data.chatBackgroundUrl) {
      // Route through applyBackground so the CSS variable on #chat-window is set correctly
      applyBackground(data.chatBackgroundUrl, overlay);

      // Sync the slider UI to the stored value
      const slider = document.getElementById('bg-overlay-slider');
      const valLabel = document.getElementById('bg-overlay-val');
      if (slider) slider.value = overlay;
      if (valLabel) valLabel.textContent = overlay + '%';

      // Update the settings preview box if open
      const previewImg = document.getElementById('bg-preview-img');
      if (previewImg) {
        previewImg.src = data.chatBackgroundUrl;
        previewImg.style.display = 'block';
        const ph = document.getElementById('bg-preview-placeholder');
        if (ph) ph.style.display = 'none';
      }
    } else {
      applyBackground(null, 0);
      const slider = document.getElementById('bg-overlay-slider');
      const valLabel = document.getElementById('bg-overlay-val');
      if (slider) slider.value = 0;
      if (valLabel) valLabel.textContent = '0%';
    }
  }
});

// ── CUSTOM BACKGROUND UPLOAD ──────────────────────────────
function applyBackground(dataUrl, overlay) {
  const cw = document.getElementById("chat-window");
  
  // Calculate how dark it should be based on the slider (0 to 0.8)
  const alpha = (overlay || 0) / 100;
  const overlayColor = alpha > 0 ? `rgba(0,0,0,${alpha})` : "transparent";
  
  if (dataUrl) {
    // 🪄 MAGIC: Combine the dark tint and the image into ONE layer
    const combinedBg = `linear-gradient(${overlayColor}, ${overlayColor}), url('${dataUrl}')`;
    
    cw.style.setProperty("--chat-bg-image", combinedBg);
    document.documentElement.style.setProperty("--chat-bg-image", combinedBg);
  } else {
    cw.style.removeProperty("--chat-bg-image");
    document.documentElement.style.setProperty("--chat-bg-image", "none");
  }
  
  // Keep this here so your settings preview box also gets the dark effect!
  document.documentElement.style.setProperty("--chat-bg-overlay", overlayColor);
}

// Background handled via triggerNativeBackgroundPicker() → openPaintEditor() → saveGlobalBackground()
// and removeGlobalBackground() — both wired directly in HTML onclick.

let _overlayDebounce = null;
document.getElementById("bg-overlay-slider").addEventListener("input", () => {
  const val = parseInt(document.getElementById("bg-overlay-slider").value);
  document.getElementById("bg-overlay-val").textContent = val + "%";

  // Apply visually right away using whatever background is currently shown
  const previewImg = document.getElementById('bg-preview-img');
  const currentBg = previewImg && previewImg.style.display !== 'none' ? previewImg.src : null;
  applyBackground(currentBg || null, val);

  // Debounce Firebase write — only persist after user stops dragging for 600ms
  clearTimeout(_overlayDebounce);
  _overlayDebounce = setTimeout(async () => {
    if (!currentBg) return; // no background set — nothing to save
    try {
      const settingsRef = doc(db, "settings", "global_preferences");
      await setDoc(settingsRef, { overlayValue: val, updatedAt: serverTimestamp() }, { merge: true });
    } catch(e) { console.error("Error saving overlay:", e); }
  }, 600);
});
