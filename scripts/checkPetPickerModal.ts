// Choosing a pet for a team slot: a popup listing every owned pet (bag, Pet
// Hutch and active), searchable, replacing the game's inventory modal, which
// since build 1449 no longer shows the faked pet list and opened empty.
import { installFakeDom } from "./_fakeDom";
installFakeDom();
import { check, checkEqual, done } from "./_check";
import { filterPickablePets, labelPetSources, openPetPickerModal, strengthLabel, type PickablePet } from "../src/features/pets/petPickerModal";
import type { InventoryPet } from "../src/features/pets/inventoryPets";

const pet = (id: string, petSpecies: string, name: string | null, abilities: string[] = [], mutations: string[] = []): InventoryPet =>
  ({ id, itemType: "Pet", petSpecies, name, xp: 0, hunger: 1000, mutations, abilities });

const pets: PickablePet[] = [
  { pet: pet("a", "Bunny", "Fluffy", ["ProduceScaleBoost"]), source: "bag" },
  { pet: pet("b", "Turtle", null, [], ["Gold"]), source: "hutch" },
  { pet: pet("c", "Bunny", null), source: "active" },
];

// The owned-pets list mixes bag, hutch and active pets: each must still be
// labelled where it really is, or the Hutch filter reads 0 with pets inside.
const owned = [pet("a", "Bunny", "Fluffy"), pet("h", "Turtle", null), pet("c", "Bunny", null)];
const labelled = labelPetSources({ active: [pet("c", "Bunny", null)], hutch: [pet("h", "Turtle", null)], owned, exclude: new Set() });
checkEqual("each pet is labelled where it is", labelled.map((p) => `${p.pet.id}:${p.source}`).sort(), ["a:bag", "c:active", "h:hutch"]);
checkEqual("excluded pets are left out", labelPetSources({ active: [], hutch: [], owned, exclude: new Set(["a"]) }).map((p) => p.pet.id).sort(), ["c", "h"]);

checkEqual("no filter keeps every pet, active ones first", filterPickablePets(pets, { query: "", source: "all" }).map((p) => p.pet.id), ["c", "a", "b"]);
checkEqual("a custom name is searchable", filterPickablePets(pets, { query: "fluf", source: "all" }).map((p) => p.pet.id), ["a"]);
checkEqual("the species is searchable", filterPickablePets(pets, { query: "turtle", source: "all" }).map((p) => p.pet.id), ["b"]);
checkEqual("a mutation is searchable", filterPickablePets(pets, { query: "gold", source: "all" }).map((p) => p.pet.id), ["b"]);
checkEqual("the source filter narrows the list", filterPickablePets(pets, { query: "", source: "hutch" }).map((p) => p.pet.id), ["b"]);

const host = document.createElement("div");
host.className = "qws-win";
document.body.appendChild(host);
const picked = openPetPickerModal({ host, title: "Choose a pet", pets });
const cards = () => Array.from(document.querySelectorAll(".pt-pick-card")) as unknown as HTMLElement[];
checkEqual("every pet gets a card", cards().length, 3);

const search = document.querySelector(".pt-pick-search") as unknown as HTMLInputElement;
search.value = "turtle";
search.dispatchEvent({ type: "input" } as Event);
checkEqual("typing filters the cards", cards().length, 1);

checkEqual("a pet below its max shows both numbers", strengthLabel(10, 85), "STR 10/85");
checkEqual("a pet at its max shows one number", strengthLabel(98, 98), "STR 98");

cards()[0].click();
picked.then((chosen) => {
  checkEqual("clicking a card picks that pet", chosen?.id, "b");
  check("and closes the popup", !document.querySelector(".pt-pick-search"));
  done();
});
