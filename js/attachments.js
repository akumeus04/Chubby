// Multiple-file attach & preview gallery
import { state } from "./state.js";

// ── MULTIPLE FILE ATTACH & PREVIEW ────────────────────────
export const mediaUpload = document.getElementById("media-upload");
export const gallery = document.getElementById("attachments-gallery");

mediaUpload.addEventListener("change", () => {
  // Add newly selected files to our array
  Array.from(mediaUpload.files).forEach(file => state.selectedFiles.push(file));
  mediaUpload.value = ""; // Reset input so you can select the same file again if needed
  renderAttachmentGallery();
});

export function renderAttachmentGallery() {
  gallery.innerHTML = "";
  if (state.selectedFiles.length > 0) {
    gallery.classList.add("has-files");
    state.selectedFiles.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");

      const mediaHtml = isVideo
        ? `<video src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;"></video>`
        : `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;

      // Edit button: always visible for images (no hover needed — works on touch)
      const editBtn = isImage
        ? `<button class="edit-attachment-btn" onclick="window.editAttachment(${index})" title="Edit image">🎨</button>`
        : "";

      gallery.innerHTML += `
        <div class="attachment-thumb-wrap">
          ${mediaHtml}
          ${editBtn}
          <button class="remove-attachment-btn" onclick="window.removeAttachment(${index})">✕</button>
        </div>
      `;
    });
  } else {
    gallery.classList.remove("has-files");
  }
}

// ── NEW: THE BRIDGE FOR EXTERNAL FILES (LIKE CAMERA.JS) ──
window.addAttachmentFile = function(file) {
  state.selectedFiles.push(file);
  renderAttachmentGallery();
};

// ── IMAGE EDITOR ENGINE ──────────────────────────────────
function dataURLtoFile(dataurl, filename) {
  try {
    // If Filerobot forgets the prefix, add a default one
    if (!dataurl.includes(",")) {
      dataurl = "data:image/jpeg;base64," + dataurl;
    }
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, { type: mime });
  } catch(err) {
    console.error("dataURLtoFile error:", err);
    return null;
  }
}

// Make removeAttachment globally accessible
window.removeAttachment = function(index) {
  state.selectedFiles.splice(index, 1);
  renderAttachmentGallery();
};

// Edit an attachment before sending
window.editAttachment = function(index) {
  const file = state.selectedFiles[index];
  if (!file || !file.type.startsWith("image/")) return;

  const blobUrl = URL.createObjectURL(file);

  openImageEditor(blobUrl, (newDataUrl) => {
    const newFile = dataURLtoFile(newDataUrl, "edited_" + file.name);
    if (newFile) {
      state.selectedFiles[index] = newFile;
      renderAttachmentGallery();
    }
    URL.revokeObjectURL(blobUrl); // Cleanup memory
  });
};
