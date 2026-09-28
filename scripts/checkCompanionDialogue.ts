import {
  CONTEXTUAL_CHANCE,
  DEFAULT_CONTEXTUAL_COOLDOWN_MS,
  initialDialogueState,
  nextBubbleTimestamp,
  pickDialogueLine,
  type ContextualLine,
  type DialogueState,
} from "../src/services/companion/dialogue";
import {
  DEFAULT_CUSTOM_LINES,
  GENERIC_WEATHER_TEMPLATES,
  LEGACY_DEFAULT_LINES,
  weatherDisplayName,
  harvestMessage,
  hungryPetMessage,
  ripeCropCount,
  sellMessage,
  weatherMessage,
} from "../src/services/companion/dialogueLines";
import { MAX_LINE_LENGTH, coerceSettings } from "../src/services/companion/settingsShape";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got=${got}  want=${want}`}`);
};

const fixedRandom = (v: number) => () => v;
const CUSTOM = ["A", "B", "C"];

function pick(
  contextual: ContextualLine[],
  customLines: string[],
  state: DialogueState,
  nowMs: number,
  random: () => number = fixedRandom(0)
) {
  return pickDialogueLine({
    contextual,
    customLines,
    state,
    nowMs,
    random,
    cooldownMs: DEFAULT_CONTEXTUAL_COOLDOWN_MS,
  });
}

console.log("--- priorité du contextuel ---");
{
  const harvest: ContextualLine = { key: "harvest", message: "3 récoltes sont prêtes." };
  const r = pick([harvest], CUSTOM, initialDialogueState(), 1000);
  check("une alerte contextuelle passe avant les phrases perso", r.message, harvest.message);
  check("l'alerte est temporisée après usage", r.state.mutedUntil.harvest, 1000 + DEFAULT_CONTEXTUAL_COOLDOWN_MS);
}
{
  // L'ordre des candidats fait la priorité.
  const first: ContextualLine = { key: "harvest", message: "récolte" };
  const second: ContextualLine = { key: "pets", message: "pets" };
  const r = pick([first, second], CUSTOM, initialDialogueState(), 0);
  check("le premier candidat gagne", r.message, "récolte");
  check("le second n'est pas temporisé pour rien", r.state.mutedUntil.pets, "undefined");
}

console.log("\n--- les alertes font partie du tirage ---");
{
  const harvest: ContextualLine = { key: "harvest", message: "récolte" };
  // Un tirage haut tombe sur une phrase perso, même avec une alerte disponible :
  // sinon les alertes sortent toutes d'affilée au début, et plus jamais après.
  const high = pick([harvest], CUSTOM, initialDialogueState(), 0, fixedRandom(0.9));
  check("un tirage haut donne une phrase perso", CUSTOM.includes(String(high.message)), true);
  check("et l'alerte n'est pas temporisée pour rien", high.state.mutedUntil.harvest, "undefined");
  const lowDraw = pick([harvest], CUSTOM, initialDialogueState(), 0, fixedRandom(CONTEXTUAL_CHANCE - 0.01));
  check("sous la probabilité, c'est l'alerte", lowDraw.message, "récolte");
  // Sans phrases perso, il n'y a rien d'autre à dire que l'alerte.
  const onlyAlert = pick([harvest], [], initialDialogueState(), 0, fixedRandom(0.9));
  check("sans phrases perso, l'alerte sort quand même", onlyAlert.message, "récolte");

  // Sur un grand nombre de tirages, les alertes sortent à peu près une fois sur quatre.
  let state = initialDialogueState();
  let alerts = 0;
  let seed = 7;
  const lcg = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < 2000; i++) {
    const r = pickDialogueLine({ contextual: [harvest], customLines: CUSTOM, state, nowMs: i, random: lcg, cooldownMs: 0 });
    state = r.state;
    if (r.message === "récolte") alerts++;
  }
  check("environ 25 % d'alertes sur 2000 tirages", alerts > 400 && alerts < 600, true);
}

