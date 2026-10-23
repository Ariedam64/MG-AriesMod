// Part of the portable bug report core: this folder is copied as it is into
// the other mods (Community Hub, Gemini, MG-mod), so it must stay
// self-contained. No import from outside it, no game or userscript manager
// global, no UI.
//
// Version numbers such as 4.0.5, compared part by part, so 4.0.10 comes after
// 4.0.9. Used to tell a player whether the version a fix shipped in is newer
// than the one they run.

const parts = (version: string) => version.trim().replace(/^v/i, "").split(/[.\-+]/);

/** Negative when `a` is older than `b`, positive when newer, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] ?? "0";
    const y = right[i] ?? "0";
    const nx = Number(x);
    const ny = Number(y);
    const diff = Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x.localeCompare(y);
    if (diff) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** True when both are known and `local` is older than `target`. */
export function isVersionBelow(local: string | null | undefined, target: string | null | undefined): boolean {
  if (!local?.trim() || !target?.trim()) return false;
  return compareVersions(local, target) < 0;
}
