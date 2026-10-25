// Media bubble HTML rendering with Photo Album Grid support
// Fixes inline HTML quote escaping bug via openAlbumLightbox & URL-encoded data-album

// ── GLOBAL ALBUM LIGHTBOX HANDLER (CLEAN, NO INLINE QUOTES) ──
if (typeof window !== "undefined") {
  window._chatAlbumStore = window._chatAlbumStore || {};
  window.openAlbumLightbox = function(el, index) {
    if (!el) return;
    const idx = typeof index === "number" ? index : (parseInt(index, 10) || 0);
    const grid = el.closest ? el.closest(".media-album-grid") : el;
    if (!grid) return;

    // 1. Fast in-memory cache lookup
    const albumKey = grid.getAttribute("data-album-key");
    if (albumKey && window._chatAlbumStore && window._chatAlbumStore[albumKey]) {
      if (typeof window.openLightbox === "function") {
        window.openLightbox(window._chatAlbumStore[albumKey], "image", idx);
        return;
      }
    }

    // 2. URI-encoded data attribute fallback (survives DOM refreshes)
    const raw = grid.getAttribute("data-album");
    if (raw) {
      try {
        const urls = JSON.parse(decodeURIComponent(raw));
        if (Array.isArray(urls) && urls.length > 0 && typeof window.openLightbox === "function") {
          window.openLightbox(urls, "image", idx);
          return;
        }
      } catch (err) {
        console.error("openAlbumLightbox decoding error:", err);
      }
    }

    // 3. Fallback: collect all img sources in this grid
    const imgs = Array.from(grid.querySelectorAll("img.album-img")).map(img => img.src).filter(Boolean);
    if (imgs.length > 0 && typeof window.openLightbox === "function") {
      window.openLightbox(imgs, "image", idx);
    }
  };
}

// ── RESOLVE DRIVE OR THUMBNAIL URLS ───────────────────────
export function resolveMediaUrl(rawUrl) {
  if (!rawUrl) return "";
  if (rawUrl.includes("drive.google.com")) {
    const m1 = rawUrl.match(/\/file\/d\/([^\/]+)/);
    const m2 = rawUrl.match(/[?&]id=([^&]+)/);
    const fileId = m1 ? m1[1] : (m2 ? m2[1] : "");
    if (fileId) return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
  }
  return rawUrl;
}

// ── INJECT ALBUM GRID STYLES (ONCE) ───────────────────────
function injectAlbumStyles() {
  if (typeof document === 'undefined' || document.getElementById('chubby-album-styles')) return;
  const style = document.createElement('style');
  style.id = 'chubby-album-styles';
  style.textContent = `
    .media-album-grid {
      display: grid;
      gap: 4px;
      border-radius: 14px;
      overflow: hidden;
      max-width: 280px;
      margin-top: 6px;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.08);
      user-select: none;
    }
    .media-album-grid.grid-2 {
      grid-template-columns: 1fr 1fr;
      aspect-ratio: 2/1;
    }
    .media-album-grid.grid-3 {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1.25fr 1fr;
    }
    .media-album-grid.grid-3 .span-2 {
      grid-column: span 2;
      aspect-ratio: 16/9;
    }
    .media-album-grid.grid-4 {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      aspect-ratio: 1/1;
    }
    .album-thumb-wrap {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      cursor: pointer;
      background: #09090b;
    }
    .album-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.25s ease, opacity 0.25s ease;
    }
    .album-thumb-wrap:hover .album-img {
      transform: scale(1.04);
      opacity: 0.92;
    }
    .album-more-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.68);
      backdrop-filter: blur(2px);
      color: #ffffff;
      font-size: 20px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
    }
  `;
  document.head.appendChild(style);
}

