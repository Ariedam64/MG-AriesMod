import {
  DEFAULT_FILTERS,
  describeFilters,
  describeSelection,
  filterRows,
  groupVariants,
  mutationsPresent,
  speciesPresent,
  rowKey,
  selectionSignature,
  type HarvestRow,
} from "../src/services/companion/chat/harvest";
import { compose, forGame } from "../src/services/companion/chat/bubbleTags";
import {
  describeFeed,
  disambiguate,
  feedSignature,
  isSettled,
  type FeedCandidate,
} from "../src/services/companion/chat/feedScope";
import {
  countByItem,
  describePlan,
  itemKey,
  plantSignature,
  stockLeft,
  summarizePlan,
  viablePlan,
  type PlantAssignment,
  type PlantScope,
} from "../src/services/companion/chat/plant";
import {
  DEFAULT_KEEP_RULES,
  describeKeep,
  hatchCheer,
  isProtected,
  matchesKeep,
  petSignature,
  slotSignature,
  summarizeHatch,
  summarizeSell,
  toFavourite,
  toSell,
  type KeepRules,
  type PetRow,
} from "../src/services/companion/chat/hatch";
import { EmoteType } from "../src/services/companion/emoteTypes";
import {
  MAX_MESSAGES,
  append,
  appendAlertOnce,
  clearProposal,
  emptyLog,
} from "../src/services/companion/chat/log";
import {
  PROPOSAL_TTL_MS,
  isExpired,
  verdict,
  type Proposal,
} from "../src/services/companion/chat/proposals";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got=${got}  want=${want}`}`);
};

const row = (over: Partial<HarvestRow> = {}): HarvestRow => ({
  tileIndex: 1,
  slotId: 0,
  species: "Carrot",
  sizePct: 80,
  growthPct: 100,
  mutations: [],
  ready: true,
  ...over,
});

console.log("\n--- variantes ---");
{
  // Les variantes sont celles qui existent, pas les combinaisons possibles.
  const rows = [
    row({ tileIndex: 1, slotId: 0, species: "Aloe", mutations: ["Frozen"] }),
    row({ tileIndex: 1, slotId: 1, species: "Aloe", mutations: ["Frozen"] }),
    row({ tileIndex: 2, slotId: 0, species: "Aloe", mutations: ["Frozen", "Amberlit"] }),
    row({ tileIndex: 3, slotId: 0, species: "Aloe" }),
    row({ tileIndex: 4, slotId: 0, species: "Carrot" }),
  ];
  const variants = groupVariants(rows);
  check("une variante par apparence", variants.length, 4);
  check("la plus nombreuse en tete", `${variants[0].species}:${variants[0].count}`, "Aloe:2");
  check(
    "les mutations d'une variante sont triees",
    variants.find((v) => v.mutations.length === 2)?.mutations.join(","),
    "Amberlit,Frozen"
  );

  // Deux crops portant les memes mutations dans un ordre different sont la
  // meme apparence : sans tri, ils compteraient pour deux vignettes.
  const mixed = groupVariants([
    row({ tileIndex: 1, slotId: 0, mutations: ["Gold", "Wet"] }),
    row({ tileIndex: 2, slotId: 0, mutations: ["Wet", "Gold"] }),
  ]);
  check("l'ordre des mutations ne cree pas de doublon", mixed.length, 1);
  check("et l'effectif est cumule", mixed[0].count, 2);

  // Un crop non mur n'a rien a faire dans un apercu de recolte.
  // La maturite est tranchee par la lecture du jardin, pas ici : une ligne non
  // mure ne devrait jamais arriver jusqu'au regroupement.
  check("une seule ligne, une seule variante", groupVariants([row()]).length, 1);
}

