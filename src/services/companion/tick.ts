// src/services/companion/tick.ts
// Atom "tick" qui sert de dépendance artificielle à l'injection du companion.
//
// Pourquoi
// --------
// Jotai ne recalcule un atom dérivé que si une de ses dépendances change. Notre
// patch sur `quinoaDataAtom` ne dépend que de l'état de room, mis à jour environ
// toutes les 420 ms (mesuré). Or la couche avatar n'interpole un pas que sur
// 130 ms et COUPE dès que deux positions consécutives sont distantes de plus
// d'une tuile : à 420 ms de cadence, le companion se téléportait.
//
// En déclarant ce tick dans les `extraDeps` du patch, le `read()` de
// `quinoaDataAtom` en devient dépendant ; l'incrémenter force donc un recalcul
// immédiat de toute la chaîne NPC, à la cadence qu'on choisit.
//
// Construire l'atom à la main
// ---------------------------
// Jotai n'est pas exposé par le jeu, mais un atom primitif v2 n'est qu'un objet
// { init, read, write }. On le construit par fermeture (jamais via `this`) :
// `fakeAtoms` réassigne `read` en fonction fléchée et appelle l'original sans
// receveur, donc un `read` qui dépendrait de `this` casserait.
//
// On l'enregistre ensuite dans `jotaiAtomCache`, que `getAtomByLabel` parcourt.

import { pageWindow } from "../../utils/page-context";
import { jSet } from "../../store/jotai";

export const COMPANION_TICK_LABEL = "ariesCompanionTickAtom";

/** Clé d'enregistrement dans le cache d'atomes du jeu. */
const CACHE_KEY = `aries/companion/${COMPANION_TICK_LABEL}`;

type AtomCache = { cache: Map<unknown, unknown>; get(key: unknown, value: unknown): unknown };

let tickAtom: any = null;
let counter = 0;

function createTickAtom(): any {
  const atom: any = {};
  atom.init = 0;
  // Fermeture sur `atom`, pas `this` : cf. note d'en-tête.
  atom.read = (get: (a: unknown) => unknown) => get(atom);
  atom.write = (get: (a: unknown) => unknown, set: (a: unknown, v: unknown) => void, update: unknown) =>
    set(atom, typeof update === "function" ? (update as (p: unknown) => unknown)(get(atom)) : update);
  atom.debugLabel = COMPANION_TICK_LABEL;
  atom.toString = () => COMPANION_TICK_LABEL;
  return atom;
}

/**
 * Crée et enregistre l'atom une seule fois.
 * Rend `null` si le cache d'atomes du jeu n'est pas encore là.
 */
export function ensureTickAtom(): any | null {
  if (tickAtom) return tickAtom;
  const cache = (pageWindow as any).jotaiAtomCache as AtomCache | undefined;
  if (!cache || typeof cache.get !== "function") return null;
  // `get(key, value)` enregistre si absent : idempotent entre rechargements du HUD.
  tickAtom = cache.get(CACHE_KEY, createTickAtom());
  return tickAtom;
}

/** true si le tick est utilisable, donc si le recalcul forcé est disponible. */
export function isTickAvailable(): boolean {
  return ensureTickAtom() !== null;
}

/**
 * Force un recalcul immédiat de la chaîne NPC.
 * Sans effet (et sans erreur) si le tick n'a pas pu être enregistré : la boucle
 * retombe alors sur la cadence naturelle du jeu, plus lente mais jamais saccadée
 * grâce au verrou de `index.ts`.
 */
export async function bumpTick(): Promise<void> {
  const atom = ensureTickAtom();
  if (!atom) return;
  counter++;
  try {
    await jSet(atom, counter);
  } catch {}
}
