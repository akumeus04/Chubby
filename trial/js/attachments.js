// Multiple-file attach & preview gallery
import { state } from "./state.js";

// ── MULTIPLE FILE ATTACH & PREVIEW ────────────────────────
export const mediaUpload = document.getElementById("media-upload");
export const gallery = document.getElementById("attachments-gallery");

export const docUpload = document.getElementById("doc-upload");

export const MAX_FILE_BYTES = 10 * 1024 * 1024;   // 10 MB per file (Apps Script upload limit)

// ── FILE HELPERS ──────────────────────────────────────────
export function fileKind(file) {
  const t = file.type || "", n = (file.name || "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (/\.(docx?|rtf|odt|pages)$/.test(n)) return "word";
  if (/\.(xlsx?|csv|ods|numbers)$/.test(n)) return "sheet";
  if (/\.(pptx?|odp|key)$/.test(n)) return "slides";
  if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return "zip";
  if (/\.(txt|md|json|xml|log)$/.test(n)) return "text";
  return "file";
}
const KIND_ICON  = { pdf: "📕", word: "📘", sheet: "📗", slides: "📙", zip: "🗜️", text: "📄", audio: "🎵", file: "📎" };
const KIND_LABEL = { pdf: "PDF", word: "Word", sheet: "Sheet", slides: "Slides", zip: "Archive", text: "Text", audio: "Audio", file: "File" };
export const fileIcon = kind => KIND_ICON[kind] || "📎";
export function prettySize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}
const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg) {
  const el = document.getElementById("status-text");
  if (!el) return;
  el.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 4000);
}

// ONE entry point for every way of adding files: picker, paste, drag & drop, camera.
export function addFiles(fileList) {
  const files = Array.from(fileList || []);
  let skipped = 0, added = 0;
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) { skipped++; continue; }
    if (!f.name || f.name === "image.png" || f.name === "blob") {
      // Screenshots pasted from the clipboard arrive unnamed — give them a friendly name
      const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
      const d = new Date(), pad = n => String(n).padStart(2, "0");
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      state.selectedFiles.push(new File([f], `screenshot-${stamp}.${ext}`, { type: f.type || "image/png" }));
    } else state.selectedFiles.push(f);
    added++;
  }
  if (skipped) toast(`⚠ ${skipped} file${skipped > 1 ? "s" : ""} skipped — max 10 MB each.`);
  renderAttachmentGallery();
  return { added, skipped };
}

mediaUpload.addEventListener("change", () => { addFiles(mediaUpload.files); mediaUpload.value = ""; });
if (docUpload) docUpload.addEventListener("change", () => { addFiles(docUpload.files); docUpload.value = ""; });

export function renderAttachmentGallery() {
  gallery.innerHTML = "";
  if (state.selectedFiles.length > 0) {
    gallery.classList.add("has-files");
    state.selectedFiles.forEach((file, index) => {
      const kind = fileKind(file);
      const wrap = document.createElement("div");
      wrap.className = "attachment-thumb-wrap" + (kind === "image" || kind === "video" ? "" : " is-doc");

      if (kind === "image" || kind === "video") {
        const url = URL.createObjectURL(file);
        wrap.innerHTML = kind === "video"
          ? `<video src="${url}" muted playsinline style="width:100%;height:100%;object-fit:cover;border-radius:12px;"></video><span class="att-badge">▶</span>`
          : `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`;
      } else {
        wrap.innerHTML = `
          <div class="att-doc">
            <div class="att-doc-icon">${fileIcon(kind)}</div>
            <div class="att-doc-name">${esc(file.name)}</div>
            <div class="att-doc-meta">${KIND_LABEL[kind]} · ${prettySize(file.size)}</div>
          </div>`;
      }
      if (kind === "image") {
        wrap.insertAdjacentHTML("beforeend", `<button class="edit-attachment-btn" type="button" onclick="window.editAttachment(${index})" title="Edit image">✏️</button>`);
      }
      wrap.insertAdjacentHTML("beforeend", `<button class="remove-attachment-btn" type="button" onclick="window.removeAttachment(${index})" title="Remove">✕</button>`);
      gallery.appendChild(wrap);
    });
  } else {
    gallery.classList.remove("has-files");
  }
}

// ── BRIDGE FOR EXTERNAL FILES (camera.js etc.) ───────────
window.addAttachmentFile = function(file) { addFiles([file]); };

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
