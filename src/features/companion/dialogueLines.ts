// src/services/companion/dialogueLines.ts
// Ce que le companion dit, et ce qu'il compte pour le dire.
//
// Module PUR, comme `dialogue.ts` : il n'importe que d'autres modules purs, et
// le hasard est injecté. La lecture de
// l'état du jeu reste dans `dialogueContext.ts` ; ici on ne fait que transformer
// ce qu'elle a lu en une phrase, ce qui se vérifie hors navigateur
// (scripts/checkCompanionDialogue.ts).

import { spaceWords } from "../../lib/format";
import { EmoteType } from "./emoteTypes";
import { TIME_LINE_EMOTES } from "./reactions";

/**
 * Les quatre répliques livrées avant la 3.2.219.
 *
 * Aucune UI ne permet de les modifier, mais elles ont été écrites sur disque
 * avec le reste des réglages : un joueur qui les porte encore n'a donc jamais
 * rien choisi, et doit recevoir la liste actuelle. Voir `coerceSettings`.
 */
export const LEGACY_DEFAULT_LINES: readonly string[] = [
  "Right behind you, boss.",
  "Nice patch you've got here.",
  "Want me to keep an eye on anything?",
  "I like it here.",
];

export const DEFAULT_CUSTOM_LINES: string[] = [
  ...LEGACY_DEFAULT_LINES,
  "Lovely day for some gardening.",
  "I could watch things grow all day. Actually, I do.",
  "Do the plants talk to you too, or is that just me?",
  "Careful where you step, something's sprouting.",
  "I counted the leaves. Lost track at forty.",
  "One day I'll have a garden of my own.",
  "Smells like fresh soil. My favourite.",
  "You've got a green thumb, you know that?",
  "I'm not lazy, I'm supervising.",
  "Did that sprout just move?",
  "If you need a hand, I've got two.",
  "Water, sun, patience. That's the whole secret.",
  "I named one of the crops. Don't ask which.",
  "Some of these are looking really good.",
  "I'd buy that seed again, honestly.",
  "Whatever you're doing, keep doing it.",
  "Is it snack time yet?",
  "I heard a rumour about a very rare crop.",
  "The pets seem happy today.",
  "Big plans for this garden?",
  "Don't mind me, just enjoying the view.",
  "I've been practising my whistling. Want to hear?",
  "You can always count on me.",
  "Every sprout is a tiny miracle.",
  "Let me know when it's harvest time.",
  "What's the rarest thing you've ever grown?",
  "Right here if you need me.",
  "I think the bees like you.",
  "One more row and this place is perfect.",
  "I'm having a great time, thanks for asking.",
  "A good mutation is the best kind of surprise.",
  "Think the weather will change soon?",
  "Stay hydrated, boss.",
  "Busy day, huh?",
  "Who needs a map when you know every tile by heart?",
  "I'll hold the fort.",
];

/**
 * Pose jouée avec une phrase libre. Une phrase absente d'ici n'en a pas : se
 * taire vaut mieux qu'une pose qui tombe à côté.
 */
const LINE_EMOTES: Record<string, EmoteType> = {
  "Nice patch you've got here.": EmoteType.Clapping,
  "Want me to keep an eye on anything?": EmoteType.Questioning,
  "I like it here.": EmoteType.Love,
  "Lovely day for some gardening.": EmoteType.Love,
  "I could watch things grow all day. Actually, I do.": EmoteType.Laughing,
  "Do the plants talk to you too, or is that just me?": EmoteType.Questioning,
  "I counted the leaves. Lost track at forty.": EmoteType.Laughing,
  "One day I'll have a garden of my own.": EmoteType.Love,
  "Smells like fresh soil. My favourite.": EmoteType.Love,
  "You've got a green thumb, you know that?": EmoteType.Clapping,
  "I'm not lazy, I'm supervising.": EmoteType.Laughing,
  "Did that sprout just move?": EmoteType.Questioning,
  "I named one of the crops. Don't ask which.": EmoteType.Laughing,
  "Some of these are looking really good.": EmoteType.Clapping,
  "Whatever you're doing, keep doing it.": EmoteType.Clapping,
  "Is it snack time yet?": EmoteType.Questioning,
  "Big plans for this garden?": EmoteType.Questioning,
  "I've been practising my whistling. Want to hear?": EmoteType.Laughing,
  "Every sprout is a tiny miracle.": EmoteType.Love,
  "What's the rarest thing you've ever grown?": EmoteType.Questioning,
  "I think the bees like you.": EmoteType.Laughing,
  "I'm having a great time, thanks for asking.": EmoteType.Love,
  "A good mutation is the best kind of surprise.": EmoteType.Clapping,
  "Think the weather will change soon?": EmoteType.Questioning,
  "Busy day, huh?": EmoteType.Laughing,
  ...TIME_LINE_EMOTES,
};

