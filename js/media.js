// Media bubble HTML rendering

// ── MEDIA RENDERING (FIXED FOR VIDEOS & LIGHTBOX) ─────────
export function buildMediaHtml(data) {
  if (!data.mediaUrl) return "";
  const rawUrl = data.mediaUrl, mime = data.mimeType || "";
  const isGif   = mime.includes("gif") || rawUrl.toLowerCase().includes(".gif");
  const isVideo  = mime.startsWith("video/") || /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(rawUrl);
  const isImage  = (mime.startsWith("image/") || /\.(jpg|jpeg|png|webp|heic)(\?|$)/i.test(rawUrl)) && !isGif;
  const isDrive  = rawUrl.includes("drive.google.com");
  
  let fileId = "";
  if (isDrive) { 
    const m1 = rawUrl.match(/\/file\/d\/([^\/]+)/), m2 = rawUrl.match(/[?&]id=([^&]+)/); 
    fileId = m1 ? m1[1] : (m2 ? m2[1] : ""); 
  }
  
if (isDrive && (isVideo || isGif)) {
    // Removed autoplay=1 to prevent browser blocking
    const prevUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
    const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
    
    // We now use window.openLightbox to launch the Drive player smoothly over the chat
    return `
      <div class="media-thumb-wrap" 
           style="width:240px;height:135px;position:relative;overflow:hidden;border-radius:12px;margin-top:6px;background:#000;cursor:pointer;" 
           onclick="window.openLightbox('${prevUrl}', 'video')">
        
        <img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;opacity:0.8;" onerror="this.style.display='none'">
        
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
          <div style="background:var(--accent);color:#fff;width:44px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 4px 12px rgba(0,0,0,0.5);">▶</div>
        </div>
        
      </div>
      <div style="margin-top:4px;font-size:11px;padding:0 4px;">
        <a href="${viewUrl}" target="_blank" class="chat-link" onclick="event.stopPropagation()">↗ Open in Drive</a>
      </div>`;
  }
  
  if (isDrive && isImage) { 
    const imgUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`; 
    return `<div class="media-thumb-wrap" onclick="window.openLightbox('${imgUrl}','image')"><img class="media-img" src="${imgUrl}" loading="lazy"></div>`; 
  }
  
  // FIX 2: Standard videos now pop up in Lightbox. 
  // Inline controls were getting blocked by the Swipe-To-Reply pointer capture.
  if (isVideo) {
    return `<div class="media-thumb-wrap" onclick="window.openLightbox('${rawUrl}', 'video')" style="position:relative;cursor:pointer;background:#000;">
              <video class="media-video" src="${rawUrl}#t=0.1" preload="metadata" playsinline style="pointer-events:none;"></video>
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                <div style="background:rgba(0,0,0,0.6);color:#fff;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;">▶</div>
              </div>
            </div>`;
  }

  if (isImage || isGif) return `<div class="media-thumb-wrap" onclick="window.openLightbox('${rawUrl}','image')"><img class="media-img" src="${rawUrl}" loading="lazy"></div>`;
  
  return `<a class="media-drive-card" href="${rawUrl}" target="_blank" onclick="event.stopPropagation()"><span class="media-drive-icon">📎</span><div><div class="media-drive-name">View attachment</div><div class="media-drive-sub">Tap to open</div></div></a>`;
}
