// Vérifie qu'une section du blob `aries_mod` survit à un rechargement de page.
//
// Le bug d'origine : la relecture du blob passe par une liste blanche de
// sections connues. Une section absente de cette liste était écrite sur le
// disque puis silencieusement jetée à la lecture suivante — les réglages
// tenaient toute la session grâce au cache mémoire, et disparaissaient au
// premier refresh. Ce test simule exactement ce moment : un blob déjà sur le
// disque, lu par un module qui n'a encore rien en cache.

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

// Le blob est posé AVANT le premier import : c'est ce que voit une page qui
// vient de se charger.
stored.set(
  "aries_mod",
  JSON.stringify({
    version: 2,
    companion: { enabled: true, mode: "garden", feedThresholdPct: 25, npcId: "NPC_Vendor" },
    misc: { ghostMode: true },
  })
);

import { readAriesPath } from "../src/utils/localStorage";
import {
  isUnreviewed,
  loadCompanionSettings,
  markReviewed,
  patchCompanionSettings,
} from "../src/services/companion/state";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got=${got}  want=${want}`}`);
};

console.log("--- persistance du companion ---");
check("la section survit au rechargement", typeof readAriesPath("companion"), "object");
check("l'activation est relue", readAriesPath("companion.enabled"), true);
check("le mode aussi", readAriesPath("companion.mode"), "garden");
check("et les reglages de nourrissage", readAriesPath("companion.feedThresholdPct"), 25);
check("et le PNJ emprunte", readAriesPath("companion.npcId"), "NPC_Vendor");
// Les sections deja connues ne doivent pas avoir ete abimees au passage.
check("les autres sections sont intactes", readAriesPath("misc.ghostMode"), true);

console.log("\n--- reglages du companion, repares a la lecture ---");
{
  // Le blob pose plus haut ne contient ni equipes ni groupes consultes : c'est
  // exactement l'etat d'un joueur qui met le mod a jour.
  const settings = loadCompanionSettings();

  check("les valeurs presentes sont gardees", settings.mode, "garden");
  check("une equipe absente vaut « ne pas y toucher »", settings.harvestTeamId, null);
  // Un reglage ajoute apres coup doit s'activer tout seul chez qui met a jour,
  // sinon la fonctionnalite n'existe que pour les nouveaux venus.
  check("une carte de question absente du blob est active", settings.askOnScreen, true);
  check("aucun groupe n'a ete consulte", settings.reviewedSettings.length, 0);
  // Sans critere, aucune vente ne sera proposee : c'est le defaut sur lequel il
  // faut retomber, jamais un critere invente.
  check("aucun critere de conservation par defaut", settings.hatchKeepRules.species.length, 0);
  check("et pas de seuil de force", settings.hatchKeepRules.minMaxStr, null);

  // Une equipe vide n'est pas une equipe : elle ne doit pas passer pour un choix.
  patchCompanionSettings({ harvestTeamId: "" as unknown as string });
  check("une equipe vide retombe sur null", loadCompanionSettings().harvestTeamId, null);

  patchCompanionSettings({ hatchTeamId: "team-hatch", hatchSellTeamId: "team-sell" });
  const withTeams = loadCompanionSettings();
  check("les trois equipes sont distinctes", `${withTeams.harvestTeamId}|${withTeams.hatchTeamId}|${withTeams.hatchSellTeamId}`, "null|team-hatch|team-sell");

  markReviewed("harvest");
  markReviewed("harvest");
  check("un groupe consulte est note une seule fois", loadCompanionSettings().reviewedSettings.join(","), "harvest");
  check("il ne l'est plus a signaler", isUnreviewed("harvest"), false);
  check("les autres le restent", isUnreviewed("hatch"), true);

  patchCompanionSettings({ askOnScreen: false });
  check("mais elle se coupe et se retient", loadCompanionSettings().askOnScreen, false);

  // Une valeur inconnue venue d'une version future ne doit pas entrer.
  patchCompanionSettings({ reviewedSettings: ["harvest", "nope"] as never });
  check("un groupe inconnu est ecarte", loadCompanionSettings().reviewedSettings.join(","), "harvest");
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
