export function setBtnLabel(btn: HTMLButtonElement, text: string) {
  const label = btn.querySelector<HTMLElement>(".label");
  if (label) label.textContent = text;
  else btn.textContent = text;
}

export function toast(msg: string, type: "warn" | "success" = "warn") {
  try {
    (window as any).toastSimple?.(msg, "", type);
  } catch {}
}

export function createTwoColumns(view: HTMLElement) {
  const columns = document.createElement("div");
  columns.className = "dd-debug-columns";
  view.appendChild(columns);

  const leftCol = document.createElement("div");
  leftCol.className = "dd-debug-column";
  const rightCol = document.createElement("div");
  rightCol.className = "dd-debug-column";
  columns.append(leftCol, rightCol);

  return { columns, leftCol, rightCol };
}

export function copy(text: string) {
  const str = String(text ?? "");
  if (!str.length) return;

  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = str;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    document.body.removeChild(ta);
    try { (window as any).toastSimple?.(ok ? "Copied" : "Copy failed", "", ok ? "success" : "error"); } catch {}
  };

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(str)
      .then(() => { try { (window as any).toastSimple?.("Copied", "", "success"); } catch {} })
      .catch(fallback);
  } else {
    fallback();
  }
}

export function safeRegex(q: string) { try { return new RegExp(q, "i"); } catch { return /.*/i; } }

/** Monospace read-out box for atom values and listings. */
export function stylePre(pre: HTMLPreElement) {
  pre.classList.add("dd-pre");
}
