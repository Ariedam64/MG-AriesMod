// The mod's toasts, shown through the game's own toast list (game/toasts.ts).

import { pushGameToast } from "../game/toasts";

export type ToastVariant = "success" | "error" | "info" | "warn";

let nextToastId = 0;

/**
 * Shows a toast. `title` and `description` may be plain strings or the game's
 * `{ id, message }` text references. Throws when the game has no toast list
 * yet, so callers that care can tell.
 */
export async function toastSimple(
  title: any, description?: any, variant: ToastVariant = "info", duration = 3500,
): Promise<void> {
  const shown = await pushGameToast({
    // Each toast needs its own id: the game removes entries by id, so two
    // toasts sharing one could not be closed separately.
    id: `aries-toast-${Date.now()}-${++nextToastId}`,
    title,
    description,
    // The game only styles "error" and "warning"; the others look the same.
    variant: variant === "warn" ? "warning" : variant,
    displayDurationMs: duration,
    isClosable: true,
    isStackable: true,
  });
  if (!shown) throw new Error("The game has no toast list yet");
}
