// src/utils/format.ts
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