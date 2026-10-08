// src/utils/page-context.ts

declare const unsafeWindow:
  | (Window & typeof globalThis & { [key: string]: any })
  | undefined;

const sandboxWin = window;
const pageWin =
  typeof unsafeWindow !== "undefined" && unsafeWindow
    ? unsafeWindow
    : sandboxWin;

/** Reference to the actual page window (falls back to the current window). */
export const pageWindow = pageWin;

/** Whether the userscript is running in an isolated sandbox. */
const isIsolatedContext = pageWin !== sandboxWin;


/** Mirror a global value onto both the page window and sandbox window. */
export function shareGlobal(name: string, value: any) {
  try {
    (pageWin as any)[name] = value;
  } catch {}
  if (isIsolatedContext) {
    try {
      (sandboxWin as any)[name] = value;
    } catch {}
  }
}

/** Read a global value from the page (preferring sandbox if available). */
export function readSharedGlobal<T = any>(name: string): T | undefined {
  if (isIsolatedContext) {
    const sandboxValue = (sandboxWin as any)[name];
    if (sandboxValue !== undefined) return sandboxValue as T;
  }
  return (pageWin as any)[name] as T | undefined;
}
