// src/services/companion/avatar.ts
// La tenue du PNJ emprunté, telle que le jeu la stocke.
//
// Le jeu ne publie aucun sprite de personnage : une apparence est une pile de
// PNG de cosmétiques (corps, bas, milieu, haut, expression) qu'il empile à
// l'écran. `npcAvatarDataAtom` porte, pour chaque PNJ, la liste de fichiers de
// sa tenue. On la lit, on la range dans l'ordre des calques, et l'interface les
// superpose — même méthode que pour les avatars de joueurs.

import { makeAtom } from "../../store/hub";
import { gameVersion } from "../../utils/gameVersion";

const npcAvatarData = makeAtom<Record<string, unknown>>("npcAvatarDataAtom");

/**
 * Ordre de superposition, du fond vers le premier plan.
 *
 * Les cosmétiques portent leur catégorie en préfixe de nom de fichier
 * (`Top_AviatorHat.png`). L'API `/assets/cosmetics` sert bien cette catégorie
 * dans un champ dédié, mais elle rend aujourd'hui un catalogue vide : le
 * préfixe est donc la seule source disponible. Une catégorie inconnue est
 * ignorée plutôt que dessinée au hasard — un bandeau de profil posé sur le
 * visage serait pire que son absence.
 */
const LAYER_ORDER = ["Default", "Bottom", "Mid", "Top", "Expression"];

function layerRank(filename: string): number {
  const prefix = filename.split("_")[0];
  return LAYER_ORDER.indexOf(prefix);
}

/**
 * Extrait une liste de fichiers de cosmétiques d'une valeur d'atom.
 *
 * La forme exacte de l'entrée n'est pas garantie d'une version à l'autre du
 * jeu : on accepte aussi bien un tableau direct qu'un objet qui en contient un.
 * On ne retient que ce qui ressemble à un cosmétique, donc une mauvaise
 * supposition ne produit rien plutôt qu'une image absurde.
 */
function cosmeticsIn(value: unknown, depth = 0): string[] {
  if (depth > 3 || !value) return [];

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".png"));
  }
  if (typeof value !== "object") return [];

  for (const nested of Object.values(value as Record<string, unknown>)) {
    const found = cosmeticsIn(nested, depth + 1);
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * Les calques de la tenue d'un PNJ, dans l'ordre où les dessiner.
 *
 * Vide quand le PNJ est inconnu ou que sa tenue n'a pas encore été reçue :
 * l'appelant garde alors son repli.
 */
export async function readNpcOutfit(npcId: string): Promise<string[]> {
  if (!npcId) return [];

  let all: Record<string, unknown> | null = null;
  try {
    all = await npcAvatarData.get();
  } catch {
    return [];
  }
  if (!all || typeof all !== "object") return [];

  return cosmeticsIn(all[npcId])
    .filter((filename) => layerRank(filename) >= 0)
    .sort((a, b) => layerRank(a) - layerRank(b));
}

/**
 * URL du PNG d'un cosmétique.
 *
 * Les cosmétiques vivent dans les assets du jeu, versionnés :
 * `<origine>/version/<version>/assets/cosmetic/<fichier>`. Sans version connue
 * on ne devine pas d'URL — mieux vaut pas d'avatar qu'une requête vouée à
 * échouer.
 */
export function cosmeticUrl(filename: string): string | null {
  if (!gameVersion || !filename) return null;
  const origin = typeof location !== "undefined" ? location.origin.replace(/\/$/, "") : "";
  if (!origin) return null;
  return `${origin}/version/${gameVersion}/assets/cosmetic/${filename}`;
}
