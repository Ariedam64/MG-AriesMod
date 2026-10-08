// What the companion says, and what he counts to say it.
//
// Pure, like `dialogue.ts`, with the chance passed in. Reading the game stays
// in `dialogueContext.ts`; this only turns what it read into a sentence, which
// is checked outside the browser (scripts/checkCompanionDialogue.ts).

import { formatInteger, spaceWords } from "../../lib/format";
import { pickOne, type Random } from "../../lib/random";
import { TIME_LINE_EMOTES } from "./dialogueTime";
import { EmoteType } from "./emoteTypes";

/**
 * The four lines shipped before 3.2.219.
 *
 * No UI edits them, but they were written to disk with the rest of the
 * settings: a player still carrying them never chose anything and must get
 * the current list. See `coerceSettings`.
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
 * The pose played with a free line. A line missing here gets none: no pose
 * beats a pose that misses.
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

/** The window in which close Talks are counted. */
export const POKE_WINDOW_MS = 10_000;
/** From this many Talks in the window, he notices being poked. */
const POKE_THRESHOLD = 5;

/**
 * The answer to a player clicking on him over and over, or `null`.
 *
 * `talkTimes` includes the current Talk. The more it goes on, the more he
 * minds: amused, then puzzled, then properly put out. Beats everything else,
 * since "Nice patch you've got here" on the tenth click in a row would ring false.
 */
export function pokeLine(
  talkTimes: readonly number[],
  now: number,
  random: Random
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
 * Ripe garden slots worth mentioning.
 *
 * A preserved crop is ripe forever by definition: the player paid to freeze
 * it as is and does not mean to pick it. Calling it "ready to harvest" would
 * repeat the same alert for good.
 *
 * This is a count, to decide whether there is anything to say; harvesting
 * goes through `chat/gardenScan.ts`, which resolves the real `slotId`s.
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

const plural = (count: number, singular: string, pluralForm: string) =>
  count === 1 ? singular : pluralForm;

export function harvestMessage(ready: number, random: Random): string {
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

export function hungryPetMessage(hungry: number, random: Random): string {
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

export function sellMessage(coins: number, random: Random): string {
  const amount = `${formatInteger(coins, "round")} coins`;
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
 * Lines for each weather, keyed by the id `weatherAtom` carries.
 *
 * Those are the game's enum values (checked on bundle 1299: `weatherAtom`
 * reads `state.weather`, which is Rain, Frost, Thunderstorm, Dawn or AmberMoon,
 * and `null` in fine weather). Only flavour: no mutation name or game rule in
 * here, and a weather missing from the table falls back on
 * `GENERIC_WEATHER_TEMPLATES` with its display name.
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

/** Phrasings for a weather the table does not know yet. */
export const GENERIC_WEATHER_TEMPLATES: ReadonlyArray<(name: string) => string> = [
  (name) => `We're getting ${name} right now.`,
  (name) => `Ooh, ${name}! Good time to be outside.`,
  (name) => `Looks like ${name} out there.`,
  (name) => `${name} today. The crops might like that.`,
  (name) => `Did you notice? ${name} is here.`,
];

/**
 * The display name of a weather id.
 *
 * The live catalog carries `name` ("Snow" for Frost), the old bundled one
 * `displayName`. With neither, the id is split ("AmberMoon" reads "Amber
 * Moon") rather than shown raw.
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

export function weatherMessage(weatherId: string, displayName: string, random: Random): string {
  const own = WEATHER_LINES[weatherId];
  if (own && own.length > 0) return pickOne(own, random);
  return pickOne(GENERIC_WEATHER_TEMPLATES, random)(displayName);
}

/** The pose that goes with each weather. An unknown weather simply wonders. */
const WEATHER_EMOTES: Record<string, EmoteType> = {
  Rain: EmoteType.Laughing,
  Frost: EmoteType.Clapping,
  Thunderstorm: EmoteType.Crying,
  Dawn: EmoteType.Love,
  AmberMoon: EmoteType.Questioning,
};

export function weatherEmote(weatherId: string): EmoteType {
  return WEATHER_EMOTES[weatherId] ?? EmoteType.Questioning;
}
