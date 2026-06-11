// src/hooks/ws-hook.ts
import { NativeWS, sockets, setQWS } from "../core/state";
import { pageWindow, readSharedGlobal, shareGlobal } from "../utils/page-context";
import { parseWSData } from "../core/parse";
import { Atoms } from "../store/atoms";
import { lockerService } from "../services/locker";
import { plantCatalog } from "../data";
import { StatsService } from "../services/stats";
import {
  friendBonusPercentFromMultiplier,
  friendBonusPercentFromPlayers,
  lockerRestrictionsService,
  percentToRequiredFriendCount,
} from "../services/lockerRestrictions";
import { toastSimple } from "../ui/toast";
import { getAtomByLabel, jGet, jSet } from "../store/jotai";
import type { GardenState, PlantSlotTiming } from "../store/atoms";
import { detectEnvironment } from "../utils/api";
import { MiscService } from "../services/misc";
import { EditorService } from "../services/editor";
import { tos } from "../utils/tileObjectSystemApi";

type WsCloseListener = (ev: CloseEvent, ws: WebSocket) => void;

const wsCloseListeners: WsCloseListener[] = [];
let versionReloadScheduled = false;
let autoRecoTimer: number | null = null;
let autoRecoCountdownInterval: number | null = null;
type AutoRecoOverlay = { update: (ms: number) => void; destroy: () => void };
let autoRecoOverlay: AutoRecoOverlay | null = null;

/** When true, auto-reconnect is suppressed (e.g. sell flow navigating to another room). */
let suppressAutoReco = false;
export function setSuppressAutoReco(value: boolean): void {
  suppressAutoReco = value;
}

function onWebSocketClose(cb: WsCloseListener): () => void {
  wsCloseListeners.push(cb);
  return () => {
    const idx = wsCloseListeners.indexOf(cb);
    if (idx !== -1) wsCloseListeners.splice(idx, 1);
  };
}

function notifyWebSocketClose(ev: CloseEvent, ws: WebSocket) {
  for (const listener of [...wsCloseListeners]) {
    try {
      listener(ev, ws);
    } catch {}
  }
}

function isVersionExpiredClose(ev: CloseEvent): boolean {
  return ev?.code === 4710 || /Version\s*Expired/i.test(ev?.reason || "");
}

function getRoomConnectionSocket(): WebSocket | null {
  try {
    const rc = (pageWindow as any).MagicCircle_RoomConnection;
    if (!rc) return null;
    return (rc.ws || rc.socket || rc.currentWebSocket) ?? null;
  } catch {
    return null;
  }
}

function startAutoReloadOnVersionExpired() {
  onWebSocketClose((ev) => {
    if (!isVersionExpiredClose(ev)) return;

    const env = detectEnvironment();
    if (env.surface === "discord" || env.isInIframe) return;
    if (versionReloadScheduled) return;
    versionReloadScheduled = true;

    try {
      console.warn("[MagicGarden] Version expired, reloading...");
    } catch {}

    try {
      pageWindow.location.reload();
    } catch {
      try {
        window.location.reload();
      } catch {}
    }
  });
}

function isSupersededSessionClose(ev: CloseEvent): boolean {
  if (!ev) return false;
  const reason = ev?.reason || "";
  const reasonLc = reason.toLowerCase();
  if (ev.code === 4300 && reasonLc.includes("heartbeat")) {
    return false;
  }
  return (
    ev.code === 4300 ||
    (ev.code === 4250 && (/superseded/i.test(reason) || /newer user session/i.test(reason)))
  );
}

function ensureAutoRecoOverlayStyle() {
  const STYLE_ID = "mgAutoRecoOverlayStyle";
  if (document.getElementById(STYLE_ID)) return;
  const css = `
    #mgAutoRecoOverlay { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.65); font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    #mgAutoRecoOverlay .box { background: #0f1318; color: #fff; padding: 24px 28px; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.45); text-align: center; max-width: 92vw; border: 1px solid rgba(255,255,255,.15); }
    #mgAutoRecoOverlay .title { font-size: 24px; font-weight: 900; letter-spacing: .02em; margin: 0 0 8px 0; }
    #mgAutoRecoOverlay .subtitle { font-size: 14px; opacity: .85; margin: 0 0 14px 0; }
    #mgAutoRecoOverlay .btn { margin-top: 6px; padding: 10px 16px; border-radius: 999px; border: 1px solid #7aa2ff; background: #1a2644; color: #fff; font-weight: 700; cursor: pointer; }
    #mgAutoRecoOverlay .btn:focus { outline: 2px solid #7aa2ff; outline-offset: 2px; }
  `;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  document.documentElement.appendChild(style);
}

function createAutoRecoOverlay(initialMs: number, onReconnectNow: () => void): AutoRecoOverlay {
  ensureAutoRecoOverlayStyle();
  const existing = document.getElementById("mgAutoRecoOverlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "mgAutoRecoOverlay";
  overlay.innerHTML = `
    <div class="box" role="dialog" aria-label="Auto reconnect status">
      <div class="title">Auto reconnect</div>
      <div class="subtitle auto-reco-subtitle">The game will reconnect soon.</div>
      <button class="btn" type="button">Reconnect now</button>
    </div>
  `;
  const subtitle = overlay.querySelector(".auto-reco-subtitle") as HTMLElement | null;
  const btn = overlay.querySelector("button.btn") as HTMLButtonElement | null;

  const render = (ms: number) => {
    if (!subtitle) return;
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    const unit = seconds <= 1 ? "second" : "seconds";
    subtitle.textContent = `The game will reconnect in ${seconds} ${unit}...`;
  };

  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      onReconnectNow();
    });
  }

  document.documentElement.appendChild(overlay);
  render(initialMs);

  return {
    update: render,
    destroy: () => {
      try { overlay.remove(); } catch {}
    },
  };
}

