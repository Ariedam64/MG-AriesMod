// src/ui/companionAsk.ts
// La question du companion, en haut de l'écran.
//
// Le fil du menu porte déjà toutes ses questions, mais il faut l'avoir ouvert.
// Cette carte les montre là où le regard est, avec l'avatar de celui qui
// demande et le même rendu tagué que le fil — donc les sprites.
//
// Ce qu'elle N'EST PAS : un raccourci vers l'action. Les deux boutons appellent
// `CompanionChat.confirm` et `.decline`, exactement ce que fait le fil. C'est
// la même confirmation par un autre chemin, jamais une seconde porte d'entrée
// (cf. `services/companion/chat/proposals.ts`).
//
// Aucun effet à l'import : rien ne s'affiche tant que `mountCompanionAsk` n'a
// pas été appelé.

import { CompanionChat } from "../services/companion/chat";
import { PROPOSAL_TTL_MS, type Proposal } from "../services/companion/chat/proposals";
import { CompanionService } from "../services/companion";
import { loadCompanionSettings } from "../services/companion/state";
import { renderTagged } from "./menus/companion/chat-icons";
import { fillWithPortrait } from "./menus/companion/npc-avatar";

const CARD_ID = "mgCompanionAsk";
const STYLE_ID = "mgCompanionAskStyle";
/** Sous les overlays plein écran, au-dessus du HUD et de ses fenêtres. */
const Z_INDEX = "2000050";

const ICON_PX = 17;
/** Cadence du compte à rebours : assez fine pour que la barre coule. */
const TICK_MS = 100;

const ACCENT = "#5eead4";
const TEXT = "#e7eef7";
const TEXT_DIM = "rgba(231,238,247,0.68)";

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
#${CARD_ID} {
  position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
  z-index: ${Z_INDEX};
  width: 430px; max-width: calc(100vw - 24px);
  border-radius: 14px; overflow: hidden;
  border: 1px solid rgba(94,234,212,0.22);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(94,234,212,0.10), transparent 55%),
    rgba(15,20,26,0.94);
  backdrop-filter: blur(8px);
  box-shadow: 0 12px 38px rgba(0,0,0,0.48);
  font: 12.5px/1.45 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  color: ${TEXT};
  animation: mgAskIn 160ms ease-out;
}
@keyframes mgAskIn {
  from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
#${CARD_ID} .mgask-body { display: flex; gap: 11px; padding: 13px 14px 11px; }
#${CARD_ID} .mgask-face {
  width: 46px; height: 46px; flex: 0 0 auto;
  border-radius: 11px; overflow: hidden;
  border: 1px solid rgba(94,234,212,0.22);
  background: rgba(255,255,255,0.05);
  display: grid; place-items: center;
  font-size: 22px; line-height: 1;
}
#${CARD_ID} .mgask-right { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 9px; }
#${CARD_ID} .mgask-who { font-size: 11px; font-weight: 700; color: ${ACCENT}; letter-spacing: 0.02em; }
#${CARD_ID} .mgask-text { display: block; overflow-wrap: anywhere; }
#${CARD_ID} .mgask-text img, #${CARD_ID} .mgask-text canvas { vertical-align: -3px; }
#${CARD_ID} .mgask-buttons { display: flex; gap: 8px; }
#${CARD_ID} button {
  flex: 0 0 auto; padding: 6px 13px; border-radius: 9px; cursor: pointer;
  font: 600 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  transition: background 120ms ease, border-color 120ms ease;
}
#${CARD_ID} button.mgask-yes {
  border: 1px solid rgba(94,234,212,0.45); background: rgba(94,234,212,0.16); color: ${ACCENT};
}
#${CARD_ID} button.mgask-yes:hover { background: rgba(94,234,212,0.26); }
#${CARD_ID} button.mgask-no {
  border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: ${TEXT_DIM};
}
#${CARD_ID} button.mgask-no:hover { background: rgba(255,255,255,0.10); }
#${CARD_ID} .mgask-clock { height: 3px; background: rgba(255,255,255,0.07); }
#${CARD_ID} .mgask-clock > i {
  display: block; height: 100%; width: 100%;
  background: linear-gradient(90deg, ${ACCENT}, rgba(94,234,212,0.45));
}
`;
  document.head.appendChild(style);
}

/* --------------------------------- État ---------------------------------- */

let card: HTMLElement | null = null;
let clockBar: HTMLElement | null = null;
let timer: number | null = null;
/** Question actuellement affichée : de quoi ne pas la redessiner à chaque tick. */
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
 * Le texte de la question, tel que le fil l'affiche.
 *
 * On le reprend du journal plutôt que du résumé de la proposition : c'est la
 * même phrase, mais avec son balisage et ses vignettes. Une seule source pour
 * les deux rendus, sinon l'un dirait un jour autre chose que l'autre.
 */
function questionOf(proposal: Proposal): Node[] {
  const message = CompanionChat.getLog().messages.find((entry) => entry.proposalId === proposal.id);
  if (!message) return [document.createTextNode(proposal.summary)];
  return message.positioned
    ? renderTagged(message.text, message.icons, ICON_PX)
    : [document.createTextNode(message.text)];
}

function build(proposal: Proposal): void {
  ensureStyle();

  const root = document.createElement("div");
  root.id = CARD_ID;

  const face = document.createElement("div");
  face.className = "mgask-face";
  // Repli visible tant que le portrait se compose, et définitif si le PNJ
  // n'est pas rendu : une case vide passerait pour un bug.
  face.textContent = "🤖";
  fillWithPortrait(face, CompanionService.getNpcId());

  const who = document.createElement("div");
  who.className = "mgask-who";
  who.textContent = "Companion";

  const text = document.createElement("div");
  text.className = "mgask-text";
  text.append(...questionOf(proposal));

  const yes = document.createElement("button");
  yes.className = "mgask-yes";
  yes.textContent = "Yes, go ahead";
  yes.addEventListener("click", () => {
    // On retire tout de suite : la confirmation est asynchrone, et laisser la
    // carte sous le curseur invite à cliquer deux fois.
    hide();
    void CompanionChat.confirm(proposal.id).catch(() => {});
  });

  const no = document.createElement("button");
  no.className = "mgask-no";
  no.textContent = "Not now";
  no.addEventListener("click", () => {
    hide();
    CompanionChat.decline(proposal.id);
  });

  const buttons = document.createElement("div");
  buttons.className = "mgask-buttons";
  buttons.append(yes, no);

  const right = document.createElement("div");
  right.className = "mgask-right";
  right.append(who, text, buttons);

  const body = document.createElement("div");
  body.className = "mgask-body";
  body.append(face, right);

  const clock = document.createElement("div");
  clock.className = "mgask-clock";
  const fill = document.createElement("i");
  clock.append(fill);

  root.append(body, clock);
  document.body.appendChild(root);

  card = root;
  clockBar = fill;
  shownId = proposal.id;

  // Le service laisse une question périmée en place jusqu'à son prochain
  // battement ; la carte, elle, doit disparaître à l'heure dite.
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
  // Coupée dans les réglages : le fil garde la question, l'écran non.
  if (!loadCompanionSettings().askOnScreen) {
    hide();
    return;
  }
  if (proposal.id === shownId) return;

  hide();
  build(proposal);
}

/** Affiche les questions du companion à l'écran. Idempotent. */
export function mountCompanionAsk(): void {
  if (unsubscribe) return;
  unsubscribe = CompanionChat.subscribe(sync);
  sync();
}

/** Retire la carte et cesse d'écouter. */
export function unmountCompanionAsk(): void {
  unsubscribe?.();
  unsubscribe = null;
  hide();
}