export function lineEmote(line: string): EmoteType | null {
  return LINE_EMOTES[line] ?? null;
}

/** Fenêtre dans laquelle on compte les Talk rapprochés. */
export const POKE_WINDOW_MS = 10_000;
/** À partir d'autant de Talk dans la fenêtre, il remarque qu'on insiste. */
const POKE_THRESHOLD = 5;

/**
 * Réponse à un joueur qui clique sur lui en boucle, ou `null`.
 *
 * `talkTimes` contient le Talk en cours. Plus on insiste, plus il s'agace :
 * amusé, puis intrigué, puis franchement vexé. Prime sur tout le reste, parce
 * que répondre « Nice patch you've got here » au dixième clic d'affilée
 * sonnerait faux.
 */
export function pokeLine(
  talkTimes: readonly number[],
  now: number,
  random: () => number
): { message: string; emote: EmoteType } | null {
  const recent = talkTimes.filter((t) => now - t <= POKE_WINDOW_MS && t <= now).length;
  if (recent < POKE_THRESHOLD) return null;
  if (recent < 7) {
    return {
      message: pickOne(["Okay okay, I'm listening!", "Yes? I'm right here.", "One at a time, boss!"], random),
      emote: EmoteType.Laughing,
    };
  }
  if (recent < 10) {
    return {
      message: pickOne(["Are you poking me on purpose?", "Is this a game? I like games.", "Hey, that tickles!"], random),
      emote: EmoteType.Questioning,
    };
  }
  return {
    message: pickOne(["Stop poking me!", "Okay, I'm ignoring you now.", "I'm going to start charging for this."], random),
    emote: EmoteType.Angered,
  };
}

/**
 * Sous-slots mûrs du jardin qu'il vaut la peine de signaler.
 *
 * Un crop préservé est mûr pour toujours, par définition : le joueur a payé
 * pour le figer tel quel et ne compte pas le cueillir. Le signaler comme « à
 * récolter » répéterait la même alerte à vie. `workflowScan` et `gardenRead`
 * lisent déjà ce drapeau ; ce compte-ci l'avait oublié.
 *
 * On veut un effectif pour décider s'il y a de quoi en parler, pas les
 * identifiants. La récolte, elle, passe par `workflowScan`, qui résout les vrais
 * `slotId` (les plantes sparse en ont des non contigus).
 */
export function ripeCropCount(tileObjects: unknown, now: number): number {
  if (!tileObjects || typeof tileObjects !== "object") return 0;
  let count = 0;
  for (const obj of Object.values(tileObjects as Record<string, unknown>)) {
    const slots = (obj as { slots?: unknown } | null)?.slots;
    if (!Array.isArray(slots)) continue;
    for (const slot of slots) {
      const s = slot as { endTime?: unknown; preserved?: unknown } | null;
      if (!s || s.preserved === true) continue;
      const end = s.endTime;
      if (typeof end === "number" && end > 0 && end <= now) count++;
    }
  }
  return count;
}

