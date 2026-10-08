/** A source of numbers in [0, 1). Taking one as a parameter keeps pickers testable. */
export type Random = () => number;

export function pickOne<T>(options: readonly T[], random: Random = Math.random): T {
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

/** True with probability `p`. */
export const chance = (p: number, random: Random = Math.random): boolean => random() < p;
