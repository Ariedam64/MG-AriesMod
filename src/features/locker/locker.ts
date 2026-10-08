// The Harvest Locker: its saved state, which settings apply to a species, and
// the verdict on the crop the player has selected.

import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { Emitter } from "../../lib/emitter";
import { harvestAllowedBy, type HarvestCandidate } from "./harvestRules";
import {
  cloneState,
  defaultState,
  sanitizeSettings,
  sanitizeState,
  type LockerOverridePersisted,
  type LockerSettingsPersisted,
  type LockerStatePersisted,
} from "./settings";
import { emptySlotInfo, startLockerSlotWatcher, type LockerSlotInfo, type LockerSlotWatcher } from "./slotWatcher";

export type { LockerSettingsPersisted } from "./settings";

const STATE_PATH = "locker.state";

type HarvestCheckArgs = HarvestCandidate & { seedKey: string | null };

type LockerSlotEvent = {
  info: LockerSlotInfo;
  /** null when the locker is off or nothing harvestable is selected. */
  harvestAllowed: boolean | null;
};

class LockerService {
  private state: LockerStatePersisted = defaultState();
  private readonly stateChanges = new Emitter<LockerStatePersisted>();
  private readonly slotChanges = new Emitter<LockerSlotEvent>();
  private slotWatcher: LockerSlotWatcher | null = null;
  private currentSlot: LockerSlotEvent = { info: emptySlotInfo(), harvestAllowed: null };

  constructor() {
    this.load();
    this.syncSlotWatcher();
  }

  private load(): void {
    if (typeof window === "undefined") return;
    try {
      this.state = sanitizeState(readAriesPath<unknown>(STATE_PATH));
    } catch {
      this.state = defaultState();
    }
  }

  private setState(next: LockerStatePersisted): void {
    this.state = next;
    if (typeof window !== "undefined") {
      try {
        writeAriesPath(STATE_PATH, this.state);
      } catch {}
    }
    this.syncSlotWatcher();
    this.stateChanges.emit(this.getState());
  }

  /** The watcher only runs while the locker is on; it is judged again on every settings change. */
  private syncSlotWatcher(): void {
    if (this.state.enabled && !this.slotWatcher) {
      this.slotWatcher = startLockerSlotWatcher();
      this.slotWatcher.onChange((info) => this.judgeSlot(info, true));
    } else if (!this.state.enabled && this.slotWatcher) {
      this.slotWatcher.stop();
      this.slotWatcher = null;
    }
    this.judgeSlot(this.slotWatcher?.get() ?? emptySlotInfo(), false);
  }

  private judgeSlot(info: LockerSlotInfo, log: boolean): void {
    let harvestAllowed: boolean | null = null;
    if (info.isPlant && info.slot) {
      try {
        harvestAllowed = this.allowsHarvest({
          seedKey: info.seedKey,
          sizePercent: info.sizePercent ?? 0,
          mutations: info.mutations,
        });
      } catch {
        harvestAllowed = null;
      }
    }
    if (log) console.log("[Locker] Slot selection", { ...info, harvestAllowed });
    this.currentSlot = { info, harvestAllowed };
    this.slotChanges.emit(this.currentSlot);
  }

  getState(): LockerStatePersisted {
    return cloneState(this.state);
  }

  isEnabled(): boolean {
    return this.state.enabled;
  }

  setGlobalState(next: { enabled: boolean; settings: LockerSettingsPersisted }): void {
    this.setState({ enabled: !!next.enabled, settings: sanitizeSettings(next.settings), overrides: { ...this.state.overrides } });
  }

  setOverride(seedKey: string, override: LockerOverridePersisted): void {
    if (!seedKey) return;
    const sanitized = { enabled: !!override?.enabled, settings: sanitizeSettings(override?.settings) };
    this.setState({ ...this.state, overrides: { ...this.state.overrides, [seedKey]: sanitized } });
  }

  removeOverride(seedKey: string): void {
    if (!seedKey || !(seedKey in this.state.overrides)) return;
    const overrides = { ...this.state.overrides };
    delete overrides[seedKey];
    this.setState({ ...this.state, overrides });
  }

  subscribe(listener: (state: LockerStatePersisted) => void): () => void {
    return this.stateChanges.on(listener);
  }

  onSlotInfoChange(listener: (event: LockerSlotEvent) => void): () => void {
    return this.slotChanges.on(listener);
  }

  /** The verdict on the selected crop: null when the locker is off or nothing harvestable is selected. */
  currentHarvestAllowed(): boolean | null {
    return this.currentSlot.harvestAllowed;
  }

  /** A species override that is switched on replaces the global settings. */
  private settingsFor(seedKey: string | null): LockerSettingsPersisted {
    const override = seedKey ? this.state.overrides[seedKey] : undefined;
    return override?.enabled ? override.settings : this.state.settings;
  }

  allowsHarvest(args: HarvestCheckArgs): boolean {
    if (!this.state.enabled) return true;
    return harvestAllowedBy(this.settingsFor(args.seedKey), args);
  }
}

export const lockerService = new LockerService();