console.log("\n--- filtres de recolte ---");
{
  const rows = [
    row({ tileIndex: 1, slotId: 0, species: "Carrot", sizePct: 60 }),
    row({ tileIndex: 2, slotId: 0, species: "Carrot", sizePct: 95, mutations: ["Gold"] }),
    row({ tileIndex: 3, slotId: 0, species: "Aloe", sizePct: 80, mutations: ["Frozen"] }),
    row({ tileIndex: 4, slotId: 0, species: "Aloe", sizePct: 90, ready: false }),
  ];
  // Une plante qui pousse encore ne se recolte pas : aucun reglage ne la fait
  // rentrer dans la selection.
  check("le non mur ne passe jamais", filterRows(rows, DEFAULT_FILTERS).length, 3);
  check("especes presentes, triees", speciesPresent(rows).join(","), "Aloe,Carrot");
  check("filtre espece", filterRows(rows, { ...DEFAULT_FILTERS, species: ["Carrot"] }).length, 2);
  check("plusieurs especes sont un OU", filterRows(rows, { ...DEFAULT_FILTERS, species: ["Carrot", "Aloe"] }).length, 3);
  check("taille minimale", filterRows(rows, { ...DEFAULT_FILTERS, minSizePct: 85 }).length, 1);
  check("mutation presente", filterRows(rows, { ...DEFAULT_FILTERS, mutations: ["Gold"] }).length, 1);
  check("mutation absente", filterRows(rows, { ...DEFAULT_FILTERS, mutations: ["Gold"], mutationMode: "none" }).length, 2);
  check("mutations cumulees", filterRows(rows, { ...DEFAULT_FILTERS, mutations: ["Gold", "Frozen"], mutationMode: "all" }).length, 0);
  check("mutations presentes, triees", mutationsPresent(rows).join(","), "Frozen,Gold");
}
{
  // La bulle cote joueur decrit la demande, pas le resultat.
  check("demande par defaut", describeFilters(DEFAULT_FILTERS), "Harvest everything that's ready");
  check("espece nommee", describeFilters({ ...DEFAULT_FILTERS, species: ["Carrot"] }), "Harvest my Carrot, please");
  check(
    "taille et mutation",
    describeFilters({ ...DEFAULT_FILTERS, minSizePct: 90, mutations: ["Gold"] }),
    "Harvest everything, with Gold, at least 90% size"
  );
  check("aucun cadratin", describeFilters({ ...DEFAULT_FILTERS, species: ["Carrot"] }).includes("—"), false);
}

console.log("\n--- identite et signature d'un lot de recolte ---");
{
  const a = row({ tileIndex: 3, slotId: 2 });
  const b = row({ tileIndex: 3, slotId: 5 });
  // Deux sous-slots de la meme tuile sont deux crops distincts.
  check("la cle porte la tuile et le slot", rowKey(a), "3:2");
  check("deux sous-slots ne se confondent pas", rowKey(a) === rowKey(b), false);

  // La signature ne doit pas dependre de l'ordre d'affichage, sinon un simple
  // reordonnancement passerait pour un changement de perimetre.
  check("signature stable par ordre", selectionSignature([a, b]), selectionSignature([b, a]));
  check("un crop de plus change la signature", selectionSignature([a]) === selectionSignature([a, b]), false);
}
{
  check("rien a annoncer", describeSelection([]), "nothing");
  check("une seule espece se suffit", describeSelection([row(), row({ tileIndex: 2 })]), "2 Carrot ready");
  check(
    "plusieurs especes donnent le total",
    describeSelection([row(), row({ tileIndex: 2 }), row({ tileIndex: 3, species: "Aloe" })]),
    "3 crops ready: 2 Carrot and 1 Aloe"
  );
}

