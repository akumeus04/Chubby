// formatter.js — Universal Social Media & Rich Media Text Formatter for Messenger
// Transforms social media links (YouTube, YouTube Shorts, Instagram Reels/Posts,
// TikTok, Twitter/X, Facebook Videos/Reels, Spotify, Apple Music, SoundCloud,
// Twitch, Vimeo, and direct MP4/MP3) into responsive, playable media inside chat bubbles.

// ── INJECT EMBED & LIGHTBOX STYLES (ONCE) ─────────────────────
(function injectPlayerStyles() {
  if (typeof document === 'undefined' || document.getElementById('chubby-player-styles')) return;
  const style = document.createElement('style');
  style.id = 'chubby-player-styles';
  style.textContent = `
    .chat-embed-wrap {
      display: block;
      margin-top: 8px;
      margin-bottom: 4px;
      max-width: 100%;
      border-radius: 14px;
      overflow: hidden;
      background: #09090b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
      font-family: system-ui, -apple-system, sans-serif;
      user-select: none;
    }
    .chat-embed-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background: rgba(18, 18, 22, 0.85);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 11px;
      font-weight: 600;
      color: #94a3b8;
    }
    .chat-embed-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: #f1f5f9;
      font-weight: 700;
    }
    .chat-embed-badge svg {
      width: 14px;
      height: 14px;
    }
    .chat-embed-thumb {
      position: relative;
      width: 100%;
      background: #000;
      cursor: pointer;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .chat-embed-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.88;
      transition: transform 0.3s ease, opacity 0.3s ease;
      display: block;
    }
    .chat-embed-thumb:hover img {
      transform: scale(1.03);
      opacity: 0.98;
    }
    .chat-embed-play-btn {
      position: absolute;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(244, 63, 94, 0.92);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 4px 20px rgba(244, 63, 94, 0.5);
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s;
    }
    .chat-embed-thumb:hover .chat-embed-play-btn {
      transform: scale(1.12);
      background: #f43f5e;
    }
    .chat-embed-iframe {
      width: 100%;
      border: none;
      display: block;
      background: #000;
    }
    .chat-link {
      color: #38bdf8;
      text-decoration: underline;
      text-underline-offset: 2px;
      word-break: break-all;
    }
    .chat-link:hover {
      color: #7dd3fc;
    }
    /* Native direct video/audio */
    .chat-direct-video {
      width: 100%;
      max-width: 320px;
      border-radius: 12px;
      margin-top: 8px;
      background: #000;
      display: block;
    }
    .chat-direct-audio {
      width: 100%;
      min-width: 240px;
      max-width: 300px;
      margin-top: 8px;
      display: block;
      accent-color: #f43f5e;
    }
    /* Fallback Lightbox Modal */
    #chubby-lightbox-modal {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: rgba(0, 0, 0, 0.92);
      backdrop-filter: blur(14px);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      padding: 16px;
      touch-action: none;
    }
    #chubby-lightbox-modal .lightbox-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
      border: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }
    #chubby-lightbox-modal .lightbox-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    #chubby-lightbox-modal .lightbox-content {
      width: 100%;
      max-width: 860px;
      aspect-ratio: 16/9;
      background: #000;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 16px 64px rgba(0, 0, 0, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    #chubby-lightbox-modal .lightbox-content iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
  `;
  document.head.appendChild(style);
})();

// ── FALLBACK LIGHTBOX MANAGER ─────────────────────────────────
if (typeof window !== 'undefined' && !window.openLightbox) {
  window.openLightbox = function (embedUrl, type) {
    let modal = document.getElementById('chubby-lightbox-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'chubby-lightbox-modal';
      modal.innerHTML = `
        <button class="lightbox-close" title="Close player">✕</button>
        <div class="lightbox-content">
          <iframe id="chubby-lightbox-iframe" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
        </div>
      `;
      modal.querySelector('.lightbox-close').addEventListener('click', () => {
        const frame = document.getElementById('chubby-lightbox-iframe');
        if (frame) frame.src = 'about:blank';
        modal.style.display = 'none';
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          const frame = document.getElementById('chubby-lightbox-iframe');
          if (frame) frame.src = 'about:blank';
          modal.style.display = 'none';
        }
      });
      document.body.appendChild(modal);
    }

    const iframe = document.getElementById('chubby-lightbox-iframe');
    if (iframe) iframe.src = embedUrl;
    modal.style.display = 'flex';
  };
}

