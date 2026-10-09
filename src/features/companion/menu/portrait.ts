// The companion's face in the menu: the portrait of the NPC whose look he
// borrows, shared by the Behavior tab, the chat header and the bubbles.

import { CompanionService } from "..";
import { part } from "./dom";
import { fillWithPortrait } from "./npcAvatar";

/** What it takes to draw the portrait: the identity for the outfit, the name for the fallback. */
export type NpcIdentityView = { npcId: string | null; name: string | null };

/** The borrowed NPC: its id for the outfit, its name for the fallback. */
export function borrowedIdentity(): NpcIdentityView {
  const npcId = CompanionService.getNpcId();
  return { npcId, name: npcId ? npcId.replace(/^NPC_/, "") : null };
}

/**
 * A round portrait, composed from the NPC's cosmetics like the game composes
 * its characters. The initial goes first and stays as the fallback: the
 * outfit arrives asynchronously, and may not arrive at all.
 */
export function portrait(identity: NpcIdentityView | null, sizePx: number, framed = false): HTMLElement {
  const el = part("div", framed ? "qws-cmp-avatar is-framed" : "qws-cmp-avatar");
  el.style.width = `${sizePx}px`;
  el.style.height = `${sizePx}px`;
  el.style.fontSize = `${Math.round(sizePx * 0.45)}px`;

  const name = (identity?.name ?? "").trim();
  if (name) el.textContent = name.charAt(0).toUpperCase();
  fillWithPortrait(el, identity?.npcId ?? null);
  return el;
}
