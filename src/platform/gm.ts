// Shared helpers for MG* modules (ported from the userscript)
// These utilities intentionally keep the original behaviour/constraints.

// Tampermonkey globals
declare function GM_xmlhttpRequest(details: {
  method: "GET";
  url: string;
  responseType?: "arraybuffer" | "blob" | "json" | "text";
  onload?: (response: { status: number; responseText: string; response: any }) => void;
  onerror?: () => void;
  ontimeout?: () => void;
}): void;

export const ORIGIN = "https://magicgarden.gg";

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

type GmResponse<T = any> = { status: number; response: T; responseText: string };

function gmGet<T = any>(
  url: string,
  responseType: "text" | "blob" | "arraybuffer" = "text",
): Promise<GmResponse<T>> {
  return new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest !== "function") {
      reject(new Error("GM_xmlhttpRequest not available"));
      return;
    }

    GM_xmlhttpRequest({
      method: "GET",
      url,
      responseType,
      onload: (r) => {
        if (r.status >= 200 && r.status < 300) resolve(r as GmResponse<T>);
        else reject(new Error(`HTTP ${r.status} for ${url}`));
      },
      onerror: () => reject(new Error(`Network error for ${url}`)),
      ontimeout: () => reject(new Error(`Timeout for ${url}`)),
    });
  });
}

export const getJSON = async <T = any>(url: string): Promise<T> =>
  JSON.parse((await gmGet<string>(url, "text")).responseText) as T;

export const getBlob = async (url: string): Promise<Blob> => (await gmGet<Blob>(url, "blob")).response;





