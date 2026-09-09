// src/ui/menus/companion/chat-tab.ts
// Onglet Chat : le fil du companion, et la barre d'actions qui remplace la saisie.
//
// On n'écrit pas au companion. Le fil sert à deux choses : recevoir ce qu'il
// signale (alertes, réponses, avancement), et déclencher des actions depuis la
// barre du bas. Chaque action passe par une question à confirmer — c'est la
// règle du mod, l'automatisation n'est pas autorisée (cf. `chat/proposals.ts`).
//
// Ce fichier assemble seulement : le rendu des bulles est dans `chat-view.ts`,
// les actions dans `actions-modal.ts`.

import { CompanionChat } from "../../../services/companion/chat";
import { CompanionService } from "../../../services/companion";
import { button, css } from "../panel-ui";
import {
  actionBar,
  barHint,
  chatHeader,
  dateSeparator,
  emptyThread,
  formatDayLabel,
  isSameGroup,
  messageRow,
  threadBody,
  type NpcIdentityView,
} from "./chat-view";
import { openActionsModal } from "./actions-modal";
import { openSettingsModal } from "./settings-modal";

const EMPTY_HINT = "Pick something below. I always ask first.";

/** Le companion démarre sans bruit : on regarde régulièrement qui il est devenu. */
const IDENTITY_REFRESH_MS = 2000;

/** Le PNJ emprunté : son identifiant pour la tenue, son nom pour le repli. */
function borrowed(): NpcIdentityView {
  const npcId = CompanionService.getNpcId();
  return { npcId, name: npcId ? npcId.replace(/^NPC_/, "") : null };
}

export function renderChatTab(view: HTMLElement): void {
  view.innerHTML = "";

  const root = document.createElement("div");
  css(root, { display: "flex", flexDirection: "column", gap: "8px" });
  view.append(root);

  const header = chatHeader("Companion");
  const thread = threadBody();
  const bar = actionBar();

  // Les popups se placent au-dessus de la fenêtre du HUD qui porte l'onglet.
  const host = (view.closest(".qws-win") as HTMLElement | null) ?? view;

  /* -------------------------------- Fil ----------------------------------- */

  function renderThread(): void {
    thread.innerHTML = "";
    const identity = borrowed();
    const { messages } = CompanionChat.getLog();
    const proposal = CompanionChat.getProposal();

    if (messages.length === 0) {
      thread.append(emptyThread(EMPTY_HINT));
      return;
    }

    const now = Date.now();
    let lastDayLabel = "";

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const dayLabel = formatDayLabel(message.atMs, now);
      const startsDay = dayLabel !== "" && dayLabel !== lastDayLabel;
      if (startsDay) {
        thread.append(dateSeparator(dayLabel));
        lastDayLabel = dayLabel;
      }

      const previous = i > 0 ? messages[i - 1] : null;
      const next = i < messages.length - 1 ? messages[i + 1] : null;
      thread.append(
        messageRow(
          message,
          {
            isFirstInGroup: !previous || startsDay || !isSameGroup(previous, message),
            isLastInGroup: !next || !isSameGroup(message, next),
          },
          identity
        )
      );

      // Les boutons ne suivent que la proposition *courante* : une question
      // déjà tranchée reste lisible dans le fil, mais n'est plus actionnable.
      if (message.proposalId && proposal && proposal.id === message.proposalId) {
        thread.append(confirmRow(message.proposalId));
      }
    }

    thread.scrollTop = thread.scrollHeight;
  }

  function confirmRow(proposalId: string): HTMLElement {
    const row = document.createElement("div");
    css(row, { display: "flex", gap: "6px", alignSelf: "flex-start", marginLeft: "34px", marginTop: "2px" });
    row.append(
      button("Yes, go ahead", "accent", () => void CompanionChat.confirm(proposalId).catch(() => {})),
      button("Not now", "neutral", () => CompanionChat.decline(proposalId))
    );
    return row;
  }

  /* ---------------------------- Barre d'actions --------------------------- */

  const actionsButton = button("Actions", "neutral", () => {
    openActionsModal(host, (request) => {
      void CompanionChat.proposeHarvest(request).catch(() => {});
    });
  });

  const settingsButton = button("Settings", "neutral", () => openSettingsModal(host));

  function renderBar(): void {
    bar.innerHTML = "";
    const run = CompanionChat.getRun();

    if (run) {
      bar.append(
        button(`Stop (${run.done}/${run.total})`, "danger", () => CompanionChat.cancelRun()),
        barHint("Working on it", "warn")
      );
      return;
    }

    bar.append(actionsButton, settingsButton);
  }

  /* ------------------------------- En-tête -------------------------------- */

  function renderStatus(): void {
    header.setIdentity(borrowed());
    const run = CompanionChat.getRun();
    if (run) {
      // Neutre : le même bandeau sert à récolter, planter, faire éclore et vendre.
      header.setStatus(`On it, ${run.done} of ${run.total}`, true);
      return;
    }
    if (CompanionChat.getProposal()) {
      header.setStatus("Waiting on you", true);
      return;
    }
    header.setStatus(
      CompanionService.isRunning() ? "Ready when you are" : "Not out yet, but I can still help",
      false
    );
  }

  function renderAll(): void {
    renderThread();
    renderBar();
    renderStatus();
  }

  root.append(header.root, thread, bar);
  renderAll();

  /* ------------------------------ Cycle de vie ---------------------------- */

  // Le menu redessine un onglet en vidant sa vue, sans appeler de nettoyage :
  // on se désabonne donc sur détachement, pour qu'un ré-affichage n'empile pas
  // un second abonnement. La popup, elle, se referme d'elle-même quand la
  // fenêtre qui la porte disparaît.
  let unsubscribe = () => {};
  unsubscribe = CompanionChat.subscribe(() => {
    if (!root.isConnected) {
      unsubscribe();
      return;
    }
    renderAll();
  });

  // Le PNJ n'est connu qu'une fois le companion démarré, ce qui n'émet aucun
  // message : sans ce battement, le portrait resterait anonyme jusqu'au premier
  // échange. `setIdentity` ne refait rien quand l'identité n'a pas changé.
  const identityTimer = window.setInterval(() => {
    if (!root.isConnected) {
      clearInterval(identityTimer);
      return;
    }
    renderStatus();
  }, IDENTITY_REFRESH_MS);

  (view as unknown as { __cleanup__?: () => void }).__cleanup__ = () => {
    clearInterval(identityTimer);
    unsubscribe();
  };
}
