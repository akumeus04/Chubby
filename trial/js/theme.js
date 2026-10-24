// Dark / light theme toggle

// ── THEME ─────────────────────────────────────────────────
const themeCheckbox = document.getElementById("theme-checkbox");
const themeBtn      = document.getElementById("theme-toggle-btn");
export function applyTheme(isLight) {
  document.documentElement[isLight ? "setAttribute" : "removeAttribute"]("data-theme", "light");
  const icon  = isLight ? "🌸" : "🌙";
  const label = isLight ? "Light Pink" : "Dark Pink";
  themeBtn.textContent = icon;
  themeCheckbox.checked = isLight;
  const si = document.getElementById("sidebar-theme-icon"), sl = document.getElementById("sidebar-theme-label");
  if (si) si.textContent = icon; if (sl) sl.textContent = label;
  localStorage.setItem("messenger-theme", isLight ? "light" : "dark");
}
themeCheckbox.addEventListener("change", () => applyTheme(themeCheckbox.checked));
themeBtn.addEventListener("click", () => applyTheme(!themeCheckbox.checked));
document.getElementById("sidebar-theme-btn")?.addEventListener("click", () => applyTheme(!themeCheckbox.checked));
