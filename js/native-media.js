// Native camera / video handoff
import { gallery } from "./attachments.js";

// ── NATIVE CAMERA & VIDEO HANDOFF ──
function handleNativeMedia(event) {
  // Push the native photo or video into your existing attachment gallery
  Array.from(event.target.files).forEach(file => {
    window.addAttachmentFile(file);
  });
  // Reset so you can take another one immediately if needed
  event.target.value = ""; 
}

// Hook up both buttons to the same function
const photoUpload = document.getElementById("native-photo-upload");
const videoUpload = document.getElementById("native-video-upload");

if (photoUpload) photoUpload.addEventListener("change", handleNativeMedia);
if (videoUpload) videoUpload.addEventListener("change", handleNativeMedia);
