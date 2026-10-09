// What he says when something happens in the game: the weather changes, a pet
// uses an ability, an egg is ready, a followed item is in the shop, a crop
// turns rare.

import { pickOne, type Random } from "../../../lib/random";
import { weatherEmote } from "../dialogueLines";
import { EmoteType } from "../emoteTypes";
import { hasRestocked, type Restocks } from "../../shops/restock";
import type { Reaction } from "./gate";

/**
 * Reaction to a weather change.
 *
 * `startLine` comes from the caller (`weatherMessage` in `dialogueLines`), so
 * the lines for each weather have a single source.
 */
export function weatherChangeReaction(
  prevId: string | null,
  nextId: string | null,
  prevName: string,
  startLine: string,
  random: Random,
): Reaction | null {
  if (prevId === nextId) return null;
  if (nextId) {
    return { key: `weather:${nextId}`, message: startLine, emote: weatherEmote(nextId), priority: "high" };
  }
  if (!prevId) return null;
  return {
    key: "weather:end",
    message: pickOne(
      [`The ${prevName} is over. Sunshine's back!`, `And just like that, the ${prevName} is gone.`, `Bye bye, ${prevName}.`],
      random,
    ),
    emote: null,
    priority: "low",
  };
}

type AbilityEvent = { name?: string; species?: string; abilityName: string };

export function abilityReaction(event: AbilityEvent, random: Random): Reaction {
  const who = event.name?.trim() || (event.species ? `your ${event.species}` : "your pet");
  const Who = who.charAt(0).toUpperCase() + who.slice(1);
  return {
    key: "ability",
    message: pickOne(
      [`${Who} just used ${event.abilityName}!`, `Go ${who}! ${event.abilityName}!`, `Did you see that? ${Who} used ${event.abilityName}.`],
      random,
    ),
    emote: EmoteType.Clapping,
    priority: "low",
  };
}

export function eggsReadyReaction(count: number, random: Random): Reaction | null {
  if (count <= 0) return null;
  return {
    key: "egg",
    message:
      count === 1
        ? pickOne(["An egg is ready to hatch!", "Ooh, one of your eggs is ready!", "Something's wiggling in that egg. It's ready!"], random)
        : pickOne([`${count} eggs are ready to hatch!`, `${count} eggs ready! Hatching time?`], random),
    emote: EmoteType.Clapping,
    priority: "high",
  };
}

export function shopReaction(names: string[], random: Random): Reaction | null {
  const list = names.filter((n) => typeof n === "string" && n.trim());
  if (list.length === 0) return null;
  const what = list.length === 1 ? list[0] : list.length === 2 ? `${list[0]} and ${list[1]}` : `${list[0]}, ${list[1]} and more`;
  const isAre = list.length === 1 ? "is" : "are";
  return {
    key: "shop",
    message: pickOne(
      [`${what} ${isAre} in the shop! Go go go!`, `Ooh, ${what} just showed up in the shop!`, `Quick, ${what} ${isAre} in stock!`],
      random,
    ),
    emote: EmoteType.Clapping,
    priority: "high",
  };
}

type ShopSection = { inventory?: unknown; restocks?: Restocks };
type ShopsLike = Partial<Record<"seed" | "egg" | "tool" | "decor", ShopSection>>;

/** A shop item's key, in the notifier's preference format (`Seed:Carrot`). */
const SHOP_ID: Record<keyof ShopsLike, [string, string]> = {
  seed: ["Seed", "species"],
  egg: ["Egg", "eggId"],
  tool: ["Tool", "toolId"],
  decor: ["Decor", "decorId"],
};

/**
 * Followed items in a shop that just restocked.
 *
 * A restock is a shop's new restock id, or a weather shop opening. The first
 * reading (`prev === null`) is the reference and says nothing, or every reload
 * would announce the stock.
 */
export function restockedFollowed(prev: ShopsLike | null, next: ShopsLike, isFollowed: (id: string) => boolean): string[] {
  if (!prev || !next) return [];
  const out: string[] = [];
  for (const kind of Object.keys(SHOP_ID) as Array<keyof ShopsLike>) {
    if (!hasRestocked(prev[kind]?.restocks, next[kind]?.restocks)) continue;
    const inventory = next[kind]?.inventory;
    if (!Array.isArray(inventory)) continue;
    const [prefix, field] = SHOP_ID[kind];
    for (const item of inventory) {
      const key = (item as Record<string, unknown> | null)?.[field];
      const stock = Number((item as Record<string, unknown> | null)?.initialStock);
      if (typeof key !== "string" || !key || !(stock > 0)) continue;
      const id = `${prefix}:${key}`;
      if (isFollowed(id)) out.push(id);
    }
  }
  return out;
}

export type RareCrop = { mutation: string; species: string };

export function rareCropReaction(crops: RareCrop[], random: Random): Reaction | null {
  if (crops.length === 0) return null;
  const first = crops[0];
  const message =
    crops.length === 1
      ? pickOne(
          [
            `A ${first.mutation} ${first.species}! Look at that!`,
            `Whoa, a ${first.mutation} ${first.species} just showed up!`,
            `${first.mutation}! Your ${first.species} is special.`,
          ],
          random,
        )
      : pickOne([`${crops.length} rare crops just appeared! Look!`, `Whoa, ${crops.length} special crops at once!`], random);
  return { key: "rarecrop", message, emote: EmoteType.Love, priority: "high" };
}
