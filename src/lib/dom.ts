/** Appends a `<style>` element with `css` to the document head. */
export function addStyle(css: string): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}
