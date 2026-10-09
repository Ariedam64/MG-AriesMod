import { check, checkEqual, done } from "./_check";
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
} from "../src/features/companion/chat/harvest";
import { compose, forGame } from "../src/features/companion/chat/bubbleTags";
import {
  describeFeed,
  disambiguate,
  feedSignature,
  isSettled,
  type FeedCandidate,
} from "../src/features/companion/chat/feed";
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
} from "../src/features/companion/chat/plant";
import {
  DEFAULT_KEEP_RULES,
  afterHatchNote,
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
} from "../src/features/companion/chat/hatch";
import { EmoteType } from "../src/features/companion/emoteTypes";
import {
  MAX_MESSAGES,
  append,
  clearProposal,
  emptyLog,
} from "../src/features/companion/chat/log";
import {
  PROPOSAL_TTL_MS,
  isExpired,
  teamPromise,
  verdict,
  withTeam,
  type Proposal,
} from "../src/features/companion/chat/proposals";

const EM_DASH = "\u2014";

const row = (over: Partial<HarvestRow> = {}): HarvestRow => ({
  tileIndex: 1,
  slotId: 0,
  species: "Carrot",
  sizePct: 80,
  growthPct: 100,
  mutations: [],
  ready: true,
  preserved: false,
  ...over,
});

console.log("\n--- variants ---");
{
  // The variants are the ones that exist, not every possible combination.
  const rows = [
    row({ tileIndex: 1, slotId: 0, species: "Aloe", mutations: ["Frozen"] }),
    row({ tileIndex: 1, slotId: 1, species: "Aloe", mutations: ["Frozen"] }),
    row({ tileIndex: 2, slotId: 0, species: "Aloe", mutations: ["Frozen", "Amberlit"] }),
    row({ tileIndex: 3, slotId: 0, species: "Aloe" }),
    row({ tileIndex: 4, slotId: 0, species: "Carrot" }),
  ];
  const variants = groupVariants(rows);
  checkEqual("one variant per look", variants.length, 4);
  checkEqual("the most numerous comes first", `${variants[0].species}:${variants[0].count}`, "Aloe:2");
  checkEqual(
    "a variant's mutations are sorted",
    variants.find((v) => v.mutations.length === 2)?.mutations.join(","),
    "Amberlit,Frozen"
  );

  // Two crops carrying the same mutations in a different order look the same:
  // without sorting, they would count as two thumbnails.
  const mixed = groupVariants([
    row({ tileIndex: 1, slotId: 0, mutations: ["Gold", "Wet"] }),
    row({ tileIndex: 2, slotId: 0, mutations: ["Wet", "Gold"] }),
  ]);
  checkEqual("mutation order does not create a duplicate", mixed.length, 1);
  checkEqual("and the count adds up", mixed[0].count, 2);

  // An unripe crop has no place in a harvest preview. Ripeness is decided when
  // the garden is read, not here: an unripe row should never reach grouping.
  checkEqual("a single row, a single variant", groupVariants([row()]).length, 1);
}

