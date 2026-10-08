




/** Injecte du CSS dans <head>. */
export function addStyle(css: string): HTMLStyleElement {
  const s = document.createElement("style");
  s.textContent = css;
  document.head.appendChild(s);
  return s;
}












/* ===========================
   Helpers bonus (optionnels)
   =========================== */

