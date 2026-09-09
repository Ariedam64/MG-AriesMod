// src/services/companion/chat/petFeed.ts
// Trouve les pets qui ont faim et de quoi les nourrir.
//
// Deux sources possibles, dans cet ordre : un crop déjà en inventaire, sinon un
// crop mûr du jardin que le Locker laisse prendre. On ne propose jamais un pet
// sans avoir de quoi le nourrir — une question à laquelle on ne peut pas donner
// suite ne vaut pas la peine d'être posée.
//
// Les favoris sont écartés : ce sont précisément les crops que le joueur a
// marqués comme à ne pas dépenser.
//
// La description du périmètre est dans `feedScope.ts`, qui reste pur.

import { loadCompanionSettings } from "../state";
import { PetsService } from "../../pets";
import type { PetInfo } from "../../player";
import { PlayerService, type CropItem } from "../../player";
import { readHarvestable } from "./gardenRead";
import { rowKey, type HarvestRow } from "./harvest";
import { disambiguate, type FeedCandidate, type FeedSource } from "./feedScope";

export { describeFeed, feedSignature } from "./feedScope";
export type { FeedCandidate, FeedSource } from "./feedScope";
function petIdOf(pet: PetInfo): string {
  return String(pet?.slot?.id ?? "");
}

function petNameOf(pet: PetInfo): string {
  const given = pet?.slot?.name;
  const species = String(pet?.slot?.petSpecies ?? "");
  return (typeof given === "string" && given.trim()) || species || "That pet";
}

/**
 * Ce qu'un pet accepte, résolu depuis l'animal qu'on tient déjà.
 *
 * `PetsService.getPetAllowedCrops` ferait le même calcul, mais en recherchant
 * d'abord le pet par son identifiant — une recherche qui peut échouer juste
 * après un changement d'équipe, le temps que l'état se propage. Elle rendait
 * alors un ensemble vide, indiscernable d'un « le joueur a tout interdit », et
 * l'animal était écarté en silence. On applique donc la même règle nous-mêmes,
 * à partir de l'espèce que l'objet pet porte déjà.
 */
function allowedCropsFor(petId: string, species: string): Set<string> {
  const compatibles = PetsService.getCompatibleCropsForSpecies(species);
  let rules: Record<string, { allowed: boolean }> = {};
  try {
    rules = PetsService.getOverride(petId).crops ?? {};
  } catch {
    rules = {};
  }
  // Une espèce sans règle explicite est autorisée : c'est le défaut du jeu.
  return new Set(compatibles.filter((crop) => (rules[crop] ? rules[crop].allowed : true)));
}

export type FeedSearch = {
  /** Satiété en dessous de laquelle on s'inquiète. */
  thresholdPct: number;
  /** Autorise la cueillette d'un crop du jardin faute d'inventaire. */
  allowGarden: boolean;
};

/**
 * Le résultat complet d'une recherche, raisons comprises.
 *
 * « Aucun pet à nourrir » recouvrait trois situations très différentes : aucun
 * animal affamé, des animaux affamés sans rien à leur donner, ou des animaux
 * qu'on aurait pu nourrir en cueillant si c'était autorisé. Les confondre rend
 * la fonctionnalité impossible à diagnostiquer de l'extérieur.
 */
export type FeedReview = {
  candidates: FeedCandidate[];
  /** Pets sous le seuil, nourrissables ou non. */
  hungry: number;
  /** Pets qu'un crop du jardin sauverait, si la cueillette était permise. */
  waitingOnGardenRule: number;
};

/**
 * Les pets sous le seuil, avec de quoi les nourrir.
 *
 * `thresholdPct` est un pourcentage de satiété : à 10, on s'inquiète quand il
 * ne reste plus qu'un dixième. Un pet par entrée, et une seule source par pet —
 * proposer deux fois le même animal n'aurait pas de sens.
 */
export async function reviewFeeding(search?: Partial<FeedSearch>): Promise<FeedReview> {
  // Sans consigne explicite, on suit les réglages du joueur : tous les appels
  // partagent ainsi la même définition de « a faim » et de « peut cueillir ».
  const settings = loadCompanionSettings();
  const thresholdPct = search?.thresholdPct ?? settings.feedThresholdPct;
  const allowGarden = search?.allowGarden ?? settings.feedFromGarden;

  const empty: FeedReview = { candidates: [], hungry: 0, waitingOnGardenRule: 0 };

  let pets: PetInfo[] = [];
  try {
    pets = (await PetsService.getPets()) ?? [];
  } catch {
    return empty;
  }

  const hungry = pets.filter((pet) => petIdOf(pet) && PetsService.getHungerPctFor(pet) <= thresholdPct);
  if (hungry.length === 0) return empty;

  let inventory: CropItem[] = [];
  let favourites = new Set<string>();
  try {
    const [invRaw, favRaw] = await Promise.all([
      PlayerService.getCropInventoryState(),
      PlayerService.getFavoriteIds().catch(() => [] as string[]),
    ]);
    inventory = Array.isArray(invRaw) ? invRaw : [];
    favourites = new Set(Array.isArray(favRaw) ? favRaw : []);
  } catch {
    inventory = [];
  }

  // Le jardin n'est lu qu'une fois, et seulement si l'inventaire ne suffit pas.
  let garden: HarvestRow[] | null = null;
  const gardenRows = async (): Promise<HarvestRow[]> => {
    if (garden === null) garden = await readHarvestable().then((scope) => scope.rows).catch(() => []);
    return garden;
  };

  /** Réservé au fil de cette recherche : deux pets ne se partagent pas un crop. */
  const claimed = new Set<string>();
  const candidates: FeedCandidate[] = [];
  let waitingOnGardenRule = 0;

  for (const pet of hungry) {
    const petId = petIdOf(pet);
    const species = String(pet?.slot?.petSpecies ?? "");
    const allowed = allowedCropsFor(petId, species);
    if (allowed.size === 0) continue;

    const fromInventory = inventory.find(
      (item) =>
        item?.id &&
        !favourites.has(String(item.id)) &&
        !claimed.has(`inv:${item.id}`) &&
        typeof item.species === "string" &&
        allowed.has(item.species)
    );

    let source: FeedSource | null = null;
    if (fromInventory?.id) {
      claimed.add(`inv:${fromInventory.id}`);
      source = { kind: "inventory", itemId: String(fromInventory.id), species: String(fromInventory.species) };
    } else {
      const rows = await gardenRows();
      const fromGarden = rows.find((row) => allowed.has(row.species) && !claimed.has(`garden:${rowKey(row)}`));
      if (fromGarden && allowGarden) {
        claimed.add(`garden:${rowKey(fromGarden)}`);
        source = { kind: "garden", row: fromGarden, species: fromGarden.species };
      } else if (fromGarden) {
        // Nourrissable, mais la cueillette est interdite : ça se dit.
        waitingOnGardenRule++;
      }
    }

    if (!source) continue;
    candidates.push({
      petId,
      petName: petNameOf(pet),
      petSpecies: species,
      hungerPct: PetsService.getHungerPctFor(pet),
      source,
    });
  }

  return {
    // Le plus affamé d'abord : c'est celui pour qui la question presse.
    candidates: disambiguate(candidates.sort((a, b) => a.hungerPct - b.hungerPct)),
    hungry: hungry.length,
    waitingOnGardenRule,
  };
}

export async function findFeedable(search?: Partial<FeedSearch>): Promise<FeedCandidate[]> {
  return (await reviewFeeding(search)).candidates;
}