console.log("\n--- harvest filters ---");
{
  const rows = [
    row({ tileIndex: 1, slotId: 0, species: "Carrot", sizePct: 60 }),
    row({ tileIndex: 2, slotId: 0, species: "Carrot", sizePct: 95, mutations: ["Gold"] }),
    row({ tileIndex: 3, slotId: 0, species: "Aloe", sizePct: 80, mutations: ["Frozen"] }),
    row({ tileIndex: 4, slotId: 0, species: "Aloe", sizePct: 90, ready: false }),
  ];
  // A plant that is still growing is not harvested: no setting brings it into
  // the selection.
  checkEqual("an unripe crop never passes", filterRows(rows, DEFAULT_FILTERS).length, 3);
  checkEqual("species present, sorted", speciesPresent(rows).join(","), "Aloe,Carrot");
  checkEqual("species filter", filterRows(rows, { ...DEFAULT_FILTERS, species: ["Carrot"] }).length, 2);
  checkEqual("several species are an OR", filterRows(rows, { ...DEFAULT_FILTERS, species: ["Carrot", "Aloe"] }).length, 3);
  checkEqual("minimum size", filterRows(rows, { ...DEFAULT_FILTERS, minSizePct: 85 }).length, 1);
  checkEqual("mutation present", filterRows(rows, { ...DEFAULT_FILTERS, mutations: ["Gold"] }).length, 1);
  checkEqual("mutation absent", filterRows(rows, { ...DEFAULT_FILTERS, mutations: ["Gold"], mutationMode: "none" }).length, 2);
  checkEqual("all mutations required", filterRows(rows, { ...DEFAULT_FILTERS, mutations: ["Gold", "Frozen"], mutationMode: "all" }).length, 0);
  checkEqual("mutations present, sorted", mutationsPresent(rows).join(","), "Frozen,Gold");

  // Preserving is paid per crop, so the default is closed, unlike every other
  // criterion. Leaving one behind only costs a second pass; harvesting one by
  // mistake costs what was just paid.
  const withPreserved = [...rows, row({ tileIndex: 9, slotId: 0, species: "Carrot", preserved: true })];
  checkEqual("a preserved crop is left out by default", filterRows(withPreserved, DEFAULT_FILTERS).length, 3);
  checkEqual(
    "and taken back when allowed",
    filterRows(withPreserved, { ...DEFAULT_FILTERS, includePreserved: true }).length,
    4
  );
  // The option opens the gate, it does not bypass it: the other criteria still hold.
  checkEqual(
    "but it is still subject to the other criteria",
    filterRows(withPreserved, { ...DEFAULT_FILTERS, includePreserved: true, species: ["Aloe"] }).length,
    1
  );
  // A preserved crop that is still growing is no more harvestable than any other.
  const growing = [row({ tileIndex: 8, slotId: 0, ready: false, preserved: true })];
  checkEqual(
    "ripeness comes before the option",
    filterRows(growing, { ...DEFAULT_FILTERS, includePreserved: true }).length,
    0
  );
}
{
  // The player's bubble describes the request, not the result.
  checkEqual("default request", describeFilters(DEFAULT_FILTERS), "Harvest everything that's ready");
  checkEqual("named species", describeFilters({ ...DEFAULT_FILTERS, species: ["Carrot"] }), "Harvest my Carrot, please");
  checkEqual(
    "size and mutation",
    describeFilters({ ...DEFAULT_FILTERS, minSizePct: 90, mutations: ["Gold"] }),
    "Harvest everything, with Gold, at least 90% size"
  );
  // Only the departure from the default is said: repeating the ordinary rule
  // on every request would weigh the sentence down and tell nothing.
  checkEqual(
    "the default says nothing about preserved crops",
    describeFilters(DEFAULT_FILTERS).includes("preserved"),
    false
  );
  checkEqual(
    "including them is said",
    describeFilters({ ...DEFAULT_FILTERS, includePreserved: true }),
    "Harvest everything, preserved ones included"
  );
  checkEqual("no em dash", describeFilters({ ...DEFAULT_FILTERS, species: ["Carrot"] }).includes(EM_DASH), false);
}

console.log("\n--- identity and signature of a harvest batch ---");
{
  const a = row({ tileIndex: 3, slotId: 2 });
  const b = row({ tileIndex: 3, slotId: 5 });
  // Two sub-slots of the same tile are two separate crops.
  checkEqual("the key carries the tile and the slot", rowKey(a), "3:2");
  checkEqual("two sub-slots are not mixed up", rowKey(a) === rowKey(b), false);

  // The signature must not depend on display order, or a mere reordering
  // would look like a change of scope.
  checkEqual("signature is stable across order", selectionSignature([a, b]), selectionSignature([b, a]));
  checkEqual("one more crop changes the signature", selectionSignature([a]) === selectionSignature([a, b]), false);
}
{
  checkEqual("nothing to announce", describeSelection([]), "nothing");
  checkEqual("a single species is enough", describeSelection([row(), row({ tileIndex: 2 })]), "2 Carrot ready");
  checkEqual(
    "several species give the total",
    describeSelection([row(), row({ tileIndex: 2 }), row({ tileIndex: 3, species: "Aloe" })]),
    "3 crops ready: 2 Carrot and 1 Aloe"
  );
}