console.log("\n--- perimetre de nourrissage ---");
{
  const pet = (over: Partial<FeedCandidate> = {}): FeedCandidate => ({
    petId: "p1",
    petName: "Turtle",
    petSpecies: "Turtle",
    hungerPct: 8,
    source: { kind: "inventory", itemId: "i1", species: "Carrot" },
    ...over,
  });

  // La signature porte les pets, pas les crops : l'inventaire est servi dans un
  // ordre variable, et faire entrer le crop rendait la proposition instable.
  const withCarrot = pet();
  const withApple = pet({ source: { kind: "inventory", itemId: "i2", species: "Apple" } });
  check("le crop retenu ne change pas la signature", feedSignature([withCarrot]), feedSignature([withApple]));
  check(
    "signature stable par ordre",
    feedSignature([pet(), pet({ petId: "p2" })]),
    feedSignature([pet({ petId: "p2" }), pet()])
  );

  // Deux tortues sans nom donne s'appellent pareil : « Turtle, Turtle » ne
  // designe rien.
  const twins = disambiguate([pet({ petId: "b" }), pet({ petId: "a" })]);
  const names = twins.map((candidate) => candidate.petName).sort();
  check("les homonymes sont numerotes", names.join(","), "Turtle #1,Turtle #2");
  check("le numero suit l'identifiant", twins.find((c) => c.petId === "a")?.petName, "Turtle #1");
  check("un nom unique reste intact", disambiguate([pet()])[0].petName, "Turtle");

  // Tant qu'un pet reste concerne, la question garde du sens.
  const picks = [pet({ petId: "p1" }), pet({ petId: "p2" })];
  check("un seul pet restant : on garde la question", isSettled(picks, new Set(["p2"])), false);
  check("plus aucun pet concerne : on se retire", isSettled(picks, new Set(["p9"])), true);

  check("un pet nomme est annonce avec son taux", describeFeed([pet()]), "Turtle is down to 8% and I have Carrot");
  check(
    "un crop a recolter est annonce comme tel",
    describeFeed([pet({ source: { kind: "garden", row: row(), species: "Carrot" } })]),
    "Turtle is down to 8% and I have Carrot, which I would pick first"
  );
  check(
    "plusieurs pets sont enumeres",
    describeFeed([pet(), pet({ petId: "p2", petName: "Bunny" })]),
    "2 pets are hungry: Turtle, Bunny"
  );
}

console.log("\n--- plan de plantation ---");
{
  const at = (tileIndex: number, id = "Carrot", kind: PlantAssignment["kind"] = "seed"): PlantAssignment => ({
    tileIndex,
    kind,
    id,
    name: id,
  });
  const scopeOf = (over: Partial<PlantScope> = {}): PlantScope => ({
    tiles: [0, 1, 2, 3],
    occupied: new Set<number>(),
    items: [{ kind: "seed", id: "Carrot", name: "Carrot", stock: 10 }],
    ...over,
  });

  // Un oeuf et une graine peuvent porter le meme identifiant : les confondre
  // reviendrait a puiser dans la mauvaise reserve.
  check("le genre fait partie de l'identite", itemKey({ kind: "egg", id: "Carrot" }) === itemKey({ kind: "seed", id: "Carrot" }), false);

  // Une case prise refuse tout, et une case qu'on ne possede pas n'existe pas.
  check("une case occupee tombe", viablePlan([at(0), at(1)], scopeOf({ occupied: new Set([1]) })).length, 1);
  check("une case hors parcelle tombe", viablePlan([at(0), at(9)], scopeOf()).length, 1);

  // La reserve est un plafond : le plan ne peut pas promettre plus qu'on n'a.
  const tooMany = [at(0), at(1), at(2), at(3)];
  const short = viablePlan(tooMany, scopeOf({ items: [{ kind: "seed", id: "Carrot", name: "Carrot", stock: 2 }] }));
  check("le plan est plafonne par la reserve", short.length, 2);
  // Premiere case dessinee, premiere servie : une regle qui changerait d'avis
  // ferait croire a un changement de perimetre a chaque relecture.
  check("le premier dessine est le premier servi", short.map((a) => a.tileIndex).join(","), "0,1");
  check("deux lectures donnent le meme plan", plantSignature(short), plantSignature(viablePlan(tooMany, scopeOf({ items: [{ kind: "seed", id: "Carrot", name: "Carrot", stock: 2 }] }))));

  // Une sorte absente de la reserve ne se pose pas.
  check("sans reserve, rien ne passe", viablePlan([at(0, "Aloe")], scopeOf()).length, 0);

  check("signature stable par ordre", plantSignature([at(0), at(1)]), plantSignature([at(1), at(0)]));
  check("changer d'espece change la signature", plantSignature([at(0)]) === plantSignature([at(0, "Aloe")]), false);
  check("changer de case change la signature", plantSignature([at(0)]) === plantSignature([at(1)]), false);

  const mixed = [at(0), at(1), at(2, "Aloe")];
  check("compte par sorte, le plus nombreux en tete", countByItem(mixed).map((e) => `${e.count} ${e.name}`).join(", "), "2 Carrot, 1 Aloe");
  check("ce qui reste en reserve", stockLeft([at(0), at(1)], scopeOf().items).get(itemKey({ kind: "seed", id: "Carrot" })), 8);

  check("demande cote joueur", describePlan(mixed), "Plant 2 Carrot and 1 Aloe for me");
  check("une seule sorte se suffit", summarizePlan([at(0), at(1)]), "2 Carrot to plant");
  check("plusieurs sortes donnent le total", summarizePlan(mixed), "2 Carrot and 1 Aloe to plant, over 3 tiles");
  check("aucun cadratin", describePlan(mixed).includes("—"), false);
}

