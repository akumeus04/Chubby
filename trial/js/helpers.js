// Small shared helpers & celebration animations

// ── HELPERS ──────────────────────────────────────────────
export function getDirectImageUrl(url) {
  if (url && url.includes("drive.google.com")) {
    const m1 = url.match(/\/file\/d\/([^\/]+)/);
    const m2 = url.match(/[?&]id=([^&]+)/);
    const id = m1 ? m1[1] : (m2 ? m2[1] : "");
    if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
  }
  return url;
}

export function closeAllPanels(except) {
  if (except !== "emoji") document.getElementById("emoji-panel")?.classList.remove("visible");
  if (except !== "gif")   document.getElementById("gif-panel")?.classList.remove("visible");
  if (except !== "saved") document.getElementById("saved-replies-panel")?.classList.remove("visible");
  document.getElementById("emoji-btn")?.classList.toggle("active", false);
  document.getElementById("gif-btn")?.classList.toggle("active", false);
  document.getElementById("saved-btn")?.classList.toggle("active", false);
}

export function removeContextMenu() {
  document.querySelectorAll(".context-menu").forEach(el => el.remove());
}

// ── CONFETTI & KISS ANIMATIONS ────────────────────────────

/**
 * High-performance full-screen Confetti blast (🎉 / 🎊)
 */
export function playConfetti() {
  if (typeof document === 'undefined') return;

  const canvas = document.createElement('canvas');
  canvas.id = 'chubby-confetti-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:999999;';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  const colors = ['#f43f5e', '#38bdf8', '#10b981', '#fbbf24', '#a855f7', '#ec4899', '#ffffff'];
  const count = 120;
  const particles = [];

  for (let i = 0; i < count; i++) {
    particles.push({
      x: width * 0.5 + (Math.random() - 0.5) * 160,
      y: height * 0.45 + (Math.random() - 0.5) * 80,
      vx: (Math.random() - 0.5) * 22,
      vy: (Math.random() - 0.85) * 24 - 4,
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      drag: 0.96,
      gravity: 0.55,
      opacity: 1,
      shape: Math.random() > 0.4 ? 'rect' : 'circle'
    });
  }

  let startTime = performance.now();
  const DURATION = 3200; // ms

  function animate(now) {
    const elapsed = now - startTime;
    if (elapsed > DURATION) {
      canvas.remove();
      return;
    }

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.vx *= p.drag;
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      if (elapsed > 1800) {
        p.opacity = Math.max(0, 1 - (elapsed - 1800) / 1400);
      }

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size * 0.5);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

/**
 * Romantic floating kiss lips & floating glowing hearts (💋 / 😘)
 */
export function playKissAnimation() {
  if (typeof document === 'undefined') return;

  const container = document.createElement('div');
  container.className = 'chubby-kiss-container';
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999999;overflow:hidden;';
  document.body.appendChild(container);

  const emojis = ['💋', '❤️', '😘', '💖', '💕', '✨', '💋', '💗'];
  const count = 32;

  // Add keyframe styling dynamically if not present
  if (!document.getElementById('kiss-anim-keyframes')) {
    const style = document.createElement('style');
    style.id = 'kiss-anim-keyframes';
    style.textContent = `
      @keyframes floatKissUp {
        0% {
          transform: translateY(105vh) scale(0.6) rotate(0deg);
          opacity: 0;
        }
        15% {
          opacity: 1;
          transform: translateY(85vh) scale(1.2) rotate(-8deg);
        }
        50% {
          transform: translateY(45vh) scale(1.4) rotate(12deg);
        }
        85% {
          opacity: 0.9;
        }
        100% {
          transform: translateY(-10vh) scale(1.6) rotate(-15deg);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const em = emojis[Math.floor(Math.random() * emojis.length)];
    const leftPercent = Math.random() * 85 + 7; // 7% to 92%
    const delay = Math.random() * 1.4; // staggered start
    const duration = Math.random() * 1.5 + 2.2; // 2.2s to 3.7s
    const size = Math.floor(Math.random() * 26) + 30; // 30px to 56px

    el.textContent = em;
    el.style.cssText = `
      position: absolute;
      left: ${leftPercent}%;
      bottom: -60px;
      font-size: ${size}px;
      animation: floatKissUp ${duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}s forwards;
      filter: drop-shadow(0 4px 14px rgba(244, 63, 94, 0.4));
      user-select: none;
    `;
    container.appendChild(el);
  }

  // Self cleanup after all floaters complete
  setTimeout(() => {
    container.remove();
  }, 4200);
}

/**
 * Checks a message string and triggers animations if confetti or kiss emojis are present
 */
export function triggerEmojiAnimation(text) {
  if (!text) return;
  const clean = text.trim();

  // Confetti triggers: exact emoji or contains celebratory party tokens
  const hasConfetti = /🎉|🎊|🥳/.test(clean);
  // Kiss triggers: kiss mark, kissing face, heart eyes, floating hearts
  const hasKiss = /💋|😘|👄|❤️|💖|💕/.test(clean);

  if (hasConfetti) {
    playConfetti();
  }
  if (hasKiss) {
    playKissAnimation();
  }
}

// Global attachment for convenience
if (typeof window !== 'undefined') {
  window.playConfetti = playConfetti;
  window.playKissAnimation = playKissAnimation;
  window.triggerEmojiAnimation = triggerEmojiAnimation;
}
