import {
  DEFAULT_CONTEXTUAL_COOLDOWN_MS,
  initialDialogueState,
  pickDialogueLine,
  type ContextualLine,
  type DialogueState,
} from "../src/services/companion/dialogue";

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

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
