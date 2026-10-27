// paint-editor.js — Canvas paint editor for Chubby Chat & Web Apps
// Advanced studio paint & annotation suite.
// Replaces Cropper.js + Filerobot. Works for background picker and chat annotation.
// Exposes: window.openPaintEditor(imageBase64, onSave)

(function () {
  'use strict';

  // ── CORE STATE ──────────────────────────────────────────────
  let modal = null;
  let canvas = null;
  let ctx = null;
  let baseImageData = null;
  let originalImage = null;
  let onSaveCallback = null;
  let modalOpenedAt = 0;

  // Active Tool & Style State
  let currentTool = 'brush';
  let currentColor = '#f43f5e';
  let brushSize = 8;
  let opacity = 1.0;
  let shapeFill = false;
  let eraserMode = 'restore'; // 'restore' (magic photo unmask) or 'alpha' (clear)
  let stepNumber = 1;

  // Text Tool State
  let textFont = "'Plus Jakarta Sans', system-ui, sans-serif";
  let isTextBold = true;
  let isTextItalic = false;
  let textBgStyle = 'glass'; // 'none', 'glass', 'solid', 'shadow'

  // Sticker State
  let activeSticker = '🔥';

  // Adjustments & Filters State
  let adjustments = {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    warmth: 0,
    vignette: 0,
    filter: 'none'
  };

  // Undo / Redo Stacks
  let undoStack = [];
  let redoStack = [];

  // Viewport / Zoom / Pan
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let isComparing = false;

  // Drawing Interaction State
  let isDrawing = false;
  let lastPos = null;
  let startPos = null;
  let snapshotBeforeDrag = null;

  // Crop State
  let cropStart = null;
  let cropEnd = null;
  let cropIsDragging = false;
  let cropIsMoving = false;
  let cropResizing = false;
  let cropResizeHandle = null;
  let cropMoveOrigin = null;
  let cropBoxAtStart = null;
  let cropRatio = 'free'; // 'free', '1:1', '16:9', '4:3', '9:16', '3:2', 'circle'

  let lastTouchTime = 0;

  // ── COORDINATE NORMALIZATION ──────────────────────────────
  function getPos(e) {
    if (!canvas) return lastPos ? { ...lastPos } : { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width ? (canvas.width / rect.width) : 1;
    const sy = rect.height ? (canvas.height / rect.height) : 1;
    
    let cx = null, cy = null;

    if (e) {
      if (e.changedTouches && e.changedTouches.length > 0 && e.changedTouches[0]) {
        cx = e.changedTouches[0].clientX;
        cy = e.changedTouches[0].clientY;
      } else if (e.touches && e.touches.length > 0 && e.touches[0]) {
        cx = e.touches[0].clientX;
        cy = e.touches[0].clientY;
      } else if (e.targetTouches && e.targetTouches.length > 0 && e.targetTouches[0]) {
        cx = e.targetTouches[0].clientX;
        cy = e.targetTouches[0].clientY;
      } else if (typeof e.clientX === 'number') {
        cx = e.clientX;
        cy = e.clientY;
      }
    }

    if (typeof cx !== 'number' || typeof cy !== 'number' || isNaN(cx) || isNaN(cy)) {
      return lastPos ? { ...lastPos } : { x: 0, y: 0 };
    }

    return {
      x: (cx - rect.left) * sx,
      y: (cy - rect.top) * sy,
    };
  }

  // ── UNDO / REDO HISTORY ───────────────────────────────────
  function snapshot() {
    if (!ctx || !canvas) return;
    try {
      undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (undoStack.length > 35) undoStack.shift();
      redoStack = [];
      refreshHistoryBtns();
    } catch (e) {
      console.warn("Could not record snapshot (canvas may be tainted):", e);
    }
  }

  function undo() {
    if (!undoStack.length || !canvas || !ctx) return;
    try {
      redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      const prev = undoStack.pop();
      if (canvas.width !== prev.width || canvas.height !== prev.height) {
        canvas.width = prev.width;
        canvas.height = prev.height;
      }
      ctx.putImageData(prev, 0, 0);
      refreshHistoryBtns();
      updateCanvasDimLabel();
    } catch (e) {
      console.warn("Could not undo:", e);
    }
  }

  function redo() {
    if (!redoStack.length || !canvas || !ctx) return;
    try {
      undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      const next = redoStack.pop();
      if (canvas.width !== next.width || canvas.height !== next.height) {
        canvas.width = next.width;
        canvas.height = next.height;
      }
      ctx.putImageData(next, 0, 0);
      refreshHistoryBtns();
      updateCanvasDimLabel();
    } catch (e) {
      console.warn("Could not redo:", e);
    }
  }

  function refreshHistoryBtns() {
    const u = document.getElementById('pe-undo');
    const r = document.getElementById('pe-redo');
    if (u) u.disabled = !undoStack.length;
    if (r) r.disabled = !redoStack.length;
  }

  function updateCanvasDimLabel() {
    const dimEl = document.getElementById('pe-dim-label');
    if (dimEl && canvas) {
      dimEl.textContent = `${canvas.width} × ${canvas.height}px · ${Math.round(zoom * 100)}%`;
    }
  }

  // ── DRAWING & SHAPE ROUTINES ──────────────────────────────
  function drawArrowShaft(from, to, color, width, isDouble) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);
    const headLength = Math.max(14, width * 3.5);
    const headAngle = Math.PI / 6;

    // Line
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Forward arrowhead
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headLength * Math.cos(angle - headAngle), to.y - headLength * Math.sin(angle - headAngle));
    ctx.lineTo(to.x - (headLength * 0.7) * Math.cos(angle), to.y - (headLength * 0.7) * Math.sin(angle));
    ctx.lineTo(to.x - headLength * Math.cos(angle + headAngle), to.y - headLength * Math.sin(angle + headAngle));
    ctx.closePath();
    ctx.fill();

    // Reverse arrowhead if double arrow
    if (isDouble) {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(from.x + headLength * Math.cos(angle - headAngle), from.y + headLength * Math.sin(angle - headAngle));
      ctx.lineTo(from.x + (headLength * 0.7) * Math.cos(angle), from.y + (headLength * 0.7) * Math.sin(angle));
      ctx.lineTo(from.x + headLength * Math.cos(angle + headAngle), from.y + headLength * Math.sin(angle + headAngle));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRectShape(start, end, color, width, fill) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, 10);
    } else {
      ctx.rect(x, y, w, h);
    }

    if (fill) ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawCircleShape(start, end, color, width, fill) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;

    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;

    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    if (fill) ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawSpeechBubbleShape(start, end, color, width, fill) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.fillStyle = fill ? color : '#ffffff';
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const x1 = Math.min(start.x, end.x);
    const y1 = Math.min(start.y, end.y);
    const w = Math.max(24, Math.abs(end.x - start.x));
    const h = Math.max(24, Math.abs(end.y - start.y));
    const r = 16;
    const tailH = Math.min(24, h * 0.25);
    const bodyH = h - tailH;

    ctx.beginPath();
    ctx.moveTo(x1 + r, y1);
    ctx.lineTo(x1 + w - r, y1);
    ctx.quadraticCurveTo(x1 + w, y1, x1 + w, y1 + r);
    ctx.lineTo(x1 + w, y1 + bodyH - r);
    ctx.quadraticCurveTo(x1 + w, y1 + bodyH, x1 + w - r, y1 + bodyH);

    ctx.lineTo(x1 + w * 0.5, y1 + bodyH);
    ctx.lineTo(x1 + w * 0.3, y1 + h); // tail tip
    ctx.lineTo(x1 + w * 0.3 + 14, y1 + bodyH);

    ctx.lineTo(x1 + r, y1 + bodyH);
    ctx.quadraticCurveTo(x1, y1 + bodyH, x1, y1 + bodyH - r);
    ctx.lineTo(x1, y1 + r);
    ctx.quadraticCurveTo(x1, y1, x1 + r, y1);
    ctx.closePath();

    if (fill) ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function applyPixelateBox(start, end) {
    const rx = Math.max(0, Math.floor(Math.min(start.x, end.x)));
    const ry = Math.max(0, Math.floor(Math.min(start.y, end.y)));
    const rw = Math.min(canvas.width - rx, Math.floor(Math.abs(end.x - start.x)));
    const rh = Math.min(canvas.height - ry, Math.floor(Math.abs(end.y - start.y)));
    if (rw <= 2 || rh <= 2) return;

    const blockSize = Math.max(8, Math.round(brushSize * 1.5));
    const imgData = ctx.getImageData(rx, ry, rw, rh);
    const d = imgData.data;

    for (let by = 0; by < rh; by += blockSize) {
      for (let bx = 0; bx < rw; bx += blockSize) {
        const bw = Math.min(blockSize, rw - bx);
        const bh = Math.min(blockSize, rh - by);
        let tr = 0, tg = 0, tb = 0, ta = 0, count = 0;
        for (let py = 0; py < bh; py++) {
          for (let px = 0; px < bw; px++) {
            const idx = ((by + py) * rw + (bx + px)) * 4;
            tr += d[idx]; tg += d[idx + 1]; tb += d[idx + 2]; ta += d[idx + 3];
            count++;
          }
        }
        const ar = Math.round(tr / count), ag = Math.round(tg / count), ab = Math.round(tb / count), aa = Math.round(ta / count);
        for (let py = 0; py < bh; py++) {
          for (let px = 0; px < bw; px++) {
            const idx = ((by + py) * rw + (bx + px)) * 4;
            d[idx] = ar; d[idx + 1] = ag; d[idx + 2] = ab; d[idx + 3] = aa;
          }
        }
      }
    }
    ctx.putImageData(imgData, rx, ry);
  }

  function applyBlurBox(start, end) {
    const rx = Math.max(0, Math.floor(Math.min(start.x, end.x)));
    const ry = Math.max(0, Math.floor(Math.min(start.y, end.y)));
    const rw = Math.min(canvas.width - rx, Math.floor(Math.abs(end.x - start.x)));
    const rh = Math.min(canvas.height - ry, Math.floor(Math.abs(end.y - start.y)));
    if (rw <= 4 || rh <= 4) return;

    const tmp = document.createElement('canvas');
    const scale = 0.12;
    const tw = Math.max(2, Math.floor(rw * scale));
    const th = Math.max(2, Math.floor(rh * scale));
    tmp.width = tw;
    tmp.height = th;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.imageSmoothingEnabled = true;
    tctx.drawImage(canvas, rx, ry, rw, rh, 0, 0, tw, th);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, tw, th, rx, ry, rw, rh);
    ctx.restore();
  }

  // ── MOUSE / TOUCH DRAW EVENTS ─────────────────────────────
  function onStart(e) {
    if (e.type && e.type.startsWith('touch')) {
      lastTouchTime = Date.now();
    } else if (e.type && e.type.startsWith('mouse') && Date.now() - lastTouchTime < 450) {
      return;
    }
    if (e.cancelable) e.preventDefault();
    if (isComparing) return;
    const pos = getPos(e);
    lastPos = pos;
    startPos = pos;

    // Hand/Pan viewport
    if (currentTool === 'hand' || (e.button === 1)) {
      isPanning = true;
      const src = e?.touches?.[0] || e?.changedTouches?.[0] || e?.targetTouches?.[0] || (typeof e?.clientX === 'number' ? e : null);
      if (src && typeof src.clientX === 'number' && typeof src.clientY === 'number') {
        panStartX = src.clientX - panX;
        panStartY = src.clientY - panY;
      }
      return;
    }

    if (currentTool === 'crop') {
      startCrop(e);
      return;
    }

    if (currentTool === 'text') {
      showTextInput(e);
      return;
    }

    if (currentTool === 'eyedropper') {
      const p = ctx.getImageData(Math.min(canvas.width - 1, Math.max(0, Math.floor(pos.x))), Math.min(canvas.height - 1, Math.max(0, Math.floor(pos.y))), 1, 1).data;
      const toHex = n => n.toString(16).padStart(2, '0');
      currentColor = `#${toHex(p[0])}${toHex(p[1])}${toHex(p[2])}`;
      setTool('brush');
      updateSwatchUI();
      return;
    }

    if (currentTool === 'step_badge') {
      snapshot();
      const r = Math.max(16, brushSize * 1.5);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = currentColor;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${r * 1.1}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(stepNumber.toString(), pos.x, pos.y + 1);
      ctx.restore();
      stepNumber++;
      updateStepBadgeUI();
      return;
    }

    if (currentTool === 'sticker') {
      snapshot();
      const size = Math.max(32, brushSize * 4);
      ctx.save();
      ctx.font = `${size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 10;
      ctx.fillText(activeSticker, pos.x, pos.y);
      ctx.restore();
      return;
    }

    snapshot();
    isDrawing = true;
    snapshotBeforeDrag = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (currentTool === 'brush' || currentTool === 'pen' || currentTool === 'highlighter' || currentTool === 'neon') {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineCap = currentTool === 'highlighter' ? 'square' : 'round';
      ctx.lineJoin = 'round';
    }
  }

  function onMove(e) {
    if (e.type && e.type.startsWith('mouse') && Date.now() - lastTouchTime < 450) {
      return;
    }
    if (e.cancelable) e.preventDefault();
    const pos = getPos(e);

    if (isPanning) {
      const src = e?.touches?.[0] || e?.changedTouches?.[0] || e?.targetTouches?.[0] || (typeof e?.clientX === 'number' ? e : null);
      if (src && typeof src.clientX === 'number' && typeof src.clientY === 'number') {
        panX = src.clientX - panStartX;
        panY = src.clientY - panStartY;
        applyCanvasTransform();
      }
      return;
    }

    if (currentTool === 'crop') {
      moveCrop(e);
      return;
    }

    if (!isDrawing || !lastPos || !startPos) return;

    if (currentTool === 'eraser') {
      if (eraserMode === 'restore' && baseImageData) {
        // Restore original photo pixels
        const r = Math.ceil(brushSize * 2.2);
        const dx = pos.x - lastPos.x;
        const dy = pos.y - lastPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(1, Math.floor(dist / Math.max(1, r * 0.4)));
        for (let i = 0; i <= steps; i++) {
          const t = steps === 0 ? 0 : i / steps;
          const ix = Math.round(lastPos.x + dx * t);
          const iy = Math.round(lastPos.y + dy * t);
          const sx = Math.max(0, ix - r);
          const sy = Math.max(0, iy - r);
          const sw = Math.min(r * 2, canvas.width - sx);
          const sh = Math.min(r * 2, canvas.height - sy);
          if (sw > 0 && sh > 0) ctx.putImageData(baseImageData, 0, 0, sx, sy, sw, sh);
        }
      } else {
        // Clear Alpha eraser
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = brushSize * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(lastPos.x, lastPos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.restore();
      }
      lastPos = pos;
    } else if (currentTool === 'brush') {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(lastPos.x, lastPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.restore();
      lastPos = pos;
    } else if (currentTool === 'pen') {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = Math.max(1, brushSize * 0.4);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lastPos.x, lastPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.restore();
      lastPos = pos;
    } else if (currentTool === 'highlighter') {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = brushSize * 2.5;
      ctx.beginPath();
      ctx.moveTo(lastPos.x, lastPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.restore();
      lastPos = pos;
    } else if (currentTool === 'neon') {
      ctx.save();
      ctx.shadowColor = currentColor;
      ctx.shadowBlur = brushSize * 1.8;
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = brushSize * 1.5;
      ctx.beginPath();
      ctx.moveTo(lastPos.x, lastPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, brushSize * 0.4);
      ctx.beginPath();
      ctx.moveTo(lastPos.x, lastPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.restore();
      lastPos = pos;
    } else {
      // Geometric shapes and preview restoration
      if (snapshotBeforeDrag) {
        ctx.putImageData(snapshotBeforeDrag, 0, 0);
      }

      if (currentTool === 'arrow') {
        drawArrowShaft(startPos, pos, currentColor, brushSize, false);
      } else if (currentTool === 'double_arrow') {
        drawArrowShaft(startPos, pos, currentColor, brushSize, true);
      } else if (currentTool === 'line') {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.restore();
      } else if (currentTool === 'rect') {
        drawRectShape(startPos, pos, currentColor, brushSize, shapeFill);
      } else if (currentTool === 'circle') {
        drawCircleShape(startPos, pos, currentColor, brushSize, shapeFill);
      } else if (currentTool === 'speech_bubble') {
        drawSpeechBubbleShape(startPos, pos, currentColor, brushSize, shapeFill);
      } else if (currentTool === 'pixelate' || currentTool === 'blur') {
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
        ctx.restore();
      }
    }
  }

  function onEnd(e) {
    if (e.type && e.type.startsWith('mouse') && Date.now() - lastTouchTime < 450) {
      return;
    }
    if (isPanning) {
      isPanning = false;
      return;
    }

    if (currentTool === 'crop') {
      endCrop(e);
      return;
    }

    if (!isDrawing) return;
    isDrawing = false;

    if (startPos) {
      const pos = getPos(e);
      
      // ONLY restore the snapshot for pixelate and blur. 
      // Brush, pen, and shapes are already perfectly drawn on the canvas from onMove!
      if (currentTool === 'pixelate') {
        if (snapshotBeforeDrag) ctx.putImageData(snapshotBeforeDrag, 0, 0);
        applyPixelateBox(startPos, pos);
      } else if (currentTool === 'blur') {
        if (snapshotBeforeDrag) ctx.putImageData(snapshotBeforeDrag, 0, 0);
        applyBlurBox(startPos, pos);
      }
    }

    lastPos = null;
    startPos = null;
    snapshotBeforeDrag = null;
  }

  // ── TEXT OVERLAY TOOL ─────────────────────────────────────
  function showTextInput(e) {
    const pos = getPos(e);
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / canvas.width;
    const sy = rect.height / canvas.height;
    const wrap = document.getElementById('pe-canvas-wrap');
    const wrapRect = wrap.getBoundingClientRect();
    const ox = rect.left - wrapRect.left;
    const oy = rect.top - wrapRect.top;
    const fontSize = Math.max(16, brushSize * 2.5);

    const old = document.getElementById('pe-text-container');
    if (old) old.remove();

    const inp = document.createElement('div');
    inp.id = 'pe-text-container';
    inp.style.cssText = `position:absolute;left:${ox + pos.x * sx}px;top:${oy + pos.y * sy - fontSize}px;z-index:100;display:flex;align-items:center;gap:8px;background:rgba(18,18,24,0.95);padding:8px 12px;border-radius:14px;border:1px solid rgba(255,255,255,0.25);backdrop-filter:blur(12px);box-shadow:0 12px 36px rgba(0,0,0,0.7);`;
    inp.innerHTML = `
      <input id="pe-text-field" type="text" placeholder="Type text..." value="Text"
        style="background:transparent;border:none;border-bottom:2px solid ${currentColor};
               color:${currentColor};font-size:${fontSize}px;font-weight:${isTextBold ? 'bold' : 'normal'};
               font-style:${isTextItalic ? 'italic' : 'normal'};outline:none;min-width:140px;max-width:280px;
               font-family:${textFont};padding:4px 6px;">
      <button id="pe-text-ok"
        style="background:linear-gradient(135deg,#e11d48,#f43f5e);border:none;color:#fff;width:34px;height:34px;
               border-radius:50%;cursor:pointer;font-size:16px;font-weight:800;display:flex;align-items:center;justify-content:center;">✓</button>
      <button id="pe-text-cancel"
        style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:30px;height:30px;
               border-radius:50%;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">✕</button>`;
    wrap.appendChild(inp);

    const field = document.getElementById('pe-text-field');
    field.focus();
    field.select();

    const commit = () => {
      const text = field.value.trim();
      if (text) {
        snapshot();
        ctx.save();
        ctx.font = `${isTextItalic ? 'italic ' : ''}${isTextBold ? 'bold ' : ''}${fontSize}px ${textFont}`;
        const metrics = ctx.measureText(text);
        const textW = metrics.width;
        const textH = fontSize * 1.2;
        const pad = 12;

        if (textBgStyle === 'glass') {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(pos.x - pad, pos.y - textH + pad * 0.5, textW + pad * 2, textH + pad, 8);
          else ctx.rect(pos.x - pad, pos.y - textH + pad * 0.5, textW + pad * 2, textH + pad);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (textBgStyle === 'solid') {
          ctx.fillStyle = currentColor === '#ffffff' ? '#09090b' : '#ffffff';
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(pos.x - pad, pos.y - textH + pad * 0.5, textW + pad * 2, textH + pad, 8);
          else ctx.rect(pos.x - pad, pos.y - textH + pad * 0.5, textW + pad * 2, textH + pad);
          ctx.fill();
        } else if (textBgStyle === 'shadow') {
          ctx.shadowColor = 'rgba(0,0,0,0.85)';
          ctx.shadowBlur = 10;
        }

        ctx.fillStyle = currentColor;
        ctx.fillText(text, pos.x, pos.y);
        ctx.restore();
      }
      inp.remove();
    };

    document.getElementById('pe-text-ok').addEventListener('click', commit);
    document.getElementById('pe-text-cancel').addEventListener('click', () => inp.remove());
    field.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') commit();
      if (ev.key === 'Escape') inp.remove();
    });
  }

  // ── CROP TOOL IMPLEMENTATION ──────────────────────────────
  function normaliseCrop() {
    if (!cropStart || !cropEnd) return;
    const x1 = Math.min(cropStart.x, cropEnd.x);
    const y1 = Math.min(cropStart.y, cropEnd.y);
    const x2 = Math.max(cropStart.x, cropEnd.x);
    const y2 = Math.max(cropStart.y, cropEnd.y);
    cropStart = { x: x1, y: y1 };
    cropEnd = { x: x2, y: y2 };
  }

  function getResizeHandle(pos) {
    if (!cropStart || !cropEnd) return null;
    const cr = canvas.getBoundingClientRect();
    const r = 24 * (canvas.width / cr.width);
    const x1 = cropStart.x, y1 = cropStart.y;
    const x2 = cropEnd.x, y2 = cropEnd.y;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const d = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
    if (d(pos.x, pos.y, x1, y1) < r) return 'nw';
    if (d(pos.x, pos.y, x2, y1) < r) return 'ne';
    if (d(pos.x, pos.y, x1, y2) < r) return 'sw';
    if (d(pos.x, pos.y, x2, y2) < r) return 'se';
    if (d(pos.x, pos.y, mx, y1) < r) return 'n';
    if (d(pos.x, pos.y, mx, y2) < r) return 's';
    if (d(pos.x, pos.y, x1, my) < r) return 'w';
    if (d(pos.x, pos.y, x2, my) < r) return 'e';
    return null;
  }

  function insideCropBox(px, py) {
    if (!cropStart || !cropEnd) return false;
    return px > cropStart.x && px < cropEnd.x && py > cropStart.y && py < cropEnd.y;
  }

  function startCrop(e) {
    const pos = getPos(e);
    if (cropStart && cropEnd) {
      const handle = getResizeHandle(pos);
      if (handle) {
        normaliseCrop();
        cropResizing = true;
        cropResizeHandle = handle;
        return;
      }
      if (insideCropBox(pos.x, pos.y)) {
        normaliseCrop();
        cropIsMoving = true;
        cropMoveOrigin = pos;
        cropBoxAtStart = { start: { ...cropStart }, end: { ...cropEnd } };
        return;
      }
    }

    cropIsDragging = true;
    cropStart = pos;
    cropEnd = { ...pos };
    renderCropOverlay();
  }

  function moveCrop(e) {
    e.preventDefault();
    const pos = getPos(e);

    if (cropResizing && cropResizeHandle) {
      switch (cropResizeHandle) {
        case 'nw': cropStart.x = pos.x; cropStart.y = pos.y; break;
        case 'ne': cropEnd.x = pos.x; cropStart.y = pos.y; break;
        case 'sw': cropStart.x = pos.x; cropEnd.y = pos.y; break;
        case 'se': cropEnd.x = pos.x; cropEnd.y = pos.y; break;
        case 'n': cropStart.y = pos.y; break;
        case 's': cropEnd.y = pos.y; break;
        case 'w': cropStart.x = pos.x; break;
        case 'e': cropEnd.x = pos.x; break;
      }
      renderCropOverlay();
      return;
    }

    if (cropIsMoving && cropMoveOrigin && cropBoxAtStart) {
      const dx = pos.x - cropMoveOrigin.x;
      const dy = pos.y - cropMoveOrigin.y;
      cropStart = { x: cropBoxAtStart.start.x + dx, y: cropBoxAtStart.start.y + dy };
      cropEnd = { x: cropBoxAtStart.end.x + dx, y: cropBoxAtStart.end.y + dy };
      renderCropOverlay();
      return;
    }

    if (cropIsDragging && cropStart) {
      if (cropRatio !== 'free') {
        let r = 1;
        if (cropRatio === '1:1' || cropRatio === 'circle') r = 1;
        if (cropRatio === '16:9') r = 16 / 9;
        if (cropRatio === '4:3') r = 4 / 3;
        if (cropRatio === '9:16') r = 9 / 16;
        if (cropRatio === '3:2') r = 3 / 2;
        const dx = pos.x - cropStart.x;
        const dy = (Math.abs(dx) / r) * Math.sign(pos.y - cropStart.y);
        cropEnd = { x: pos.x, y: cropStart.y + dy };
      } else {
        cropEnd = pos;
      }
      renderCropOverlay();
    }
  }

  function endCrop(e) {
    if (cropResizing) { cropResizing = false; cropResizeHandle = null; normaliseCrop(); renderCropOverlay(); return; }
    if (cropIsMoving) { cropIsMoving = false; cropMoveOrigin = null; cropBoxAtStart = null; return; }
    if (!cropIsDragging) return;
    cropIsDragging = false;
    normaliseCrop();
    renderCropOverlay();
    const bar = document.getElementById('pe-crop-bar');
    if (bar) bar.style.display = 'flex';
  }

  function renderCropOverlay() {
    if (!cropStart || !cropEnd) return;
    const ol = document.getElementById('pe-crop-overlay');
    const wrap = document.getElementById('pe-canvas-wrap');
    if (!ol || !wrap) return;

    const wrapRect = wrap.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const scaleX = cr.width / canvas.width;
    const scaleY = cr.height / canvas.height;
    const ox = cr.left - wrapRect.left;
    const oy = cr.top - wrapRect.top;

    const x1 = Math.min(cropStart.x, cropEnd.x);
    const y1 = Math.min(cropStart.y, cropEnd.y);
    const x2 = Math.max(cropStart.x, cropEnd.x);
    const y2 = Math.max(cropStart.y, cropEnd.y);

    const left = x1 * scaleX + ox;
    const top = y1 * scaleY + oy;
    const w = (x2 - x1) * scaleX;
    const h = (y2 - y1) * scaleY;

    ol.style.cssText = `position:absolute;display:block;left:${left}px;top:${top}px;width:${w}px;height:${h}px;border:2px solid #ffffff;box-shadow:0 0 0 9999px rgba(0,0,0,0.65);box-sizing:border-box;pointer-events:none;background:transparent;${cropRatio === 'circle' ? 'border-radius:50%;' : ''}`;
    ol.innerHTML = `
      ${cropRatio !== 'circle' ? `
      <div style="position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr 1fr;pointer-events:none;opacity:0.35;">
        <div style="border-right:1px solid #fff;border-bottom:1px solid #fff;"></div>
        <div style="border-right:1px solid #fff;border-bottom:1px solid #fff;"></div>
        <div style="border-bottom:1px solid #fff;"></div>
        <div style="border-right:1px solid #fff;border-bottom:1px solid #fff;"></div>
        <div style="border-right:1px solid #fff;border-bottom:1px solid #fff;"></div>
        <div style="border-bottom:1px solid #fff;"></div>
      </div>` : ''}
      <div style="position:absolute;left:-6px;top:-6px;width:12px;height:12px;background:#fff;border-radius:50%;border:2px solid #000;"></div>
      <div style="position:absolute;right:-6px;top:-6px;width:12px;height:12px;background:#fff;border-radius:50%;border:2px solid #000;"></div>
      <div style="position:absolute;left:-6px;bottom:-6px;width:12px;height:12px;background:#fff;border-radius:50%;border:2px solid #000;"></div>
      <div style="position:absolute;right:-6px;bottom:-6px;width:12px;height:12px;background:#fff;border-radius:50%;border:2px solid #000;"></div>
      <div style="position:absolute;bottom:6px;left:6px;background:rgba(0,0,0,0.8);color:#fff;padding:2px 8px;border-radius:6px;font-size:11px;font-family:monospace;font-weight:bold;">${Math.round(x2 - x1)} × ${Math.round(y2 - y1)}px</div>
    `;
  }

  function applyCrop() {
    if (!cropStart || !cropEnd) return;
    const x = Math.round(Math.min(cropStart.x, cropEnd.x));
    const y = Math.round(Math.min(cropStart.y, cropEnd.y));
    const w = Math.round(Math.abs(cropEnd.x - cropStart.x));
    const h = Math.round(Math.abs(cropEnd.y - cropStart.y));
    if (w < 10 || h < 10) { cancelCropMode(); return; }

    snapshot();
    const cropped = ctx.getImageData(x, y, w, h);
    canvas.width = w;
    canvas.height = h;
    ctx.putImageData(cropped, 0, 0);

    if (cropRatio === 'circle') {
      const circleCanvas = document.createElement('canvas');
      circleCanvas.width = w;
      circleCanvas.height = h;
      circleCanvas.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0);

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(circleCanvas, 0, 0);
      ctx.restore();
    }

    if (baseImageData) {
      const tmp = document.createElement('canvas');
      tmp.width = baseImageData.width;
      tmp.height = baseImageData.height;
      tmp.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0);
      baseImageData = tmp.getContext('2d').getImageData(x, y, w, h);
    }
    cancelCropMode();
    updateCanvasDimLabel();
    fitZoom();
  }

  function cancelCropMode() {
    cropIsDragging = false;
    cropIsMoving = false;
    cropResizing = false;
    cropStart = null;
    cropEnd = null;
    const ol = document.getElementById('pe-crop-overlay');
    if (ol) { ol.style.cssText = 'display:none;'; ol.innerHTML = ''; }
    const bar = document.getElementById('pe-crop-bar');
    if (bar) bar.style.display = 'none';
    setTool('brush');
  }

  // ── ROTATE & FLIP ─────────────────────────────────────────
  function rotateCanvas(deg) {
    snapshot();
    const oldW = canvas.width, oldH = canvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = oldW; tmp.height = oldH;
    tmp.getContext('2d').drawImage(canvas, 0, 0);

    const is90 = Math.abs(deg) === 90;
    canvas.width = is90 ? oldH : oldW;
    canvas.height = is90 ? oldW : oldH;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(tmp, -oldW / 2, -oldH / 2);
    ctx.restore();

    if (baseImageData) {
      const baseTmp = document.createElement('canvas');
      baseTmp.width = oldW; baseTmp.height = oldH;
      baseTmp.getContext('2d', { willReadFrequently: true }).putImageData(baseImageData, 0, 0);

      const newBaseCanvas = document.createElement('canvas');
      newBaseCanvas.width = canvas.width;
      newBaseCanvas.height = canvas.height;
      const bctx = newBaseCanvas.getContext('2d', { willReadFrequently: true });
      bctx.translate(canvas.width / 2, canvas.height / 2);
      bctx.rotate((deg * Math.PI) / 180);
      bctx.drawImage(baseTmp, -oldW / 2, -oldH / 2);
      baseImageData = bctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    updateCanvasDimLabel();
    fitZoom();
  }

  function flipCanvas(axis) {
    snapshot();
    const w = canvas.width, h = canvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    tmp.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0);

    ctx.save();
    if (axis === 'h') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(0, h);
      ctx.scale(1, -1);
    }
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();

    if (baseImageData) {
      const baseTmp = document.createElement('canvas');
      baseTmp.width = w; baseTmp.height = h;
      baseTmp.getContext('2d', { willReadFrequently: true }).putImageData(baseImageData, 0, 0);

      const bcanvas = document.createElement('canvas');
      bcanvas.width = w; bcanvas.height = h;
      const bctx = bcanvas.getContext('2d', { willReadFrequently: true });
      if (axis === 'h') { bctx.translate(w, 0); bctx.scale(-1, 1); }
      else { bctx.translate(0, h); bctx.scale(1, -1); }
      bctx.drawImage(baseTmp, 0, 0);
      baseImageData = bctx.getImageData(0, 0, w, h);
    }
  }

  // ── VIEWPORT ZOOM & PAN ───────────────────────────────────
  function setZoomLevel(newZoom) {
    zoom = Math.max(0.2, Math.min(4, newZoom));
    applyCanvasTransform();
    updateCanvasDimLabel();
  }

  function fitZoom() {
    const wrap = document.getElementById('pe-canvas-wrap');
    if (!wrap || !canvas) return;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    const padding = 48;
    const availW = Math.max(100, cw - padding);
    const availH = Math.max(100, ch - padding);
    const scale = Math.min(availW / canvas.width, availH / canvas.height, 1);
    zoom = Number(scale.toFixed(2));
    panX = 0;
    panY = 0;
    applyCanvasTransform();
    updateCanvasDimLabel();
  }

  function applyCanvasTransform() {
    if (!canvas) return;
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  // ── TOOL SELECTION & CONTEXT BAR ──────────────────────────
  function setTool(tool) {
    currentTool = tool;
    if (modal) modal.dataset.tool = tool;

    document.querySelectorAll('.pe-tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    const isCrop = tool === 'crop';
    const ol = document.getElementById('pe-crop-overlay');
    if (ol && !isCrop) ol.style.cssText = 'display:none;';
    const cropBar = document.getElementById('pe-crop-bar');
    if (cropBar && !isCrop) cropBar.style.display = 'none';

    // Show contextual bar depending on tool
    const contextCrop = document.getElementById('pe-context-crop');
    const contextSticker = document.getElementById('pe-context-sticker');
    const contextGeneral = document.getElementById('pe-context-general');

    if (contextCrop) contextCrop.style.display = isCrop ? 'flex' : 'none';
    if (contextSticker) contextSticker.style.display = tool === 'sticker' ? 'flex' : 'none';
    if (contextGeneral) contextGeneral.style.display = (!isCrop && tool !== 'sticker') ? 'flex' : 'none';

    if (canvas) {
      canvas.style.cursor = tool === 'text' ? 'text' :
                            tool === 'eyedropper' ? 'cell' :
                            tool === 'hand' ? 'grab' : 'crosshair';
    }
  }

  function updateSwatchUI() {
    document.querySelectorAll('.pe-swatch').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color.toLowerCase() === currentColor.toLowerCase());
    });
    const customInp = document.getElementById('pe-custom-color');
    if (customInp) customInp.value = currentColor;
  }

  function updateStepBadgeUI() {
    const el = document.getElementById('pe-step-val');
    if (el) el.textContent = stepNumber;
  }

  // ── PUBLIC API EXPOSURE ───────────────────────────────────
  window.openPaintEditor = function (imageBase64, onSave) {
    if (!modal) {
      modal = buildModal();
      wireEvents();
    }

    onSaveCallback = onSave;
    undoStack = [];
    redoStack = [];
    cropStart = null;
    cropEnd = null;
    stepNumber = 1;
    zoom = 1;
    panX = 0;
    panY = 0;

    window._paintEditorOpenedAt = Date.now();
    modal.style.display = 'flex';
    modalOpenedAt = Date.now();
    if (window.location.hash !== '#paint-editor') {
      window.location.hash = 'paint-editor';
    }

    canvas = document.getElementById('pe-canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    const img = new Image();
    // Only set crossOrigin if it is a remote HTTP/HTTPS resource, not data: or blob:
    if (typeof imageBase64 === 'string' && (imageBase64.startsWith('http://') || imageBase64.startsWith('https://'))) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      const isMobile = window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024);
      const MAX = isMobile ? 1400 : 2000;
      let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round((h * MAX) / w); w = MAX; }
        else { w = Math.round((w * MAX) / h); h = MAX; }
      }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      try {
        baseImageData = ctx.getImageData(0, 0, w, h);
      } catch (err) {
        console.warn("Could not read baseImageData (canvas cross-origin):", err);
        baseImageData = null;
      }
      originalImage = img;
      undoStack = [];
      redoStack = [];
      refreshHistoryBtns();
      updateCanvasDimLabel();
      setTool('brush');
      setTimeout(fitZoom, 50);
    };

    img.onerror = (e) => {
      console.error("Failed to load image in paint editor:", e);
      // Fallback: If anonymous failed, retry without crossOrigin so user can at least view/draw
      if (img.crossOrigin) {
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          const isMobile = window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024);
          const MAX = isMobile ? 1400 : 2000;
          let w = fallbackImg.naturalWidth || fallbackImg.width, h = fallbackImg.naturalHeight || fallbackImg.height;
          if (w > MAX || h > MAX) {
            if (w > h) { h = Math.round((h * MAX) / w); w = MAX; }
            else { w = Math.round((w * MAX) / h); h = MAX; }
          }
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(fallbackImg, 0, 0, w, h);
          originalImage = fallbackImg;
          undoStack = [];
          redoStack = [];
          refreshHistoryBtns();
          updateCanvasDimLabel();
          setTool('brush');
          setTimeout(fitZoom, 50);
        };
        fallbackImg.onerror = () => {
          alert("Failed to load image into editor. Please check connection.");
        };
        fallbackImg.src = imageBase64;
      } else {
        alert("Failed to load image into editor.");
      }
    };

    img.src = imageBase64;
  };

  function closeEditor() {
    window._paintEditorOpenedAt = 0;
    if (!modal) return;
    modal.style.display = 'none';
    const ol = document.getElementById('pe-crop-overlay');
    if (ol) { ol.style.cssText = 'display:none;'; ol.innerHTML = ''; }
    const tc = document.getElementById('pe-text-container');
    if (tc) tc.remove();
    const bar = document.getElementById('pe-crop-bar');
    if (bar) bar.style.display = 'none';
    if (window.location.hash === '#paint-editor') {
      window.location.hash = 'app';
    }
  }
  window.closePaintEditor = closeEditor;

  function saveAndClose() {
    let out = null;
    try {
      out = canvas.toDataURL('image/jpeg', 0.92);
    } catch (err) {
      console.error("Error exporting canvas image:", err);
      try {
        out = canvas.toDataURL();
      } catch (err2) {
        console.error("Canvas toDataURL totally blocked by browser:", err2);
        alert("Security restriction: unable to export image. Please download the image first or edit a new upload.");
        return;
      }
    }
    closeEditor();
    if (onSaveCallback && out) onSaveCallback(out);
  }

  // ── WIRE EVENTS ───────────────────────────────────────────
  function wireEvents() {
    canvas = document.getElementById('pe-canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd, { passive: false });
    canvas.addEventListener('touchcancel', onEnd, { passive: false });
    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onEnd);
    window.addEventListener('mouseup', onEnd);

    // Zoom via mouse wheel
    const wrap = document.getElementById('pe-canvas-wrap');
    if (wrap) {
      wrap.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        setZoomLevel(zoom + delta);
      }, { passive: false });
    }

    document.getElementById('pe-undo').addEventListener('click', undo);
    document.getElementById('pe-redo').addEventListener('click', redo);
    document.getElementById('pe-cancel').addEventListener('click', closeEditor);
    document.getElementById('pe-save').addEventListener('click', saveAndClose);

    // Zoom Buttons
    document.getElementById('pe-zoom-in')?.addEventListener('click', () => setZoomLevel(zoom + 0.15));
    document.getElementById('pe-zoom-out')?.addEventListener('click', () => setZoomLevel(zoom - 0.15));
    document.getElementById('pe-zoom-fit')?.addEventListener('click', fitZoom);

    // Compare button
    const cmpBtn = document.getElementById('pe-compare');
    if (cmpBtn) {
      const showOrig = () => {
        isComparing = true;
        if (originalImage && canvas) {
          ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
        }
      };
      const restoreWork = () => {
        isComparing = false;
        if (undoStack.length > 0) {
          ctx.putImageData(undoStack[undoStack.length - 1], 0, 0);
        } else if (baseImageData) {
          ctx.putImageData(baseImageData, 0, 0);
        }
      };
      cmpBtn.addEventListener('mousedown', showOrig);
      cmpBtn.addEventListener('mouseup', restoreWork);
      cmpBtn.addEventListener('touchstart', showOrig);
      cmpBtn.addEventListener('touchend', restoreWork);
    }

    // Brush Size
    const sizeEl = document.getElementById('pe-size');
    const updateSize = () => {
      brushSize = +sizeEl.value;
      const dot = document.getElementById('pe-size-dot');
      if (dot) {
        dot.style.width = dot.style.height = `${Math.max(4, Math.min(24, brushSize))}px`;
        dot.style.background = currentColor;
      }
      const val = document.getElementById('pe-size-val');
      if (val) val.textContent = brushSize;
    };
    sizeEl.addEventListener('input', updateSize);
    updateSize();

    // Opacity
    const opacEl = document.getElementById('pe-opacity');
    if (opacEl) {
      opacEl.addEventListener('input', e => {
        opacity = +e.target.value / 100;
        const val = document.getElementById('pe-opacity-val');
        if (val) val.textContent = `${Math.round(opacity * 100)}%`;
      });
    }

    // Shape Fill Toggle
    const fillBtn = document.getElementById('pe-shape-fill');
    if (fillBtn) {
      fillBtn.addEventListener('click', () => {
        shapeFill = !shapeFill;
        fillBtn.textContent = shapeFill ? 'Filled' : 'Outline';
        fillBtn.classList.toggle('active', shapeFill);
      });
    }

    // Eraser Mode Toggle (Restore photo vs Alpha)
    const eraserModeBtn = document.getElementById('pe-eraser-mode');
    if (eraserModeBtn) {
      eraserModeBtn.addEventListener('click', () => {
        eraserMode = eraserMode === 'restore' ? 'alpha' : 'restore';
        eraserModeBtn.textContent = eraserMode === 'restore' ? 'Magic Photo Restore' : 'Transparent Cut';
      });
    }

    // Crop Actions
    document.getElementById('pe-crop-apply').addEventListener('click', applyCrop);
    document.getElementById('pe-crop-cancel-btn').addEventListener('click', cancelCropMode);

    // Crop Aspect Ratio Selectors
    document.querySelectorAll('.pe-crop-ratio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pe-crop-ratio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        cropRatio = btn.dataset.ratio;
      });
    });

    // Transform buttons
    document.getElementById('pe-rot-left')?.addEventListener('click', () => rotateCanvas(-90));
    document.getElementById('pe-rot-right')?.addEventListener('click', () => rotateCanvas(90));
    document.getElementById('pe-flip-h')?.addEventListener('click', () => flipCanvas('h'));
    document.getElementById('pe-flip-v')?.addEventListener('click', () => flipCanvas('v'));

    // Tool click handlers
    document.querySelectorAll('.pe-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });

    // Swatches
    document.querySelectorAll('.pe-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        currentColor = btn.dataset.color;
        updateSwatchUI();
        updateSize();
        if (currentTool === 'eraser' || currentTool === 'crop') setTool('brush');
      });
    });

    const customColor = document.getElementById('pe-custom-color');
    if (customColor) {
      customColor.addEventListener('input', e => {
        currentColor = e.target.value;
        updateSwatchUI();
        updateSize();
      });
    }

    // Sticker Selection
    document.querySelectorAll('.pe-sticker-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pe-sticker-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeSticker = btn.dataset.sticker;
      });
    });

    // Keyboard Shortcuts (Ctrl+Z, Ctrl+Y, Esc)
    window.addEventListener('keydown', e => {
      if (!modal || modal.style.display === 'none') return;
      if (e.target.tagName === 'INPUT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') {
        if (currentTool === 'crop') cancelCropMode();
      }
    });

    // Android back button hash listener
    window.addEventListener('hashchange', () => {
      if (modal && modal.style.display !== 'none' && window.location.hash !== '#paint-editor') {
        if (Date.now() - modalOpenedAt < 500) {
          window.history.replaceState(null, '', '#paint-editor');
          return;
        }
        modal.style.display = 'none';
        const ol = document.getElementById('pe-crop-overlay');
        if (ol) ol.style.cssText = 'display:none;';
      }
    });
  }

  // ── BUILD MODAL MARKUP & EMBEDDED STYLES ──────────────────
  function buildModal() {
    const style = document.createElement('style');
    style.textContent = `
      #paint-editor-modal {
        --pe-accent: #f43f5e;
        --pe-bg: #09090b;
        --pe-panel: #121216;
        --pe-chip: #1a1a22;
        --pe-line: rgba(255, 255, 255, 0.08);
        --pe-text: #f8fafc;
        --pe-mute: #94a3b8;
        font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      }
      #paint-editor-modal * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      #paint-editor-modal button { font-family: inherit; cursor: pointer; touch-action: manipulation; }

      /* Top bar */
      #paint-editor-modal .pe-top {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: calc(8px + env(safe-area-inset-top, 0px)) 16px 8px;
        background: var(--pe-panel); border-bottom: 1px solid var(--pe-line); flex-shrink: 0;
      }
      #paint-editor-modal .pe-pill {
        display: flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px;
        border-radius: 10px; border: 1px solid var(--pe-line); background: var(--pe-chip);
        color: var(--pe-text); font-size: 13px; font-weight: 600; transition: all .15s;
      }
      #paint-editor-modal .pe-pill:active { transform: scale(0.96); }
      #paint-editor-modal .pe-pill:disabled { opacity: 0.3; cursor: default; }
      #paint-editor-modal .pe-pill.active { background: var(--pe-accent); color: #fff; border-color: transparent; }
      #paint-editor-modal #pe-save {
        background: linear-gradient(135deg, #e11d48, #f43f5e); color: #fff; border: none;
        box-shadow: 0 4px 14px rgba(244, 63, 94, 0.35); font-weight: 700; padding: 0 18px;
      }

      /* Canvas Wrap */
      #paint-editor-modal #pe-canvas-wrap {
        flex: 1; display: flex; align-items: center; justify-content: center;
        overflow: hidden; position: relative; background: #0c0c0e;
        background-image: linear-gradient(45deg, #141418 25%, transparent 25%),
                          linear-gradient(-45deg, #141418 25%, transparent 25%),
                          linear-gradient(45deg, transparent 75%, #141418 75%),
                          linear-gradient(-45deg, transparent 75%, #141418 75%);
        background-size: 20px 20px;
      }
      #paint-editor-modal #pe-canvas {
        transition: transform 0.05s linear;
        box-shadow: 0 16px 64px rgba(0,0,0,0.8);
      }

      /* Context Option Bar */
      #paint-editor-modal .pe-context-strip {
        background: #16161c; border-bottom: 1px solid var(--pe-line);
        padding: 8px 16px; display: flex; align-items: center; justify-content: center;
        gap: 16px; flex-shrink: 0; font-size: 12px; overflow-x: auto;
      }

      /* Crop Action Bar */
      #paint-editor-modal #pe-crop-bar {
        display: none; background: var(--pe-panel); padding: 8px 16px;
        justify-content: center; gap: 12px; border-top: 1px solid var(--pe-line); flex-shrink: 0;
      }
      #paint-editor-modal #pe-crop-apply {
        border: none; color: #fff; font-size: 13px; font-weight: 700; padding: 0 20px;
        height: 36px; border-radius: 10px; background: #10b981;
      }
      #paint-editor-modal #pe-crop-cancel-btn {
        background: var(--pe-chip); border: 1px solid var(--pe-line); color: var(--pe-text);
        font-size: 13px; font-weight: 600; padding: 0 16px; height: 36px; border-radius: 10px;
      }

      /* Bottom Toolbar */
      #paint-editor-modal .pe-bottom {
        background: var(--pe-panel); border-top: 1px solid var(--pe-line);
        padding: 8px 12px calc(10px + env(safe-area-inset-bottom, 0px)); flex-shrink: 0;
        box-shadow: 0 -8px 30px rgba(0,0,0,0.5);
      }
      #paint-editor-modal .pe-tools {
        display: flex; gap: 6px; max-width: 900px; margin: 0 auto; overflow-x: auto; padding-bottom: 6px;
      }
      #paint-editor-modal .pe-tool-btn {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 3px; min-width: 54px; height: 52px; border-radius: 12px; border: 1px solid transparent;
        background: var(--pe-chip); color: var(--pe-mute); font-size: 11px; font-weight: 700;
        transition: all .15s; flex-shrink: 0;
      }
      #paint-editor-modal .pe-tool-btn svg { width: 18px; height: 18px; }
      #paint-editor-modal .pe-tool-btn.active {
        background: linear-gradient(135deg, #e11d48, #f43f5e);
        color: #fff; box-shadow: 0 4px 14px rgba(244, 63, 94, 0.35); border-color: rgba(255,255,255,0.2);
      }

      /* Controls & Sliders */
      #paint-editor-modal .pe-opts { max-width: 900px; margin: 6px auto 0; display: flex; flex-direction: column; gap: 6px; }
      #paint-editor-modal .pe-size-row { display: flex; align-items: center; gap: 10px; }
      #paint-editor-modal .pe-size-label { font-size: 11px; font-weight: 700; color: var(--pe-mute); width: 34px; }
      #paint-editor-modal .pe-size-preview { width: 28px; height: 28px; border-radius: 50%; background: var(--pe-chip); display: flex; align-items: center; justify-content: center; }
      #paint-editor-modal #pe-size-dot { border-radius: 50%; background: #f43f5e; }
      #paint-editor-modal input[type="range"] { flex: 1; accent-color: var(--pe-accent); cursor: pointer; }
      #paint-editor-modal #pe-size-val { width: 24px; font-size: 12px; font-weight: 700; text-align: right; font-family: monospace; }

      #paint-editor-modal .pe-colors { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; padding: 2px 0; }
      #paint-editor-modal .pe-swatch, #paint-editor-modal .pe-wheel {
        width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
        border: 2px solid rgba(255,255,255,0.15); transition: transform .1s;
      }
      #paint-editor-modal .pe-swatch.active { border-color: #fff; transform: scale(1.2); box-shadow: 0 0 0 2px var(--pe-accent); }
      #paint-editor-modal .pe-wheel {
        background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red);
        position: relative; overflow: hidden;
      }
      #paint-editor-modal .pe-wheel input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

      .pe-chip-btn {
        padding: 4px 10px; border-radius: 8px; border: 1px solid var(--pe-line);
        background: var(--pe-chip); color: var(--pe-text); font-size: 11px; font-weight: 600;
      }
      .pe-chip-btn.active { background: var(--pe-accent); border-color: transparent; }
    `;
    document.head.appendChild(style);

    const SWATCHES = [
      '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4',
      '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#ffffff', '#94a3b8', '#0f172a'
    ];

    const STICKERS = ['🔥', '⚠️', '🎯', '❤️', '👀', '🚀', '⭐', '💡', '👍', '💬', '✅', '❌'];

    const el = document.createElement('div');
    el.id = 'paint-editor-modal';
    el.dataset.tool = 'brush';
    el.style.cssText = 'display:none;position:fixed;inset:0;background:var(--pe-bg);z-index:100001;flex-direction:column;touch-action:none;';
    el.innerHTML = `
      <!-- TOP NAVIGATION BAR -->
      <div class="pe-top">
        <button id="pe-cancel" class="pe-pill" type="button">Cancel</button>

        <div style="display:flex;align-items:center;gap:6px;overflow-x:auto;">
          <span id="pe-dim-label" style="font-size:11px;color:var(--pe-mute);font-family:monospace;margin-right:6px;white-space:nowrap;">1200 × 800px</span>
          <button id="pe-undo" class="pe-pill" type="button" disabled title="Undo (Ctrl+Z)">↩</button>
          <button id="pe-redo" class="pe-pill" type="button" disabled title="Redo (Ctrl+Y)">↪</button>
          <button id="pe-compare" class="pe-pill" type="button" title="Hold to compare original">👁 Compare</button>
          <button id="pe-rot-left" class="pe-pill" type="button" title="Rotate Left 90°">↺</button>
          <button id="pe-rot-right" class="pe-pill" type="button" title="Rotate Right 90°">↻</button>
          <button id="pe-flip-h" class="pe-pill" type="button" title="Flip Horizontal">⇄</button>
          <button id="pe-flip-v" class="pe-pill" type="button" title="Flip Vertical">⇅</button>
          <button id="pe-zoom-fit" class="pe-pill" type="button" title="Fit to Screen">⛶</button>
        </div>

        <button id="pe-save" class="pe-pill" type="button">Save</button>
      </div>

      <!-- CONTEXTUAL SECONDARY STRIP -->
      <!-- Crop Ratio Strip -->
      <div id="pe-context-crop" class="pe-context-strip" style="display:none;">
        <span style="color:var(--pe-mute);font-weight:700;">Ratio:</span>
        <button class="pe-chip-btn pe-crop-ratio-btn active" data-ratio="free">Free</button>
        <button class="pe-chip-btn pe-crop-ratio-btn" data-ratio="1:1">1:1 Square</button>
        <button class="pe-chip-btn pe-crop-ratio-btn" data-ratio="16:9">16:9 Banner</button>
        <button class="pe-chip-btn pe-crop-ratio-btn" data-ratio="4:3">4:3 Post</button>
        <button class="pe-chip-btn pe-crop-ratio-btn" data-ratio="9:16">9:16 Story</button>
        <button class="pe-chip-btn pe-crop-ratio-btn" data-ratio="3:2">3:2 Photo</button>
        <button class="pe-chip-btn pe-crop-ratio-btn" data-ratio="circle">⚪ Avatar</button>
      </div>

      <!-- Sticker Strip -->
      <div id="pe-context-sticker" class="pe-context-strip" style="display:none;">
        <span style="color:var(--pe-mute);font-weight:700;">Tap Sticker to Stamp:</span>
        ${STICKERS.map((s, i) => `<button class="pe-chip-btn pe-sticker-opt${i === 0 ? ' active' : ''}" data-sticker="${s}" style="font-size:16px;">${s}</button>`).join('')}
      </div>

      <!-- General Options Strip (Fill, Eraser Mode, Step Badge) -->
      <div id="pe-context-general" class="pe-context-strip">
        <button id="pe-shape-fill" class="pe-chip-btn" type="button" title="Toggle Shape Fill or Outline">Outline</button>
        <button id="pe-eraser-mode" class="pe-chip-btn" type="button" title="Toggle restore original vs alpha erase">Magic Photo Restore</button>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="color:var(--pe-mute);">Step #:</span>
          <span id="pe-step-val" style="font-weight:bold;color:var(--pe-accent);font-family:monospace;">1</span>
        </div>
      </div>

      <!-- CANVAS VIEWPORT -->
      <div id="pe-canvas-wrap">
        <canvas id="pe-canvas" style="touch-action:none;display:block;max-width:none;"></canvas>
        <div id="pe-crop-overlay" style="display:none;position:absolute;"></div>
      </div>

      <!-- CROP ACTION BAR -->
      <div id="pe-crop-bar">
        <button id="pe-crop-apply" type="button">✓ Apply Crop</button>
        <button id="pe-crop-cancel-btn" type="button">Cancel</button>
      </div>

      <!-- BOTTOM SUITE (Expanded Pro Tools) -->
      <div class="pe-bottom">
        <div class="pe-tools">
          <button class="pe-tool-btn active" data-tool="brush" type="button" title="Smooth Brush">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18"/></svg>
            <span>Brush</span>
          </button>
          <button class="pe-tool-btn" data-tool="highlighter" type="button" title="Marker / Highlighter">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11-6 6v3h3l6-6"/><path d="m22 2-7.5 7.5L17 12l7.5-7.5z"/></svg>
            <span>Marker</span>
          </button>
          <button class="pe-tool-btn" data-tool="pen" type="button" title="Precision Ink Pen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18"/></svg>
            <span>Pen</span>
          </button>
          <button class="pe-tool-btn" data-tool="neon" type="button" title="Neon Glow Pen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg>
            <span>Neon</span>
          </button>
          <button class="pe-tool-btn" data-tool="eraser" type="button" title="Eraser">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
            <span>Erase</span>
          </button>
          <button class="pe-tool-btn" data-tool="arrow" type="button" title="Directional Arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            <span>Arrow</span>
          </button>
          <button class="pe-tool-btn" data-tool="double_arrow" type="button" title="Two-way Dimension Arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/><polyline points="12 19 5 12 12 5"/></svg>
            <span>2-Arrow</span>
          </button>
          <button class="pe-tool-btn" data-tool="rect" type="button" title="Rectangle Box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            <span>Rect</span>
          </button>
          <button class="pe-tool-btn" data-tool="circle" type="button" title="Circle / Ellipse">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
            <span>Circle</span>
          </button>
          <button class="pe-tool-btn" data-tool="speech_bubble" type="button" title="Speech Callout Bubble">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Callout</span>
          </button>
          <button class="pe-tool-btn" data-tool="pixelate" type="button" title="Privacy Censor (Mosaic)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span>Mosaic</span>
          </button>
          <button class="pe-tool-btn" data-tool="blur" type="button" title="Privacy Censor (Blur)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8" stroke-dasharray="2 2"/></svg>
            <span>Blur</span>
          </button>
          <button class="pe-tool-btn" data-tool="step_badge" type="button" title="Numbered Step Markers (1, 2, 3...)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M10 10l2-2"/></svg>
            <span>1-2-3</span>
          </button>
          <button class="pe-tool-btn" data-tool="text" type="button" title="Typography Text">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
            <span>Text</span>
          </button>
          <button class="pe-tool-btn" data-tool="sticker" type="button" title="Stickers & Emojis">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            <span>Sticker</span>
          </button>
          <button class="pe-tool-btn" data-tool="crop" type="button" title="Interactive Crop & Aspect Ratios">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
            <span>Crop</span>
          </button>
          <button class="pe-tool-btn" data-tool="eyedropper" type="button" title="Eyedropper Color Picker">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m2 22 1-1h3l9-9"/><path d="M14 6l4 4"/><circle cx="18" cy="6" r="3"/></svg>
            <span>Pick</span>
          </button>
          <button class="pe-tool-btn" data-tool="hand" type="button" title="Hand Pan Viewport">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v7"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
            <span>Hand</span>
          </button>
        </div>

        <!-- OPTIONS: SIZE, OPACITY & COLOR PALETTE -->
        <div class="pe-opts">
          <div class="pe-size-row">
            <span class="pe-size-label">Size</span>
            <div class="pe-size-preview"><div id="pe-size-dot"></div></div>
            <input type="range" id="pe-size" min="2" max="60" value="8">
            <span id="pe-size-val">8</span>

            <span class="pe-size-label" style="margin-left:12px;width:44px;">Opacity</span>
            <input type="range" id="pe-opacity" min="15" max="100" value="100" style="max-width:120px;">
            <span id="pe-opacity-val" style="font-size:12px;font-family:monospace;width:38px;">100%</span>
          </div>

          <div class="pe-colors">
            ${SWATCHES.map((c, i) => `<button class="pe-swatch${i === 8 ? ' active' : ''}" type="button" data-color="${c}" style="background:${c};" aria-label="Color ${c}"></button>`).join('')}
            <label class="pe-wheel" title="Custom color picker">
              <input type="color" id="pe-custom-color" value="#f43f5e">
            </label>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    return el;
  }
})();