console.log("\n--- feeding scope ---");
{
  const pet = (over: Partial<FeedCandidate> = {}): FeedCandidate => ({
    petId: "p1",
    petName: "Turtle",
    petSpecies: "Turtle",
    hungerPct: 8,
    source: { kind: "inventory", itemId: "i1", species: "Carrot" },
    ...over,
  });

  // The signature carries the pets, not the crops: the inventory comes in a
  // varying order, and including the crop made the proposal unstable.
  const withCarrot = pet();
  const withApple = pet({ source: { kind: "inventory", itemId: "i2", species: "Apple" } });
  checkEqual("the chosen crop does not change the signature", feedSignature([withCarrot]), feedSignature([withApple]));
  checkEqual(
    "signature is stable across order",
    feedSignature([pet(), pet({ petId: "p2" })]),
    feedSignature([pet({ petId: "p2" }), pet()])
  );

  // Two turtles with no given name are called the same: "Turtle, Turtle"
  // points at nothing.
  const twins = disambiguate([pet({ petId: "b" }), pet({ petId: "a" })]);
  const names = twins.map((candidate) => candidate.petName).sort();
  checkEqual("namesakes are numbered", names.join(","), "Turtle #1,Turtle #2");
  checkEqual("the number follows the id", twins.find((c) => c.petId === "a")?.petName, "Turtle #1");
  checkEqual("a unique name is left alone", disambiguate([pet()])[0].petName, "Turtle");

  // As long as one pet is still concerned, the question still makes sense.
  const picks = [pet({ petId: "p1" }), pet({ petId: "p2" })];
  checkEqual("one pet left: the question stays", isSettled(picks, new Set(["p2"])), false);
  checkEqual("no pet concerned any more: it withdraws", isSettled(picks, new Set(["p9"])), true);

  checkEqual("a named pet is announced with its level", describeFeed([pet()]), "Turtle is down to 8% and I have Carrot");
  checkEqual(
    "a crop still to harvest is announced as such",
    describeFeed([pet({ source: { kind: "garden", row: row(), species: "Carrot" } })]),
    "Turtle is down to 8% and I have Carrot, which I would pick first"
  );
  checkEqual(
    "several pets are listed",
    describeFeed([pet(), pet({ petId: "p2", petName: "Bunny" })]),
    "2 pets are hungry: Turtle, Bunny"
  );
}

console.log("\n--- planting plan ---");
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

  // An egg and a seed can carry the same id: mixing them up would draw from
  // the wrong stock.
  checkEqual("the kind is part of the identity", itemKey({ kind: "egg", id: "Carrot" }) === itemKey({ kind: "seed", id: "Carrot" }), false);

  // A taken tile refuses everything, and a tile we do not own does not exist.
  checkEqual("an occupied tile drops out", viablePlan([at(0), at(1)], scopeOf({ occupied: new Set([1]) })).length, 1);
  checkEqual("a tile outside the plot drops out", viablePlan([at(0), at(9)], scopeOf()).length, 1);

  // The stock is a ceiling: the plan cannot promise more than there is.
  const tooMany = [at(0), at(1), at(2), at(3)];
  const short = viablePlan(tooMany, scopeOf({ items: [{ kind: "seed", id: "Carrot", name: "Carrot", stock: 2 }] }));
  checkEqual("the plan is capped by the stock", short.length, 2);
  // First tile drawn, first served: a rule that changed its mind would look
  // like a change of scope on every reread.
  checkEqual("the first drawn is the first served", short.map((a) => a.tileIndex).join(","), "0,1");
  checkEqual("two reads give the same plan", plantSignature(short), plantSignature(viablePlan(tooMany, scopeOf({ items: [{ kind: "seed", id: "Carrot", name: "Carrot", stock: 2 }] }))));

  // A kind missing from the stock is not placed.
  checkEqual("with no stock, nothing passes", viablePlan([at(0, "Aloe")], scopeOf()).length, 0);

  checkEqual("signature is stable across order", plantSignature([at(0), at(1)]), plantSignature([at(1), at(0)]));
  checkEqual("changing the species changes the signature", plantSignature([at(0)]) === plantSignature([at(0, "Aloe")]), false);
  checkEqual("changing the tile changes the signature", plantSignature([at(0)]) === plantSignature([at(1)]), false);

  const mixed = [at(0), at(1), at(2, "Aloe")];
  checkEqual("count per kind, the most numerous first", countByItem(mixed).map((e) => `${e.count} ${e.name}`).join(", "), "2 Carrot, 1 Aloe");
  checkEqual("what is left in stock", stockLeft([at(0), at(1)], scopeOf().items).get(itemKey({ kind: "seed", id: "Carrot" })), 8);

  checkEqual("the player's request", describePlan(mixed), "Plant 2 Carrot and 1 Aloe for me");
  checkEqual("a single kind is enough", summarizePlan([at(0), at(1)]), "2 Carrot to plant");
  checkEqual("several kinds give the total", summarizePlan(mixed), "2 Carrot and 1 Aloe to plant, over 3 tiles");
  checkEqual("no em dash", describePlan(mixed).includes(EM_DASH), false);
}

