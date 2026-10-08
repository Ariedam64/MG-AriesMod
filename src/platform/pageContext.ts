const sandboxWindow = window;

/**
 * The page's own window, where the game's globals live. Under `@inject-into
 * page` it is `window` itself; `unsafeWindow` covers a manager that runs the
 * script in a sandbox anyway.
 */
export const pageWindow: Window & typeof globalThis & Record<string, any> =
  typeof unsafeWindow !== "undefined" && unsafeWindow ? (unsafeWindow as any) : (sandboxWindow as any);

const isSandboxed = pageWindow !== sandboxWindow;

/** Sets a global on the page window, and on the sandbox window too when they differ. */
export function shareGlobal(name: string, value: any): void {
  try {
    pageWindow[name] = value;
  } catch {}
  if (isSandboxed) {
    try {
      (sandboxWindow as any)[name] = value;
    } catch {}
  }
}

/** Reads a global, from the sandbox window first when there is one. */
export function readSharedGlobal<T = any>(name: string): T | undefined {
  if (isSandboxed) {
    const sandboxValue = (sandboxWindow as any)[name];
    if (sandboxValue !== undefined) return sandboxValue as T;
  }
  return pageWindow[name] as T | undefined;
}
