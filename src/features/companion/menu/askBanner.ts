// The companion's question, at the top of the screen.
//
// The menu thread already carries every question, but it has to be open. This
// card shows them where the eyes are, with the asker's portrait and the same
// tagged rendering as the thread, sprites included.
//
// What it is NOT: a shortcut to the action. Its two buttons call
// `CompanionChat.confirm` and `.decline`, exactly what the thread does. The
// same confirmation by another path, never a second way in (see
// `chat/proposals.ts`).
//
// Nothing happens at import: nothing shows until `mountCompanionAsk` is called.

import { button } from "../../../ui/kit/button";
import { h } from "../../../ui/kit/dom";
import { ensureKitStyles } from "../../../ui/kit/styles";
import { layer } from "../../../ui/kit/theme";
import { CompanionService } from "..";
import { CompanionChat } from "../chat";
import { PROPOSAL_TTL_MS, type Proposal } from "../chat/proposals";
import { loadCompanionSettings } from "../state";
import { renderTagged } from "./chatIcons";
import { fillWithPortrait } from "./npcAvatar";

const CARD_ID = "mgCompanionAsk";
const STYLE_ID = "mgCompanionAskStyle";
/** Under full-screen overlays, above the HUD and its windows. */
const Z_INDEX = layer.window + 49;

const ICON_PX = 17;
/** The countdown's period: fine enough for the bar to flow. */
const TICK_MS = 100;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  // The card reads the kit's theme variables, which may not be in yet.
  ensureKitStyles();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
#${CARD_ID} {
  position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
  z-index: ${Z_INDEX};
  width: 430px; max-width: calc(100vw - 24px); box-sizing: border-box;
  border-radius: var(--qmm-radius-xl); overflow: hidden;
  border: 3px solid var(--qmm-sand-edge);
  background: var(--qmm-paper);
  box-shadow: var(--qmm-shadow-raise);
  font-family: var(--qmm-font); font-size: var(--qmm-fs-md); font-weight: 700; line-height: 1.45;
  color: var(--qmm-text);
  animation: mgAskIn 160ms ease-out;
}
@keyframes mgAskIn {
  from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@media (prefers-reduced-motion: reduce) { #${CARD_ID} { animation: none; } }
#${CARD_ID} .mgask-body { display: flex; gap: var(--qmm-space-lg); padding: 14px 16px 12px; }
#${CARD_ID} .mgask-face {
  width: 48px; height: 48px; flex: 0 0 auto;
  border-radius: 50%; overflow: hidden;
  box-shadow: 0 0 0 2px var(--qmm-accent-border);
  background: var(--qmm-sepia-soft);
  display: grid; place-items: center;
  font-size: 22px; line-height: 1;
}
#${CARD_ID} .mgask-face canvas { image-rendering: pixelated; }
#${CARD_ID} .mgask-right { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: var(--qmm-space-md); }
#${CARD_ID} .mgask-who {
  font-size: var(--qmm-fs-xs); font-weight: 900; letter-spacing: .08em; text-transform: uppercase;
  color: var(--qmm-sepia-ink);
}
#${CARD_ID} .mgask-text { display: block; overflow-wrap: anywhere; }
#${CARD_ID} .mgask-text img, #${CARD_ID} .mgask-text canvas { vertical-align: -3px; }
#${CARD_ID} .mgask-buttons { display: flex; flex-wrap: wrap; gap: var(--qmm-space-md); }
#${CARD_ID} .mgask-clock { height: 4px; background: var(--qmm-sand); }
#${CARD_ID} .mgask-clock > i { display: block; height: 100%; width: 100%; background: var(--qmm-sepia); }
`;
  document.head.appendChild(style);
}

/* ---------------------------------- state --------------------------------- */

let card: HTMLElement | null = null;
let clockBar: HTMLElement | null = null;
let timer: number | null = null;
/** The question on screen: so it is not redrawn on every tick. */
let shownId: string | null = null;
let unsubscribe: (() => void) | null = null;

function hide(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  card?.remove();
  card = null;
  clockBar = null;
  shownId = null;
}

/**
 * The question's text, as the thread shows it.
 *
 * Taken from the log rather than the proposal's summary: the same sentence,
 * but with its markup and thumbnails. One source for both renderings, or one
 * would end up saying something else.
 */
function questionOf(proposal: Proposal): Node[] {
  const message = CompanionChat.getLog().messages.find((entry) => entry.proposalId === proposal.id);
  if (!message) return [document.createTextNode(proposal.summary)];
  return message.positioned ? renderTagged(message.text, message.icons, ICON_PX) : [document.createTextNode(message.text)];
}

function build(proposal: Proposal): void {
  ensureStyle();

  const root = h("div");
  root.id = CARD_ID;

  // A visible fallback while the portrait is composed, and for good if the NPC
  // is not drawn: an empty box would look like a bug.
  const face = h("div", "mgask-face", "🤖");
  fillWithPortrait(face, CompanionService.getNpcId());

  const text = h("div", "mgask-text");
  text.append(...questionOf(proposal));

  // Hidden at once: the confirmation is asynchronous, and leaving the card
  // under the cursor invites a second click.
  const yes = button("Yes, go ahead", {
    size: "sm",
    variant: "primary",
    onClick: () => {
      hide();
      void CompanionChat.confirm(proposal.id).catch(() => {});
    },
  });
  const no = button("Not now", {
    size: "sm",
    onClick: () => {
      hide();
      CompanionChat.decline(proposal.id);
    },
  });

  const buttons = h("div", "mgask-buttons");
  buttons.append(yes, no);

  const right = h("div", "mgask-right");
  right.append(h("div", "mgask-who", "Companion"), text, buttons);

  const body = h("div", "mgask-body");
  body.append(face, right);

  const clock = h("div", "mgask-clock");
  const fill = h("i");
  clock.append(fill);

  root.append(body, clock);
  document.body.appendChild(root);

  card = root;
  clockBar = fill;
  shownId = proposal.id;

  // The chat leaves a stale question in place until its next check; the card
  // must go on time.
  timer = window.setInterval(() => {
    const left = PROPOSAL_TTL_MS - (Date.now() - proposal.createdAtMs);
    if (left <= 0) {
      hide();
      return;
    }
    if (clockBar) clockBar.style.width = `${(left / PROPOSAL_TTL_MS) * 100}%`;
  }, TICK_MS);
}

function sync(): void {
  const proposal = CompanionChat.getProposal();
  if (!proposal) {
    hide();
    return;
  }
  // Companion off, or the card off in the settings. The first is not just a
  // precaution: a question still waiting when he is switched off would
  // otherwise stay on screen until the watch drops it.
  const settings = loadCompanionSettings();
  if (!settings.enabled || !settings.askOnScreen) {
    hide();
    return;
  }
  if (proposal.id === shownId) return;

  hide();
  build(proposal);
}

/** Shows the companion's questions on screen. Idempotent. */
export function mountCompanionAsk(): void {
  if (unsubscribe) return;
  unsubscribe = CompanionChat.subscribe(sync);
  sync();
}
