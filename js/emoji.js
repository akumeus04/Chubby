// Emoji picker — newest emoji set (Emoji 17), search, "recent" row, and it hides
// any emoji this phone/computer can't draw (so you never see empty boxes).
import { closeAllPanels } from "./helpers.js";

// ── DEVICE SUPPORT CHECK (canvas) ─────────────────────────
let _ctx = null, _base = 0, _tofu = null;
function sig(s) {
  _ctx.clearRect(0, 0, 44, 44);
  _ctx.fillText(s, 3, 3);
  const d = _ctx.getImageData(0, 0, 44, 44).data;
  let h = 0, n = 0, color = false;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 40) {
      n++; h = (h * 31 + (i >> 2) + d[i]) | 0;
      if (Math.abs(d[i] - d[i + 1]) > 24 || Math.abs(d[i + 1] - d[i + 2]) > 24) color = true;
    }
  }
  return { h, n, color };
}
function initDetector() {
  if (_ctx) return;
  const c = document.createElement("canvas"); c.width = c.height = 44;
  _ctx = c.getContext("2d", { willReadFrequently: true });
  _ctx.font = '32px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
  _ctx.textBaseline = "top";
  _base = _ctx.measureText("😀").width;
  _tofu = sig("\u{10FFFF}");
}
function canDraw(e) {
  initDetector();
  if (_ctx.measureText(e).width > _base * 1.6) return false;        // combined emoji that fell apart into pieces
  const s = sig(e);
  if (s.n < 10) return false;                                        // blank
  if (_tofu.n > 0 && s.h === _tofu.h && s.n === _tofu.n) return false; // the "missing glyph" box
  const first = e.codePointAt(0);
  if (!s.color && first >= 0x1F900) return false;                    // newer emoji drawn as a plain box
  return true;
}

// ── DATA (loaded the first time the picker is built) ─────
let DATA = null, SYN = {};
const okCache = new Map();           // emoji -> boolean
let DETECTION_OFF = false;
const supported = e => { if (DETECTION_OFF) return true; if (!okCache.has(e)) okCache.set(e, canDraw(e)); return okCache.get(e); };
const catItems = cat => cat.items.filter(([e]) => supported(e));

const RECENT_KEY = "recent-emojis";
const getRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } };
function pushRecent(e) {
  const list = [e, ...getRecent().filter(x => x !== e)].slice(0, 30);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch {}
}

function insertAtCursor(el, text) {
  const s = el.selectionStart ?? el.value.length, e2 = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, s) + text + el.value.slice(e2);
  el.selectionStart = el.selectionEnd = s + text.length;
  el.dispatchEvent(new Event("input"));
}

export async function buildEmojiPicker() {
  const panel = document.getElementById("emoji-panel");
  if (!panel || panel.dataset.built) return;
  panel.dataset.built = "1";
  try {
    const mod = await import("./emoji-data.js");
    DATA = mod.EMOJI_DATA; SYN = mod.EMOJI_SYNONYMS;
  } catch (err) { console.error("Emoji data failed to load:", err); panel.textContent = "Emoji couldn't load."; return; }

  // Only keep categories that have at least one drawable emoji on this device
  let cats = DATA.map(c => ({ ...c, shown: catItems(c) })).filter(c => c.shown.length);

  // Safety net: if (almost) nothing passes, the check itself is probably blocked (privacy mode, no canvas) —
  // show everything rather than an empty picker.
  const total = DATA.reduce((n, c) => n + c.items.length, 0);
  const passed = cats.reduce((n, c) => n + c.shown.length, 0);
  if (passed < total * 0.08) {
    cats = DATA.map(c => ({ ...c, shown: c.items }));
    okCache.clear(); DETECTION_OFF = true;
  }
  let active = getRecent().length ? "recent" : cats[0].id;

  panel.innerHTML = `
    <div class="emoji-search-wrap"><input id="emoji-search" type="search" placeholder="Search emoji…" autocomplete="off" enterkeyhint="search"></div>
    <div class="emoji-tabs" id="emoji-tabs"></div>
    <div class="emoji-grid" id="emoji-grid"></div>`;
  const tabsEl = panel.querySelector("#emoji-tabs"), grid = panel.querySelector("#emoji-grid"), search = panel.querySelector("#emoji-search");

  const btn = e => `<button class="emoji-btn" data-e="${e}" type="button">${e}</button>`;

  function renderTabs() {
    const hasRecent = getRecent().length > 0;
    tabsEl.innerHTML =
      (hasRecent ? `<button class="emoji-tab${active === "recent" ? " active" : ""}" data-cat="recent" title="Recent" type="button">🕘</button>` : "") +
      cats.map(c => `<button class="emoji-tab${active === c.id ? " active" : ""}" data-cat="${c.id}" title="${c.label}" type="button">${c.shown[0][0]}</button>`).join("");
  }
  function renderGrid() {
    let list;
    if (active === "recent") list = getRecent().filter(supported);
    else list = (cats.find(c => c.id === active) || cats[0]).shown.map(x => x[0]);
    grid.innerHTML = list.map(btn).join("");
    grid.scrollTop = 0;
  }
  function renderSearch(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    // typed words match the START of a word in the name; synonyms match whole words (or word starts when long)
    const matches = (nameWords, w) => {
      if (nameWords.some(x => x.startsWith(w))) return true;
      const syn = SYN[w] ? SYN[w].split(" ") : [];
      return syn.some(x => nameWords.some(nw => x.length >= 5 ? nw.startsWith(x) : nw === x));
    };
    const hits = [];
    for (const c of cats) for (const [e, name] of c.shown) {
      const nameWords = name.split(/[\s-]+/);
      if (words.every(w => matches(nameWords, w))) hits.push(e);
      if (hits.length >= 150) break;
    }
    grid.innerHTML = hits.length ? hits.map(btn).join("") : `<div class="emoji-empty">No emoji found 🥲</div>`;
    grid.scrollTop = 0;
  }
  function refresh() { renderTabs(); renderGrid(); }
  refresh();

  tabsEl.addEventListener("click", ev => {
    ev.stopPropagation();
    const t = ev.target.closest(".emoji-tab"); if (!t) return;
    active = t.dataset.cat; search.value = ""; refresh();
  });
  grid.addEventListener("click", ev => {
    ev.stopPropagation();
    const b = ev.target.closest(".emoji-btn"); if (!b) return;
    insertAtCursor(document.getElementById("message-input"), b.dataset.e);
    pushRecent(b.dataset.e);
    if (navigator.vibrate) navigator.vibrate(8);
    // stay open so you can pick several; refresh the tab strip so "Recent" shows up
    const keep = tabsEl.scrollLeft; renderTabs(); tabsEl.scrollLeft = keep;
  });
  search.addEventListener("input", () => { const q = search.value.trim(); q ? renderSearch(q) : renderGrid(); });
  search.addEventListener("click", ev => ev.stopPropagation());
}

document.getElementById("emoji-btn").addEventListener("click", e => {
  e.stopPropagation();
  const p = document.getElementById("emoji-panel");
  const isVisible = p.classList.contains("visible");
  closeAllPanels();
  if (!isVisible) { p.classList.add("visible"); document.getElementById("emoji-btn").classList.add("active"); }
});
document.getElementById("emoji-panel").addEventListener("click", e => e.stopPropagation());
