// Message text formatter (links, YouTube embeds)

// ── TEXT FORMATTER ────────────────────────────────────────
export function formatMessageText(text) {
  if (!text) return "";
  let out = text, hasEmbed = false;
  
// YouTube 
  const ytRx = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})[^\s]*/g;
  out = out.replace(ytRx, (_, id) => {
    hasEmbed = true;
    const embedUrl = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&controls=1&modestbranding=1`;
    
    // ✨ FIX: Opens the high-quality iframe safely inside the Lightbox
    return `
      <br>
      <div class="media-thumb-wrap" 
           style="width:240px;height:135px;position:relative;overflow:hidden;border-radius:12px;margin-top:6px;background:#000;cursor:pointer;" 
           onclick="event.stopPropagation(); window.openLightbox('${embedUrl}', 'youtube');">
        
        <img src="https://img.youtube.com/vi/${id}/hqdefault.jpg" style="width:100%;height:100%;object-fit:cover;opacity:0.85;">
        
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
          <div style="background:rgba(255,0,0,0.9);color:#fff;width:48px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 12px rgba(0,0,0,0.5);">▶</div>
        </div>
        
      </div>`;
  });
  
  // TikTok
  const ttRx = /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)[^\s]*/g;
  out = out.replace(ttRx, (_, id) => { hasEmbed = true; return `<br><iframe src="https://www.tiktok.com/embed/v2/${id}" width="100%" height="380" frameborder="0" allow="fullscreen" scrolling="no" style="border-radius:12px;margin-top:8px;max-width:100%;background:#000;"></iframe>`; });
  
  // Spotify
  const spotRx = /(?:https?:\/\/)?(?:open\.)?spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)[^\s]*/g;
  out = out.replace(spotRx, (_, type, id) => { hasEmbed = true; return `<br><iframe style="border-radius:12px;margin-top:8px;" src="https://open.spotify.com/embed/${type}/${id}" width="100%" height="152" frameborder="0" allowfullscreen allow="autoplay;clipboard-write;encrypted-media;fullscreen;picture-in-picture"></iframe>`; });
  
  // Standard Links
  if (!hasEmbed) { out = out.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="chat-link" onclick="event.stopPropagation()">$1</a>'); }
  return out;
}