console.log("\n--- icones de bulle ---");
{
  // Le jeu bascule sur son rendu balise des que `tags` existe, meme vide : une
  // phrase sans icone ne doit pas emporter de champ `tags` du tout.
  const plain = compose("nothing to show");
  check("sans icone, aucun champ tags", plain.tags, undefined);
  check("le texte passe tel quel", plain.message, "nothing to show");

  const icon = { gameThing: { name: "", sprite: "sprite/plant/Carrot" } };
  const one = compose("I found ", icon, " for you");
  check("la balise est auto-fermante et numerotee", one.message, "I found <0/> for you");
  check("et la voila dans les tags", one.tags?.[0], icon);

  const two = compose(icon, " and ", { mutation: "Frozen" });
  check("les numeros se suivent", two.message, "<0/> and <1/>");
  check("chacun a son entree", Object.keys(two.tags ?? {}).join(","), "0,1");

  // Un fabricant rend `null` quand le catalogue ne connait pas l'objet : une
  // cle d'atlas inventee dessinerait un carre vide, pire qu'une phrase nue.
  const missing = compose("plain ", null, "text");
  check("un fragment nul disparait sans trou", missing.message, "plain text");
  check("et ne cree pas de tags", missing.tags, undefined);
  check("la numerotation ignore les nuls", compose(null, icon).message, "<0/>");

  // Les phrases sont ecrites en supposant l'icone presente : quand elle manque,
  // il reste « 12  ready » ou « 12 . Pick ». On repare au composeur plutot qu'a
  // chaque appel, sinon le prochain point d'appel reintroduira le defaut.
  check("les espaces doublees se resorbent", compose("12 ", null, " ready").message, "12 ready");
  check("l'espace avant un point disparait", compose("12 ", null, ". Pick them?").message, "12. Pick them?");
  check("et avant une virgule aussi", compose("a ", null, ", b").message, "a, b");
  check("les bords sont rognes", compose(" ", "hello", " ").message, "hello");

  // Une liste ou chaque nom porte son sprite : c'est la difference entre « une
  // icone puis trois noms » et une liste qu'on lit.
  const listed = compose(icon, " Bee, ", icon, " Worm");
  check("chaque nom garde son icone", listed.message, "<0/> Bee, <1/> Worm");
  check("et chaque icone son entree", Object.keys(listed.tags ?? {}).join(","), "0,1");

  // Un objet de catalogue ne parle pas au jeu : ni `tileRef`, qui nomme un
  // sprite des atlas du mod, ni `sprite`, qui est une URL de l'API du mod. Le
  // fil sait les dessiner, `Sprite.from` non.
  const modOnly = { gameThing: { name: "", sprite: "sprite/plant/Carrot" }, modOnly: true } as const;
  const mixed = compose("2 ", modOnly, " and ", { mutation: "Frozen" }, ". Pick them?");
  check("le fil garde tout", Object.keys(mixed.tags ?? {}).join(","), "0,1");

  // Retirer le tag sans sa balise laissait « 2 . Pick them? » : le jeu saute
  // bien la balise orpheline, mais le texte se refermait mal.
  const spoken = forGame(mixed);
  check("la balise part avec son tag", spoken.message, "2 and <1/>. Pick them?");
  check("et le tag survivant garde son numero", Object.keys(spoken.tags ?? {}).join(","), "1");

  // Plus rien d'affichable : pas de champ `tags`, sinon le jeu basculerait sur
  // son rendu balise pour une phrase qui n'a plus de balise.
  const bare = forGame(compose("2 ", modOnly, " ready"));
  check("tout retirer nettoie la phrase", bare.message, "2 ready");
  check("et ne laisse aucun tag", bare.tags, undefined);
  check("une ligne sans tags passe telle quelle", forGame({ message: "plain" }).message, "plain");
  check("une phrase saine ne bouge pas", compose("12 ", icon, " with ", icon).message, "12 <0/> with <1/>");
}
{
  // La bulle d'une recolte montre UNE variante pour tout un lot : celle qu'on
  // verra le plus dans le panier. C'est `groupVariants` qui la designe, en tete
  // de son classement, mutations comprises.
  const rows = [
    row({ tileIndex: 1, species: "Carrot" }),
    row({ tileIndex: 2, species: "Aloe", mutations: ["Frozen"] }),
    row({ tileIndex: 3, species: "Aloe", mutations: ["Frozen"] }),
  ];
  const top = groupVariants(rows)[0];
  check("la variante dominante mene le classement", `${top.species}:${top.count}`, "Aloe:2");
  check("et elle porte ses mutations", top.mutations.join(","), "Frozen");
  check("un lot vide n'en a aucune", groupVariants([]).length, 0);
}

