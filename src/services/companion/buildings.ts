// src/services/companion/buildings.ts
// Retrouver un bâtiment parmi les clés que la map expose.
//
// Module PUR, séparé de `map.ts` parce que celui-ci s'abonne à un atome dès
// l'import : la règle de correspondance mérite d'être vérifiable sans monter
// tout le pont d'état.
//
// Aucun nom de bâtiment n'est écrit en dur dans le mod. La map est la seule
// source, et ses clés changent d'une version du jeu à l'autre — d'où une
// recherche par fragments plutôt que par égalité.

/**
 * Le premier bâtiment dont le nom contient tous les fragments de `required` et
 * au moins un de `alternatives`.
 *
 * Le second groupe est ce qui sépare deux lieux parlant de la même chose : la
 * boutique d'animaux et la niche contiennent toutes deux « pet ». Un groupe
 * vide ne contraint rien.
 *
 * Rend `null` quand rien ne correspond. Deviner serait pire : l'appelant sait
 * quoi faire d'une absence, pas d'un mauvais bâtiment.
 */
export function matchBuildingName(
  names: string[],
  required: string[],
  alternatives: string[]
): string | null {
  const wanted = required.map((word) => word.toLowerCase());
  const either = alternatives.map((word) => word.toLowerCase());

  for (const name of names) {
    // Les clés de map mélangent les casses et les séparateurs : on compare sur
    // les seules lettres pour que « PetShop » et « pet_shop » se valent.
    const key = name.toLowerCase().replace(/[^a-z]/g, "");
    if (!wanted.every((word) => key.includes(word))) continue;
    if (either.length > 0 && !either.some((word) => key.includes(word))) continue;
    return name;
  }
  return null;
}