// ── PHOTO ALBUM GRID BUILDER ──────────────────────────────
function buildPhotoGridHtml(urls, data) {
  injectAlbumStyles();

  const resolved = urls.map(u => resolveMediaUrl(u)).filter(Boolean);
  const count = resolved.length;
  if (count === 0) return "";

  // Unique key for in-memory store + URI-encoded string for HTML attribute (no quotes or brackets!)
  const albumKey = "alb_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  if (typeof window !== "undefined") {
    window._chatAlbumStore = window._chatAlbumStore || {};
    window._chatAlbumStore[albumKey] = resolved;
  }
  const encodedAlbum = encodeURIComponent(JSON.stringify(resolved));

  // 2 Photos: Side-by-side
  if (count === 2) {
    return `
      <div class="media-album-grid grid-2" data-album-key="${albumKey}" data-album="${encodedAlbum}" onclick="event.stopPropagation()">
        ${resolved.map((url, i) => `
          <div class="album-thumb-wrap" onclick="window.openAlbumLightbox(this, ${i})">
            <img src="${url}" class="album-img" loading="lazy" alt="Photo ${i + 1}">
          </div>
        `).join('')}
      </div>
    `;
  }

  // 3 Photos: 1 wide top, 2 split bottom
  if (count === 3) {
    return `
      <div class="media-album-grid grid-3" data-album-key="${albumKey}" data-album="${encodedAlbum}" onclick="event.stopPropagation()">
        <div class="album-thumb-wrap span-2" onclick="window.openAlbumLightbox(this, 0)">
          <img src="${resolved[0]}" class="album-img" loading="lazy" alt="Photo 1">
        </div>
        <div class="album-thumb-wrap" onclick="window.openAlbumLightbox(this, 1)">
          <img src="${resolved[1]}" class="album-img" loading="lazy" alt="Photo 2">
        </div>
        <div class="album-thumb-wrap" onclick="window.openAlbumLightbox(this, 2)">
          <img src="${resolved[2]}" class="album-img" loading="lazy" alt="Photo 3">
        </div>
      </div>
    `;
  }

  // 4+ Photos: 2x2 grid with +N on 4th image
  const displayPhotos = resolved.slice(0, 4);
  const remaining = count - 4;

  return `
    <div class="media-album-grid grid-4" data-album-key="${albumKey}" data-album="${encodedAlbum}" onclick="event.stopPropagation()">
      ${displayPhotos.map((url, i) => {
        const isLast = i === 3 && remaining > 0;
        return `
          <div class="album-thumb-wrap" onclick="window.openAlbumLightbox(this, ${i})">
            <img src="${url}" class="album-img" loading="lazy" alt="Photo ${i + 1}">
            ${isLast ? `<div class="album-more-overlay">+${remaining + 1}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ── MEDIA RENDERING (FIXED FOR MULTI-PHOTO ALBUMS, VIDEOS & LIGHTBOX) ──
export function buildMediaHtml(data, secondaryMime) {
  if (!data) return "";

  // Normalize string calls e.g. buildMediaHtml(url, mime)
  if (typeof data === "string") {
    data = { mediaUrl: data, mimeType: secondaryMime || "" };
  }

  // 1. Gather all possible URL sources for multi-photo albums
  let urls = [];
  if (Array.isArray(data.mediaUrls) && data.mediaUrls.length > 0) {
    urls = data.mediaUrls.map(u => (typeof u === "string" ? u : (u?.url || ""))).filter(Boolean);
  } else if (Array.isArray(data.mediaItems) && data.mediaItems.length > 0) {
    urls = data.mediaItems.map(u => (typeof u === "string" ? u : (u?.url || ""))).filter(Boolean);
  } else if (Array.isArray(data.images) && data.images.length > 0) {
    urls = data.images.map(u => (typeof u === "string" ? u : (u?.url || ""))).filter(Boolean);
  } else if (typeof data.mediaUrls === "string" && data.mediaUrls.trim()) {
    const trimmed = data.mediaUrls.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) urls = parsed.map(u => (typeof u === "string" ? u : (u?.url || ""))).filter(Boolean);
      } catch (_) {}
    } else if (trimmed.includes(",")) {
      urls = trimmed.split(",").map(s => s.trim()).filter(Boolean);
    } else {
      urls = [trimmed];
    }
  } else if (data.mediaUrl) {
    urls = [data.mediaUrl];
  }

  // 2. If more than 1 URL, render the Photo Album Grid!
  if (urls.length > 1) {
    return buildPhotoGridHtml(urls, data);
  }

  // 3. Single URL fallback: ensure data.mediaUrl is set
  if (urls.length === 1 && !data.mediaUrl) {
    data.mediaUrl = urls[0];
  }

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
    const prevUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
    const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
    
    return `
      <div class="media-thumb-wrap" 
           style="width:240px;height:135px;position:relative;overflow:hidden;border-radius:12px;margin-top:6px;background:#000;cursor:pointer;" 
           data-media-url="${prevUrl}"
           onclick="window.openLightbox(this.getAttribute('data-media-url'), 'video')">
        
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
    return `<div class="media-thumb-wrap" data-media-url="${imgUrl}" onclick="window.openLightbox(this.getAttribute('data-media-url'),'image')"><img class="media-img" src="${imgUrl}" loading="lazy"></div>`; 
  }
  
  if (isVideo) {
    return `<div class="media-thumb-wrap" data-media-url="${rawUrl}" onclick="window.openLightbox(this.getAttribute('data-media-url'), 'video')" style="position:relative;cursor:pointer;background:#000;">
              <video class="media-video" src="${rawUrl}#t=0.1" preload="metadata" playsinline style="pointer-events:none;"></video>
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                <div style="background:rgba(0,0,0,0.6);color:#fff;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;">▶</div>
              </div>
            </div>`;
  }

  if (isImage || isGif) {
    return `<div class="media-thumb-wrap" data-media-url="${rawUrl}" onclick="window.openLightbox(this.getAttribute('data-media-url'),'image')"><img class="media-img" src="${rawUrl}" loading="lazy"></div>`;
  }
  
  return buildDocumentCard(data, rawUrl, mime, fileId);
}

