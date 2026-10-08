// Reads and writes the game's active modal, whatever shape the build uses.
//
// Up to v1324 `activeModalStateAtom` held the modal name (`string | null`).
// Since v1342 it holds `{ modal, openId }`, and `activeModalAtom` is a read-only
// atom derived from it. The game opens a modal like this (RoomConnection, v1342):
//   let { modal, openId } = get(state);
//   next !== modal && set(state, { modal: next, openId: openId + 1 });
// Writing a bare name into the new atom leaves the game reading `.modal` from a
// string, so nothing opens.

type ModalStateObject = { modal: string | null; openId: number };

function isStateObject(raw: unknown): raw is ModalStateObject {
  return !!raw && typeof raw === "object" && "modal" in (raw as object);
}

/** The modal name, from either shape. */
export function modalNameOf(raw: unknown): string | null {
  if (isStateObject(raw)) return raw.modal ?? null;
  return typeof raw === "string" ? raw : null;
}

/**
 * The value to write to open `next` (or close with null), in the shape `raw`
 * already has. `undefined` when that modal is already the active one, which is
 * when the game itself writes nothing.
 */
export function nextModalState(raw: unknown, next: string | null): unknown {
  if (modalNameOf(raw) === next) return undefined;
  if (isStateObject(raw)) {
    const openId = Number.isFinite(raw.openId) ? raw.openId : 0;
    return { modal: next, openId: openId + 1 };
  }
  return next;
}