function clearAutoRecoOverlayAndCountdown() {
  if (autoRecoCountdownInterval !== null) {
    clearInterval(autoRecoCountdownInterval);
    autoRecoCountdownInterval = null;
  }
  if (autoRecoOverlay) {
    try { autoRecoOverlay.destroy(); } catch {}
    autoRecoOverlay = null;
  }
}

function startAutoReconnectOnSuperseded() {
  onWebSocketClose((ev, ws) => {
    if (!isSupersededSessionClose(ev)) return;
    const rcSocket = getRoomConnectionSocket();
    if (rcSocket && ws && ws !== rcSocket) {
      return;
    }
    // Temporarily disabled at the request of the game developers.
    if (MiscService.AUTO_RECO_TEMPORARILY_DISABLED) return;
    if (!MiscService.readAutoRecoEnabled(false)) return;

    if (autoRecoTimer !== null) {
      clearTimeout(autoRecoTimer);
      autoRecoTimer = null;
    }
    clearAutoRecoOverlayAndCountdown();

    const delayMs = MiscService.getAutoRecoDelayMs();

    const runReconnect = () => {
      autoRecoTimer = null;
      if (!MiscService.readAutoRecoEnabled(false)) {
        clearAutoRecoOverlayAndCountdown();
        return;
      }
      clearAutoRecoOverlayAndCountdown();
      try {
        const conn = (pageWindow as any).MagicCircle_RoomConnection;
        const connect = conn?.connect;
        if (typeof connect === "function") {
          connect.call(conn);
        }
      } catch (error) {
        console.warn("[MagicGarden] Auto reco failed:", error);
      }
    };

    const triggerManualReconnect = () => {
      if (autoRecoTimer !== null) {
        clearTimeout(autoRecoTimer);
        autoRecoTimer = null;
      }
      runReconnect();
    };

    if (delayMs > 0) {
      autoRecoOverlay = createAutoRecoOverlay(delayMs, triggerManualReconnect);
      let remainingMs = delayMs;
      autoRecoCountdownInterval = window.setInterval(() => {
        remainingMs -= 1000;
        if (remainingMs < 0) remainingMs = 0;
        if (autoRecoOverlay) autoRecoOverlay.update(remainingMs);
        if (remainingMs <= 0) {
          clearAutoRecoOverlayAndCountdown();
        }
      }, 1000);
    }

    autoRecoTimer = window.setTimeout(() => {
      runReconnect();
    }, delayMs);
  });
}

/**
 * Intercept QuinoaCommand envelopes at the WebSocket.send level.
 *
 * The game no longer routes commands through RoomConnection.sendMessage: they
 * are wrapped in { type: "QuinoaCommand", requestId, command: {...} } and
 * written straight to the socket. Patching the native prototype covers every
 * socket instance, including reconnections. Interceptors stay keyed on the
 * inner command type (HarvestCrop, PurchaseShopItem, ...).
 */
function installQuinoaCommandSendInterceptor() {
  const proto = NativeWS.prototype as any;
  if (proto.__qwsSendPatched) return;

  const originalSend = proto.send;
  proto.send = function (this: WebSocket, data: any, ...rest: any[]) {
    try {
      if (
        typeof data === "string" &&
        interceptorsByType.size > 0 &&
        data.indexOf('"QuinoaCommand"') !== -1
      ) {
        const parsed = JSON.parse(data);
        const command =
          parsed?.type === "QuinoaCommand" && parsed.command && typeof parsed.command === "object"
            ? parsed.command
            : null;
        const type = command?.type;
        if (type) {
          const result = applyInterceptors(type, command, { thisArg: this, args: rest });
          if (result.drop) return;
          if (result.message !== command) {
            data = JSON.stringify({ ...parsed, command: result.message });
          }
        }
      }
    } catch (error) {
      console.error("[MG-mod] Erreur dans le hook WS send :", error);
    }
    return originalSend.call(this, data, ...rest);
  };
  proto.__qwsSendPatched = true;
}