// ── DOCUMENT / FILE CARD ──────────────────────────────────
const escHtml = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function docKind(name, mime) {
  const n = (name || "").toLowerCase(), t = mime || "";
  if (t === "application/pdf" || n.endsWith(".pdf")) return ["📕", "PDF"];
  if (/\.(docx?|rtf|odt|pages)$/.test(n) || t.includes("word")) return ["📘", "Word"];
  if (/\.(xlsx?|csv|ods|numbers)$/.test(n) || t.includes("sheet") || t.includes("excel")) return ["📗", "Spreadsheet"];
  if (/\.(pptx?|odp|key)$/.test(n) || t.includes("presentation") || t.includes("powerpoint")) return ["📙", "Slides"];
  if (/\.(zip|rar|7z|tar|gz)$/.test(n) || t.includes("zip") || t.includes("compressed")) return ["🗜️", "Archive"];
  if (t.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|aac)$/.test(n)) return ["🎵", "Audio"];
  if (/\.(txt|md|json|xml|log)$/.test(n) || t.startsWith("text/")) return ["📄", "Text"];
  return ["📎", "File"];
}
function prettyBytes(b) {
  if (!b && b !== 0) return "";
  if (b < 1024) return b + " B";
  if (b < 1048576) return Math.round(b / 1024) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}
function buildDocumentCard(data, rawUrl, mime, fileId) {
  let name = data.fileName;
  if (!name) { try { name = decodeURIComponent((rawUrl.split("?")[0].split("/").pop()) || ""); } catch (_) { name = ""; } }
  if (!name || (fileId && name === "view")) name = "Document";
  const [icon, label] = docKind(name, mime);
  const size = prettyBytes(data.fileSize);
  const viewUrl = fileId ? `https://drive.google.com/file/d/${fileId}/view` : rawUrl;
  const dlUrl   = fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : rawUrl;
  return `<div class="doc-card" onclick="event.stopPropagation()">
    <a class="doc-card-main" href="${viewUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
      <span class="doc-card-icon">${icon}</span>
      <span class="doc-card-text"><span class="doc-card-name">${escHtml(name)}</span><span class="doc-card-meta">${label}${size ? " · " + size : ""}</span></span>
    </a>
    <a class="doc-card-dl" href="${dlUrl}" target="_blank" rel="noopener" download title="Download" onclick="event.stopPropagation()">⬇</a>
  </div>`;
}

if (typeof window !== "undefined") {
  window.buildMediaHtml = buildMediaHtml;
}
