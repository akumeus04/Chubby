// Emoji picker
import { closeAllPanels } from "./helpers.js";

// ── EMOJI PICKER ──────────────────────────────────────────
const EMOJI_CATS = {
  "😀": ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","😟","🙁","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖"],
  "❤️": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","🕉️","🔥","💫","✨","🌟","⭐","🌈","🎉","🎊","🎈","🎁","🎀","🏆","🥇","👑","💎","🍀","🌸","🌺","🌻","🌹","🌷","💐","🌿","🍃","🍂","🍁","🌊","⚡","🌙","☀️","⛅","🌤️","🌈"],
  "👋": ["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👀","👁️","👅","👄","🫦"],
  "🐶": ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🦟","🦗","🪳","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🦮","🐕‍🦺","🐈","🐈‍⬛","🪶","🐓","🦃","🦤","🦚","🦜","🦢","🦩","🕊️","🐇","🦝","🦨","🦡","🦫","🦦","🦥","🐁","🐀","🐿️","🦔"],
  "🍎": ["🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🧄","🧅","🥔","🍠","🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🫓","🥪","🥙","🧆","🌮","🌯","🫔","🥗","🥘","🫕","🥫","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🦪","🍤","🍙","🍚","🍘","🍥","🥮","🍢","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🍯","🧃","🥤","🧋","☕","🍵","🧉","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🍾","🧊","🥄","🍴","🍽️","🥢","🧂"],
};
const CAT_KEYS = Object.keys(EMOJI_CATS);

export function buildEmojiPicker() {
  const panel = document.getElementById("emoji-panel");
  let activeCat = 0;
  function render() {
    const emojis = EMOJI_CATS[CAT_KEYS[activeCat]];
    panel.innerHTML = `
      <div class="emoji-tabs">${CAT_KEYS.map((k,i) => `<button class="emoji-tab${i===activeCat?' active':''}" data-cat="${i}">${k}</button>`).join("")}</div>
      <div class="emoji-grid">${emojis.map(e => `<button class="emoji-btn" data-e="${e}">${e}</button>`).join("")}</div>`;
    panel.querySelectorAll(".emoji-tab").forEach(btn => btn.addEventListener("click", e => {
      e.stopPropagation(); // prevent outside-click from closing
      activeCat = +btn.dataset.cat; render();
    }));
    panel.querySelectorAll(".emoji-btn").forEach(btn => btn.addEventListener("click", e => {
      e.stopPropagation();
      insertAtCursor(document.getElementById("message-input"), btn.dataset.e);
      // Do NOT close — let user keep picking emojis until they click outside
    }));
  }
  render();
}
function insertAtCursor(el, text) {
  const s = el.selectionStart, e2 = el.selectionEnd;
  el.value = el.value.slice(0, s) + text + el.value.slice(e2);
  el.selectionStart = el.selectionEnd = s + text.length;
  el.dispatchEvent(new Event("input"));
  }

document.getElementById("emoji-btn").addEventListener("click", e => {
  e.stopPropagation();
  const p = document.getElementById("emoji-panel");
  const isVisible = p.classList.contains("visible");
  closeAllPanels();
  if (!isVisible) { p.classList.add("visible"); document.getElementById("emoji-btn").classList.add("active"); }
});
document.getElementById("emoji-panel").addEventListener("click", e => e.stopPropagation());