export function installPageWebSocketHook() {
  if (!pageWindow || !NativeWS) return;

  startAutoReloadOnVersionExpired();
  startAutoReconnectOnSuperseded();
  installQuinoaCommandSendInterceptor();

  function WrappedWebSocket(this: any, url: string | URL, protocols?: string | string[]) {
    const ws: WebSocket =
      protocols !== undefined
        ? new NativeWS(url as any, protocols)
        : new NativeWS(url as any);
    sockets.push(ws);

    ws.addEventListener("open", () => {
      setTimeout(() => {
        if ((ws as any).readyState === NativeWS.OPEN) setQWS(ws, "open-fallback");
      }, 800);
    });

    ws.addEventListener("message", async (ev: MessageEvent) => {
      const j = await parseWSData(ev.data);
      if (!j) return;
      if (
        !hasSharedQuinoaWS() &&
        (j.type === "Welcome" || j.type === "Config" || j.fullState || j.config)
      ) {
        setQWS(ws, "message:" + (j.type || "state"));
      }
    });

    ws.addEventListener("close", (ev: CloseEvent) => {
      notifyWebSocketClose(ev, ws);
    });
    return ws;
  }

  (WrappedWebSocket as any).prototype = NativeWS.prototype;
  try { (WrappedWebSocket as any).OPEN = (NativeWS as any).OPEN; } catch {}
  try { (WrappedWebSocket as any).CLOSED = (NativeWS as any).CLOSED; } catch {}
  try { (WrappedWebSocket as any).CLOSING = (NativeWS as any).CLOSING; } catch {}
  try { (WrappedWebSocket as any).CONNECTING = (NativeWS as any).CONNECTING; } catch {}

  (pageWindow as any).WebSocket = WrappedWebSocket as any;
  if (pageWindow !== window) {
    try { (window as any).WebSocket = WrappedWebSocket as any; } catch {}
  }

  function hasSharedQuinoaWS() {
    const existing = readSharedGlobal<WebSocket | null>("quinoaWS");
    return !!existing;
  }

  function scheduleRoomConnectionFallback() {
    const FALLBACK_DELAY_MS = 5000;
    const win = pageWindow || (typeof window !== "undefined" ? window : null);
    if (!win) return;

    win.setTimeout(() => {
      try {
        if (hasSharedQuinoaWS()) return;
        const conn =
          (win as any).MagicCircle_RoomConnection ||
          readSharedGlobal<any>("MagicCircle_RoomConnection");
        const ws: WebSocket | undefined = conn?.currentWebSocket;
        if (ws && ws.readyState === NativeWS.OPEN) {
          setQWS(ws, "room-connection-fallback");
        }
      } catch (error) {
        console.warn("[MagicGarden] Room connection WS fallback failed", error);
      }
    }, FALLBACK_DELAY_MS);
  }

  scheduleRoomConnectionFallback();
  installHarvestCropInterceptor();
}

type ConnectionCtor = {
  sendMessage?: (message: unknown, ...rest: any[]) => unknown;
  prototype?: ConnectionCtor;
};

type ResolvedSendMessage =
  | { kind: "static" | "proto"; fn: (message: unknown, ...rest: any[]) => unknown }
  | null;

export type MessageInterceptorContext = {
  thisArg: unknown;
  args: any[];
};

export type MessageInterceptorResult =
  | void
  | { kind: "drop" }
  | { kind: "replace"; message: any };

export type MessageInterceptor = (
  message: any,
  context: MessageInterceptorContext
) => MessageInterceptorResult;

const interceptorsByType = new Map<string, MessageInterceptor[]>();

type AppliedInterceptorResult = { message: any; drop: boolean };

type InterceptorHookStatus = "idle" | "installing" | "installed";
let interceptorStatus: InterceptorHookStatus = readSharedGlobal<boolean>(
  "__tmMessageHookInstalled"
)
  ? "installed"
  : "idle";

let interceptorPoll: number | null = null;
let interceptorTimeout: number | null = null;

export function registerMessageInterceptor(
  type: string,
  interceptor: MessageInterceptor
): () => void {
  const list = interceptorsByType.get(type);
  if (list) {
    list.push(interceptor);
  } else {
    interceptorsByType.set(type, [interceptor]);
  }

  ensureMessageInterceptorInstalled();

  return () => {
    const current = interceptorsByType.get(type);
    if (!current) return;
    const index = current.indexOf(interceptor);
    if (index !== -1) current.splice(index, 1);
    if (current.length === 0) interceptorsByType.delete(type);
  };
}

function ensureMessageInterceptorInstalled() {
  if (interceptorStatus === "installed" || interceptorStatus === "installing") return;

  interceptorStatus = "installing";

  const tryInstall = () => {
    const Conn: ConnectionCtor | undefined =
      (pageWindow as any).MagicCircle_RoomConnection ||
      readSharedGlobal<ConnectionCtor>("MagicCircle_RoomConnection");
    if (!Conn) return false;

    const original = resolveSendMessage(Conn);
    if (!original) return false;

    const wrap = function (this: unknown, message: any, ...rest: any[]) {
      let currentMessage = message;

      try {
        // QuinoaCommand envelopes are intercepted at the WebSocket.send level
        // (installQuinoaCommandSendInterceptor) — skip them here so the
        // interceptors never run twice for the same command. Legacy flat
        // messages are still handled at this level.
        const isEnvelope =
          currentMessage?.type === "QuinoaCommand" &&
          currentMessage?.command &&
          typeof currentMessage.command === "object";
        const type = currentMessage?.type;
        if (!isEnvelope && type && interceptorsByType.size > 0) {
          const context: MessageInterceptorContext = { thisArg: this, args: rest };
          const result = applyInterceptors(type, currentMessage, context);
          if (result.drop) return;
          currentMessage = result.message;
        }
      } catch (error) {
        console.error("[MG-mod] Erreur dans le hook WS :", error);
      }

      return original.fn.call(this, currentMessage, ...rest);
    };

    if (original.kind === "static") {
      (Conn as any).sendMessage = wrap;
    } else {
      (Conn as any).prototype.sendMessage = wrap;
    }

    interceptorStatus = "installed";
    shareGlobal("__tmMessageHookInstalled", true);

    if (interceptorPoll !== null) {
      clearInterval(interceptorPoll);
      interceptorPoll = null;
    }
    if (interceptorTimeout !== null) {
      clearTimeout(interceptorTimeout);
      interceptorTimeout = null;
    }

    return true;
  };

  if (tryInstall()) return;

  interceptorPoll = window.setInterval(() => {
    if (tryInstall()) {
      if (interceptorPoll !== null) {
        clearInterval(interceptorPoll);
        interceptorPoll = null;
      }
    }
  }, 200);

  interceptorTimeout = window.setTimeout(() => {
    if (interceptorPoll !== null) {
      clearInterval(interceptorPoll);
      interceptorPoll = null;
    }
    if (interceptorStatus !== "installed") {
      interceptorStatus = "idle";
    }
    interceptorTimeout = null;
  }, 20000);
}

