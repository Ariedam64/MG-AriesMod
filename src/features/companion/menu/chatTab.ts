// The Chat tab: the companion's thread, and the action bar in place of an
// input.
//
// Nobody writes to the companion. The thread does two things: receive what he
// reports (answers, progress), and trigger actions from the bar. Every action
// goes through a question to confirm: that is the mod's rule, automation is
// not allowed (see `chat/proposals.ts`).
//
// This file only assembles: drawing the bubbles is `chatView.ts`, the actions
// are `actionsModal.ts`.

import { button, type ButtonOptions } from "../../../ui/kit/button";
import { refreshWhileVisible } from "../../../ui/kit/dom";
import { CompanionChat } from "../chat";
import { CompanionService } from "..";
import { openActionsModal } from "./actionsModal";
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
} from "./chatView";
import { part } from "./dom";
import { borrowedIdentity } from "./portrait";
import { openSettingsModal } from "./settingsModal";

const EMPTY_HINT = "Nothing said yet. Pick an action below, I always ask first.";

/** The companion starts quietly: who he became is looked at regularly. */
const IDENTITY_REFRESH_MS = 2000;

const SMALL: ButtonOptions = { size: "sm", lockWhilePending: true };

export function renderChatTab(view: HTMLElement): void {
  view.innerHTML = "";

  const root = part("div", "qws-cmp-tab");
  view.append(root);

  const header = chatHeader("Companion");
  const thread = threadBody();
  const bar = actionBar();

  // Popups sit above the HUD window that holds the tab.
  const host = (view.closest(".qws-win") as HTMLElement | null) ?? view;

  /* --------------------------------- thread --------------------------------- */

  function confirmRow(proposalId: string): HTMLElement {
    const row = part("div", "qws-cmp-confirm");
    row.append(
      button("Yes, go ahead", {
        ...SMALL,
        variant: "primary",
        onClick: () => void CompanionChat.confirm(proposalId).catch(() => {}),
      }),
      button("Not now", { ...SMALL, onClick: () => CompanionChat.decline(proposalId) }),
    );
    return row;
  }

  function renderThread(): void {
    thread.innerHTML = "";
    const identity = borrowedIdentity();
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
          identity,
        ),
      );

      // The buttons only follow the *current* proposal: a question already
      // answered stays readable in the thread, but no longer actionable.
      if (message.proposalId && proposal && proposal.id === message.proposalId) {
        thread.append(confirmRow(message.proposalId));
      }
    }

    thread.scrollTop = thread.scrollHeight;
  }

  /* ------------------------------- action bar ------------------------------- */

  // Asking for something is what the tab is for, so it gets the weight.
  const actionsButton = button("Actions", {
    ...SMALL,
    variant: "primary",
    onClick: () => openActionsModal(host, (request) => void CompanionChat.ask(request).catch(() => {})),
  });
  actionsButton.classList.add("qws-cmp-bar__grow");
  const settingsButton = button("Settings", { ...SMALL, onClick: () => openSettingsModal(host) });

  function renderBar(): void {
    bar.innerHTML = "";
    const run = CompanionChat.getRun();

    if (run) {
      bar.append(
        button(`Stop (${run.done}/${run.total})`, { ...SMALL, variant: "danger", onClick: () => CompanionChat.cancelRun() }),
        barHint("Working on it", "warn"),
      );
      return;
    }

    bar.append(actionsButton, settingsButton);
  }

  /* --------------------------------- header --------------------------------- */

  function renderStatus(): void {
    header.setIdentity(borrowedIdentity());
    const run = CompanionChat.getRun();
    if (run) {
      // Neutral: the same line serves harvesting, planting, hatching and selling.
      header.setStatus(`On it, ${run.done} of ${run.total}`, "busy");
      return;
    }
    if (CompanionChat.getProposal()) {
      header.setStatus("Waiting on you", "busy");
      return;
    }
    if (CompanionService.isRunning()) header.setStatus("Ready when you are", "ready");
    else header.setStatus("Not out yet, but I can still help", "idle");
  }

  function renderAll(): void {
    renderThread();
    renderBar();
    renderStatus();
  }

  root.append(header.root, thread, bar);
  renderAll();

  /* -------------------------------- lifecycle ------------------------------- */

  // The menu redraws a tab by emptying its view without calling any cleanup:
  // the subscription goes once the view is detached, so a redraw does not
  // stack a second one. The popup closes by itself when its window goes.
  let unsubscribe = () => {};
  unsubscribe = CompanionChat.subscribe(() => {
    if (!root.isConnected) {
      unsubscribe();
      return;
    }
    renderAll();
  });

  // The NPC is only known once the companion has started, which posts no
  // message: without this beat the portrait would stay anonymous until the
  // first exchange. `setIdentity` does nothing when the identity is unchanged.
  // Only while the tab shows: a detached or hidden view runs nothing.
  refreshWhileVisible(root, renderStatus, IDENTITY_REFRESH_MS);

  // A thread drawn while its tab was hidden has no height yet, so it could
  // not scroll to the latest message: that is done when it shows.
  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver((entries) => {
      if (!root.isConnected) observer.disconnect();
      else if (entries[entries.length - 1]?.isIntersecting) thread.scrollTop = thread.scrollHeight;
    });
    observer.observe(thread);
  }
}