console.log("\n--- couvee : ce qu'on garde, ce qui part ---");
{
  const pet = (over: Partial<PetRow> = {}): PetRow => ({
    petId: "a",
    name: "Bee",
    species: "Bee",
    mutations: [],
    abilities: [],
    maxStrength: 50,
    favorited: false,
    onTeam: false,
    ...over,
  });
  const rules = (over: Partial<KeepRules> = {}): KeepRules => ({ ...DEFAULT_KEEP_RULES, ...over });

  check("sans critere, rien n'est garde par les regles", matchesKeep(pet(), DEFAULT_KEEP_RULES), false);
  check("espece", matchesKeep(pet(), rules({ species: ["Bee"] })), true);
  check("capacite", matchesKeep(pet({ abilities: ["SeedFinderI"] }), rules({ abilities: ["SeedFinderI"] })), true);
  // Les sources ecrivent les mutations tantot en majuscules tantot non.
  check("mutation, quelle que soit la casse", matchesKeep(pet({ mutations: ["gold"] }), rules({ mutations: ["Gold"] })), true);
  check("force suffisante", matchesKeep(pet({ maxStrength: 96 }), rules({ minMaxStr: 95 })), true);
  check("force insuffisante", matchesKeep(pet({ maxStrength: 94 }), rules({ minMaxStr: 95 })), false);
  // Une force inconnue ne doit pas passer pour une force suffisante.
  check("force inconnue ne garde pas", matchesKeep(pet({ maxStrength: null }), rules({ minMaxStr: 95 })), false);

  // Deux protections que rien ne discute : elles viennent du joueur, pas des regles.
  check("un favori est protege", isProtected(pet({ favorited: true }), DEFAULT_KEEP_RULES), true);
  check("un pet d'equipe est protege", isProtected(pet({ onTeam: true }), DEFAULT_KEEP_RULES), true);

  const bag = [
    pet({ petId: "keep-species", species: "Bee" }),
    pet({ petId: "keep-fav", species: "Worm", favorited: true }),
    pet({ petId: "keep-team", species: "Worm", onTeam: true }),
    pet({ petId: "sell-1", species: "Worm" }),
    pet({ petId: "sell-2", species: "Worm" }),
  ];
  const keepBees = rules({ species: ["Bee"] });

  // Sans critere, « ce qui ne correspond pas » designerait tout le sac : on
  // refuse plutot que de faire du vide par defaut.
  check("aucun critere : aucune vente", toSell(bag, DEFAULT_KEEP_RULES).length, 0);
  check("ne partent que les non proteges", toSell(bag, keepBees).map((p) => p.petId).sort().join(","), "sell-1,sell-2");
  // Refavoriser un favori n'apporte rien et allongerait la liste a relire ;
  // en revanche un pet d'equipe qui correspond merite de l'etre, sinon il
  // perdrait toute protection en quittant l'equipe.
  const worms = toFavourite(bag, rules({ species: ["Worm"] })).map((p) => p.petId);
  check("on ne refavorise pas un favori", worms.includes("keep-fav"), false);
  check("un pet d'equipe qui correspond est favorise", worms.sort().join(","), "keep-team,sell-1,sell-2");
  check("un favori d'espece gardee reste hors liste", toFavourite(bag, keepBees).map((p) => p.petId).join(","), "keep-species");

  // Une vente ne se rattrape pas : la moindre difference invalide la confirmation.
  check("signature stable par ordre", petSignature([bag[3], bag[4]]), petSignature([bag[4], bag[3]]));
  check("un pet de plus change la signature", petSignature([bag[3]]) === petSignature([bag[3], bag[4]]), false);
  check("signature de couvee triee", slotSignature([12, 3, 7]), "3|7|12");
  check("l'ordre des cases ne compte pas", slotSignature([3, 12, 7]), slotSignature([12, 7, 3]));

  check("une seule espece se suffit", summarizeSell([bag[3], bag[4]]), "2 Worm");
  check("plusieurs especes donnent le total", summarizeSell([bag[0], bag[3], bag[4]]), "3 pets: 2 Worm and 1 Bee");
  check("une couvee s'annonce", summarizeHatch([1, 2]), "2 eggs ready to hatch");
  check("un oeuf seul reste au singulier", summarizeHatch([1]), "1 egg ready to hatch");

  check("critere vide se dit", describeKeep(DEFAULT_KEEP_RULES), "Nothing set yet");
  check(
    "criteres cumules se lisent",
    describeKeep(rules({ species: ["Bee"], minMaxStr: 95 })),
    "Bee, max STR 95 and up"
  );
  check(
    "une capacite est nommee, pas identifiee",
    describeKeep(rules({ abilities: ["SeedFinderI"] }), new Map([["SeedFinderI", "Seed Finder I"]])),
    "Seed Finder I"
  );
  check("aucun cadratin", describeKeep(rules({ species: ["Bee"], minMaxStr: 95 })).includes("—"), false);

  // La celebration suit les criteres, pas l'eclosion : applaudir un animal
  // qu'on proposera de vendre juste apres n'aurait aucun sens.
  const keepBee = rules({ species: ["Bee"] });
  check("ce qui ne correspond pas ne se fete pas", hatchCheer([pet({ species: "Worm" })], keepBee), null);
  check("sans critere, rien ne se fete", hatchCheer([pet({ species: "Bee" })], DEFAULT_KEEP_RULES), null);
  check("une portee vide non plus", hatchCheer([], keepBee), null);

  const plain = hatchCheer([pet({ species: "Bee" })], keepBee);
  check("ce qu'on garde vaut des applaudissements", plain?.emote, EmoteType.Clapping);
  check("mais aucune vedette", plain?.star, null);
  check("et rien a nommer", plain?.mutation, null);

  const rainbow = hatchCheer([pet({ petId: "r", species: "Bee", mutations: ["Rainbow"] })], keepBee);
  check("un gros tirage vaut mieux que ca", rainbow?.emote, EmoteType.Love);
  check("il passe en vedette", rainbow?.star?.petId, "r");
  check("et la phrase le nomme", rainbow?.mutation, "Rainbow");

  // Les sources ecrivent les mutations tantot en majuscules tantot non, mais le
  // nom rendu est celui de notre liste : c'est lui qui part dans la phrase.
  const gold = hatchCheer([pet({ species: "Bee", mutations: ["gold"] })], keepBee);
  check("quelle que soit la casse", gold?.emote, EmoteType.Love);
  check("le nom rendu est canonique", gold?.mutation, "Gold");

  // Un Gold qui ne correspond a rien reste un Gold qu'on vendra : la regle du
  // joueur passe avant la rarete.
  check(
    "un gros tirage hors criteres reste muet",
    hatchCheer([pet({ species: "Worm", mutations: ["Gold"] })], keepBee),
    null
  );
  // Plusieurs peuvent sortir entre deux lectures du sac, et le beau n'est pas
  // toujours le premier.
  const litter = hatchCheer(
    [pet({ petId: "a", species: "Bee" }), pet({ petId: "b", species: "Bee", mutations: ["Gold"] })],
    keepBee
  );
  check("le meilleur de la portee passe devant", litter?.star?.petId, "b");
  // Une portee qui sort les deux fete la plus rare, pas la premiere trouvee.
  const both = hatchCheer(
    [pet({ petId: "g", species: "Bee", mutations: ["Gold"] }), pet({ petId: "r", species: "Bee", mutations: ["Rainbow"] })],
    keepBee
  );
  check("le rainbow passe avant l'or", both?.mutation, "Rainbow");
  check("et c'est lui la vedette", both?.star?.petId, "r");
}