function applyInterceptors(
  type: string,
  initialMessage: any,
  context: MessageInterceptorContext
): AppliedInterceptorResult {
  const interceptors = interceptorsByType.get(type);
  if (!interceptors || interceptors.length === 0) {
    return { message: initialMessage, drop: false };
  }

  let currentMessage = initialMessage;
  for (const interceptor of [...interceptors]) {
    try {
      const result = interceptor(currentMessage, context);
      if (!result) continue;
      if (result.kind === "drop") {
        return { message: currentMessage, drop: true };
      }
      if (result.kind === "replace") {
        currentMessage = result.message;
      }
    } catch (error) {
    }
  }

  return { message: currentMessage, drop: false };
}

function installHarvestCropInterceptor() {
  if (readSharedGlobal<boolean>("__tmHarvestHookInstalled")) return;

  let latestGardenState: GardenState | null = null;
  let latestCurrentGardenObject: any = null;
  let friendBonusPercent: number | null = null;
  let friendBonusFromPlayers: number | null = null;
  let latestEggId: string | null = null;
  let latestInventoryCount = 0;
  const inventorySeeds = new Set<string>();
  const inventoryDecors = new Set<string>();
  const inventoryEggs = new Set<string>();
  const inventoryTools = new Set<string>();
  const INVENTORY_BLOCK_AT = 99;

  const refreshInventorySnapshot = (raw: any) => {
    const items = extractInventoryItems(raw);
    latestInventoryCount = items.length;
    inventorySeeds.clear();
    inventoryDecors.clear();
    inventoryEggs.clear();
    inventoryTools.clear();
    for (const entry of items) {
      if (!entry || typeof entry !== "object") continue;
      const source = (entry as any).item && typeof (entry as any).item === "object"
        ? (entry as any).item
        : entry;
      if (!source || typeof source !== "object") continue;
      const type = String(source.itemType ?? source.data?.itemType ?? "").toLowerCase();
      if (type === "seed" && source.species) inventorySeeds.add(String(source.species));
      if (type === "decor" && source.decorId) inventoryDecors.add(String(source.decorId));
      if (type === "egg" && source.eggId) inventoryEggs.add(String(source.eggId));
      if (type === "tool" && source.toolId) inventoryTools.add(String(source.toolId));
    }
  };

  const shouldBlockNewInventoryEntry = () =>
    MiscService.readInventorySlotReserveEnabled(false) && latestInventoryCount >= INVENTORY_BLOCK_AT;

  const shouldBlockPurchase = (kind: "seed" | "decor" | "egg" | "tool", id: unknown) => {
    if (!shouldBlockNewInventoryEntry()) return false;
    if (id == null) return true;
    const key = String(id);
    if (!key) return true;
    if (kind === "seed") return !inventorySeeds.has(key);
    if (kind === "decor") return !inventoryDecors.has(key);
    if (kind === "egg") return !inventoryEggs.has(key);
    return !inventoryTools.has(key);
  };

  void (async () => {
    try {
      latestGardenState = (await Atoms.data.garden.get()) ?? null;
    } catch {}
    try {
      await Atoms.data.garden.onChange((next) => {
        latestGardenState = (next as GardenState | null) ?? null;
      });
    } catch {}
    try {
      const initialObj = await Atoms.data.myCurrentGardenObject.get();
      latestCurrentGardenObject = initialObj;
      latestEggId = extractEggId(initialObj);
    } catch {}
    try {
      await Atoms.data.myCurrentGardenObject.onChange((next) => {
        latestCurrentGardenObject = next;
        latestEggId = extractEggId(next);
      });
    } catch {}
    try {
      refreshInventorySnapshot(await Atoms.inventory.myInventory.get());
    } catch {}
    try {
      await Atoms.inventory.myInventory.onChange((next) => {
        refreshInventorySnapshot(next);
      });
    } catch {}
  })();

  void (async () => {
    try {
      const initial = await Atoms.server.friendBonusMultiplier.get();
      friendBonusPercent = friendBonusPercentFromMultiplier(initial);
    } catch {}
    try {
      await Atoms.server.friendBonusMultiplier.onChange((next) => {
        friendBonusPercent = friendBonusPercentFromMultiplier(next);
      });
    } catch {}
    try {
      const initialPlayers = await Atoms.server.numPlayers.get();
      friendBonusFromPlayers = friendBonusPercentFromPlayers(initialPlayers);
    } catch {}
    try {
      await Atoms.server.numPlayers.onChange((next) => {
        friendBonusFromPlayers = friendBonusPercentFromPlayers(next);
      });
    } catch {}
  })();

  const resolveFriendBonusPercent = (): number | null =>
    friendBonusPercent ?? friendBonusFromPlayers ?? null;

  registerMessageInterceptor("HarvestCrop", (message) => {
    if (shouldBlockNewInventoryEntry()) {
      console.log("[HarvestCrop] Blocked by inventory reserve");
      return { kind: "drop" };
    }
    const slot = message.slot;
    const slotsIndex = message.slotsIndex;

    if (!Number.isInteger(slot as number) || !Number.isInteger(slotsIndex as number)) {
      return;
    }

    // Fail-closed fallback: when the tile cannot be resolved from the garden
    // atom below, rely on the locker's own current-slot assessment (fed by
    // myCurrentGardenObject + mySelectedSlotIdAtom — the pipeline that powers
    // the purple outline). A harvest targets the current selection, so a
    // negative assessment is enough to block instead of silently allowing.
    const blockedByCurrentSlotFallback = () => {
      try {
        if (!lockerService.getState().enabled) return false;
        return lockerService.getCurrentSlotSnapshot().harvestAllowed === false;
      } catch {
        return false;
      }
    };

    const garden = latestGardenState;
    const tileObjects = garden?.tileObjects;
    let tile: any = tileObjects ? (tileObjects[String(slot)] as any) : undefined;

    // In editor mode the tile view is updated directly (bypassing the garden atom),
    // so fall back to TOS which always reflects the current visual state.
    if ((!tile || typeof tile !== "object") && EditorService.isEnabled()) {
      try {
        const tosTile = tos.getTileObjectByIndex(slot as number);
        if (tosTile?.tileObject && typeof tosTile.tileObject === "object") {
          tile = tosTile.tileObject;
        }
      } catch {}
    }

    if (!tile || typeof tile !== "object" || tile.objectType !== "plant") {
      if (blockedByCurrentSlotFallback()) {
        console.log("[HarvestCrop] Blocked by locker (current-slot fallback, tile not found)", { slot, slotsIndex });
        return { kind: "drop" };
      }
      return;
    }

    // `slotsIndex` in the HarvestCrop message is the sub-slot's `slotId`
    // (sourced from mySelectedSlotIdAtom in the game), NOT its position in the
    // slots[] array. Sparse plants (Clover after harvest, Daisy, ...) have non-
    // contiguous slotIds (e.g. 0,2,3,4,5,7,10,12,15,18), so indexing the array
    // by slotsIndex returns the wrong sub or undefined.
    const slots = Array.isArray(tile.slots) ? tile.slots : [];
    const findBySlotId = (list: any[]): any =>
      list.find((s) => s && typeof s === "object" && s.slotId === slotsIndex) ?? null;
    const cropSlot = findBySlotId(slots) ?? slots[slotsIndex as number] ?? null;

    if (!cropSlot || typeof cropSlot !== "object") {
      if (blockedByCurrentSlotFallback()) {
        console.log("[HarvestCrop] Blocked by locker (current-slot fallback, sub-slot not found)", { slot, slotsIndex });
        return { kind: "drop" };
      }
      return;
    }

    // The garden atom now exposes per-sub species (e.g. "FourLeafClover" inside
    // a Clover tile), so use the actual sub-slot first. Fall back to
    // myCurrentGardenObject only when standing on the same tile (auto-harvest
    // fires from a distance — using the player's current tile data would resolve
    // a completely unrelated species, bypassing the locker).
    const currentObjSlots = Array.isArray(latestCurrentGardenObject?.slots)
      ? latestCurrentGardenObject.slots
      : [];
    const currentObjSlot = findBySlotId(currentObjSlots) ?? currentObjSlots[slotsIndex as number];
    const seedKey =
      extractSeedKey(cropSlot as any) ??
      extractSeedKey(currentObjSlot) ??
      extractSeedKey(tile);
    const sizePercent = extractSizePercent(cropSlot as PlantSlotTiming);
    const mutations = sanitizeMutations((cropSlot as PlantSlotTiming)?.mutations);

    const lockerEnabled = (() => {
      try {
        return lockerService.getState().enabled;
      } catch {
        return false;
      }
    })();

    if (lockerEnabled) {
      let harvestAllowed = true;

      try {
        harvestAllowed = lockerService.allowsHarvest({
          seedKey,
          sizePercent,
          mutations,
        });
      } catch {
        harvestAllowed = true;
      }

      if (!harvestAllowed) {
        console.log("[HarvestCrop] Blocked by locker", {
          slot,
          slotsIndex,
          seedKey,
          sizePercent,
          mutations,
        });
        return { kind: "drop" };
      }
    }

    StatsService.incrementGardenStat("totalHarvested");

    void (async () => {
      try {
        const garden = await Atoms.data.garden.get();
        const tileObjects = (garden as any)?.tileObjects ?? null;
        const tile = tileObjects ? tileObjects[String(slot)] : undefined;
        const subList = Array.isArray(tile?.slots) ? tile.slots : [];
        const cropSlot =
          subList.find((s: any) => s && typeof s === "object" && s.slotId === slotsIndex) ??
          subList[slotsIndex as number];
        console.log("[HarvestCrop]", {
          slot,
          slotsIndex,
          cropSlot,
        });
      } catch (error) {
        console.error("[HarvestCrop] Unable to log crop slot", error);
      }
    })();

    //return { kind: "drop" };
  });




  registerMessageInterceptor("RemoveGardenObject", (message) => {
    StatsService.incrementGardenStat("totalDestroyed");
  });

  registerMessageInterceptor("WaterPlant", (message) => {
    StatsService.incrementGardenStat("watercanUsed");
    StatsService.incrementGardenStat("waterTimeSavedMs", 5 * 60 * 1000);
  });

  registerMessageInterceptor("PlantSeed", (message) => {
    StatsService.incrementGardenStat("totalPlanted");
  });

  registerMessageInterceptor("PurchaseShopItem", (message) => {
    const shop: string | undefined = message?.shop;
    const item: any = message?.item ?? {};

    let kind: "seed" | "egg" | "tool" | "decor" | null = null;
    let id: string | undefined;
    let stat: "seedsBought" | "eggsBought" | "toolsBought" | "decorBought" | null = null;

    if (shop === "seed") {
      kind = "seed"; stat = "seedsBought";
      id = item.species ?? message?.species ?? message?.id;
    } else if (shop === "egg") {
      kind = "egg"; stat = "eggsBought";
      id = item.eggId ?? message?.eggId ?? message?.id;
    } else if (shop === "tool") {
      kind = "tool"; stat = "toolsBought";
      id = item.toolId ?? message?.toolId ?? message?.id;
    } else if (shop === "decor") {
      kind = "decor"; stat = "decorBought";
      id = item.decorId ?? message?.decorId ?? message?.id;
    }

    if (!kind) return;

    if (shouldBlockPurchase(kind, id)) {
      console.log(`[PurchaseShopItem:${shop}] Blocked by inventory reserve`, { id });
      return { kind: "drop" };
    }
    if (stat) StatsService.incrementShopStat(stat);
  });

  registerMessageInterceptor("PickupObject", () => {
    if (shouldBlockNewInventoryEntry()) {
      console.log("[PickupObject] Blocked by inventory reserve");
      return { kind: "drop" };
    }
  });

  registerMessageInterceptor("PickupDecor", () => {
    if (EditorService.isEnabled()) {
      try {
        const removeFn =
          readSharedGlobal<() => void>("qwsRemoveDecorFromGardenAtCurrentTile") ||
          (pageWindow as any).qwsRemoveDecorFromGardenAtCurrentTile;
        if (typeof removeFn === "function") {
          console.log("[PickupDecor][Editor] intercept -> local remove");
          removeFn();
          return { kind: "drop" };
        }
      } catch (err) {
        console.log("[PickupDecor][Editor] remove interceptor error", err);
      }
    }

    const decorLocked = lockerRestrictionsService.isDecorPickupLocked();
    if (decorLocked) {
      console.log("[PickupDecor] Blocked by decor picker");
      return { kind: "drop" };
    }
  });

  registerMessageInterceptor("HatchEgg", () => {
    if (shouldBlockNewInventoryEntry()) {
      console.log("[HatchEgg] Blocked by inventory reserve");
      return { kind: "drop" };
    }
    const locked = lockerRestrictionsService.isEggLocked(latestEggId);
    if (locked) {
      console.log("[HatchEgg] Blocked by egg locker", { eggId: latestEggId });
      void (async () => {
        try {
          await dedupeEggLockToast(latestEggId);
        } catch {}
      })();
      return { kind: "drop" };
    }

    void (async () => {
      const previousPets = await readInventoryPetSnapshots();
      const previousMap = buildPetMap(previousPets);

      const nextPets = await waitForInventoryPetAddition(previousMap);
      if (!nextPets) return;

      const newPets = extractNewPets(nextPets, previousMap);
      if (!newPets.length) return;

      for (const pet of newPets) {
        const rarity = inferPetRarity(pet.mutations);
        if (pet.species) {
          StatsService.incrementPetHatched(pet.species, rarity);
        }
      }
    })();
  });

  registerMessageInterceptor("SellAllCrops", (message) => {
    const restrictionState = lockerRestrictionsService.getState();
    const requiredPct = lockerRestrictionsService.getRequiredPercent();
    const requiredPlayers = restrictionState.minRequiredPlayers;
    const currentBonusPct = resolveFriendBonusPercent();
    const allowed = lockerRestrictionsService.allowsCropSale(currentBonusPct);

    if (!allowed) {
      const currentPlayers = currentBonusPct != null ? percentToRequiredFriendCount(currentBonusPct) : null;
      console.log("[SellAllCrops] Blocked by friend bonus restriction", {
        requiredPct,
        requiredPlayers,
        currentBonusPct,
        currentPlayers,
      });
      void (async () => {
        try {
          await toastSimple(
            "Friend bonus locker",
            `Require at least ${requiredPct}% friend bonus`,
            "error"
          );
        } catch {}
        void removeSellSuccessToast();
      })();
      return { kind: "drop" };
    }

    void (async () => {
      try {
        const items = await Atoms.inventory.myCropItemsToSell.get();
        const count = Array.isArray(items) ? items.length : 0;
        if (count > 0) {
          StatsService.incrementShopStat("cropsSoldCount", count);
        }
      } catch (error) {
        console.error("[SellAllCrops] Unable to read crop items", error);
      }

      try {
        const total = await Atoms.shop.totalCropSellPrice.get();
        const value = Number(total);
        if (Number.isFinite(value) && value > 0) {
          StatsService.incrementShopStat("cropsSoldValue", value);
        }
      } catch (error) {
        console.error("[SellAllCrops] Unable to read crop sell price", error);
      }
    })();
  });

  registerMessageInterceptor("SellPet", (message) => {
    StatsService.incrementShopStat("petsSoldCount");

    void (async () => {
      try {
        const total = await Atoms.pets.totalPetSellPrice.get();
        const value = Number(total);
        if (Number.isFinite(value) && value > 0) {
          StatsService.incrementShopStat("petsSoldValue", value);
        }
      } catch (error) {
        console.error("[SellPet] Unable to read pet sell price", error);
      }
    })();
  });

  shareGlobal("__tmHarvestHookInstalled", true);
}

