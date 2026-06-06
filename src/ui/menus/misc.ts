// src/ui/menus/misc.ts
import { Menu } from "../menu";
import { MiscService, DEFAULT_SEED_DELETE_DELAY_MS, DEFAULT_DECOR_DELETE_DELAY_MS } from "../../services/misc";
import { Atoms } from "../../store/atoms";

/* ---------------- helpers ---------------- */
const formatShortDuration = (seconds: number) => {
  if (seconds <= 0) return "Instant";
  const sec = Math.max(0, Math.round(seconds));
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  if (r === 0) return `${m} min`;
  return `${m} min ${r} s`;
};

/* ---------------- number formatting (US) ---------------- */
const NF_US = new Intl.NumberFormat("en-US");
const formatNum = (n: number) => NF_US.format(Math.max(0, Math.floor(n || 0)));

const formatDurationShort = (ms: number): string => {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)} s`;
  return `${Math.round(seconds)} s`;
};

const formatFinishTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS = 10;

const buildEstimateSentence = (count: number, delayMs: number, finishTimestamp: number | null): string => {
  if (count <= 0 || delayMs <= 0) return "";
  const durationMs = count * (delayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
  const durationText = formatDurationShort(durationMs);
  if (!finishTimestamp) return ` · Estimated time ${durationText}`;
  return ` · Estimated time ${durationText} (${formatFinishTime(finishTimestamp)})`;
};

/* ---------------- entry ---------------- */

export async function renderMiscMenu(container: HTMLElement) {
  const ui = new Menu({ id: "misc", compact: true });
  ui.mount(container);

  const view = ui.root.querySelector(".qmm-views") as HTMLElement;
  view.innerHTML = "";
  view.style.display = "grid";
  view.style.minHeight = "0";
  view.style.justifyItems = "center";
  view.style.padding = "8px 0";

  const applyStyles = <T extends HTMLElement>(el: T, styles: Partial<CSSStyleDeclaration>): T => {
    Object.assign(el.style, styles);
    return el;
  };

  const createPill = (text: string) => {
    const pill = applyStyles(document.createElement("div"), {
      padding: "3px 8px",
      borderRadius: "999px",
      border: "1px solid #2b3340",
      background: "#141b22",
      fontSize: "12px",
      fontWeight: "600",
      color: "#dbe7ff",
      whiteSpace: "nowrap",
    });
    pill.textContent = text;
    return pill;
  };

  const createSettingRow = (title: string, description: string | null, control: HTMLElement) => {
    const row = applyStyles(document.createElement("div"), {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      alignItems: "center",
      gap: "12px",
      padding: "10px 12px",
      border: "1px solid #2b3340",
      borderRadius: "10px",
      background: "#0f1318",
    });

    const text = applyStyles(document.createElement("div"), {
      display: "grid",
      gap: "2px",
    });

    const titleEl = document.createElement("div");
    titleEl.textContent = title;
    titleEl.style.fontWeight = "600";
    titleEl.style.fontSize = "13px";
    text.appendChild(titleEl);

    if (description) {
      const desc = document.createElement("div");
      desc.textContent = description;
      desc.style.fontSize = "12px";
      desc.style.opacity = "0.72";
      text.appendChild(desc);
    }

    const controls = applyStyles(document.createElement("div"), {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "8px",
      flexWrap: "wrap",
    });
    controls.appendChild(control);

    row.append(text, controls);
    return { row, controls };
  };

  const styleCard = (card: ReturnType<typeof ui.card>) => {
    card.root.style.width = "100%";
    card.root.style.maxWidth = "100%";
    card.root.style.minWidth = "0";
    card.body.style.display = "grid";
    card.body.style.gap = "10px";
  };

  const header = applyStyles(document.createElement("div"), {
    width: "100%",
    maxWidth: "1040px",
    display: "grid",
    gap: "4px",
    padding: "10px 14px",
    borderRadius: "12px",
    border: "1px solid #2b3340",
    background: "linear-gradient(135deg, #1c222b 0%, #121820 100%)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
  });

  const headerTitle = document.createElement("div");
  headerTitle.textContent = "Misc controls";
  headerTitle.style.fontSize = "16px";
  headerTitle.style.fontWeight = "700";

  const headerSubtitle = document.createElement("div");
  headerSubtitle.textContent = "Utility toggles and bulk tools.";
  headerSubtitle.style.fontSize = "12.5px";
  headerSubtitle.style.opacity = "0.75";

  header.append(headerTitle, headerSubtitle);

  const page = applyStyles(document.createElement("div"), {
    width: "100%",
    maxWidth: "1040px",
    display: "grid",
    gap: "12px",
    alignItems: "start",
  });

  const grid = applyStyles(document.createElement("div"), {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "12px",
    width: "100%",
    alignItems: "start",
  });

/* ===== Section: Auto reco ===== */
  const secAutoReco = (() => {
    const card = ui.card("Auto reconnect", {
      tone: "muted",
      align: "stretch",
      subtitle: "Reconnect automatically when the session is kicked.",
    });
    styleCard(card);

    const featureDisabled = MiscService.AUTO_RECO_TEMPORARILY_DISABLED;

    const toggle = ui.switch(
      featureDisabled ? false : MiscService.readAutoRecoEnabled(false),
    ) as HTMLInputElement;
    if (featureDisabled) toggle.disabled = true;
    const toggleRow = createSettingRow(
      "Enabled",
      "Attempts to log back in after a session conflict.",
      toggle,
    );

    const initialSeconds = Math.round(MiscService.getAutoRecoDelayMs() / 1000);
    const slider = ui.slider(0, 300, 30, initialSeconds) as HTMLInputElement;
    slider.style.width = "100%";
    const sliderValue = createPill(formatShortDuration(initialSeconds));
    sliderValue.style.minWidth = "72px";
    sliderValue.style.textAlign = "center";

    const sliderControl = applyStyles(document.createElement("div"), {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: "8px",
      alignItems: "center",
      minWidth: "220px",
    });
    sliderControl.append(slider, sliderValue);

    const sliderRow = createSettingRow(
      "Delay",
      "Wait time before reconnecting.",
      sliderControl,
    );

    const hint = document.createElement("div");
    hint.style.opacity = "0.8";
    hint.style.fontSize = "12px";
    hint.style.lineHeight = "1.35";

    const clampSeconds = (value: number) =>
      Math.max(0, Math.min(300, Math.round(value / 30) * 30));

    const syncToggle = () => {
      if (featureDisabled) {
        toggle.checked = false;
        slider.disabled = true;
        hint.textContent =
          "Auto reconnect has been temporarily disabled at the request of the game developers. It will most likely come back later.";
        return;
      }
      const on = !!toggle.checked;
      slider.disabled = !on;
      MiscService.writeAutoRecoEnabled(on);
      hint.textContent = on
        ? "Automatically log back in if this account is disconnected because it was opened in another session."
        : "Auto reconnect on session conflict is turned off.";
    };

    const updateSlider = (raw: number, persist: boolean) => {
      const seconds = clampSeconds(raw);
      slider.value = String(seconds);
      sliderValue.textContent = formatShortDuration(seconds);
      if (persist) MiscService.setAutoRecoDelayMs(seconds * 1000);
      syncToggle();
    };

    toggle.addEventListener("change", syncToggle);
    slider.addEventListener("input", () => updateSlider(Number(slider.value), false));
    slider.addEventListener("change", () => updateSlider(Number(slider.value), true));

    syncToggle();

    card.body.append(toggleRow.row, sliderRow.row, hint);
    return card.root;
  })();

/* ===== Section: Player controls ===== */
  const secPlayer = (() => {
    const card = ui.card("Player controls", {
      tone: "muted",
      align: "stretch",
      subtitle: "Movement helpers for walking and testing.",
    });
    styleCard(card);

    const ghostSwitch = ui.switch(MiscService.readGhostEnabled(false)) as HTMLInputElement;
    (ghostSwitch as any).id = "player.ghostMode";

    const delayInput = ui.inputNumber(10, 1000, 5, 50) as HTMLInputElement;
    (delayInput as any).id = "player.moveDelay";
    const delayWrap = ((delayInput as any).wrap ?? delayInput) as HTMLElement;
    (delayWrap as any).style && ((delayWrap as any).style.margin = "0");
    (delayInput as any).style && ((delayInput as any).style.width = "84px");

    const ghostRow = createSettingRow(
      "Ghost mode",
      "Ignores collisions while you move.",
      ghostSwitch as unknown as HTMLElement,
    );

    const delayRow = createSettingRow(
      "Move delay (ms)",
      "Lower values feel faster.",
      delayWrap,
    );

    const ghost = MiscService.createGhostController();
    delayInput.value = String(MiscService.getGhostDelayMs());
    delayInput.addEventListener("change", () => {
      const v = Math.max(10, Math.min(1000, Math.floor(Number(delayInput.value) || 50)));
      delayInput.value = String(v);
      ghost.setSpeed?.(v);
      MiscService.setGhostDelayMs(v);
    });

    if (ghostSwitch.checked) ghost.start();
    ghostSwitch.onchange = () => {
      const on = !!ghostSwitch.checked;
      MiscService.writeGhostEnabled(on);
      on ? ghost.start() : ghost.stop();
    };

    (card.root as any).__cleanup__ = () => { try { ghost.stop(); } catch {} };

    card.body.append(ghostRow.row, delayRow.row);
    return card.root;
  })();
 /* ===== Section: Inventory slot reserve ===== */
  const secInventoryReserve = (() => {
    const card = ui.card("Inventory guard", {
      tone: "muted",
      align: "stretch",
      subtitle: "Keep a slot open for swaps and bulk actions.",
    });
    styleCard(card);

    const toggle = ui.switch(MiscService.readInventorySlotReserveEnabled(false)) as HTMLInputElement;
    const row = createSettingRow(
      "Keep 1 slot free",
      "Blocks actions that would add a new inventory entry at 99/100.",
      toggle,
    );

    toggle.addEventListener("change", () => {
      MiscService.writeInventorySlotReserveEnabled(!!toggle.checked);
    });

    card.body.append(row.row);
    return card.root;
  })();
/* ===== Section: Storage auto-store ===== */
  const secStorage = (() => {
    const card = ui.card("Storage auto-store", {
      tone: "muted",
      align: "stretch",
      subtitle: "Move items into storage when a matching stack already exists.",
    });
    styleCard(card);

    const seedToggle = ui.switch(MiscService.readAutoStoreSeedSiloEnabled(false)) as HTMLInputElement;
    const seedRow = createSettingRow(
      "Seed Silo",
      "Auto-store seeds when the species already exists in the silo.",
      seedToggle,
    );

    const decorToggle = ui.switch(MiscService.readAutoStoreDecorShedEnabled(false)) as HTMLInputElement;
    const decorRow = createSettingRow(
      "Decor Shed",
      "Auto-store decor when the item already exists in the shed.",
      decorToggle,
    );

    seedToggle.addEventListener("change", () => {
      MiscService.setAutoStoreSeedSiloEnabled(!!seedToggle.checked);
    });

    decorToggle.addEventListener("change", () => {
      MiscService.setAutoStoreDecorShedEnabled(!!decorToggle.checked);
    });

    card.body.append(seedRow.row, decorRow.row);
    return card.root;
  })();
 /* ===== Section: Seed deleter ===== */
  const secSeed = (() => {
    const grid = applyStyles(document.createElement("div"), {
      display: "grid",
      gap: "10px",
    });

    const selValue = createPill("0 species - 0 seeds");
    selValue.id = "misc.seedDeleter.summary";
    const summaryRow = createSettingRow(
      "Selected",
      "Review the current seed selection before deleting.",
      selValue,
    );
    grid.append(summaryRow.row);

    const actions = ui.flexRow({ gap: 6 });
    actions.style.flexWrap = "wrap";
    const btnSelect = ui.btn("Select seeds", { variant: "primary", size: "sm" });
    const btnDelete = ui.btn("Delete", { variant: "danger", size: "sm", disabled: true });
    const btnClear = ui.btn("Clear", { size: "sm", disabled: true });

    actions.append(btnSelect, btnDelete, btnClear);
    const actionsRow = createSettingRow(
      "Actions",
      "Pick, clear, or delete the selected seeds.",
      actions,
    );
    grid.append(actionsRow.row);

    const statusLine = createPill("Idle");
    statusLine.style.fontWeight = "600";

    const controlRow = ui.flexRow({ gap: 6 });
    controlRow.style.flexWrap = "wrap";
    const btnPause = ui.btn("Pause", { size: "sm" });
    const btnPlay = ui.btn("Play", { size: "sm" });
    const btnStop = ui.btn("Stop", { size: "sm", variant: "ghost" });
    btnPause.onclick = () => { MiscService.pauseSeedDeletion(); updateSeedControlState(); };
    btnPlay.onclick = () => { MiscService.resumeSeedDeletion(); updateSeedControlState(); };
    btnStop.onclick = () => { MiscService.cancelSeedDeletion(); updateSeedControlState(); };
    controlRow.append(btnPause, btnPlay, btnStop);

    const statusControls = applyStyles(document.createElement("div"), {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      flexWrap: "wrap",
      justifyContent: "flex-end",
    });
    statusControls.append(controlRow, statusLine);

    const statusRow = createSettingRow(
      "Status",
      "Pause or stop the current delete flow.",
      statusControls,
    );
    grid.append(statusRow.row);

    const seedStatus = { species: "-", done: 0, total: 0, remaining: 0 };
    const describeSeedStatus = () => {
      const running = MiscService.isSeedDeletionRunning();
      const paused = MiscService.isSeedDeletionPaused();
      const target = seedStatus.species || "-";
      const base = `${target} (${seedStatus.done}/${seedStatus.total})`;
      if (!running) return "Idle";
      return paused ? `Paused - ${base}` : base;
    };
    const updateSeedStatusUI = () => {
      statusLine.textContent = describeSeedStatus();
    };
    const updateSeedControlState = () => {
      const running = MiscService.isSeedDeletionRunning();
      const paused = MiscService.isSeedDeletionPaused();
      btnPause.disabled = !running || paused;
      btnPlay.disabled = !running || !paused;
      btnStop.disabled = !running;
      updateSeedStatusUI();
    };

    let seedEstimatedFinish: number | null = null;
    let seedSummaryTimer: number | null = null;
    const clearSeedSummaryTimer = () => {
      if (seedSummaryTimer !== null) {
        clearTimeout(seedSummaryTimer);
        seedSummaryTimer = null;
      }
    };
    const scheduleSeedSummaryRefresh = () => {
      clearSeedSummaryTimer();
      seedSummaryTimer = window.setTimeout(() => updateSummaryUI(), 1000);
    };

    const onSeedProgress = (event: CustomEvent) => {
      const detail = event.detail;
      seedStatus.species = detail.species;
      seedStatus.done = detail.done;
      seedStatus.total = detail.total;
      seedStatus.remaining = detail.remainingForSpecies;
      updateSeedStatusUI();
      updateSeedControlState();
    };
    const onSeedComplete = () => {
      seedStatus.species = "-";
      seedStatus.done = 0;
      seedStatus.total = 0;
      seedStatus.remaining = 0;
      updateSeedStatusUI();
      updateSeedControlState();
    };
    const onSeedPaused = () => updateSeedControlState();
    const onSeedResumed = () => updateSeedControlState();
    window.addEventListener("qws:seeddeleter:progress", onSeedProgress as EventListener);
    window.addEventListener("qws:seeddeleter:done", onSeedComplete as EventListener);
    window.addEventListener("qws:seeddeleter:error", onSeedComplete as EventListener);
    window.addEventListener("qws:seeddeleter:paused", onSeedPaused as EventListener);
    window.addEventListener("qws:seeddeleter:resumed", onSeedResumed as EventListener);
    const cleanupSeedListeners = () => {
      window.removeEventListener("qws:seeddeleter:progress", onSeedProgress as EventListener);
      window.removeEventListener("qws:seeddeleter:done", onSeedComplete as EventListener);
      window.removeEventListener("qws:seeddeleter:error", onSeedComplete as EventListener);
      window.removeEventListener("qws:seeddeleter:paused", onSeedPaused as EventListener);
      window.removeEventListener("qws:seeddeleter:resumed", onSeedResumed as EventListener);
    };

    updateSeedStatusUI();
    updateSeedControlState();

    function readSelection() {
      const sel = MiscService.getCurrentSeedSelection?.() || [];
      const speciesCount = sel.length;
      let totalQty = 0;
      for (const it of sel) totalQty += Math.max(0, Math.floor(it?.qty || 0));
      return { sel, speciesCount, totalQty };
    }
    function updateSummaryUI() {
      const { speciesCount, totalQty } = readSelection();
      const seedDelayMs = DEFAULT_SEED_DELETE_DELAY_MS;
      const estimateMs = totalQty * (seedDelayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
      const isRunning = MiscService.isSeedDeletionRunning();
      const finishTimestamp = isRunning
        ? seedEstimatedFinish
        : estimateMs > 0
          ? Date.now() + estimateMs
          : null;
      const estimateText = buildEstimateSentence(totalQty, seedDelayMs, finishTimestamp);
      selValue.textContent = `${speciesCount} species - ${formatNum(totalQty)} seeds${estimateText}`;
      const has = speciesCount > 0 && totalQty > 0;
      ui.setButtonEnabled(btnDelete, has);
      ui.setButtonEnabled(btnClear, has);
      if (!isRunning && totalQty > 0) {
        scheduleSeedSummaryRefresh();
      } else {
        clearSeedSummaryTimer();
      }
    }

    btnSelect.onclick = async () => {
      try {
        await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null);
      } catch {}
      await MiscService.openSeedSelectorFlow(ui.setWindowVisible.bind(ui));
      updateSummaryUI();
    };
    btnClear.onclick = () => {
      try { MiscService.clearSeedSelection?.(); } catch {}
      updateSummaryUI();
    };
    btnDelete.onclick = async () => {
      const { totalQty } = readSelection();
      const seedDelayMs = DEFAULT_SEED_DELETE_DELAY_MS;
      const estimateMs = totalQty * (seedDelayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
      seedEstimatedFinish = estimateMs > 0 ? Date.now() + estimateMs : null;
      clearSeedSummaryTimer();
      const deletionPromise = MiscService.deleteSelectedSeeds({ delayMs: seedDelayMs });
      updateSummaryUI();
      await deletionPromise;
      seedEstimatedFinish = null;
      updateSummaryUI();
    };

    const card = ui.card("Seed deleter", {
      tone: "muted",
      align: "stretch",
      subtitle: "Bulk delete seeds from inventory.",
    });
    styleCard(card);
    card.body.append(grid);
    (card.root as any).__cleanup__ = () => {
      clearSeedSummaryTimer();
      cleanupSeedListeners();
    };
    return card.root;
  })();
/* ===== Section: Decor deleter ===== */
  const secDecor = (() => {
    const grid = applyStyles(document.createElement("div"), {
      display: "grid",
      gap: "10px",
    });

    const selValue = createPill("0 decor - 0 items");
    selValue.id = "misc.decorDeleter.summary";
    const summaryRow = createSettingRow(
      "Selected",
      "Review the current decor selection before deleting.",
      selValue,
    );
    grid.append(summaryRow.row);

    const actions = ui.flexRow({ gap: 6 });
    actions.style.flexWrap = "wrap";
    const btnSelect = ui.btn("Select decor", { variant: "primary", size: "sm" });
    const btnDelete = ui.btn("Delete", { variant: "danger", size: "sm", disabled: true });
    const btnClear = ui.btn("Clear", { size: "sm", disabled: true });

    actions.append(btnSelect, btnDelete, btnClear);
    const actionsRow = createSettingRow(
      "Actions",
      "Pick, clear, or delete the selected decor.",
      actions,
    );
    grid.append(actionsRow.row);

    const statusLine = createPill("Idle");
    statusLine.style.fontWeight = "600";

    const controlRow = ui.flexRow({ gap: 6 });
    controlRow.style.flexWrap = "wrap";
    const btnPause = ui.btn("Pause", { size: "sm" });
    const btnPlay = ui.btn("Play", { size: "sm" });
    const btnStop = ui.btn("Stop", { size: "sm", variant: "ghost" });
    btnPause.onclick = () => { MiscService.pauseDecorDeletion(); updateDecorControlState(); };
    btnPlay.onclick = () => { MiscService.resumeDecorDeletion(); updateDecorControlState(); };
    btnStop.onclick = () => { MiscService.cancelDecorDeletion(); updateDecorControlState(); };
    controlRow.append(btnPause, btnPlay, btnStop);

    const statusControls = applyStyles(document.createElement("div"), {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      flexWrap: "wrap",
      justifyContent: "flex-end",
    });
    statusControls.append(controlRow, statusLine);

    const statusRow = createSettingRow(
      "Status",
      "Pause or stop the current delete flow.",
      statusControls,
    );
    grid.append(statusRow.row);

    const decorStatus = { name: "-", done: 0, total: 0, remaining: 0 };
    const describeDecorStatus = () => {
      const running = MiscService.isDecorDeletionRunning();
      const paused = MiscService.isDecorDeletionPaused();
      const target = decorStatus.name || "-";
      const base = `${target} (${decorStatus.done}/${decorStatus.total})`;
      if (!running) return "Idle";
      return paused ? `Paused - ${base}` : base;
    };
    const updateDecorStatusUI = () => {
      statusLine.textContent = describeDecorStatus();
    };
    const updateDecorControlState = () => {
      const running = MiscService.isDecorDeletionRunning();
      const paused = MiscService.isDecorDeletionPaused();
      btnPause.disabled = !running || paused;
      btnPlay.disabled = !running || !paused;
      btnStop.disabled = !running;
      updateDecorStatusUI();
    };

    const onDecorProgress = (event: CustomEvent) => {
      const detail = event.detail;
      decorStatus.name = detail.decorId;
      decorStatus.done = detail.done;
      decorStatus.total = detail.total;
      decorStatus.remaining = detail.remainingForDecor;
      updateDecorStatusUI();
      updateDecorControlState();
    };
    const onDecorComplete = () => {
      decorStatus.name = "-";
      decorStatus.done = 0;
      decorStatus.total = 0;
      decorStatus.remaining = 0;
      updateDecorStatusUI();
      updateDecorControlState();
    };
    const onDecorPaused = () => updateDecorControlState();
    const onDecorResumed = () => updateDecorControlState();
    window.addEventListener("qws:decordeleter:progress", onDecorProgress as EventListener);
    window.addEventListener("qws:decordeleter:done", onDecorComplete as EventListener);
    window.addEventListener("qws:decordeleter:error", onDecorComplete as EventListener);
    window.addEventListener("qws:decordeleter:paused", onDecorPaused as EventListener);
    window.addEventListener("qws:decordeleter:resumed", onDecorResumed as EventListener);
    const cleanupDecorListeners = () => {
      window.removeEventListener("qws:decordeleter:progress", onDecorProgress as EventListener);
      window.removeEventListener("qws:decordeleter:done", onDecorComplete as EventListener);
      window.removeEventListener("qws:decordeleter:error", onDecorComplete as EventListener);
      window.removeEventListener("qws:decordeleter:paused", onDecorPaused as EventListener);
      window.removeEventListener("qws:decordeleter:resumed", onDecorResumed as EventListener);
    };

    updateDecorStatusUI();
    updateDecorControlState();

    let decorEstimatedFinish: number | null = null;
    let decorSummaryTimer: number | null = null;
    const clearDecorSummaryTimer = () => {
      if (decorSummaryTimer !== null) {
        clearTimeout(decorSummaryTimer);
        decorSummaryTimer = null;
      }
    };
    const scheduleDecorSummaryRefresh = () => {
      clearDecorSummaryTimer();
      decorSummaryTimer = window.setTimeout(() => updateSummaryUI(), 1000);
    };

    function readSelection() {
      const sel = MiscService.getCurrentDecorSelection?.() || [];
      const decorCount = sel.length;
      let totalQty = 0;
      for (const it of sel) totalQty += Math.max(0, Math.floor(it?.qty || 0));
      return { sel, decorCount, totalQty };
    }
    function updateSummaryUI() {
      const { decorCount, totalQty } = readSelection();
      const decorDelayMs = DEFAULT_DECOR_DELETE_DELAY_MS * 2;
      const estimateMs = totalQty * (decorDelayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
      const isRunning = MiscService.isDecorDeletionRunning();
      const finishTimestamp = isRunning
        ? decorEstimatedFinish
        : estimateMs > 0
          ? Date.now() + estimateMs
          : null;
      const estimateText = buildEstimateSentence(totalQty, decorDelayMs, finishTimestamp);
      selValue.textContent = `${decorCount} decor - ${formatNum(totalQty)} items${estimateText}`;
      const has = decorCount > 0 && totalQty > 0;
      ui.setButtonEnabled(btnDelete, has);
      ui.setButtonEnabled(btnClear, has);
      if (!isRunning && totalQty > 0) {
        scheduleDecorSummaryRefresh();
      } else {
        clearDecorSummaryTimer();
      }
    }

    btnSelect.onclick = async () => {
      try {
        await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null);
      } catch {}
      await MiscService.openDecorSelectorFlow(ui.setWindowVisible.bind(ui));
      updateSummaryUI();
    };
    btnDelete.onclick = async () => {
      const { totalQty } = readSelection();
      const decorDelayMs = DEFAULT_DECOR_DELETE_DELAY_MS * 2;
      const estimateMs = totalQty * (decorDelayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
      decorEstimatedFinish = estimateMs > 0 ? Date.now() + estimateMs : null;
      clearDecorSummaryTimer();
      const deletionPromise = MiscService.deleteSelectedDecor?.({ delayMs: DEFAULT_DECOR_DELETE_DELAY_MS });
      updateSummaryUI();
      if (deletionPromise) await deletionPromise;
      decorEstimatedFinish = null;
      updateSummaryUI();
    };
    btnClear.onclick = () => {
      try { MiscService.clearDecorSelection?.(); } catch {}
      updateSummaryUI();
    };

    const card = ui.card("Decor deleter", {
      tone: "muted",
      align: "stretch",
      subtitle: "Bulk delete decor from inventory.",
    });
    styleCard(card);
    card.body.append(grid);
    (card.root as any).__cleanup__ = () => {
      clearDecorSummaryTimer();
      cleanupDecorListeners();
    };
    return card.root;
  })();
  secSeed.style.gridColumn = "1 / -1";
  secDecor.style.gridColumn = "1 / -1";

  grid.append(secAutoReco, secPlayer, secInventoryReserve, secStorage, secSeed, secDecor);
  page.append(header, grid);
  view.appendChild(page);

  (view as any).__cleanup__ = () => {
    try { (secPlayer as any).__cleanup__?.(); } catch {}
    try { (secSeed as any).__cleanup__?.(); } catch {}
    try { (secDecor as any).__cleanup__?.(); } catch {}
  };
}