console.log("\n--- bubble icons ---");
{
  // The game switches to its tagged rendering as soon as `tags` exists, even
  // empty: a sentence with no icon must not carry a `tags` field at all.
  const plain = compose("nothing to show");
  checkEqual("no icon, no tags field", plain.tags, undefined);
  checkEqual("the text passes through as is", plain.message, "nothing to show");

  const icon = { gameThing: { name: "", sprite: "sprite/plant/Carrot" } };
  const one = compose("I found ", icon, " for you");
  checkEqual("the tag is self-closing and numbered", one.message, "I found <0/> for you");
  checkEqual("and there it is in the tags", one.tags?.[0], icon);

  const two = compose(icon, " and ", { mutation: "Frozen" });
  checkEqual("the numbers follow on", two.message, "<0/> and <1/>");
  checkEqual("each has its own entry", Object.keys(two.tags ?? {}).join(","), "0,1");

  // A maker returns `null` when the catalog does not know the object: a made-up
  // atlas key would draw an empty square, worse than a bare sentence.
  const missing = compose("plain ", null, "text");
  checkEqual("a null fragment disappears without a gap", missing.message, "plain text");
  checkEqual("and creates no tags", missing.tags, undefined);
  checkEqual("numbering skips the nulls", compose(null, icon).message, "<0/>");

  // Sentences are written assuming the icon is there: when it is missing,
  // "12  ready" or "12 . Pick" is left over. The composer repairs it rather
  // than each call site, or the next call site would bring the flaw back.
  checkEqual("doubled spaces collapse", compose("12 ", null, " ready").message, "12 ready");
  checkEqual("the space before a full stop goes", compose("12 ", null, ". Pick them?").message, "12. Pick them?");
  checkEqual("and before a comma too", compose("a ", null, ", b").message, "a, b");
  checkEqual("the edges are trimmed", compose(" ", "hello", " ").message, "hello");

  // A list where each name carries its sprite: that is the difference between
  // "one icon then three names" and a list you can read.
  const listed = compose(icon, " Bee, ", icon, " Worm");
  checkEqual("each name keeps its icon", listed.message, "<0/> Bee, <1/> Worm");
  checkEqual("and each icon its entry", Object.keys(listed.tags ?? {}).join(","), "0,1");

  // A catalog object means nothing to the game: neither `tileRef`, which names
  // a sprite in the mod's atlases, nor `sprite`, which is a URL of the mod's
  // API. The chat thread can draw them, `Sprite.from` cannot.
  const modOnly = { gameThing: { name: "", sprite: "sprite/plant/Carrot" }, modOnly: true } as const;
  const mixed = compose("2 ", modOnly, " and ", { mutation: "Frozen" }, ". Pick them?");
  checkEqual("the chat thread keeps everything", Object.keys(mixed.tags ?? {}).join(","), "0,1");

  // Removing the tag without its marker left "2 . Pick them?": the game does
  // skip the orphan marker, but the text closed up badly.
  const spoken = forGame(mixed);
  checkEqual("the marker goes with its tag", spoken.message, "2 and <1/>. Pick them?");
  checkEqual("and the surviving tag keeps its number", Object.keys(spoken.tags ?? {}).join(","), "1");

  // Nothing left to display: no `tags` field, or the game would switch to its
  // tagged rendering for a sentence that no longer has a marker.
  const bare = forGame(compose("2 ", modOnly, " ready"));
  checkEqual("removing everything cleans the sentence", bare.message, "2 ready");
  checkEqual("and leaves no tag", bare.tags, undefined);
  checkEqual("a line with no tags passes through as is", forGame({ message: "plain" }).message, "plain");
  checkEqual("a sound sentence does not change", compose("12 ", icon, " with ", icon).message, "12 <0/> with <1/>");
}
{
  // A harvest bubble shows ONE variant for a whole batch: the one you will see
  // most in the basket. `groupVariants` picks it, at the top of its ranking,
  // mutations included.
  const rows = [
    row({ tileIndex: 1, species: "Carrot" }),
    row({ tileIndex: 2, species: "Aloe", mutations: ["Frozen"] }),
    row({ tileIndex: 3, species: "Aloe", mutations: ["Frozen"] }),
  ];
  const top = groupVariants(rows)[0];
  checkEqual("the dominant variant leads the ranking", `${top.species}:${top.count}`, "Aloe:2");
  checkEqual("and it carries its mutations", top.mutations.join(","), "Frozen");
  checkEqual("an empty batch has none", groupVariants([]).length, 0);
}

