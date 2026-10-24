// paint-editor.js — Canvas paint editor for Chubby Chat
// Replaces Cropper.js + Filerobot. Works for background picker and chat annotation.
// Exposes: window.openPaintEditor(imageBase64, onSave)

(function () {
  'use strict';

  let modal        = null;
  let canvas       = null;
  let ctx          = null;
  let baseImageData = null;   // Original pixels — used by eraser to restore

  let isDrawing    = false;
  let lastPos      = null;
  let currentTool  = 'brush';
  let currentColor = '#e8407a';
  let brushSize    = 6;

  let undoStack    = [];
  let redoStack    = [];
  let onSaveCallback = null;

  // Crop state
  let cropIsDragging   = false;   // drawing a new crop rect
  let cropIsMoving     = false;   // dragging the whole rect
  let cropResizing     = false;   // dragging a resize handle
  let cropResizeHandle = null;    // 'nw'|'ne'|'sw'|'se'|'n'|'s'|'e'|'w'
  let cropStart        = null;    // normalised top-left  {x,y}
  let cropEnd          = null;    // normalised bot-right {x,y}
  let cropMoveOrigin   = null;
  let cropBoxAtStart   = null;

  // ── COORDINATE HELPER ──────────────────────────────────────
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;
    const src = e.touches          ? e.touches[0]
              : e.changedTouches   ? e.changedTouches[0]
              : e;
    return {
      x: (src.clientX - rect.left) * sx,
      y: (src.clientY - rect.top)  * sy
    };
  }

  // ── UNDO / REDO ───────────────────────────────────────────
  function snapshot() {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > 25) undoStack.shift();
    redoStack = [];
    refreshHistoryBtns();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(undoStack.pop(), 0, 0);
    refreshHistoryBtns();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.putImageData(redoStack.pop(), 0, 0);
    refreshHistoryBtns();
  }

  function refreshHistoryBtns() {
    const u = document.getElementById('pe-undo');
    const r = document.getElementById('pe-redo');
    if (u) u.disabled = !undoStack.length;
    if (r) r.disabled = !redoStack.length;
  }

  // ── DRAW EVENTS ───────────────────────────────────────────
  function onStart(e) {
    e.preventDefault();
    if (currentTool === 'text')  { showTextInput(e); return; }
    if (currentTool === 'crop')  { startCrop(e);     return; }
    snapshot();
    isDrawing = true;
    lastPos   = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineCap   = 'round';
    ctx.lineJoin  = 'round';
    if (currentTool !== 'eraser') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = currentColor;
      ctx.lineWidth   = brushSize;
    }
  }

  function onMove(e) {
    e.preventDefault();
    if (currentTool === 'crop') { moveCrop(e); return; }
    if (!isDrawing) return;
    const pos = getPos(e);

    if (currentTool === 'eraser') {
      // Restore original image pixels in a circle — clean erase back to source
      const r = Math.ceil(brushSize * 2.5);
      const dx = pos.x - lastPos.x;
      const dy = pos.y - lastPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(1, Math.floor(dist / Math.max(1, r * 0.4)));
      for (let i = 0; i <= steps; i++) {
        const t  = steps === 0 ? 0 : i / steps;
        const ix = Math.round(lastPos.x + dx * t);
        const iy = Math.round(lastPos.y + dy * t);
        const sx = Math.max(0, ix - r);
        const sy = Math.max(0, iy - r);
        const sw = Math.min(r * 2, canvas.width  - sx);
        const sh = Math.min(r * 2, canvas.height - sy);
        if (sw > 0 && sh > 0) ctx.putImageData(baseImageData, 0, 0, sx, sy, sw, sh);
      }
    } else {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    lastPos = pos;
  }

  function onEnd(e) {
    if (currentTool === 'crop') { endCrop(e); return; }
    isDrawing = false;
    lastPos   = null;
  }

  // ── TEXT TOOL ─────────────────────────────────────────────
  function showTextInput(e) {
    const pos      = getPos(e);
    const rect     = canvas.getBoundingClientRect();
    const sx       = rect.width  / canvas.width;
    const sy       = rect.height / canvas.height;
    const wrap     = document.getElementById('pe-canvas-wrap');
    const wrapRect = wrap.getBoundingClientRect();
    const ox       = rect.left - wrapRect.left;
    const oy       = rect.top  - wrapRect.top;
    const fontSize = brushSize * 2 + 14;

    const old = document.getElementById('pe-text-container');
    if (old) old.remove();

    const inp = document.createElement('div');
    inp.id = 'pe-text-container';
    inp.style.cssText = `position:absolute;left:${ox + pos.x * sx}px;top:${oy + pos.y * sy - fontSize}px;z-index:20;display:flex;align-items:center;gap:8px;background:rgba(0,0,0,0.5);padding:6px 8px 6px 12px;border-radius:16px;backdrop-filter:blur(6px);`;
    inp.innerHTML = `
      <input id="pe-text-field" type="text" placeholder="Type here…"
        style="background:transparent;border:none;border-bottom:2px solid ${currentColor};
               color:${currentColor};font-size:${fontSize}px;font-weight:700;outline:none;
               min-width:120px;max-width:240px;font-family:sans-serif;
               text-shadow:0 1px 3px rgba(0,0,0,0.85);padding:2px 4px;">
      <button id="pe-text-ok"
        style="background:#e8407a;border:none;color:#fff;width:40px;height:40px;
               border-radius:50%;cursor:pointer;font-size:18px;font-weight:700;flex-shrink:0;">✓</button>`;
    wrap.appendChild(inp);

    const field = document.getElementById('pe-text-field');
    field.focus();

    const commit = () => {
      const text = field.value.trim();
      if (text) {
        snapshot();
        ctx.globalCompositeOperation = 'source-over';
        ctx.font        = `700 ${fontSize}px sans-serif`;
        ctx.lineWidth   = Math.max(1, fontSize / 10);
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(text, pos.x, pos.y);
        ctx.fillStyle   = currentColor;
        ctx.fillText(text, pos.x, pos.y);
      }
      inp.remove();
    };

    document.getElementById('pe-text-ok').addEventListener('click', commit);
    field.addEventListener('keydown', ev => {
      if (ev.key === 'Enter')  commit();
      if (ev.key === 'Escape') inp.remove();
    });
  }

  // ── CROP TOOL ─────────────────────────────────────────────

  /** Normalise cropStart/cropEnd so start=top-left, end=bot-right */
  function normaliseCrop() {
    if (!cropStart || !cropEnd) return;
    const x1 = Math.min(cropStart.x, cropEnd.x);
    const y1 = Math.min(cropStart.y, cropEnd.y);
    const x2 = Math.max(cropStart.x, cropEnd.x);
    const y2 = Math.max(cropStart.y, cropEnd.y);
    cropStart = { x: x1, y: y1 };
    cropEnd   = { x: x2, y: y2 };
  }

  /** Hit-test pos (canvas-space) against the 8 resize handles.
   *  Returns handle name or null.  Hit radius is ~20 screen-px. */
  function getResizeHandle(pos) {
    if (!cropStart || !cropEnd) return null;
    const cr = canvas.getBoundingClientRect();
    // Convert 20 screen-px into canvas-px
    const r  = 20 * (canvas.width / cr.width);
    const x1 = cropStart.x, y1 = cropStart.y;
    const x2 = cropEnd.x,   y2 = cropEnd.y;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const d  = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
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

  const HANDLE_CURSORS = {
    nw: 'nw-resize', ne: 'ne-resize', sw: 'sw-resize', se: 'se-resize',
    n:  'n-resize',  s:  's-resize',  w:  'w-resize',  e:  'e-resize'
  };

  /** Returns true if pos is strictly inside the crop box (excluding handles) */
  function insideCropBox(px, py) {
    if (!cropStart || !cropEnd) return false;
    return px > cropStart.x && px < cropEnd.x &&
           py > cropStart.y && py < cropEnd.y;
  }

  function startCrop(e) {
    const pos = getPos(e);

    if (cropStart && cropEnd) {
      // 1 — resize handle hit?
      const handle = getResizeHandle(pos);
      if (handle) {
        normaliseCrop();
        cropResizing     = true;
        cropIsMoving     = false;
        cropIsDragging   = false;
        cropResizeHandle = handle;
        setCropCursor(HANDLE_CURSORS[handle]);
        return;
      }
      // 2 — inside box → move
      if (insideCropBox(pos.x, pos.y)) {
        normaliseCrop();
        cropIsMoving   = true;
        cropIsDragging = false;
        cropResizing   = false;
        cropMoveOrigin = pos;
        cropBoxAtStart = { start: { ...cropStart }, end: { ...cropEnd } };
        setCropCursor('move');
        return;
      }
    }

    // 3 — outside → draw new box
    cropIsDragging   = true;
    cropIsMoving     = false;
    cropResizing     = false;
    cropResizeHandle = null;
    cropStart = pos;
    cropEnd   = { ...pos };
    renderCropOverlay();
  }

  function moveCrop(e) {
    e.preventDefault();
    const pos = getPos(e);

    // ── RESIZE ──────────────────────────────────────────────
    if (cropResizing && cropResizeHandle) {
      switch (cropResizeHandle) {
        case 'nw': cropStart.x = pos.x; cropStart.y = pos.y; break;
        case 'ne': cropEnd.x   = pos.x; cropStart.y = pos.y; break;
        case 'sw': cropStart.x = pos.x; cropEnd.y   = pos.y; break;
        case 'se': cropEnd.x   = pos.x; cropEnd.y   = pos.y; break;
        case 'n':  cropStart.y = pos.y; break;
        case 's':  cropEnd.y   = pos.y; break;
        case 'w':  cropStart.x = pos.x; break;
        case 'e':  cropEnd.x   = pos.x; break;
      }
      renderCropOverlay();
      return;
    }

    // ── MOVE ────────────────────────────────────────────────
    if (cropIsMoving && cropMoveOrigin) {
      const dx = pos.x - cropMoveOrigin.x;
      const dy = pos.y - cropMoveOrigin.y;
      cropStart = { x: cropBoxAtStart.start.x + dx, y: cropBoxAtStart.start.y + dy };
      cropEnd   = { x: cropBoxAtStart.end.x   + dx, y: cropBoxAtStart.end.y   + dy };
      renderCropOverlay();
      return;
    }

    // ── DRAWING ─────────────────────────────────────────────
    if (cropIsDragging) {
      cropEnd = pos;
      renderCropOverlay();
      return;
    }

    // ── HOVER CURSOR (no button held) ───────────────────────
    if (cropStart && cropEnd) {
      const handle = getResizeHandle(pos);
      if (handle) {
        setCropCursor(HANDLE_CURSORS[handle]);
      } else if (insideCropBox(pos.x, pos.y)) {
        setCropCursor('move');
      } else {
        setCropCursor('crosshair');
      }
    }
  }

  function endCrop(e) {
    if (cropResizing) {
      cropResizing     = false;
      cropResizeHandle = null;
      normaliseCrop();
      renderCropOverlay();
      document.getElementById('pe-crop-bar').style.display = 'flex';
      setCropCursor('crosshair');
      return;
    }
    if (cropIsMoving) {
      cropIsMoving   = false;
      cropMoveOrigin = null;
      cropBoxAtStart = null;
      setCropCursor('crosshair');
      return;
    }
    if (!cropIsDragging) return;
    cropIsDragging = false;
    const src  = e.changedTouches ? e.changedTouches[0] : e;
    const rect = canvas.getBoundingClientRect();
    cropEnd = {
      x: (src.clientX - rect.left) * (canvas.width  / rect.width),
      y: (src.clientY - rect.top)  * (canvas.height / rect.height)
    };
    normaliseCrop();
    renderCropOverlay();
    document.getElementById('pe-crop-bar').style.display = 'flex';
  }

  function setCropCursor(type) {
    if (canvas) canvas.style.cursor = type;
  }

  function renderCropOverlay() {
    if (!cropStart) return;
    const ol       = document.getElementById('pe-crop-overlay');
    const wrap     = document.getElementById('pe-canvas-wrap');
    const wrapRect = wrap.getBoundingClientRect();
    const cr       = canvas.getBoundingClientRect();
    const scaleX = cr.width  / canvas.width;
    const scaleY = cr.height / canvas.height;
    const ox = cr.left - wrapRect.left;
    const oy = cr.top  - wrapRect.top;

    // Use normalised values so handles always appear on the real corners/edges
    const x1 = Math.min(cropStart.x, cropEnd.x);
    const y1 = Math.min(cropStart.y, cropEnd.y);
    const x2 = Math.max(cropStart.x, cropEnd.x);
    const y2 = Math.max(cropStart.y, cropEnd.y);

    const left = x1 * scaleX + ox;
    const top  = y1 * scaleY + oy;
    const w    = (x2 - x1) * scaleX;
    const h    = (y2 - y1) * scaleY;

    ol.style.cssText = `position:absolute;display:block;left:${left}px;top:${top}px;
      width:${w}px;height:${h}px;border:2px solid rgba(255,255,255,0.9);
      box-shadow:0 0 0 9999px rgba(0,0,0,0.52);box-sizing:border-box;
      pointer-events:none;background:transparent;`;

    // Rebuild handles every time so they're always in the right positions
    ol.innerHTML = '';

    // Rule of thirds grid lines
    const rl = document.createElement('div');
    rl.style.cssText = `position:absolute;inset:0;pointer-events:none;
      background:
        linear-gradient(to right,  transparent calc(33.3% - 0.5px), rgba(255,255,255,0.25) calc(33.3% - 0.5px), rgba(255,255,255,0.25) calc(33.3% + 0.5px), transparent calc(33.3% + 0.5px)),
        linear-gradient(to right,  transparent calc(66.6% - 0.5px), rgba(255,255,255,0.25) calc(66.6% - 0.5px), rgba(255,255,255,0.25) calc(66.6% + 0.5px), transparent calc(66.6% + 0.5px)),
        linear-gradient(to bottom, transparent calc(33.3% - 0.5px), rgba(255,255,255,0.25) calc(33.3% - 0.5px), rgba(255,255,255,0.25) calc(33.3% + 0.5px), transparent calc(33.3% + 0.5px)),
        linear-gradient(to bottom, transparent calc(66.6% - 0.5px), rgba(255,255,255,0.25) calc(66.6% - 0.5px), rgba(255,255,255,0.25) calc(66.6% + 0.5px), transparent calc(66.6% + 0.5px));`;
    ol.appendChild(rl);

    // 8 handles: 4 corners (round) + 4 edge midpoints (square)
    const handles = [
      // corners — larger, round
      { pos: 'top:0;left:0',           tf: 'translate(-50%,-50%)', round: true  },
      { pos: 'top:0;right:0',          tf: 'translate(50%,-50%)',  round: true  },
      { pos: 'bottom:0;left:0',        tf: 'translate(-50%,50%)',  round: true  },
      { pos: 'bottom:0;right:0',       tf: 'translate(50%,50%)',   round: true  },
      // edges — smaller, square
      { pos: 'top:0;left:50%',         tf: 'translate(-50%,-50%)', round: false },
      { pos: 'bottom:0;left:50%',      tf: 'translate(-50%,50%)',  round: false },
      { pos: 'top:50%;left:0',         tf: 'translate(-50%,-50%)', round: false },
      { pos: 'top:50%;right:0',        tf: 'translate(50%,-50%)',  round: false },
    ];

    handles.forEach(({ pos, tf, round }) => {
      const dot = document.createElement('div');
      const size = round ? '14px' : '10px';
      dot.style.cssText = `position:absolute;width:${size};height:${size};
        background:#fff;border:2px solid rgba(0,0,0,0.5);
        border-radius:${round ? '50%' : '2px'};
        ${pos};transform:${tf};pointer-events:none;
        box-shadow:0 1px 4px rgba(0,0,0,0.6);`;
      ol.appendChild(dot);
    });
  }

  function applyCrop() {
    if (!cropStart || !cropEnd) return;
    const x = Math.round(Math.min(cropStart.x, cropEnd.x));
    const y = Math.round(Math.min(cropStart.y, cropEnd.y));
    const w = Math.round(Math.abs(cropEnd.x - cropStart.x));
    const h = Math.round(Math.abs(cropEnd.y - cropStart.y));
    if (w < 10 || h < 10) { cancelCropMode(); return; }

    snapshot();

    // Crop the base image data for eraser accuracy after cropping
    const tmpC   = document.createElement('canvas');
    tmpC.width   = canvas.width;
    tmpC.height  = canvas.height;
    tmpC.getContext('2d').putImageData(baseImageData, 0, 0);
    baseImageData = tmpC.getContext('2d').getImageData(x, y, w, h);

    // Crop the working canvas
    const cropped  = ctx.getImageData(x, y, w, h);
    canvas.width   = w;
    canvas.height  = h;
    ctx.putImageData(cropped, 0, 0);

    cancelCropMode();
  }

  function cancelCropMode() {
    cropIsDragging   = false;
    cropIsMoving     = false;
    cropResizing     = false;
    cropResizeHandle = null;
    cropStart        = null;
    cropEnd          = null;
    cropMoveOrigin   = null;
    cropBoxAtStart   = null;
    const ol = document.getElementById('pe-crop-overlay');
    if (ol) { ol.style.cssText = 'display:none;'; ol.innerHTML = ''; }
    document.getElementById('pe-crop-bar').style.display = 'none';
    setTool('brush');
  }

  // ── TOOL SELECT ───────────────────────────────────────────
  const TOOL_HINTS = {
    brush:  'Draw with your finger or mouse',
    eraser: 'Rub over your drawing to restore the original',
    text:   'Tap where you want to type',
    crop:   'Drag to choose the area to keep'
  };
  function setTool(tool) {
    currentTool = tool;
    if (modal) modal.dataset.tool = tool;
    document.querySelectorAll('.pe-tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    const hint = document.getElementById('pe-hint');
    if (hint) hint.textContent = TOOL_HINTS[tool] || '';
    if (tool !== 'crop') {
      const ol = document.getElementById('pe-crop-overlay');
      if (ol) ol.style.cssText = 'display:none;';
      document.getElementById('pe-crop-bar').style.display = 'none';
    }
    if (canvas) canvas.style.cursor = tool === 'text' ? 'text' : 'crosshair';
  }

  // ── PUBLIC API ────────────────────────────────────────────
  window.openPaintEditor = function (imageBase64, onSave) {
    if (!modal) {
      modal = buildModal();
      wireEvents();
    }

    onSaveCallback   = onSave;
    undoStack        = [];
    redoStack        = [];
    cropStart        = null;
    cropEnd          = null;
    cropIsDragging   = false;
    cropIsMoving     = false;
    cropResizing     = false;
    cropResizeHandle = null;

    modal.style.display = 'flex';
    window.history.pushState(null, '', '#paint-editor');

    canvas = document.getElementById('pe-canvas');
    ctx    = canvas.getContext('2d');

    const img = new Image();
    img.onload = () => {
      const MAX = 1500;
      let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      canvas.width  = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      baseImageData = ctx.getImageData(0, 0, w, h);
      undoStack = []; redoStack = [];
      refreshHistoryBtns();
      setTool('brush');
    };
    img.src = imageBase64;
  };

  function closeEditor() {
    if (!modal) return;
    modal.style.display = 'none';
    const ol = document.getElementById('pe-crop-overlay');
    if (ol) { ol.style.cssText = 'display:none;'; ol.innerHTML = ''; }
    const tc = document.getElementById('pe-text-container');
    if (tc) tc.remove();
    document.getElementById('pe-crop-bar').style.display = 'none';
    // Replace hash with #app so the app's back-button trap stays intact.
    // Do NOT call history.back() — that would pop past the app's base #app
    // entry and trigger a native Android app-exit.
    if (window.location.hash === '#paint-editor') {
      window.history.replaceState(null, '', '#app');
    }
  }

  function saveAndClose() {
    const out = canvas.toDataURL('image/jpeg', 0.88);
    closeEditor();
    if (onSaveCallback) onSaveCallback(out);
  }

  // ── WIRE EVENTS ───────────────────────────────────────────
  function wireEvents() {
    canvas = document.getElementById('pe-canvas');
    ctx    = canvas.getContext('2d');

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove',  onMove,  { passive: false });
    canvas.addEventListener('touchend',   onEnd,   { passive: false });
    canvas.addEventListener('mousedown',  onStart);
    canvas.addEventListener('mousemove',  onMove);
    canvas.addEventListener('mouseup',    onEnd);
    canvas.addEventListener('mouseleave', () => {
      isDrawing = false; lastPos = null;
      if (cropResizing) { cropResizing = false; cropResizeHandle = null; normaliseCrop(); renderCropOverlay(); document.getElementById('pe-crop-bar').style.display = 'flex'; }
      if (cropIsMoving) { cropIsMoving = false; cropMoveOrigin = null; cropBoxAtStart = null; }
    });

    document.getElementById('pe-undo').addEventListener('click', undo);
    document.getElementById('pe-redo').addEventListener('click', redo);
    document.getElementById('pe-cancel').addEventListener('click', closeEditor);
    document.getElementById('pe-save').addEventListener('click', saveAndClose);
    const sizeEl = document.getElementById('pe-size');
    const paintSizePreview = () => {
      brushSize = +sizeEl.value;
      const dot = document.getElementById('pe-size-dot');
      const d = Math.max(4, Math.min(34, brushSize));
      dot.style.width = dot.style.height = d + 'px';
      dot.style.background = currentColor;
      document.getElementById('pe-size-val').textContent = brushSize;
    };
    sizeEl.addEventListener('input', paintSizePreview);
    paintSizePreview();
    document.getElementById('pe-crop-apply').addEventListener('click', applyCrop);
    document.getElementById('pe-crop-cancel-btn').addEventListener('click', cancelCropMode);

    document.querySelectorAll('.pe-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });

    document.querySelectorAll('.pe-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        currentColor = btn.dataset.color;
        document.querySelectorAll('.pe-swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('pe-custom-color').value = currentColor;
        paintSizePreview();
        if (currentTool === 'eraser' || currentTool === 'crop') setTool('brush');   // picking a colour means "I want to draw"
      });
    });

    document.getElementById('pe-custom-color').addEventListener('input', e => {
      currentColor = e.target.value;
      document.querySelectorAll('.pe-swatch').forEach(b => b.classList.remove('active'));
      document.getElementById('pe-custom-wheel').classList.add('active');
      paintSizePreview();
    });

    // Android back button: if the paint editor is open and back is pressed,
    // the hash changes away from #paint-editor — close the editor gracefully.
    window.addEventListener('hashchange', () => {
      if (modal && modal.style.display !== 'none' && window.location.hash !== '#paint-editor') {
        // Close without touching history — the hash has already changed
        modal.style.display = 'none';
        const ol = document.getElementById('pe-crop-overlay');
        if (ol) { ol.style.cssText = 'display:none;'; ol.innerHTML = ''; }
        const tc = document.getElementById('pe-text-container');
        if (tc) tc.remove();
        document.getElementById('pe-crop-bar').style.display = 'none';
      }
    });
  }

  // ── BUILD MODAL ───────────────────────────────────────────
  function buildModal() {
    const style = document.createElement('style');
    style.textContent = `
      #paint-editor-modal { --pe-pink:#ff4d8d; --pe-pink-d:#d12f73; --pe-bg:#140a10; --pe-panel:#1f1118; --pe-chip:#2c1a24; --pe-line:rgba(255,160,200,.16); --pe-text:#ffeaf3; --pe-mute:#c79bb0; }
      #paint-editor-modal * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
      #paint-editor-modal button { font-family:inherit; cursor:pointer; touch-action:manipulation; }

      /* top bar */
      #paint-editor-modal .pe-top { display:flex; align-items:center; gap:8px; padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px; background:var(--pe-panel); border-bottom:1px solid var(--pe-line); flex-shrink:0; }
      #paint-editor-modal .pe-top .pe-spacer { flex:1; }
      #paint-editor-modal .pe-pill { display:flex; align-items:center; gap:6px; height:44px; padding:0 14px; border-radius:22px; border:none; background:var(--pe-chip); color:var(--pe-text); font-size:14px; font-weight:700; transition:transform .1s, opacity .15s, background .15s; }
      #paint-editor-modal .pe-pill svg { width:20px; height:20px; flex-shrink:0; }
      #paint-editor-modal .pe-pill:active { transform:scale(.94); }
      #paint-editor-modal .pe-pill:disabled { opacity:.32; cursor:default; transform:none; }
      #paint-editor-modal #pe-cancel { background:transparent; color:var(--pe-mute); padding:0 10px; }
      #paint-editor-modal #pe-save { background:linear-gradient(135deg,var(--pe-pink-d),var(--pe-pink)); color:#fff; padding:0 20px; box-shadow:0 4px 14px rgba(255,77,141,.4); }
      @media (max-width:420px) { #paint-editor-modal .pe-pill .pe-lbl-opt { display:none; } #paint-editor-modal .pe-pill { padding:0 12px; } }

      /* canvas */
      #paint-editor-modal #pe-canvas-wrap { flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative; background:
          repeating-conic-gradient(#1b1016 0% 25%, #170d12 0% 50%) 50% / 24px 24px; }

      /* crop bar */
      #paint-editor-modal #pe-crop-bar { display:none; background:var(--pe-panel); padding:12px 16px; justify-content:center; gap:12px; flex-shrink:0; border-top:1px solid var(--pe-line); }
      #paint-editor-modal #pe-crop-apply { border:none; color:#fff; font-size:15px; font-weight:800; padding:0 28px; height:48px; border-radius:24px; background:linear-gradient(135deg,var(--pe-pink-d),var(--pe-pink)); box-shadow:0 4px 14px rgba(255,77,141,.4); }
      #paint-editor-modal #pe-crop-cancel-btn { background:var(--pe-chip); border:none; color:var(--pe-text); font-size:15px; font-weight:700; padding:0 24px; height:48px; border-radius:24px; }

      /* bottom toolbar */
      #paint-editor-modal .pe-bottom { background:var(--pe-panel); border-top:1px solid var(--pe-line); border-radius:26px 26px 0 0; padding:12px 14px calc(14px + env(safe-area-inset-bottom,0px)); flex-shrink:0; box-shadow:0 -8px 28px rgba(0,0,0,.35); }
      #paint-editor-modal .pe-hint { text-align:center; font-size:12.5px; color:var(--pe-mute); font-weight:600; margin-bottom:10px; min-height:16px; }
      #paint-editor-modal .pe-tools { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; max-width:520px; margin:0 auto; }
      #paint-editor-modal .pe-tool-btn { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; height:64px; border-radius:18px; border:2px solid transparent; background:var(--pe-chip); color:var(--pe-text); font-size:12px; font-weight:800; transition:background .15s, border-color .15s, transform .1s; }
      #paint-editor-modal .pe-tool-btn svg { width:26px; height:26px; }
      #paint-editor-modal .pe-tool-btn:active { transform:scale(.95); }
      #paint-editor-modal .pe-tool-btn.active { background:linear-gradient(135deg,var(--pe-pink-d),var(--pe-pink)); border-color:rgba(255,255,255,.35); color:#fff; box-shadow:0 4px 16px rgba(255,77,141,.35); }

      /* size + colours (hidden when they don't apply to the tool) */
      #paint-editor-modal .pe-opts { max-width:520px; margin:14px auto 0; display:flex; flex-direction:column; gap:12px; }
      #paint-editor-modal[data-tool="crop"] .pe-opts { display:none; }
      #paint-editor-modal[data-tool="eraser"] .pe-colors { display:none; }
      #paint-editor-modal .pe-size-row { display:flex; align-items:center; gap:12px; }
      #paint-editor-modal .pe-size-label { font-size:12px; font-weight:800; color:var(--pe-mute); text-transform:uppercase; letter-spacing:.5px; width:44px; }
      #paint-editor-modal .pe-size-preview { width:40px; height:40px; border-radius:50%; background:var(--pe-chip); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      #paint-editor-modal #pe-size-dot { border-radius:50%; background:#e8407a; transition:width .08s, height .08s; }
      #paint-editor-modal #pe-size { flex:1; height:36px; accent-color:var(--pe-pink); cursor:pointer; }
      #paint-editor-modal #pe-size-val { width:28px; text-align:right; font-size:13px; font-weight:800; color:var(--pe-text); }
      #paint-editor-modal .pe-colors { display:flex; flex-wrap:wrap; justify-content:center; gap:12px 12px; padding:8px 4px 4px; }
      #paint-editor-modal .pe-swatch, #paint-editor-modal .pe-wheel { width:38px; height:38px; border-radius:50%; flex-shrink:0; border:3px solid rgba(255,255,255,.18); outline:none; position:relative; transition:transform .1s; }
      #paint-editor-modal .pe-swatch:active, #paint-editor-modal .pe-wheel:active { transform:scale(.9); }
      #paint-editor-modal .pe-swatch.active, #paint-editor-modal .pe-wheel.active { border-color:#fff; transform:scale(1.12); box-shadow:0 0 0 3px rgba(255,77,141,.55); }
      #paint-editor-modal .pe-wheel { background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red); }
      #paint-editor-modal .pe-wheel input { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; padding:0; border:none; }
    `;
    document.head.appendChild(style);

    const SWATCHES = [
      { c: '#ffffff' }, { c: '#111111' },
      { c: '#e8407a', active: true }, { c: '#ff8fb8' },
      { c: '#ff4b4b' }, { c: '#ff9f43' }, { c: '#ffd93d' },
      { c: '#4cdb8e' }, { c: '#4d96ff' }, { c: '#9d4edd' }
    ];
    const ICON = {
      cancel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      undo:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
      redo:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/></svg>',
      check:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
      draw:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z"/><path d="M14 7l3 3"/></svg>',
      eraser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H9L4 15a2 2 0 010-2.8l8-8a2 2 0 012.8 0l5 5a2 2 0 010 2.8L13 19"/><path d="M8 11l6 6"/></svg>',
      text:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7V5h14v2M12 5v14M9 19h6"/></svg>',
      crop:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 002 2h14"/><path d="M2 6h14a2 2 0 012 2v14"/></svg>'
    };

    const el = document.createElement('div');
    el.id = 'paint-editor-modal';
    el.dataset.tool = 'brush';
    el.style.cssText = 'display:none;position:fixed;inset:0;background:#140a10;z-index:100001;flex-direction:column;touch-action:none;font-family:var(--font,sans-serif);';
    el.innerHTML = `
      <!-- TOP BAR: cancel · undo/redo · save -->
      <div class="pe-top">
        <button id="pe-cancel" class="pe-pill" type="button" aria-label="Cancel">${ICON.cancel}<span class="pe-lbl-opt">Cancel</span></button>
        <div class="pe-spacer"></div>
        <button id="pe-undo" class="pe-pill" type="button" disabled aria-label="Undo">${ICON.undo}<span class="pe-lbl-opt">Undo</span></button>
        <button id="pe-redo" class="pe-pill" type="button" disabled aria-label="Redo">${ICON.redo}<span class="pe-lbl-opt">Redo</span></button>
        <div class="pe-spacer"></div>
        <button id="pe-save" class="pe-pill" type="button" aria-label="Save">${ICON.check}<span>Save</span></button>
      </div>

      <!-- CANVAS -->
      <div id="pe-canvas-wrap">
        <canvas id="pe-canvas" style="max-width:100%;max-height:100%;touch-action:none;display:block;box-shadow:0 8px 40px rgba(0,0,0,.5);"></canvas>
        <div id="pe-crop-overlay" style="display:none;position:absolute;"></div>
      </div>

      <!-- CROP ACTIONS (appear after you drag a crop box) -->
      <div id="pe-crop-bar">
        <button id="pe-crop-apply" type="button">✓ Apply crop</button>
        <button id="pe-crop-cancel-btn" type="button">Cancel</button>
      </div>

      <!-- TOOLBAR -->
      <div class="pe-bottom">
        <div class="pe-hint" id="pe-hint">Draw with your finger or mouse</div>

        <div class="pe-tools">
          <button class="pe-tool-btn active" data-tool="brush"  type="button">${ICON.draw}<span>Draw</span></button>
          <button class="pe-tool-btn"        data-tool="eraser" type="button">${ICON.eraser}<span>Erase</span></button>
          <button class="pe-tool-btn"        data-tool="text"   type="button">${ICON.text}<span>Text</span></button>
          <button class="pe-tool-btn"        data-tool="crop"   type="button">${ICON.crop}<span>Crop</span></button>
        </div>

        <div class="pe-opts">
          <div class="pe-size-row">
            <span class="pe-size-label">Size</span>
            <div class="pe-size-preview"><div id="pe-size-dot"></div></div>
            <input type="range" id="pe-size" min="2" max="44" value="6">
            <span id="pe-size-val">6</span>
          </div>
          <div class="pe-colors">
            ${SWATCHES.map(s => `<button class="pe-swatch${s.active ? ' active' : ''}" type="button" data-color="${s.c}" style="background:${s.c};" aria-label="Colour ${s.c}"></button>`).join('')}
            <label class="pe-wheel" id="pe-custom-wheel" title="Custom colour">
              <input type="color" id="pe-custom-color" value="#e8407a">
            </label>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    return el;
  }
})();