function extractSeedKey(tile: any): string | null {
  if (!tile || typeof tile !== "object") return null;
  if (typeof tile.seedKey === "string" && tile.seedKey) return tile.seedKey;
  if (typeof tile.species === "string" && tile.species) return tile.species;
  const fallbacks = ["seedSpecies", "plantSpecies", "cropSpecies", "speciesId"];
  for (const key of fallbacks) {
    const value = tile[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

const normalizeSpeciesKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/(seed|plant|baby|fruit|crop)$/i, "");

const MAX_SCALE_BY_SPECIES = (() => {
  const map = new Map<string, number>();
  const register = (key: unknown, value: number) => {
    if (typeof key !== "string") return;
    const normalized = normalizeSpeciesKey(key.trim());
    if (!normalized || map.has(normalized)) return;
    map.set(normalized, value);
  };

  for (const [species, entry] of Object.entries(plantCatalog as Record<string, any>)) {
    const maxScale = Number(entry?.crop?.maxScale);
    if (!Number.isFinite(maxScale) || maxScale <= 0) continue;
    register(species, maxScale);
    register(entry?.seed?.name, maxScale);
    register(entry?.plant?.name, maxScale);
    register(entry?.crop?.name, maxScale);
  }

  return map;
})();

function lookupMaxScale(species: unknown): number | null {
  if (typeof species !== "string") return null;
  const normalized = normalizeSpeciesKey(species.trim());
  if (!normalized) return null;
  const found = MAX_SCALE_BY_SPECIES.get(normalized);
  if (typeof found === "number" && Number.isFinite(found) && found > 0) {
    return found;
  }
  return null;
}

function getMaxScaleForSlot(slot: any): number | null {
  if (!slot || typeof slot !== "object") return null;
  const candidates = new Set<string>();
  const fromSeedKey = extractSeedKey(slot as any);
  if (fromSeedKey) candidates.add(fromSeedKey);
  const fields = [
    "species",
    "seedSpecies",
    "plantSpecies",
    "cropSpecies",
    "baseSpecies",
    "seedKey",
  ];
  for (const field of fields) {
    const value = (slot as Record<string, unknown>)[field];
    if (typeof value === "string" && value) {
      candidates.add(value);
    }
  }
  for (const cand of candidates) {
    const max = lookupMaxScale(cand);
    if (typeof max === "number" && Number.isFinite(max) && max > 0) {
      return max;
    }
  }
  return null;
}

function extractSizePercent(slot: PlantSlotTiming | undefined): number {
  if (!slot || typeof slot !== "object") return 100;
  const direct = Number(
    (slot as any).sizePercent ?? (slot as any).sizePct ?? (slot as any).size ?? (slot as any).percent ?? (slot as any).progressPercent
  );
  if (Number.isFinite(direct)) {
    return clampPercent(Math.round(direct), 0, 100);
  }
  const scale = Number((slot as any).targetScale ?? (slot as any).scale);
  if (Number.isFinite(scale)) {
    const maxScale = getMaxScaleForSlot(slot);
    if (typeof maxScale === "number" && Number.isFinite(maxScale) && maxScale > 1) {
      const clamped = Math.max(1, Math.min(maxScale, scale));
      const pct = 50 + ((clamped - 1) / (maxScale - 1)) * 50;
      return clampPercent(Math.round(pct), 50, 100);
    }
    if (scale > 1 && scale <= 2) {
      const pct = 50 + ((scale - 1) / 1) * 50;
      return clampPercent(Math.round(pct), 50, 100);
    }
    const pct = Math.round(scale * 100);
    return clampPercent(pct, 0, 100);
  }
  return 100;
}

function sanitizeMutations(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const value = raw[i];
    if (typeof value === "string") {
      if (value) out.push(value);
    } else if (value != null) {
      const str = String(value);
      if (str) out.push(str);
    }
  }
  return out;
}

function clampPercent(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type InventoryPetSnapshot = {
  id: string;
  species: string;
  mutations: string[];
};

const HATCH_EGG_TIMEOUT_MS = 5000;

async function readInventoryPetSnapshots(): Promise<InventoryPetSnapshot[]> {
  try {
    const inventory = await Atoms.inventory.myInventory.get();
    return collectInventoryPets(inventory);
  } catch (error) {
    console.error("[HatchEgg] Unable to read inventory", error);
    return [];
  }
}

function collectInventoryPets(rawInventory: any): InventoryPetSnapshot[] {
  const items = extractInventoryItems(rawInventory);
  const pets: InventoryPetSnapshot[] = [];
  for (const entry of items) {
    const pet = toInventoryPet(entry);
    if (pet) pets.push(pet);
  }
  return pets;
}

function extractInventoryItems(rawInventory: any): any[] {
  if (!rawInventory) return [];
  if (Array.isArray(rawInventory)) return rawInventory;
  if (Array.isArray(rawInventory.items)) return rawInventory.items;
  if (Array.isArray(rawInventory.inventory)) return rawInventory.inventory;
  if (Array.isArray(rawInventory.inventory?.items)) return rawInventory.inventory.items;
  return [];
}

function toInventoryPet(entry: any): InventoryPetSnapshot | null {
  if (!entry || typeof entry !== "object") return null;
  const source = (entry as any).item && typeof (entry as any).item === "object"
    ? (entry as any).item
    : entry;
  if (!source || typeof source !== "object") return null;
  const type = (source.itemType ?? source.data?.itemType ?? "") as string;
  if (String(type).toLowerCase() !== "pet") return null;

  const id = source.id ?? source.data?.id;
  const species = source.petSpecies ?? source.data?.petSpecies;
  if (!id || !species) return null;

  const mutations = sanitizeMutations(source.mutations ?? source.data?.mutations);

  return {
    id: String(id),
    species: String(species),
    mutations,
  };
}

function buildPetMap(pets: InventoryPetSnapshot[]): Map<string, InventoryPetSnapshot> {
  const map = new Map<string, InventoryPetSnapshot>();
  for (const pet of pets) {
    map.set(pet.id, pet);
  }
  return map;
}

function extractNewPets(
  pets: InventoryPetSnapshot[],
  previous: Map<string, InventoryPetSnapshot>
): InventoryPetSnapshot[] {
  return pets.filter(pet => !previous.has(pet.id));
}

function extractEggId(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;
  if (obj.objectType !== "egg") return null;
  const eggId = (obj as any).eggId;
  return typeof eggId === "string" && eggId ? eggId : null;
}

async function dedupeEggLockToast(latestEggId: string | null) {
  const toastsAtom = getAtomByLabel("quinoaToastsAtom");
  const description = latestEggId
    ? `Hatching locked for ${latestEggId}`
    : "Hatching locked by egg locker";

  if (!toastsAtom) {
    await toastSimple("Egg hatch locker", description, "error");
    return;
  }

  const list = await jGet<any[]>(toastsAtom).catch(() => []) as any[];
  const filtered = Array.isArray(list)
    ? list.filter((t) => !(t?.title === "Egg hatch locker"))
    : [];
  filtered.push({
    isClosable: true,
    duration: 3500,
    title: "Egg hatch locker",
    description,
    variant: "error",
    id: "quinoa-game-toast",
  });
  await jSet(toastsAtom, filtered);
}

function inferPetRarity(mutations: string[]): "normal" | "gold" | "rainbow" {
  if (!Array.isArray(mutations) || mutations.length === 0) {
    return "normal";
  }

  const seen = new Set(mutations.map(m => String(m).toLowerCase()));
  if (seen.has("rainbow")) return "rainbow";
  if (seen.has("gold") || seen.has("golden")) return "gold";
  return "normal";
}

async function waitForInventoryPetAddition(
  previous: Map<string, InventoryPetSnapshot>,
  timeoutMs = HATCH_EGG_TIMEOUT_MS
): Promise<InventoryPetSnapshot[] | null> {
  await delay(0);

  const initial = await readInventoryPetSnapshots();
  if (hasNewInventoryPet(initial, previous)) {
    return initial;
  }

  return new Promise(async (resolve) => {
    let settled = false;
    let unsub: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finalize = (value: InventoryPetSnapshot[] | null) => {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      if (unsub) {
        try { unsub(); } catch {}
      }
      resolve(value);
    };

    const evaluate = (source: any) => {
      const pets = collectInventoryPets(source);
      if (hasNewInventoryPet(pets, previous)) {
        finalize(pets);
      }
    };

    try {
      unsub = await Atoms.inventory.myInventory.onChange((next) => {
        evaluate(next);
      });
    } catch (error) {
      console.error("[HatchEgg] Unable to observe inventory", error);
      finalize(null);
      return;
    }

    timer = setTimeout(() => {
      void (async () => {
        const latest = await readInventoryPetSnapshots();
        if (hasNewInventoryPet(latest, previous)) {
          finalize(latest);
        } else {
          finalize(null);
        }
      })();
    }, timeoutMs);
  });
}

function hasNewInventoryPet(
  pets: InventoryPetSnapshot[],
  previous: Map<string, InventoryPetSnapshot>
): boolean {
  return pets.some(pet => !previous.has(pet.id));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveSendMessage(Conn: ConnectionCtor): ResolvedSendMessage {
  const isFn = (value: unknown): value is (...args: any[]) => any =>
    typeof value === "function";

  if (isFn(Conn.sendMessage)) {
    return { kind: "static" as const, fn: Conn.sendMessage.bind(Conn) };
  }

  if (Conn.prototype && isFn(Conn.prototype.sendMessage)) {
    return { kind: "proto" as const, fn: Conn.prototype.sendMessage };
  }

  return null;
}

async function removeSellSuccessToast(): Promise<void> {
  try {
    const toastsAtom = getAtomByLabel("quinoaToastsAtom");
    if (!toastsAtom) return;
    const list = await jGet<any[]>(toastsAtom).catch(() => []) as any[];
    const filtered = Array.isArray(list)
      ? list.filter((t) => {
          if (!t || typeof t !== "object") return true;
          if (t.variant !== "success") return true;
          const icon = (t as any).icon;
          const isTileSell = icon?.type === "tile" && icon?.spritesheet === "items" && Number(icon?.index) === 11;
          const hasCropText = !!(t as any)?.description?.props?.values?.cropText;
          return !(isTileSell || hasCropText);
        })
      : list;
    if (filtered.length !== list.length) {
      await jSet(toastsAtom, filtered);
    }
  } catch {
    /* ignore cleanup errors */
  }
}