console.log("\n--- hatching: what stays, what goes ---");
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

  checkEqual("with no criterion, the rules keep nothing", matchesKeep(pet(), DEFAULT_KEEP_RULES), false);
  checkEqual("species", matchesKeep(pet(), rules({ species: ["Bee"] })), true);
  checkEqual("ability", matchesKeep(pet({ abilities: ["SeedFinderI"] }), rules({ abilities: ["SeedFinderI"] })), true);
  // The sources write mutations sometimes capitalised, sometimes not.
  checkEqual("mutation, whatever the case", matchesKeep(pet({ mutations: ["gold"] }), rules({ mutations: ["Gold"] })), true);
  checkEqual("enough strength", matchesKeep(pet({ maxStrength: 96 }), rules({ minMaxStr: 95 })), true);
  checkEqual("not enough strength", matchesKeep(pet({ maxStrength: 94 }), rules({ minMaxStr: 95 })), false);
  // An unknown strength must not pass for enough strength.
  checkEqual("an unknown strength does not keep", matchesKeep(pet({ maxStrength: null }), rules({ minMaxStr: 95 })), false);

  // Two protections nothing overrides: they come from the player, not the rules.
  checkEqual("a favourite is protected", isProtected(pet({ favorited: true }), DEFAULT_KEEP_RULES), true);
  checkEqual("a team pet is protected", isProtected(pet({ onTeam: true }), DEFAULT_KEEP_RULES), true);

  const bag = [
    pet({ petId: "keep-species", species: "Bee" }),
    pet({ petId: "keep-fav", species: "Worm", favorited: true }),
    pet({ petId: "keep-team", species: "Worm", onTeam: true }),
    pet({ petId: "sell-1", species: "Worm" }),
    pet({ petId: "sell-2", species: "Worm" }),
  ];
  const keepBees = rules({ species: ["Bee"] });

  // With no criterion, "whatever does not match" would mean the whole bag: we
  // refuse rather than clear everything out by default.
  checkEqual("no criterion: no sale", toSell(bag, DEFAULT_KEEP_RULES).length, 0);
  checkEqual("only unprotected pets go", toSell(bag, keepBees).map((p) => p.petId).sort().join(","), "sell-1,sell-2");
  // Favouriting a favourite again brings nothing and lengthens the list to
  // review; a matching team pet does deserve it, or it would lose all
  // protection on leaving the team.
  const worms = toFavourite(bag, rules({ species: ["Worm"] })).map((p) => p.petId);
  checkEqual("a favourite is not favourited again", worms.includes("keep-fav"), false);
  checkEqual("a matching team pet is favourited", worms.sort().join(","), "keep-team,sell-1,sell-2");
  checkEqual("a favourite of a kept species stays off the list", toFavourite(bag, keepBees).map((p) => p.petId).join(","), "keep-species");

  // A sale cannot be undone: the slightest difference voids the confirmation.
  checkEqual("signature is stable across order", petSignature([bag[3], bag[4]]), petSignature([bag[4], bag[3]]));
  checkEqual("one more pet changes the signature", petSignature([bag[3]]) === petSignature([bag[3], bag[4]]), false);
  checkEqual("hatch signature is sorted", slotSignature([12, 3, 7]), "3|7|12");
  checkEqual("slot order does not matter", slotSignature([3, 12, 7]), slotSignature([12, 7, 3]));

  checkEqual("a single species is enough", summarizeSell([bag[3], bag[4]]), "2 Worm");
  checkEqual("several species give the total", summarizeSell([bag[0], bag[3], bag[4]]), "3 pets: 2 Worm and 1 Bee");
  checkEqual("a hatch is announced", summarizeHatch([1, 2]), "2 eggs ready to hatch");
  checkEqual("a single egg stays singular", summarizeHatch([1]), "1 egg ready to hatch");

  checkEqual("an empty criterion is said", describeKeep(DEFAULT_KEEP_RULES), "Nothing set yet");
  checkEqual(
    "combined criteria read well",
    describeKeep(rules({ species: ["Bee"], minMaxStr: 95 })),
    "Bee, max STR 95 and up"
  );
  checkEqual(
    "an ability is named, not given by id",
    describeKeep(rules({ abilities: ["SeedFinderI"] }), new Map([["SeedFinderI", "Seed Finder I"]])),
    "Seed Finder I"
  );
  checkEqual("no em dash", describeKeep(rules({ species: ["Bee"], minMaxStr: 95 })).includes(EM_DASH), false);

  // The celebration follows the criteria, not the hatching: applauding a pet
  // we will offer to sell right after would make no sense.
  const keepBee = rules({ species: ["Bee"] });
  checkEqual("what does not match is not celebrated", hatchCheer([pet({ species: "Worm" })], keepBee), null);
  checkEqual("with no criterion, nothing is celebrated", hatchCheer([pet({ species: "Bee" })], DEFAULT_KEEP_RULES), null);
  checkEqual("nor is an empty litter", hatchCheer([], keepBee), null);

  const plain = hatchCheer([pet({ species: "Bee" })], keepBee);
  checkEqual("a keeper is worth applause", plain?.emote, EmoteType.Clapping);
  checkEqual("but no star", plain?.star, null);
  checkEqual("and nothing to name", plain?.mutation, null);

  const rainbow = hatchCheer([pet({ petId: "r", species: "Bee", mutations: ["Rainbow"] })], keepBee);
  checkEqual("a big pull is worth more than that", rainbow?.emote, EmoteType.Love);
  checkEqual("it becomes the star", rainbow?.star?.petId, "r");
  checkEqual("and the sentence names it", rainbow?.mutation, "Rainbow");

  // The sources write mutations sometimes capitalised, sometimes not, but the
  // name returned is the one from our list: that is the one in the sentence.
  const gold = hatchCheer([pet({ species: "Bee", mutations: ["gold"] })], keepBee);
  checkEqual("whatever the case", gold?.emote, EmoteType.Love);
  checkEqual("the returned name is canonical", gold?.mutation, "Gold");

  // A Gold that matches nothing is still a Gold we will sell: the player's rule
  // comes before rarity.
  checkEqual(
    "a big pull outside the criteria stays quiet",
    hatchCheer([pet({ species: "Worm", mutations: ["Gold"] })], keepBee),
    null
  );
  // Several can hatch between two reads of the bag, and the good one is not
  // always the first.
  const litter = hatchCheer(
    [pet({ petId: "a", species: "Bee" }), pet({ petId: "b", species: "Bee", mutations: ["Gold"] })],
    keepBee
  );
  checkEqual("the best of the litter goes first", litter?.star?.petId, "b");
  // A litter with both celebrates the rarer one, not the first found.
  const both = hatchCheer(
    [pet({ petId: "g", species: "Bee", mutations: ["Gold"] }), pet({ petId: "r", species: "Bee", mutations: ["Rainbow"] })],
    keepBee
  );
  checkEqual("rainbow comes before gold", both?.mutation, "Rainbow");
  checkEqual("and it is the star", both?.star?.petId, "r");
}