console.log("\n--- propositions ---");
{
  const proposal: Proposal = {
    id: "p1",
    commandId: "harvest",
    summary: "12 Carrot ready",
    size: 12,
    signature: "a|b",
    createdAtMs: 1000,
  };

  check("fraiche, elle tient", isExpired(proposal, 1000 + PROPOSAL_TTL_MS - 1), false);
  // Au-dela, une confirmation n'est plus une decision mais un declencheur.
  check("passe le delai, elle est perimee", isExpired(proposal, 1000 + PROPOSAL_TTL_MS), true);

  check("perimetre inchange : on execute", verdict(proposal, "a|b", 1001).ok, true);
  check("aucune proposition : on refuse", verdict(null, "a|b", 1001).ok, false);

  // Le perimetre a bouge entre la question et la reponse : on redemande plutot
  // que de recolter 40 crops sur une confirmation qui en annoncait 12.
  const moved = verdict(proposal, "a|b|c", 1001);
  check("perimetre modifie : on refuse", moved.ok, false);
  check("et on dit pourquoi", moved.ok === false && moved.reason, "changed");

  const stale = verdict(proposal, "a|b", 1000 + PROPOSAL_TTL_MS);
  check("perimee : on refuse", stale.ok, false);
  check("et on dit pourquoi", stale.ok === false && stale.reason, "expired");

  const empty = verdict({ ...proposal, size: 0 }, "", 1001);
  check("lot vide : on refuse", empty.ok === false && empty.reason, "empty");
}

