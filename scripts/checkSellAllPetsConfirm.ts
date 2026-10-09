// The confirmation Sell All Pets asks for before selling protected pets.
//
// Opening a second confirmation used to remove the first dialog without
// answering it, so the first Sell All Pets run waited forever. Each run now
// gets an answer: a replaced dialog counts as cancelled.
//
// Run with: npm run check:sellallpetsconfirm
import { checkEqual, run } from "./_check";
import "./_installFakeDom";
import { confirmProtectedPetSale } from "../src/features/sellAllPets/confirmModal";
import type { FlaggedPet } from "../src/features/sellAllPets/protection";

const flagged: FlaggedPet[] = [
  { pet: { id: "p1", itemType: "Pet", petSpecies: "Bee", mutations: ["Gold"] }, reasons: ["Mutation: Gold"], mutations: ["Gold"] },
];
const dialogs = () => document.documentElement.querySelectorAll(".qmm-modal-scrim");
const buttonIn = (root: Element, text: string) =>
  root.querySelectorAll(".qmm-btn").find((b: any) => b.textContent.trim() === text) as unknown as HTMLElement;
const settled = <T>(promise: Promise<T>) =>
  Promise.race([promise, new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 20))]);

async function main() {
  (globalThis as any).fetch = () => new Promise(() => {});

  const first = confirmProtectedPetSale(flagged);
  checkEqual("a dialog opens", dialogs().length, 1);
  const second = confirmProtectedPetSale(flagged);
  checkEqual("a second dialog replaces the first", dialogs().length, 1);
  checkEqual("the replaced dialog's run is told no", await settled(first), false);

  buttonIn(dialogs()[0], "Sell").click();
  checkEqual("Sell confirms", await settled(second), true);
  checkEqual("and closes the dialog", dialogs().length, 0);

  const third = confirmProtectedPetSale(flagged);
  buttonIn(dialogs()[0], "Cancel").click();
  checkEqual("Cancel declines", await settled(third), false);
}

run(main);