console.log("\n--- proposals ---");
{
  const proposal: Proposal = {
    id: "p1",
    commandId: "harvest",
    summary: "12 Carrot ready",
    size: 12,
    signature: "a|b",
    createdAtMs: 1000,
  };

  checkEqual("fresh, it holds", isExpired(proposal, 1000 + PROPOSAL_TTL_MS - 1), false);
  // Past that, a confirmation is no longer a decision but a trigger.
  checkEqual("past the delay, it has expired", isExpired(proposal, 1000 + PROPOSAL_TTL_MS), true);

  checkEqual("scope unchanged: it runs", verdict(proposal, "a|b", 1001).ok, true);
  checkEqual("no proposal: refused", verdict(null, "a|b", 1001).ok, false);

  // The scope moved between the question and the answer: ask again rather
  // than harvest 40 crops on a confirmation that announced 12.
  const moved = verdict(proposal, "a|b|c", 1001);
  checkEqual("scope changed: refused", moved.ok, false);
  checkEqual("and the reason is given", moved.ok === false && moved.reason, "changed");

  const stale = verdict(proposal, "a|b", 1000 + PROPOSAL_TTL_MS);
  checkEqual("expired: refused", stale.ok, false);
  checkEqual("and the reason is given", stale.ok === false && stale.reason, "expired");

  const empty = verdict({ ...proposal, size: 0 }, "", 1001);
  checkEqual("empty batch: refused", empty.ok === false && empty.reason, "empty");
}

