// The confirmation Sell All Pets asks for before selling protected pets.
//
// Opening a second confirmation used to remove the first dialog without
// answering it, so the first Sell All Pets run waited forever. Each run now
// gets an answer: a replaced dialog counts as cancelled.
//
// Run with: npm run check:sellallpetsconfirm
import "./_installFakeDom";
import { confirmProtectedPetSale } from "../src/features/sellAllPets/confirmModal";
import type { FlaggedPet } from "../src/features/sellAllPets/protection";

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
};

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
  check("a dialog opens", dialogs().length, 1);
  const second = confirmProtectedPetSale(flagged);
  check("a second dialog replaces the first", dialogs().length, 1);
  check("the replaced dialog's run is told no", await settled(first), false);

  buttonIn(dialogs()[0], "Sell").click();
  check("Sell confirms", await settled(second), true);
  check("and closes the dialog", dialogs().length, 0);

  const third = confirmProtectedPetSale(flagged);
  buttonIn(dialogs()[0], "Cancel").click();
  check("Cancel declines", await settled(third), false);

  console.log(failed ? `${failed} FAILURE(S)` : "All checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("FAIL the dialog threw", error);
  process.exit(1);
});