console.log("\n--- temporisation ---");
{
  const harvest: ContextualLine = { key: "harvest", message: "récolte" };
  const pets: ContextualLine = { key: "pets", message: "pets" };
  const first = pick([harvest, pets], CUSTOM, initialDialogueState(), 0);
  // Juste après, la même alerte doit se taire et laisser la place à la suivante.
  const second = pick([harvest, pets], CUSTOM, first.state, 1000);
  check("une alerte ne se répète pas immédiatement", second.message, "pets");
  // Une fois le délai passé, elle peut revenir.
  const third = pick([harvest], CUSTOM, second.state, DEFAULT_CONTEXTUAL_COOLDOWN_MS + 1);
  check("elle revient après le cooldown", third.message, "récolte");
}
{
  // Toutes temporisées : on retombe sur les phrases perso.
  const harvest: ContextualLine = { key: "harvest", message: "récolte" };
  const first = pick([harvest], CUSTOM, initialDialogueState(), 0);
  const second = pick([harvest], CUSTOM, first.state, 500);
  check("repli sur une phrase perso quand tout est temporisé", CUSTOM.includes(String(second.message)), true);
}

console.log("\n--- phrases perso ---");
{
  const r = pick([], CUSTOM, initialDialogueState(), 0, fixedRandom(0));
  check("tire bien dans la liste", r.message, "A");
  // Le même tirage ne doit pas ressortir la même phrase deux fois d'affilée.
  const again = pick([], CUSTOM, r.state, 0, fixedRandom(0));
  check("évite de répéter la précédente", again.message, "B");
}
{
  const single = pick([], ["Seule"], initialDialogueState(), 0);
  check("une liste d'une phrase reste utilisable", single.message, "Seule");
  const twice = pick([], ["Seule"], single.state, 0);
  check("et se répète sans boucler à l'infini", twice.message, "Seule");
}
{
  const empty = pick([], [], initialDialogueState(), 0);
  check("liste vide -> null (le jeu garde sa réplique)", empty.message, "null");
  const blanks = pick([], ["   ", ""], initialDialogueState(), 0);
  check("des lignes vides ne comptent pas comme des répliques", blanks.message, "null");
}
{
  // random() renvoyant 1 ne doit pas déborder du tableau.
  const r = pick([], CUSTOM, initialDialogueState(), 0, fixedRandom(1));
  check("random() = 1 reste dans les bornes", CUSTOM.includes(String(r.message)), true);
}

console.log("\n--- immuabilité de l'état ---");
{
  const base = initialDialogueState();
  const r = pick([{ key: "harvest", message: "récolte" }], CUSTOM, base, 0);
  check("l'état d'entrée n'est pas muté", Object.keys(base.mutedUntil).length, 0);
  check("l'état rendu porte bien la temporisation", Object.keys(r.state.mutedUntil).length, 1);
}

console.log("\n--- récolte prête : les crops préservés ne comptent pas ---");
{
  const now = 10_000;
  const garden = {
    "0": { objectType: "plant", slots: [{ endTime: 5 }, { endTime: 5, preserved: true }] },
    "1": { objectType: "plant", slots: [{ endTime: 5, preserved: true }, { endTime: now + 1 }] },
    "2": { objectType: "plant", slots: [{ endTime: 5, preserved: false }] },
  };
  check("un crop préservé n'est pas signalé comme à récolter", ripeCropCount(garden, now), 2);
  const onlyPreserved = { "0": { objectType: "plant", slots: [{ endTime: 5, preserved: true }] } };
  check("un jardin tout préservé ne donne rien à dire", ripeCropCount(onlyPreserved, now), 0);
  check("un jardin illisible compte zéro", ripeCropCount(null, now), 0);
}

console.log("\n--- répliques par défaut ---");
{
  check("la liste par défaut a de quoi varier", DEFAULT_CUSTOM_LINES.length >= 30, true);
  check("aucune réplique en double", new Set(DEFAULT_CUSTOM_LINES).size, DEFAULT_CUSTOM_LINES.length);
  check(
    "aucune ne dépasse la longueur d'une bulle",
    DEFAULT_CUSTOM_LINES.every((line) => line.length <= MAX_LINE_LENGTH),
    true
  );
  check("pas de tiret cadratin", DEFAULT_CUSTOM_LINES.some((line) => line.includes("—")), false);

  // Les joueurs existants ont les 4 anciennes phrases sur disque : sans
  // migration, la nouvelle liste ne leur parviendrait jamais.
  const legacy = coerceSettings({ lines: [...LEGACY_DEFAULT_LINES] });
  check("les anciennes répliques par défaut passent à la nouvelle liste", legacy.lines.length, DEFAULT_CUSTOM_LINES.length);
  const custom = coerceSettings({ lines: ["Mine", "Right behind you, boss."] });
  check("une liste personnalisée n'est pas écrasée", custom.lines.join("|"), "Mine|Right behind you, boss.");
  const empty = coerceSettings({ lines: [] });
  check("une liste vidée exprès reste vide", empty.lines.length, 0);
}

