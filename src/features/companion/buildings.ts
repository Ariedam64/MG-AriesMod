// Finding a building among the keys the map exposes.
//
// No building name is written into the mod: the map is the only source, and
// its keys change from one game version to the next, hence a search by
// fragments rather than by equality.

/**
 * The first building whose name holds every fragment of `required` and at
 * least one of `alternatives`.
 *
 * The second group tells apart two places about the same thing: the pet shop
 * and the kennel both contain "pet". An empty group constrains nothing.
 *
 * `null` when nothing matches. Guessing would be worse: the caller knows what
 * to do with an absence, not with the wrong building.
 */
export function matchBuildingName(names: string[], required: string[], alternatives: string[]): string | null {
  const wanted = required.map((word) => word.toLowerCase());
  const either = alternatives.map((word) => word.toLowerCase());

  for (const name of names) {
    // Map keys mix cases and separators: comparing letters only makes
    // "PetShop" and "pet_shop" the same.
    const key = name.toLowerCase().replace(/[^a-z]/g, "");
    if (!wanted.every((word) => key.includes(word))) continue;
    if (either.length > 0 && !either.some((word) => key.includes(word))) continue;
    return name;
  }
  return null;
}
