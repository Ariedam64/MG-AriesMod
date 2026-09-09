// src/services/companion/injection.ts
// Socle du companion : fait exister un NPC à la position qu'on décide.
//
// Comment ça marche
// -----------------
// Le jeu lit les positions de ses NPC dans `quinoaDataAtom.npcs`, un dico
// { playerId -> index de tuile } qui vient de l'état de room. On patche le
// `read()` de cet atom (via le mécanisme `fakeAtoms` déjà en place) pour y
// injecter notre entrée. Tout le reste suit tout seul : le jeu recalcule
// npcQuinoaUsersAtom / npcAvatarDataAtom / npcInteractionTilesAtom, crée la vue
// avatar, et l'anime.
//
// Pourquoi ça anime la marche gratuitement : la couche avatar interpole entre
// deux tuiles adjacentes et déclenche le cycle de marche/course. Il suffit donc
// de faire avancer l'index d'une case à la fois (cf. movement.ts).
//
// Réservation de label : ce module est le SEUL à poser un fake sur
// `quinoaDataAtom`. Le registre de fakeAtoms est indexé par label, donc deux
// modules qui patchent le même atom s'écrasent mutuellement (c'est pour ça que
// fakeModal et editor partagent déjà un patch unique sur `myDataAtom`).

import { fakeShow, fakeUpdate, fakeHide, fakeDispose, type FakeConfig } from "../fakeAtoms";
import { makeAtom } from "../../store/hub";
import { readCompanionMap } from "./map";
import { COMPANION_TICK_LABEL, bumpTick, ensureTickAtom } from "./tick";

/** Préfixe des identifiants de NPC du jeu : `NPC_Reina`, `NPC_Wade`, ... */
const NPC_ID_PREFIX = "NPC_";

const QUINOA_DATA_LABEL = "quinoaDataAtom";

const quinoaData = makeAtom<{ npcs?: Record<string, number> | null } | null>(QUINOA_DATA_LABEL);

type NpcsPatch = { npcs: Record<string, number> };

/**
 * Notre entrée écrase celle du jeu pour le même playerId (le companion est
 * prioritaire, y compris pendant l'événement météo du marchand détourné).
 * Les boutiques météo sont des bâtiments distincts des NPC : les déplacer
 * n'empêche donc pas d'y accéder.
 */
const COMPANION_PATCH: FakeConfig<NpcsPatch> = {
  label: QUINOA_DATA_LABEL,
  // Dépendance artificielle : sans elle, le recalcul ne suit que l'état de room
  // (~420 ms mesuré), trop lent pour les 130 ms d'interpolation d'un pas.
  extraDeps: [COMPANION_TICK_LABEL],
  merge: (real: any, fake: any) => {
    const base = real && typeof real === "object" ? real : {};
    const realNpcs = base.npcs && typeof base.npcs === "object" ? base.npcs : {};
    const fakeNpcs = fake?.npcs && typeof fake.npcs === "object" ? fake.npcs : {};
    return { ...base, npcs: { ...realNpcs, ...fakeNpcs } };
  },
};

export type NpcIdentity = {
  playerId: string;
  name: string;
  spawnLayer: string;
  /** true si le jeu le fait exister en ce moment (marchand météo actif, PNJ permanent). */
  present: boolean;
  /** Tuile d'apparition native, utile comme position de repli. */
  spawnTile: number | null;
};

/** true quand le merge est effectivement appliqué (patch posé ET actif). */
let active = false;
let currentPayload: NpcsPatch = { npcs: {} };

/**
 * Roster des NPC, dérivé à l'exécution — jamais écrit en dur.
 *
 * Deux sources complémentaires :
 *  - `mapAtom.npcSpawns`, dont les clés sont les noms de layer d'apparition, qui
 *    sont exactement les noms des NPC. Cette source les liste TOUS, y compris
 *    les marchands météo absents.
 *  - `quinoaDataAtom.npcs`, qui ne contient que ceux présents à l'instant T,
 *    mais donne leurs vrais playerId.
 *
 * Les identifiants observés font foi ; le préfixe n'est qu'un repli pour les
 * NPC absents, qu'on ne peut pas observer.
 */
export async function listNpcIdentities(): Promise<NpcIdentity[]> {
  const map = await readCompanionMap();
  const presentIds = new Set(await readPresentNpcIds());

  const byId = new Map<string, NpcIdentity>();

  for (const name of map?.npcSpawnLayers ?? []) {
    const playerId = NPC_ID_PREFIX + name;
    byId.set(playerId, {
      playerId,
      name,
      spawnLayer: name,
      present: presentIds.has(playerId),
      spawnTile: map?.npcSpawnTile(name) ?? null,
    });
  }

  // Un NPC présent mais absent des layers (map inattendue) ne doit pas manquer.
  for (const playerId of presentIds) {
    if (byId.has(playerId)) continue;
    const name = playerId.startsWith(NPC_ID_PREFIX) ? playerId.slice(NPC_ID_PREFIX.length) : playerId;
    byId.set(playerId, { playerId, name, spawnLayer: name, present: true, spawnTile: null });
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** playerId des NPC que le jeu fait exister en ce moment. */
export async function readPresentNpcIds(): Promise<string[]> {
  try {
    const data = await quinoaData.get();
    const npcs = data?.npcs;
    if (!npcs || typeof npcs !== "object") return [];
    // Nos propres injections ne comptent pas comme des NPC "du jeu".
    return Object.keys(npcs).filter((id) => !(id in currentPayload.npcs));
  } catch {
    return [];
  }
}

/**
 * Installe et ACTIVE le patch (idempotent).
 *
 * `active` suit l'état effectif du fake, pas seulement la pose du patch :
 * `fakeHide` désactive le merge sans retirer le hook, donc sans ce drapeau une
 * réactivation repasserait en early-return et le companion resterait invisible.
 */
export async function installInjection(): Promise<void> {
  if (active) return;
  // Le tick doit exister avant la première lecture patchée, sinon `extraDeps`
  // ne résout rien et la dépendance n'est jamais enregistrée.
  ensureTickAtom();
  await fakeShow(COMPANION_PATCH, currentPayload);
  active = true;
}

/** Place le companion sur une tuile. C'est le seul appel de la boucle de jeu. */
export async function setCompanionTile(playerId: string, tileIndex: number): Promise<void> {
  if (!Number.isInteger(tileIndex) || tileIndex < 0) return;
  currentPayload = { npcs: { [playerId]: tileIndex } };
  if (!active) {
    ensureTickAtom();
    // fakeShow réutilise le patch déjà posé et le réactive avec ce payload.
    await fakeShow(COMPANION_PATCH, currentPayload);
    active = true;
    return;
  }
  await fakeUpdate(QUINOA_DATA_LABEL, currentPayload);
  // Le payload seul ne déclenche aucun recalcul : c'est le tick qui pousse la
  // nouvelle position jusqu'au rendu, avant le pas suivant.
  await bumpTick();
}

/** Retire le companion mais garde le patch en place (réactivation instantanée). */
export async function hideCompanion(): Promise<void> {
  if (!active) return;
  currentPayload = { npcs: {} };
  active = false;
  await fakeHide(QUINOA_DATA_LABEL);
}

/** Retire le patch et restaure le `read()` d'origine. */
export async function disposeInjection(): Promise<void> {
  currentPayload = { npcs: {} };
  active = false;
  await fakeDispose(QUINOA_DATA_LABEL);
}
