// Kept only for the imports in game/mgVersion.ts and ui/kit/sprites/iconCache.ts,
// which belong to other parts of the refactor. Once they import from
// platform/http and lib/async, this file goes.

import { getBlob as httpGetBlob, getJSON as httpGetJSON } from "./http";

export { sleep } from "../lib/async";

export const ORIGIN = "https://magicgarden.gg";

export const getJSON = <T = any>(url: string): Promise<T> => httpGetJSON<T>(url, { preferGm: true });

export const getBlob = (url: string): Promise<Blob> => httpGetBlob(url, { preferGm: true });
