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

export function stylePre(pre: HTMLPreElement) {
  pre.style.maxHeight = "260px";
  pre.style.overflow = "auto";
  pre.style.background = "#0b1016";
  pre.style.border = "1px solid #ffffff18";
  pre.style.borderRadius = "12px";
  pre.style.padding = "12px";
  pre.style.margin = "6px 0 0";
  pre.style.fontSize = "12px";
  pre.style.lineHeight = "1.5";
  pre.style.color = "#dbe4ff";
  pre.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,.04)";
}