console.log("\n--- journal ---");
{
  const at = (n: number) => 1000 + n;
  let log = emptyLog();
  check("un journal neuf est vide", log.messages.length, 0);

  log = append(log, { from: "you", kind: "command", text: "Harvest everything", atMs: at(0) });
  log = append(log, { from: "companion", kind: "reply", text: "12 ready?", atMs: at(1), proposalId: "p1" });
  check("les messages s'empilent", log.messages.length, 2);
  check("les identifiants sont ordonnes", log.messages.map((m) => m.id).join(","), "m1,m2");
  check("la proposition est attachee", log.messages[1].proposalId, "p1");

  // Une proposition traitee ne doit plus proposer quoi que ce soit.
  const cleared = clearProposal(log, "p1");
  check("la proposition traitee disparait", cleared.messages[1].proposalId, undefined);
  check("un identifiant inconnu ne touche a rien", clearProposal(log, "p9"), log);

  // Le journal ne mute jamais son entree : l'UI compare les references.
  check("l'entree n'est pas mutee", log.messages[1].proposalId, "p1");

  // Les sources d'alertes reemettent le meme etat a chaque rafraichissement.
  let alerts = emptyLog();
  alerts = appendAlertOnce(alerts, { from: "companion", kind: "alert", text: "3 pets hungry", atMs: at(0) }, 1000);
  alerts = appendAlertOnce(alerts, { from: "companion", kind: "alert", text: "3 pets hungry", atMs: at(500) }, 1000);
  check("une alerte repetee ne double pas le fil", alerts.messages.length, 1);
  alerts = appendAlertOnce(alerts, { from: "companion", kind: "alert", text: "3 pets hungry", atMs: at(2000) }, 1000);
  check("passe la fenetre, elle repasse", alerts.messages.length, 2);

  let long = emptyLog();
  for (let i = 0; i < MAX_MESSAGES + 10; i++) {
    long = append(long, { from: "companion", kind: "system", text: `m${i}`, atMs: at(i) });
  }
  check("le journal est borne", long.messages.length, MAX_MESSAGES);
  check("ce sont les plus anciens qui partent", long.messages[0].text, "m10");
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
