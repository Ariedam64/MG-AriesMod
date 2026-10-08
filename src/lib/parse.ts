// src/core/parse.ts
export async function parseWSData(d: any): Promise<any | null> {
  try {
    if (typeof d === "string") return JSON.parse(d);
    if (d instanceof Blob)     return JSON.parse(await d.text());
    if (d instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(d));
  } catch {}
  return null;
}