// ── INLINE PLAY MEDIA ACTIVATOR ───────────────────────────────
if (typeof window !== 'undefined' && !window.playInlineSocialMedia) {
  window.playInlineSocialMedia = function (elId, embedUrl, height) {
    const container = document.getElementById(elId);
    if (!container) return;
    const h = height || 220;
    container.innerHTML = `
      <iframe src="${embedUrl}" 
              width="100%" 
              height="${h}" 
              class="chat-embed-iframe" 
              frameborder="0" 
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" 
              allowfullscreen 
              style="height:${h}px;border-radius:0 0 14px 14px;"></iframe>`;
  };
}

// ── SVG ICONS FOR SOCIAL MEDIA BADGES ─────────────────────────
const ICONS = {
  youtube: `<svg viewBox="0 0 24 24" fill="#ef4444"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" fill="#06b6d4"><path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-2.901 2.893 2.892 2.892 0 0 1-2.893-2.893 2.893 2.893 0 0 1 2.893-2.892c.382 0 .74.072 1.07.202V9.452a6.34 6.34 0 0 0-1.07-.091A6.338 6.338 0 0 0 3 15.699 6.338 6.338 0 0 0 9.338 22a6.338 6.338 0 0 0 6.338-6.301v-6.91a8.212 8.212 0 0 0 4.912 1.62v-3.723h-.999z"/></svg>`,
  spotify: `<svg viewBox="0 0 24 24" fill="#10b981"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" fill="#e1306c"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
  twitter: `<svg viewBox="0 0 24 24" fill="#ffffff"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
  soundcloud: `<svg viewBox="0 0 24 24" fill="#ff5500"><path d="M1.175 12.225c-.053 0-.095.043-.102.096l-.271 2.723c-.004.053.037.1.09.106.006 0 .011 0 .017 0 .053 0 .096-.043.102-.096l.271-2.723a.105.105 0 0 0-.09-.106c-.006 0-.012 0-.017 0zm1.096-.757c-.06 0-.11.047-.116.107l-.37 3.513c-.007.06.037.113.097.12.006 0 .013 0 .02 0 .06 0 .11-.047.116-.107l.37-3.513c.007-.06-.037-.113-.097-.12a.15.15 0 0 0-.02 0zm1.18-.553c-.067 0-.123.052-.13.12l-.435 4.09c-.007.068.042.127.11.134.007 0 .014 0 .02 0 .068 0 .123-.052.13-.12l.436-4.09c.007-.068-.043-.127-.111-.134a.12.12 0 0 0-.02 0zm1.218-.327c-.073 0-.135.056-.142.13l-.48 4.44c-.008.075.046.14.12.148.008 0 .016 0 .023 0 .074 0 .135-.057.142-.13l.48-4.44c.008-.075-.046-.14-.12-.148a.14.14 0 0 0-.023 0zm1.246.06c-.08 0-.147.06-.155.14l-.466 4.333c-.008.081.05.15.132.16.008 0 .016 0 .024 0 .08 0 .147-.06.155-.14l.466-4.333c.008-.082-.05-.152-.132-.16a.18.18 0 0 0-.024 0zm19.085 1.572c0-1.85-1.5-3.35-3.35-3.35-.55 0-1.07.13-1.53.37-.36-.92-1.25-1.57-2.3-1.57-.4 0-.78.1-1.12.28-.48-.96-1.48-1.63-2.63-1.63-.58 0-1.12.17-1.58.46V7.47c0-.09-.07-.16-.16-.17-.09 0-.17.07-.17.17v9.42c0 .09.07.16.16.17.01 0 .02 0 .03 0 .08 0 .14-.06.14-.14v-7.14c.43-.54 1.09-.89 1.83-.89 1.15 0 2.11.83 2.3 1.93.04.22.21.38.43.38.03 0 .06 0 .09-.01.25-.05.42-.27.37-.52-.01-.06-.02-.13-.02-.2 0-1.07.87-1.94 1.94-1.94.88 0 1.62.59 1.85 1.41.06.22.25.37.47.37.04 0 .08 0 .12-.02 1.34-.48 2.82.23 3.3 1.57.14.39.21.8.21 1.22 0 .09.07.16.16.17.01 0 .02 0 .03 0 .08 0 .14-.06.14-.14v-.01z"/></svg>`,
  twitch: `<svg viewBox="0 0 24 24" fill="#a855f7"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>`,
  vimeo: `<svg viewBox="0 0 24 24" fill="#00adef"><path d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.29 6.37-1.409 0-2.578-1.294-3.553-3.881L5.322 11.4C4.603 8.816 3.834 7.525 3.003 7.525c-.179 0-.806.378-1.881 1.132L0 7.197c1.185-1.044 2.351-2.083 3.501-3.128 1.581-1.365 2.766-2.091 3.554-2.176 1.864-.18 3.016.924 3.456 3.311.468 2.551.787 4.148.961 4.792.518 2.213 1.082 3.321 1.691 3.321.472 0 1.171-.735 2.097-2.199.923-1.467 1.423-2.585 1.498-3.355.132-1.282-.367-1.926-1.502-1.926-.599 0-1.233.136-1.887.41 1.23-4.041 3.577-5.975 7.05-5.808 2.578.125 3.791 1.745 3.639 4.868z"/></svg>`,
  music: `<svg viewBox="0 0 24 24" fill="#fa233b"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`
};

