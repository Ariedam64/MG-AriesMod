// src/utils/download.ts
// File download helper that works from a userscript sandbox and inside
// iframes (Discord Activities): GM_download first, then an anchor click
// executed in the page context, then a sandbox-side anchor, and finally a
// clipboard copy as last resort.

import { pageWindow } from "./page-context";

declare const GM_download: ((options: { name?: string; url: string; saveAs?: boolean }) => void) | undefined;

export function copyTextToClipboard(text: string): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

export function downloadJSONFile(filename: string, payload: string): void {
  if (typeof GM_download === "function") {
    try {
      // Base64 data URI: some download managers save percent-encoded URIs
      // without decoding them, producing files full of "%7B%0A...".
      const url = `data:application/json;base64,${toBase64Utf8(payload)}`;
      GM_download({ name: filename, url, saveAs: true });
      return;
    } catch {
      // ignore and fallback
    }
  }

  const win = pageWindow || window;
  const safePayload = JSON.stringify(payload);
  const safeFilename = JSON.stringify(filename);
  const script = `(function(){try{const data=${safePayload};const name=${safeFilename};const blob=new Blob([data],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.style.display="none";const parent=document.body||document.documentElement||document;parent.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}catch(e){console.error("[download] download:",e)}})();`;
  try {
    win.eval(script);
    return;
  } catch {
    // ignore and fallback
  }

  try {
    const doc = (win.document || document) as Document;
    const root: ParentNode | null =
      (doc.body as ParentNode | null) ||
      (doc.documentElement as ParentNode | null) ||
      (document.body as ParentNode | null);
    const blob = new Blob([payload], { type: "application/json" });
    const url = (win.URL || URL).createObjectURL(blob);
    const a = doc.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    if (root) {
      root.appendChild(a);
    }
    a.click();
    if (root) {
      root.removeChild(a);
    }
    (win.URL || URL).revokeObjectURL(url);
  } catch {
    copyTextToClipboard(payload);
  }
}
