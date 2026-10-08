import { openRecoDialog } from "./dialog";

/** The full-screen countdown shown while auto reconnect waits out its delay. */
export type AutoRecoOverlay = { update: (ms: number) => void; destroy: () => void };

const countdownText = (ms: number): string => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `The game will reconnect in ${seconds} ${seconds <= 1 ? "second" : "seconds"}...`;
};

export function createAutoRecoOverlay(initialMs: number, onReconnectNow: () => void): AutoRecoOverlay {
  const dialog = openRecoDialog({
    id: "mgAutoRecoOverlay",
    title: "Auto reconnect",
    body: countdownText(initialMs),
    buttonLabel: "Reconnect now",
    onButton: onReconnectNow,
  });
  return {
    update: (ms) => dialog.setBody(countdownText(ms)),
    destroy: () => dialog.close(),
  };
}