// ── EXTRACTOR & EMBED BUILDER ─────────────────────────────────
function buildSocialEmbed(url) {
  if (!url) return null;
  const cleanUrl = url.trim();

  // 1. YouTube & YouTube Shorts & Music
  // Matches: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID, youtube.com/embed/ID, music.youtube.com/watch?v=ID
  const ytMatch = cleanUrl.match(/(?:https?:\/\/)?(?:www\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (ytMatch) {
    const videoId = ytMatch[1];
    const isShort = cleanUrl.includes('/shorts/');
    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&controls=1&rel=0`;
    const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    const uid = 'yt_' + videoId + '_' + Math.random().toString(36).substr(2, 6);
    const aspectStyle = isShort ? 'max-width:280px;aspect-ratio:9/16;' : 'width:100%;max-width:380px;aspect-ratio:16/9;';

    return `
      <div class="chat-embed-wrap" style="${aspectStyle}" onclick="event.stopPropagation();">
        <div class="chat-embed-header">
          <span class="chat-embed-badge">${ICONS.youtube} ${isShort ? 'YouTube Short' : 'YouTube'}</span>
          <button style="background:none;border:none;color:#94a3b8;cursor:pointer;padding:0;font-size:11px;" 
                  onclick="event.stopPropagation(); window.openLightbox('${embedUrl}', 'youtube');">⛶ Expand</button>
        </div>
        <div id="${uid}" class="chat-embed-thumb" style="width:100%;height:calc(100% - 29px);"
             onclick="window.playInlineSocialMedia('${uid}', '${embedUrl}', ${isShort ? 460 : 210});">
          <img src="${thumbUrl}" alt="YouTube video preview" loading="lazy">
          <div class="chat-embed-play-btn">▶</div>
        </div>
      </div>
    `;
  }

  // 2. TikTok
  // Matches: tiktok.com/@user/video/ID, vm.tiktok.com/ID, vt.tiktok.com/ID
  const ttMatch = cleanUrl.match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/i);
  if (ttMatch) {
    const videoId = ttMatch[1];
    return `
      <div class="chat-embed-wrap" style="width:100%;max-width:325px;height:480px;" onclick="event.stopPropagation();">
        <div class="chat-embed-header">
          <span class="chat-embed-badge">${ICONS.tiktok} TikTok</span>
          <a href="${cleanUrl}" target="_blank" style="color:#94a3b8;text-decoration:none;">Open ↗</a>
        </div>
        <iframe src="https://www.tiktok.com/embed/v2/${videoId}" 
                width="100%" 
                height="448" 
                class="chat-embed-iframe" 
                scrolling="no" 
                allow="fullscreen" 
                style="height:448px;border:none;"></iframe>
      </div>
    `;
  }

  // 3. Instagram Reels & Posts
  // Matches: instagram.com/reel/ID, instagram.com/p/ID, instagram.com/tv/ID
  const igMatch = cleanUrl.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/(p|reel|tv)\/([a-zA-Z0-9_-]+)/i);
  if (igMatch) {
    const type = igMatch[1];
    const id = igMatch[2];
    const isReel = type === 'reel';
    const embedUrl = `https://www.instagram.com/${type}/${id}/embed/`;
    return `
      <div class="chat-embed-wrap" style="width:100%;max-width:340px;height:${isReel ? '480px' : '420px'};" onclick="event.stopPropagation();">
        <div class="chat-embed-header">
          <span class="chat-embed-badge">${ICONS.instagram} Instagram ${isReel ? 'Reel' : 'Post'}</span>
          <a href="${cleanUrl}" target="_blank" style="color:#94a3b8;text-decoration:none;">Open ↗</a>
        </div>
        <iframe src="${embedUrl}" 
                width="100%" 
                height="${isReel ? 448 : 388}" 
                class="chat-embed-iframe" 
                scrolling="no" 
                frameborder="0"
                allowtransparency="true"
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                style="height:${isReel ? 448 : 388}px;"></iframe>
      </div>
    `;
  }

  // 4. Twitter / X Posts & Videos
  // Matches: twitter.com/user/status/ID or x.com/user/status/ID
  const twMatch = cleanUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/(?:[\w.-]+)\/status\/(\d+)/i);
  if (twMatch) {
    const tweetId = twMatch[1];
    const embedUrl = `https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=dark`;
    return `
      <div class="chat-embed-wrap" style="width:100%;max-width:360px;min-height:280px;" onclick="event.stopPropagation();">
        <div class="chat-embed-header">
          <span class="chat-embed-badge">${ICONS.twitter} X (Twitter)</span>
          <a href="${cleanUrl}" target="_blank" style="color:#94a3b8;text-decoration:none;">Open ↗</a>
        </div>
        <iframe src="${embedUrl}" 
                width="100%" 
                height="340" 
                class="chat-embed-iframe" 
                scrolling="no" 
                frameborder="0"
                style="height:340px;"></iframe>
      </div>
    `;
  }

  // 5. Facebook Videos & Reels
  // Matches: facebook.com/watch/?v=ID, facebook.com/reel/ID, fb.watch/ID, facebook.com/user/videos/ID
  const fbMatch = cleanUrl.match(/(?:https?:\/\/)?(?:www\.|m\.)?(?:facebook\.com\/(?:watch\/\?v=|reel\/|[\w.-]+\/videos\/)|fb\.watch\/)/i);
  if (fbMatch) {
    const encoded = encodeURIComponent(cleanUrl);
    const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encoded}&show_text=0&width=320`;
    return `
      <div class="chat-embed-wrap" style="width:100%;max-width:340px;height:280px;" onclick="event.stopPropagation();">
        <div class="chat-embed-header">
          <span class="chat-embed-badge">${ICONS.facebook} Facebook Video</span>
          <a href="${cleanUrl}" target="_blank" style="color:#94a3b8;text-decoration:none;">Open ↗</a>
        </div>
        <iframe src="${embedUrl}" 
                width="100%" 
                height="248" 
                class="chat-embed-iframe" 
                scrolling="no" 
                frameborder="0"
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                allowFullScreen="true"
                style="height:248px;"></iframe>
      </div>
    `;
  }

  // 6. Spotify (Track, Album, Playlist, Podcast Episode)
  const spotMatch = cleanUrl.match(/(?:https?:\/\/)?(?:open\.)?spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/i);
  if (spotMatch) {
    const type = spotMatch[1];
    const id = spotMatch[2];
    const isSmall = type === 'track';
    const height = isSmall ? 152 : 352;
    return `
      <div class="chat-embed-wrap" style="width:100%;max-width:340px;" onclick="event.stopPropagation();">
        <div class="chat-embed-header">
          <span class="chat-embed-badge">${ICONS.spotify} Spotify ${type.toUpperCase()}</span>
          <a href="${cleanUrl}" target="_blank" style="color:#94a3b8;text-decoration:none;">Open ↗</a>
        </div>
        <iframe src="https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0" 
                width="100%" 
                height="${height}" 
                class="chat-embed-iframe" 
                frameborder="0" 
                allowfullscreen 
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                style="height:${height}px;"></iframe>
      </div>
    `;
  }

  // 7. Apple Music
  const appleMatch = cleanUrl.match(/(?:https?:\/\/)?music\.apple\.com\/([a-z]{2})\/(album|song|playlist|music-video)\/([^\s/?#]+)(?:\/(\d+))?/i);
  if (appleMatch) {
    const embedUrl = cleanUrl.replace('music.apple.com', 'embed.music.apple.com');
    return `
      <div class="chat-embed-wrap" style="width:100%;max-width:340px;height:175px;" onclick="event.stopPropagation();">
        <div class="chat-embed-header">
          <span class="chat-embed-badge">${ICONS.music} Apple Music</span>
          <a href="${cleanUrl}" target="_blank" style="color:#94a3b8;text-decoration:none;">Open ↗</a>
        </div>
        <iframe src="${embedUrl}" 
                width="100%" 
                height="150" 
                class="chat-embed-iframe" 
                frameborder="0" 
                allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" 
                sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
                style="height:150px;"></iframe>
      </div>
    `;
  }

  // 8. SoundCloud
  const scMatch = cleanUrl.match(/(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/([\w.-]+)\/([\w.-]+)/i);
  if (scMatch && !['discover', 'stream', 'upload', 'you', 'search'].includes(scMatch[1].toLowerCase())) {
    const encoded = encodeURIComponent(cleanUrl);
    const embedUrl = `https://w.soundcloud.com/player/?url=${encoded}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false`;
    return `
      <div class="chat-embed-wrap" style="width:100%;max-width:340px;height:185px;" onclick="event.stopPropagation();">
        <div class="chat-embed-header">
          <span class="chat-embed-badge">${ICONS.soundcloud} SoundCloud</span>
          <a href="${cleanUrl}" target="_blank" style="color:#94a3b8;text-decoration:none;">Open ↗</a>
        </div>
        <iframe src="${embedUrl}" 
                width="100%" 
                height="150" 
                class="chat-embed-iframe" 
                scrolling="no" 
                frameborder="no" 
                allow="autoplay"
                style="height:150px;"></iframe>
      </div>
    `;
  }

  // 9. Twitch (Clips, Videos, Channels)
  const twitchClip = cleanUrl.match(/(?:https?:\/\/)?(?:clips\.twitch\.tv\/|www\.twitch\.tv\/(?:[\w.-]+)\/clip\/)([a-zA-Z0-9_-]+)/i);
  if (twitchClip) {
    const clipId = twitchClip[1];
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const embedUrl = `https://clips.twitch.tv/embed?clip=${clipId}&parent=${host}&autoplay=false`;
    return `
      <div class="chat-embed-wrap" style="width:100%;max-width:340px;height:240px;" onclick="event.stopPropagation();">
        <div class="chat-embed-header">
          <span class="chat-embed-badge">${ICONS.twitch} Twitch Clip</span>
          <a href="${cleanUrl}" target="_blank" style="color:#94a3b8;text-decoration:none;">Open ↗</a>
        </div>
        <iframe src="${embedUrl}" 
                width="100%" 
                height="208" 
                class="chat-embed-iframe" 
                frameborder="0" 
                scrolling="no" 
                allowfullscreen="true"
                style="height:208px;"></iframe>
      </div>
    `;
  }

  // 10. Vimeo
  const vimeoMatch = cleanUrl.match(/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)/i);
  if (vimeoMatch) {
    const vimeoId = vimeoMatch[3];
    const embedUrl = `https://player.vimeo.com/video/${vimeoId}?dnt=1`;
    return `
      <div class="chat-embed-wrap" style="width:100%;max-width:340px;height:225px;" onclick="event.stopPropagation();">
        <div class="chat-embed-header">
          <span class="chat-embed-badge">${ICONS.vimeo} Vimeo</span>
          <button style="background:none;border:none;color:#94a3b8;cursor:pointer;padding:0;font-size:11px;" 
                  onclick="event.stopPropagation(); window.openLightbox('${embedUrl}', 'vimeo');">⛶ Expand</button>
        </div>
        <iframe src="${embedUrl}" 
                width="100%" 
                height="192" 
                class="chat-embed-iframe" 
                frameborder="0" 
                allow="autoplay; fullscreen; picture-in-picture" 
                allowfullscreen
                style="height:192px;"></iframe>
      </div>
    `;
  }

  // 11. Direct Video files (.mp4, .webm, .mov, .m4v, .ogv)
  if (/\.(mp4|webm|mov|m4v|ogv)(?:\?.*)?$/i.test(cleanUrl)) {
    return `
      <div class="chat-embed-wrap" style="max-width:320px;" onclick="event.stopPropagation();">
        <div class="chat-embed-header">
          <span class="chat-embed-badge">🎥 Video</span>
          <a href="${cleanUrl}" target="_blank" style="color:#94a3b8;text-decoration:none;">Open ↗</a>
        </div>
        <video class="chat-direct-video" controls playsinline preload="metadata">
          <source src="${cleanUrl}">
          Your browser does not support HTML5 video.
        </video>
      </div>
    `;
  }

  // 12. Direct Audio files (.mp3, .wav, .ogg, .m4a, .aac, .flac)
  if (/\.(mp3|wav|ogg|m4a|aac|flac)(?:\?.*)?$/i.test(cleanUrl)) {
    return `
      <div class="chat-embed-wrap" style="max-width:300px;padding:8px;" onclick="event.stopPropagation();">
        <div class="chat-embed-header" style="background:transparent;border:none;padding:0 0 6px;">
          <span class="chat-embed-badge">🎵 Audio Stream</span>
        </div>
        <audio class="chat-direct-audio" controls preload="metadata">
          <source src="${cleanUrl}">
          Your browser does not support HTML5 audio.
        </audio>
      </div>
    `;
  }

  return null;
}

// ── MAIN FORMATTER EXPORT ─────────────────────────────────────
export function formatMessageText(text) {
  if (!text) return "";

  // 1. Find all URLs in the message text
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;
  const urls = [];
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    if (!urls.includes(match[1])) {
      urls.push(match[1]);
    }
  }

  // 2. Generate playable social media embeds for detected links
  const embeds = [];
  for (const url of urls) {
    const embedHtml = buildSocialEmbed(url);
    if (embedHtml) {
      embeds.push(embedHtml);
    }
  }

  // 3. Make all standard URLs in the text clickable
  let formattedText = text.replace(urlRegex, (matchedUrl) => {
    return `<a href="${matchedUrl}" target="_blank" rel="noopener noreferrer" class="chat-link" onclick="event.stopPropagation()">${matchedUrl}</a>`;
  });

  // 4. Return message text + attached playable cards
  if (embeds.length > 0) {
    return `${formattedText}<div class="chat-embeds-container">${embeds.join('')}</div>`;
  }

  return formattedText;
}

// Also attach globally to window for legacy access if needed
if (typeof window !== 'undefined') {
  window.formatMessageText = formatMessageText;
  window.buildSocialEmbed = buildSocialEmbed;
}
