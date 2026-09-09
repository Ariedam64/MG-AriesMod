// src/services/companion/diagnostics.ts
// Mesure ce que le JEU consomme réellement comme positions de companion.
//
// Pourquoi ce fichier existe : notre boucle injecte une tuile à intervalle fixe,
// mais le rendu ne voit cette valeur que lorsque Jotai recalcule les atomes NPC.
// Si le recalcul est plus lent que notre pas, le jeu observe un saut de
// plusieurs tuiles d'un coup et coupe au lieu d'animer la marche
// (`AvatarView.preDraw` : snap dès que la distance de Manhattan dépasse 1).
//
// On s'abonne donc au MÊME atom que la couche avatar (`npcQuinoaUsersAtom`) et
// on enregistre chaque position observée, pour trancher entre deux causes :
//   - deltas > 1  => cadence de recalcul trop lente (notre faute)
//   - deltas == 1 => le jeu coupe pour une autre raison (forceSnap)

import { makeAtom } from "../../store/hub";

const DEFAULT_SAMPLE_MS = 6000;

type Observation = { atMs: number; x: number; y: number };

export type DiagnosticReport = {
  /** Nombre de positions distinctes vues par le jeu pendant la mesure. */
  observations: number;
  /** Intervalle médian entre deux positions observées, en ms. */
  medianIntervalMs: number | null;
  /** Plus grand écart de tuiles entre deux observations consécutives. */
  maxDelta: number;
  /** Combien de fois le jeu a vu un saut > 1 tuile (donc un snap). */
  snapCount: number;
  /** Part des transitions qui ont provoqué un snap. */
  snapRatio: number;
  verdict: string;
};

const npcQuinoaUsers = makeAtom<Array<{ playerId: string; position?: { x: number; y: number } | null }>>(
  "npcQuinoaUsersAtom"
);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/**
 * Échantillonne les positions que le jeu observe pour `npcId`.
 * À lancer pendant que le companion marche.
 */
export async function diagnoseCompanion(
  npcId: string,
  sampleMs = DEFAULT_SAMPLE_MS
): Promise<DiagnosticReport> {
  const seen: Observation[] = [];

  const record = (entries: Array<{ playerId: string; position?: { x: number; y: number } | null }> | null) => {
    const entry = Array.isArray(entries) ? entries.find((e) => e?.playerId === npcId) : null;
    const pos = entry?.position;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    const last = seen[seen.length - 1];
    if (last && last.x === pos.x && last.y === pos.y) return;
    seen.push({ atMs: performance.now(), x: pos.x, y: pos.y });
  };

  let unsub: (() => void) | null = null;
  try {
    unsub = await npcQuinoaUsers.onChangeNow((next) => record(next));
  } catch {
    return {
      observations: 0,
      medianIntervalMs: null,
      maxDelta: 0,
      snapCount: 0,
      snapRatio: 0,
      verdict: "Impossible de s'abonner à npcQuinoaUsersAtom.",
    };
  }

  await new Promise<void>((resolve) => setTimeout(resolve, sampleMs));
  try {
    unsub?.();
  } catch {}

  const intervals: number[] = [];
  let maxDelta = 0;
  let snapCount = 0;
  for (let i = 1; i < seen.length; i++) {
    const prev = seen[i - 1];
    const curr = seen[i];
    intervals.push(curr.atMs - prev.atMs);
    const delta = Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y);
    if (delta > maxDelta) maxDelta = delta;
    if (delta > 1) snapCount++;
  }

  const transitions = Math.max(0, seen.length - 1);
  const snapRatio = transitions === 0 ? 0 : snapCount / transitions;

  return {
    observations: seen.length,
    medianIntervalMs: median(intervals),
    maxDelta,
    snapCount,
    snapRatio: Number(snapRatio.toFixed(2)),
    verdict: buildVerdict(seen.length, snapCount, maxDelta),
  };
}

function buildVerdict(observations: number, snapCount: number, maxDelta: number): string {
  if (observations < 2) {
    return "Aucune position observée : le companion ne bouge pas, ou l'atom n'est pas relu. Vérifie qu'il marche pendant la mesure.";
  }
  if (snapCount === 0) {
    return "Le jeu ne voit que des pas d'une tuile. La cadence n'est pas en cause : le snap vient d'ailleurs (forceSnap).";
  }
  return `Le jeu observe des sauts jusqu'à ${maxDelta} tuiles : la cadence de recalcul est plus lente que notre pas. C'est la cause du snap.`;
}
