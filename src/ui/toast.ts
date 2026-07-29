// src/ui/toast.ts
import { getAtomByLabel, jGet, jSet } from "../store/jotai";

export type ToastVariant = "success" | "error" | "info" | "warn";
export type SimpleToast = { title: any; description?: any; variant?: ToastVariant };

// Matches the real "board"-style toast pushed by the game itself for shop
// announcements (captured live from quinoaToastsAtom). title/subtitle can be
// either a plain string or a `{ id }` i18n message reference, mirroring what
// the game sends.
type ShopAnnouncementToast = {
  toastType: "shopAnnouncement";
  presentation: string;
  title: any;
  subtitle?: any;
  isStackable?: boolean;
  displayDurationMs?: number | null;
  presentByServerMs?: number;
  id?: string;
};

type AnyToast = SimpleToast | ShopAnnouncementToast;

export async function sendToast(toast: AnyToast): Promise<void> {
  const sendAtom = getAtomByLabel("sendQuinoaToastAtom");
  if (sendAtom) { await jSet(sendAtom, toast); return; }

  const listAtom = getAtomByLabel("quinoaToastsAtom");
  if (!listAtom) throw new Error("Aucun atom de toast trouvé");

  const prev = await jGet<any[]>(listAtom).catch(() => []) as any[];
  const isAnnouncement = "toastType" in toast && toast.toastType === "shopAnnouncement";

  const t: any = isAnnouncement
    ? { isClosable: true, presentByServerMs: Date.now(), ...toast }
    : { isClosable: true, duration: 10000, ...toast };

  // Every toast needs a distinct id: the game's toast list keys/removes
  // entries by id, so any two toasts sharing "quinoa-game-toast" become
  // indistinguishable to it — closing one either closes both or fails to
  // remove either, which is exactly the "won't dismiss" symptom this fixes.
  t.id = t.id ?? `quinoa-game-toast-${Date.now()}-${Math.random()}`;

  await jSet(listAtom, [...prev, t]);
}

export async function toastSimple(
  title: any, description?: any, variant: ToastVariant = "info", duration = 3500
) {
  await sendToast({ title, description, variant, duration });
}

export async function toastBoard(
  title: any, subtitle: any, presentation: string,
  displayDurationMs = 5000, opts: Partial<ShopAnnouncementToast> = {}
) {
  await sendToast({
    toastType: "shopAnnouncement",
    presentation,
    title,
    subtitle,
    isStackable: true,
    displayDurationMs,
    ...opts,
  });
}

export async function clearToasts() {
  const listAtom = getAtomByLabel("quinoaToastsAtom");
  if (listAtom) await jSet(listAtom, []);
}
