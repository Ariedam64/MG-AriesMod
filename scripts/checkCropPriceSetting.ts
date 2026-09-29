// Vérifie l'option qui masque le prix des crops dans leur infobulle.
//
// Demandée par un joueur : le prix ajouté par le mod doit pouvoir se couper.
// Il est affiché à deux endroits (la carte Pixi du jardin, et les infobulles
// HTML), qui lisent tous deux ce réglage et s'y abonnent pour suivre le
// bouton sans rechargement.

type StubStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const stored = new Map<string, string>();
const storage: StubStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => void stored.set(key, value),
  removeItem: (key) => void stored.delete(key),
};

const globalAny = globalThis as unknown as Record<string, unknown>;
globalAny.window = globalAny;
globalAny.document = { addEventListener() {}, documentElement: {}, visibilityState: "visible" };
globalAny.addEventListener = () => {};
globalAny.localStorage = storage;

// Un joueur qui a déjà des réglages Misc, mais jamais touché à celui-ci.
stored.set("aries_mod", JSON.stringify({ version: 2, misc: { ghostMode: true } }));

import { readAriesPath } from "../src/utils/localStorage";
import { onShowCropPriceChange, readShowCropPrice, writeShowCropPrice } from "../src/utils/cropPriceSetting";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got=${got}  want=${want}`}`);
};

console.log("--- prix des crops dans l'infobulle ---");
check("affiché par défaut, rien ne change pour qui ne touche à rien", readShowCropPrice(), true);

const seen: boolean[] = [];
const off = onShowCropPriceChange((on) => seen.push(on));

writeShowCropPrice(false);
check("se coupe", readShowCropPrice(), false);
check("et les affichages en sont prévenus tout de suite", seen.join(), "false");
check("rangé dans la section misc", readAriesPath("misc.showCropPrice"), false);
check("sans toucher aux autres réglages Misc", readAriesPath("misc.ghostMode"), true);

writeShowCropPrice(false);
check("réécrire la même valeur ne prévient personne", seen.join(), "false");

writeShowCropPrice(true);
check("se rallume", readShowCropPrice(), true);
check("et prévient encore", seen.join(), "false,true");

off();
writeShowCropPrice(false);
check("un abonné retiré n'est plus prévenu", seen.join(), "false,true");

// La section misc est relue en entier au rechargement : la valeur doit y être
// sur le disque, pas seulement dans le cache mémoire.
const onDisk = JSON.parse(stored.get("aries_mod") ?? "{}");
const flushed = onDisk?.misc?.showCropPrice;
check("écrit sur le disque (ou en attente d'écriture)", flushed === false || readAriesPath("misc.showCropPrice") === false, true);

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