console.log("\n--- log ---");
{
  const at = (n: number) => 1000 + n;
  let log = emptyLog();
  checkEqual("a new log is empty", log.messages.length, 0);

  log = append(log, { from: "you", kind: "command", text: "Harvest everything", atMs: at(0) });
  log = append(log, { from: "companion", kind: "reply", text: "12 ready?", atMs: at(1), proposalId: "p1" });
  checkEqual("messages pile up", log.messages.length, 2);
  checkEqual("ids are in order", log.messages.map((m) => m.id).join(","), "m1,m2");
  checkEqual("the proposal is attached", log.messages[1].proposalId, "p1");

  // A handled proposal must not propose anything any more.
  const cleared = clearProposal(log, "p1");
  checkEqual("the handled proposal disappears", cleared.messages[1].proposalId, undefined);
  check("an unknown id returns the same log", clearProposal(log, "p9") === log);

  // The log never mutates its input: the UI compares references.
  checkEqual("the input is not mutated", log.messages[1].proposalId, "p1");

  let long = emptyLog();
  for (let i = 0; i < MAX_MESSAGES + 10; i++) {
    long = append(long, { from: "companion", kind: "system", text: `m${i}`, atMs: at(i) });
  }
  checkEqual("the log is bounded", long.messages.length, MAX_MESSAGES);
  checkEqual("the oldest ones are the ones that go", long.messages[0].text, "m10");
}

console.log("\n--- working team ---");
{
  checkEqual("the team is part of the signature", withTeam("a|b", "t1"), "a|b#team:t1");
  checkEqual("with no team, the signature says so too", withTeam("a|b", null), "a|b#team:");
  checkEqual("a team changes the signature", withTeam("a|b", "t1") === withTeam("a|b", "t2"), false);
  checkEqual("the question names the team worn", teamPromise("Harvesters"), " I would wear Harvesters, then give yours back.");
  checkEqual("and says nothing without a team", teamPromise(null), "");
}

console.log("\n--- after hatching ---");
{
  const rules = { ...DEFAULT_KEEP_RULES, species: ["Bee"] };
  checkEqual("hatching done, nothing to sell: it stays quiet", afterHatchNote("done", 0, rules, 0), null);
  checkEqual("hatching done, sales possible", afterHatchNote("done", 0, rules, 2), "All open. Now the ones you did not want.");
  checkEqual(
    "bag full with no criterion: it says so",
    afterHatchNote("full", 3, DEFAULT_KEEP_RULES, 0),
    "Your bag is full. 3 eggs still waiting. Nothing set to keep, so I am not selling."
  );
  checkEqual(
    "bag full with a criterion, nothing to sell",
    afterHatchNote("full", 1, rules, 0),
    "Your bag is full, nothing in it is up for sale. 1 egg still waiting."
  );
}

done();