function pickOne<T>(options: readonly T[], random: () => number): T {
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

const plural = (count: number, singular: string, pluralForm: string) =>
  count === 1 ? singular : pluralForm;

export function harvestMessage(ready: number, random: () => number): string {
  const crops = `${ready} ${plural(ready, "crop", "crops")}`;
  const isAre = plural(ready, "is", "are");
  return pickOne(
    [
      `${crops} ${isAre} ready to harvest, by the way.`,
      `Psst, ${crops} ${isAre} ripe and waiting for you.`,
      `I spotted ${crops} ready to pick.`,
      `Harvest time! ${crops} ${isAre} good to go.`,
      `${crops} ${isAre} looking ripe. Just saying.`,
      `Don't leave them hanging, ${crops} ${isAre} ready.`,
    ],
    random
  );
}

export function hungryPetMessage(hungry: number, random: () => number): string {
  const pets = `${hungry} ${plural(hungry, "pet", "pets")}`;
  const isAre = plural(hungry, "is", "are");
  return pickOne(
    [
      `${pets} ${isAre} getting hungry.`,
      `I think ${pets} could use a snack.`,
      `${pets} ${isAre} giving me the hungry eyes.`,
      `Someone's tummy is rumbling. ${pets} need${hungry === 1 ? "s" : ""} feeding.`,
      `Heads up, ${pets} ${isAre} running low on food.`,
    ],
    random
  );
}

export function sellMessage(coins: number, random: () => number): string {
  const amount = `${Math.round(coins).toLocaleString("en-US")} coins`;
  return pickOne(
    [
      `You're carrying ${amount} worth of crops.`,
      `Your bag's worth ${amount} right now. Shop trip?`,
      `That's ${amount} of crops in your pockets.`,
      `Ka-ching! ${amount} worth of crops, ready to sell.`,
      `You could cash in ${amount} at the shop.`,
    ],
    random
  );
}

/**
 * Répliques propres à une météo, indexées par l'ID que porte `weatherAtom`.
 *
 * Ce sont les valeurs de l'enum du jeu (vérifié sur le bundle 1299 :
 * `weatherAtom` lit `state.weather`, qui vaut Rain, Frost, Thunderstorm, Dawn
 * ou AmberMoon, et `null` par beau temps). Ce n'est que de la couleur : aucun
 * nom de mutation ni aucune règle du jeu n'y figure, et une météo absente de
 * cette table retombe sur `GENERIC_WEATHER_TEMPLATES` avec son nom affiché.
 */
const WEATHER_LINES: Record<string, readonly string[]> = {
  Rain: [
    "It's raining! The crops are loving this.",
    "Free watering, courtesy of the sky.",
    "I forgot my umbrella again.",
    "Listen to that rain. So relaxing.",
    "Puddle jumping, anyone?",
    "Rain day. Perfect excuse to stay in the garden.",
  ],
  Frost: [
    "Brr, it's snowing! Wrap up warm.",
    "Snow on the garden. Everything looks so quiet.",
    "My toes are freezing out here.",
    "Want to build a snowman after this?",
    "Careful, it's slippery with all this snow.",
    "Snowflakes on the leaves. Pretty, isn't it?",
  ],
  Thunderstorm: [
    "Whoa, did you hear that thunder?",
    "Thunderstorm! Stay away from tall things.",
    "That lightning made me jump.",
    "Big storm rolling in. Hold on to your hat.",
    "I'm not scared of thunder. Much.",
    "What a storm. The sky's putting on a show.",
  ],
  Dawn: [
    "Look at that sunrise.",
    "Dawn's here. Everything glows.",
    "Early light is the best light.",
    "Rise and shine, garden!",
    "The whole garden looks golden right now.",
    "I love this time of day.",
  ],
  AmberMoon: [
    "The Amber Moon is up. Spooky, right?",
    "Everything's glowing orange tonight.",
    "Don't the crops look magical under the Amber Moon?",
    "An Amber Moon. Doesn't come around often.",
    "Stay close, strange things happen under the Amber Moon.",
    "Moonlight like this makes me want to howl.",
  ],
};

/** Tournures pour une météo que la table ne connaît pas encore. */
export const GENERIC_WEATHER_TEMPLATES: ReadonlyArray<(name: string) => string> = [
  (name) => `We're getting ${name} right now.`,
  (name) => `Ooh, ${name}! Good time to be outside.`,
  (name) => `Looks like ${name} out there.`,
  (name) => `${name} today. The crops might like that.`,
  (name) => `Did you notice? ${name} is here.`,
];

/**
 * Nom à afficher pour un ID de météo.
 *
 * Le catalogue live porte `name` (« Snow » pour Frost), l'ancien catalogue
 * embarqué `displayName`. Sans l'un ni l'autre, on découpe l'ID (« AmberMoon »
 * devient « Amber Moon ») plutôt que de montrer l'identifiant brut.
 */
export function weatherDisplayName(weatherId: string, catalog: unknown): string {
  const entry = catalog && typeof catalog === "object"
    ? (catalog as Record<string, unknown>)[weatherId]
    : undefined;
  for (const field of ["name", "displayName"]) {
    const value = (entry as Record<string, unknown> | undefined)?.[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return spaceWords(weatherId);
}

export function weatherMessage(weatherId: string, displayName: string, random: () => number): string {
  const own = WEATHER_LINES[weatherId];
  if (own && own.length > 0) return pickOne(own, random);
  return pickOne(GENERIC_WEATHER_TEMPLATES, random)(displayName);
}