console.log("\n--- répliques contextuelles variées ---");
{
  const sweep = (make: (random: () => number) => string) =>
    new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((v) => make(fixedRandom(v))));
  check("la récolte a plusieurs tournures", sweep((r) => harvestMessage(3, r)).size >= 3, true);
  check("la faim a plusieurs tournures", sweep((r) => hungryPetMessage(2, r)).size >= 3, true);
  check("la vente a plusieurs tournures", sweep((r) => sellMessage(1500, r)).size >= 3, true);
  check("la météo a plusieurs tournures", sweep((r) => weatherMessage("Rain", "Rain", r)).size >= 3, true);
  check("le nombre apparaît bien", harvestMessage(7, fixedRandom(0.5)).includes("7"), true);
  check("le singulier est respecté", /\b1 crops\b/.test(harvestMessage(1, fixedRandom(0))), false);
  check("les pièces sont formatées", sellMessage(12345, fixedRandom(0)).includes("12,345"), true);
  check("random() = 1 reste dans les bornes", typeof harvestMessage(2, fixedRandom(1)), "string");
}

console.log("\n--- répliques propres à chaque météo ---");
{
  const all = (id: string, name: string) =>
    [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.99].map((v) => weatherMessage(id, name, fixedRandom(v)));
  // Les IDs que porte `weatherAtom` (bundle 1299 : Rain, Frost, Thunderstorm, Dawn, AmberMoon).
  for (const [id, name] of [
    ["Rain", "Rain"],
    ["Frost", "Snow"],
    ["Thunderstorm", "Thunderstorm"],
    ["Dawn", "Dawn"],
    ["AmberMoon", "Amber Moon"],
  ]) {
    const lines = all(id, name);
    check(`${id} a ses propres répliques`, lines.every((line) => !GENERIC_WEATHER_TEMPLATES.some((t) => t(name) === line)), true);
    check(`${id} en a plusieurs`, new Set(lines).size >= 4, true);
    check(`${id} ne montre jamais l'ID brut`, id === name || lines.every((line) => !line.includes(id)), true);
  }
  // Une météo ajoutée par le jeu après cette version : repli générique, avec son nom affiché.
  const unknown = all("SolarFlare", "Solar Flare");
  check("une météo inconnue retombe sur le générique", unknown.every((line) => line.includes("Solar Flare")), true);
  check("aucune réplique météo n'a de tiret cadratin", [...unknown, ...all("Rain", "Rain")].some((l) => l.includes("—")), false);
}
{
  check("nom d'affichage : catalogue live", weatherDisplayName("Frost", { Frost: { name: "Snow" } }), "Snow");
  check("nom d'affichage : ancien champ displayName", weatherDisplayName("Frost", { Frost: { displayName: "Snow" } }), "Snow");
  check("nom d'affichage : ID découpé en repli", weatherDisplayName("AmberMoon", {}), "Amber Moon");
  check("nom d'affichage : catalogue illisible", weatherDisplayName("Rain", null), "Rain");
}

console.log("\n--- une bulle du Talk passe après une bulle du mod ---");
{
  // Règle du jeu (bundle 1299, deliverNpcChatBubble) : une bulle ne s'affiche
  // que si son horodatage dépasse celui de la dernière affichée. Le mod date
  // ses bulles avec Date.now(), le jeu avec son horloge calée sur le serveur.
  const deliver = (timestamps: number[]) => {
    let last = 0;
    return timestamps.map((ts) => {
      if (ts > last) {
        last = ts;
        return true;
      }
      return false;
    });
  };
  const server = 1_000_000;
  const modAhead = server + 2_000; // horloge du PC en avance de 2 s
  const talk = server + 500; // Talk du joueur une demi-seconde plus tard

  check("sans correction, le Talk est ignoré", deliver([modAhead, talk]).join(), "true,false");

  let last: number | null = null;
  const stamped = [modAhead, talk].map((ts) => {
    const next = nextBubbleTimestamp(last, ts);
    last = next;
    return next;
  });
  check("avec correction, les deux bulles s'affichent", deliver(stamped).join(), "true,true");
  check("une bulle déjà plus récente garde son heure", nextBubbleTimestamp(100, 500), 500);
  check("la toute première garde son heure", nextBubbleTimestamp(null, 42), 42);
  check("un horodatage illisible reste tel quel", nextBubbleTimestamp(100, NaN as unknown as number), "NaN");
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
