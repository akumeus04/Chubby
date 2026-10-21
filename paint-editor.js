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
    if (u) { u.disabled = !undoStack.length; u.style.opacity = undoStack.length ? '1' : '0.3'; }
    if (r) { r.disabled = !redoStack.length; r.style.opacity = redoStack.length ? '1' : '0.3'; }
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
    inp.style.cssText = `position:absolute;left:${ox + pos.x * sx}px;top:${oy + pos.y * sy - fontSize}px;z-index:20;display:flex;align-items:center;gap:6px;`;
    inp.innerHTML = `
      <input id="pe-text-field" type="text" placeholder="Type here…"
        style="background:transparent;border:none;border-bottom:2px solid ${currentColor};
               color:${currentColor};font-size:${fontSize}px;font-weight:700;outline:none;
               min-width:120px;max-width:240px;font-family:sans-serif;
               text-shadow:0 1px 3px rgba(0,0,0,0.85);padding:2px 4px;">
      <button id="pe-text-ok"
        style="background:${currentColor};border:none;color:#fff;padding:6px 14px;
               border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;flex-shrink:0;">✓</button>`;
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
  function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.pe-tool-btn').forEach(btn => {
      const active = btn.dataset.tool === tool;
      btn.style.border     = active ? '2px solid var(--accent,#e8407a)' : '2px solid transparent';
      btn.style.background = active ? 'rgba(232,64,122,0.15)' : '#222';
    });
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
    document.getElementById('pe-size').addEventListener('input', e => { brushSize = +e.target.value; });
    document.getElementById('pe-crop-apply').addEventListener('click', applyCrop);
    document.getElementById('pe-crop-cancel-btn').addEventListener('click', cancelCropMode);

    document.querySelectorAll('.pe-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });

    document.querySelectorAll('.pe-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        currentColor = btn.dataset.color;
        document.querySelectorAll('.pe-swatch').forEach(b => b.style.border = '2px solid rgba(255,255,255,0.15)');
        btn.style.border = '3px solid rgba(255,255,255,0.9)';
        document.getElementById('pe-custom-color').value = currentColor;
      });
    });

    document.getElementById('pe-custom-color').addEventListener('input', e => {
      currentColor = e.target.value;
      document.querySelectorAll('.pe-swatch').forEach(b => b.style.border = '2px solid rgba(255,255,255,0.15)');
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
      #paint-editor-modal .pe-tool-btn { transition: border-color .15s, background .15s; }
    `;
    document.head.appendChild(style);

    const SWATCHES = [
      { c: '#ffffff' }, { c: '#000000' },
      { c: '#e8407a', active: true },
      { c: '#ff6347' }, { c: '#ffd700' },
      { c: '#4cdb8e' }, { c: '#4d96ff' }, { c: '#9d4edd' }
    ];

    const el = document.createElement('div');
    el.id = 'paint-editor-modal';
    el.style.cssText = 'display:none;position:fixed;inset:0;background:#0a0a0a;z-index:100001;flex-direction:column;touch-action:none;font-family:var(--font,sans-serif);';
    el.innerHTML = `

      <!-- ── TOP BAR ── -->
      <div style="height:56px;background:#111;display:flex;align-items:center;justify-content:space-between;
                  padding:0 16px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.07);">
        <button id="pe-cancel"
          style="background:transparent;border:none;color:#bbb;font-size:24px;cursor:pointer;
                 padding:6px 10px;border-radius:8px;line-height:1;">✕</button>
        <div style="display:flex;gap:6px;">
          <button id="pe-undo" disabled
            style="background:#222;border:none;color:#fff;font-size:18px;cursor:pointer;
                   padding:8px 14px;border-radius:8px;opacity:.3;">↩</button>
          <button id="pe-redo" disabled
            style="background:#222;border:none;color:#fff;font-size:18px;cursor:pointer;
                   padding:8px 14px;border-radius:8px;opacity:.3;">↪</button>
        </div>
        <button id="pe-save"
          style="background:var(--accent,#e8407a);border:none;color:#fff;font-size:15px;
                 font-weight:600;padding:10px 24px;border-radius:24px;cursor:pointer;">Save</button>
      </div>

      <!-- ── CANVAS AREA ── -->
      <div id="pe-canvas-wrap"
        style="flex:1;display:flex;align-items:center;justify-content:center;
               overflow:hidden;position:relative;background:#1a1a1a;">
        <canvas id="pe-canvas"
          style="max-width:100%;max-height:100%;touch-action:none;display:block;"></canvas>
        <div id="pe-crop-overlay" style="display:none;position:absolute;"></div>
      </div>

      <!-- ── CROP ACTION BAR (hidden until crop drag ends) ── -->
      <div id="pe-crop-bar"
        style="display:none;background:#1a0d12;padding:12px 16px;justify-content:center;
               gap:12px;flex-shrink:0;border-top:1px solid rgba(255,255,255,0.07);">
        <button id="pe-crop-apply"
          style="background:var(--accent,#e8407a);border:none;color:#fff;font-size:15px;
                 font-weight:600;padding:11px 32px;border-radius:24px;cursor:pointer;">✓ Apply Crop</button>
        <button id="pe-crop-cancel-btn"
          style="background:transparent;border:1px solid #555;color:#ccc;font-size:15px;
                 padding:11px 22px;border-radius:24px;cursor:pointer;">Cancel</button>
      </div>

      <!-- ── BOTTOM TOOLBAR ── -->
      <div style="background:#111;border-top:1px solid rgba(255,255,255,0.07);
                  padding:10px 14px 14px;display:flex;align-items:center;gap:10px;
                  flex-shrink:0;overflow-x:auto;-webkit-overflow-scrolling:touch;">

        <!-- Tool buttons -->
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="pe-tool-btn" data-tool="brush" title="Draw"
            style="width:46px;height:46px;border-radius:12px;
                   border:2px solid var(--accent,#e8407a);background:rgba(232,64,122,0.15);
                   color:#fff;font-size:22px;cursor:pointer;">🖌</button>
          <button class="pe-tool-btn" data-tool="eraser" title="Erase"
            style="width:46px;height:46px;border-radius:12px;
                   border:2px solid transparent;background:#222;
                   color:#fff;font-size:20px;cursor:pointer;">🧽</button>
          <button class="pe-tool-btn" data-tool="text" title="Add text"
            style="width:46px;height:46px;border-radius:12px;
                   border:2px solid transparent;background:#222;
                   color:#fff;font-size:18px;font-weight:700;cursor:pointer;font-family:sans-serif;">T</button>
          <button class="pe-tool-btn" data-tool="crop" title="Crop"
            style="width:46px;height:46px;border-radius:12px;
                   border:2px solid transparent;background:#222;
                   color:#fff;font-size:20px;cursor:pointer;">⊡</button>
        </div>

        <div style="width:1px;height:38px;background:#333;flex-shrink:0;"></div>

        <!-- Brush size -->
        <div style="display:flex;flex-direction:column;gap:4px;min-width:72px;flex-shrink:0;">
          <span style="color:#555;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Size</span>
          <input type="range" id="pe-size" min="2" max="44" value="6"
            style="width:72px;accent-color:var(--accent,#e8407a);cursor:pointer;">
        </div>

        <div style="width:1px;height:38px;background:#333;flex-shrink:0;"></div>

        <!-- Color swatches + custom picker -->
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
          ${SWATCHES.map(s => `<button class="pe-swatch" data-color="${s.c}"
            style="width:28px;height:28px;border-radius:50%;background:${s.c};
                   border:${s.active ? '3px solid rgba(255,255,255,0.9)' : '2px solid rgba(255,255,255,0.15)'};
                   cursor:pointer;flex-shrink:0;outline:none;"></button>`).join('')}
          <label title="Custom colour" style="cursor:pointer;position:relative;width:28px;height:28px;flex-shrink:0;">
            <input type="color" id="pe-custom-color" value="#e8407a"
              style="opacity:0;position:absolute;inset:0;cursor:pointer;width:100%;height:100%;padding:0;border:none;">
            <div style="width:28px;height:28px;border-radius:50%;
                        background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);
                        border:2px solid rgba(255,255,255,0.2);pointer-events:none;"></div>
          </label>
        </div>

      </div>
    `;

    document.body.appendChild(el);
    return el;
  }
})();
