const INTEGER_FORMAT = new Intl.NumberFormat("en-US");

/** `1234567.8` -> `"1,234,567"`. Negative and non-finite values become 0. */
export const formatInteger = (value: number, rounding: "floor" | "round" = "floor"): string =>
  INTEGER_FORMAT.format(Math.max(0, Math[rounding](Number.isFinite(value) ? value : 0)));

/** `1500` -> `"1.50k"`, `2e9` -> `"2B"`. Used for prices. */
export function formatPrice(val: unknown): string | null {
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n)) return n === Infinity ? "∞" : null;
  const abs = Math.abs(n);
  const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2));
  if (abs >= 1e12) return `${fmt(n / 1e12)}T`;
  if (abs >= 1e9) return `${fmt(n / 1e9)}B`;
  if (abs >= 1e6) return `${fmt(n / 1e6)}M`;
  if (abs >= 1e3) return `${fmt(n / 1e3)}k`;
  return String(n);
}

export const pad2 = (n: number): string => String(Math.floor(n)).padStart(2, "0");

/** "AmberMoon" reads "Amber Moon": splits a camelCase id into words. */
export const spaceWords = (id: string): string => id.replace(/([a-z])([A-Z])/g, "$1 $2");
