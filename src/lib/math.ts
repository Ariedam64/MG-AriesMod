export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Like `clamp`, but a non-finite value becomes `fallback` first. */
export const clampFinite = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  return clamp(Number.isFinite(n) ? n : fallback, min, max);
};
