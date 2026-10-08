import { Menu } from "../../ui/kit/menu";
import { ensureStore, findAtomsByLabel, jGet, jSub } from "../../game/store/jotai";
import { fmtTime } from "./wsCapture";
import { copy, createTwoColumns, safeRegex, stylePre, setBtnLabel, toast } from "./shared";

type AtomLiveEntry = {
  atom: any;
  lastValue: any;
  unsubscribe: null | (() => void);
};

type AtomLiveRecord = {
  label: string;
  timestamp: number;
  previous: any;
  next: any;
  type: "initial" | "update";
};

export function renderLiveAtomsTab(view: HTMLElement, ui: Menu) {
  if (typeof (view as any).__atoms_live_cleanup__ === "function") {
    try { (view as any).__atoms_live_cleanup__(); } catch {}
  }

  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  const entries = new Map<string, AtomLiveEntry>();
  const records: AtomLiveRecord[] = [];
  let recording = false;
  let selectedRecord: number | null = null;

  const { leftCol, rightCol } = createTwoColumns(view);

  // ---------- Selection controls ----------
  const selectCard = ui.card("🧪 Pick atoms", {
    tone: "muted",
    subtitle: "Filter labels with a regex then toggle atoms to monitor.",
  });
  leftCol.appendChild(selectCard.root);

  const filterRow = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
  const filterInput = ui.inputText("regex label (ex: position|health)", "");
  filterInput.classList.add("dd-grow");
  const btnFilter = ui.btn("Refresh", { icon: "🔍", onClick: () => refreshMatches() });
  filterRow.append(filterInput, btnFilter);

  const matchesWrap = document.createElement("div");
  matchesWrap.className = "dd-atom-list";

  const emptyMatches = document.createElement("p");
  emptyMatches.className = "dd-card-description";
  emptyMatches.textContent = "No atoms match the current filter.";
  emptyMatches.style.display = "none";

  const selectedInfo = document.createElement("p");
  selectedInfo.className = "dd-card-description";
  selectedInfo.style.marginTop = "8px";

  selectCard.body.append(filterRow, matchesWrap, emptyMatches, selectedInfo);

  filterInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      refreshMatches();
    }
  });

  // ---------- Live log ----------
  const logCard = ui.card("📡 Live atom log", {
    tone: "muted",
    subtitle: "Start recording to capture updates for the selected atoms.",
  });
  rightCol.appendChild(logCard.root);

  const controlsRow = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
  const btnRecord = ui.btn("Start recording", {
    variant: "primary",
    onClick: () => toggleRecording(),
  });
  const btnClear = ui.btn("Clear log", {
    variant: "ghost",
    icon: "🧹",
    onClick: () => {
      records.length = 0;
      selectedRecord = null;
      renderRecords(false);
      updateDetails(null);
      updateControls();
    },
  });
  const btnCopyLog = ui.btn("Copy log", {
    variant: "ghost",
    icon: "📋",
    onClick: () => copyLog(),
  });
  controlsRow.append(btnRecord, btnClear, btnCopyLog);
  logCard.body.appendChild(controlsRow);

  const logWrap = document.createElement("div");
  logWrap.className = "dd-log";
  logWrap.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const logEmpty = document.createElement("div");
  logEmpty.className = "dd-log__empty";
  logEmpty.textContent = "No updates yet.";
  logWrap.appendChild(logEmpty);
  logCard.body.appendChild(logWrap);

  const detailHeader = document.createElement("p");
  detailHeader.className = "dd-card-description";
  detailHeader.textContent = "Select a log entry to inspect previous and next values.";

  const detailWrap = ui.flexRow({ gap: 12, wrap: true, fullWidth: true });
  const prevBox = document.createElement("div");
  prevBox.style.flex = "1 1 320px";
  const prevTitle = document.createElement("strong");
  prevTitle.textContent = "Previous";
  prevTitle.style.display = "block";
  prevTitle.style.marginBottom = "6px";
  const prevPre = document.createElement("pre");
  stylePre(prevPre);
  prevPre.style.minHeight = "140px";
  prevPre.textContent = "";
  prevBox.append(prevTitle, prevPre);

  const nextBox = document.createElement("div");
  nextBox.style.flex = "1 1 320px";
  const nextTitle = document.createElement("strong");
  nextTitle.textContent = "Next";
  nextTitle.style.display = "block";
  nextTitle.style.marginBottom = "6px";
  const nextPre = document.createElement("pre");
  stylePre(nextPre);
  nextPre.style.minHeight = "140px";
  nextPre.textContent = "";
  nextBox.append(nextTitle, nextPre);

  const historyBox = document.createElement("div");
  historyBox.style.flex = "1 1 100%";
  historyBox.style.minWidth = "0";
  const historyTitle = document.createElement("strong");
  historyTitle.textContent = "History";
  historyTitle.style.display = "block";
  historyTitle.style.marginBottom = "6px";
  const historyList = document.createElement("div");
  historyList.style.display = "flex";
  historyList.style.flexDirection = "column";
  historyList.style.gap = "10px";
  historyList.style.maxHeight = "320px";
  historyList.style.overflow = "auto";
  historyBox.append(historyTitle, historyList);

  detailWrap.append(prevBox, nextBox, historyBox);
  logCard.body.append(detailHeader, detailWrap);

  // ---------- Logic helpers ----------
  function refreshMatches() {
    const raw = filterInput.value.trim();
    const rx = safeRegex(raw || ".*");
    const atoms = findAtomsByLabel(rx);
    matchesWrap.innerHTML = "";
    emptyMatches.style.display = atoms.length ? "none" : "block";
    atoms
      .map((atom) => ({ atom, label: String(atom?.debugLabel || atom?.label || "<unknown>") }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .forEach(({ atom, label }) => {
        const row = document.createElement("label");
        row.className = "dd-atom-list__item";
        row.title = label;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = entries.has(label);
        checkbox.className = "dd-atom-list__checkbox";

        const text = document.createElement("span");
        text.className = "dd-atom-list__label";
        text.textContent = label;

        row.append(checkbox, text);

        checkbox.addEventListener("change", async () => {
          if (checkbox.checked) {
            const existing = entries.get(label);
            if (existing) {
              existing.atom = atom;
            } else {
              entries.set(label, { atom, lastValue: null, unsubscribe: null });
            }
            if (recording) {
              const ok = await attachEntry(label);
              if (!ok) checkbox.checked = false;
            }
          } else {
            const existing = entries.get(label);
            if (existing?.unsubscribe) {
              try { existing.unsubscribe(); } catch {}
            }
            entries.delete(label);
          }
          updateSelectedInfo();
          updateControls();
        });

        matchesWrap.appendChild(row);
        if (entries.has(label)) {
          const existing = entries.get(label);
          if (existing) existing.atom = atom;
        }
      });
    updateSelectedInfo();
  }

  function updateSelectedInfo() {
    const size = entries.size;
    selectedInfo.textContent = size
      ? `${size} atom${size > 1 ? "s" : ""} selected.`
      : "No atom selected.";
  }

  function updateControls() {
    setBtnLabel(btnRecord, recording ? "Stop recording" : "Start recording");
    btnRecord.classList.toggle("active", recording);
    btnRecord.disabled = !recording && !entries.size;
    btnClear.disabled = records.length === 0;
    btnCopyLog.disabled = records.length === 0;
  }

  function renderRecords(autoScroll = false) {
    logWrap.innerHTML = "";
    if (!records.length) {
      logWrap.appendChild(logEmpty);
      renderHistoryFor(null, null);
      return;
    }
    records.forEach((rec, idx) => {
      const row = document.createElement("div");
      row.className = "atoms-log-row";
      row.dataset.idx = String(idx);
      row.style.display = "grid";
      row.style.gridTemplateColumns = "minmax(120px, 160px) minmax(0, 1fr)";
      row.style.gap = "12px";
      row.style.padding = "10px 12px";
      row.style.margin = "4px 0";
      row.style.borderRadius = "12px";
      row.style.border = "1px solid rgba(255,255,255,.12)";
      const isSelected = selectedRecord === idx;
      row.style.background = isSelected ? "rgba(92,126,255,.16)" : "rgba(11,16,22,.85)";
      row.style.borderColor = isSelected ? "rgba(92,126,255,.42)" : "rgba(255,255,255,.12)";
      row.style.cursor = "pointer";
      row.addEventListener("mouseenter", () => { row.style.borderColor = "rgba(255,255,255,.28)"; });
      row.addEventListener("mouseleave", () => {
        const sel = selectedRecord === idx;
        row.style.borderColor = sel ? "rgba(92,126,255,.42)" : "rgba(255,255,255,.12)";
      });

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";
      left.style.gap = "2px";
      const lbl = document.createElement("strong");
      lbl.textContent = rec.label;
      const ts = document.createElement("span");
      ts.style.opacity = "0.7";
      ts.style.fontSize = "12px";
      ts.textContent = `${fmtTime(rec.timestamp)}${rec.type === "initial" ? " • initial" : ""}`;
      left.append(lbl, ts);

      const summary = document.createElement("div");
      summary.style.fontSize = "12px";
      summary.style.lineHeight = "1.45";
      summary.style.whiteSpace = "pre-wrap";
      const prefix = rec.type === "initial" ? "[initial] " : "";
      summary.textContent = prefix + summarizeValue(rec.next);

      row.append(left, summary);
      row.addEventListener("click", () => {
        selectedRecord = idx;
        renderRecords(false);
        updateDetails(rec);
      });
      logWrap.appendChild(row);
    });
    if (autoScroll) logWrap.scrollTop = logWrap.scrollHeight;
    if (selectedRecord != null && !records[selectedRecord]) {
      selectedRecord = records.length ? Math.min(selectedRecord, records.length - 1) : null;
    }
    if (selectedRecord != null) {
      renderHistoryFor(records[selectedRecord]?.label ?? null, selectedRecord);
    }
  }

  function updateDetails(rec: AtomLiveRecord | null) {
    if (!rec) {
      detailHeader.textContent = "Select a log entry to inspect previous and next values.";
      prevTitle.textContent = "Previous";
      prevPre.textContent = "";
      nextTitle.textContent = "Next";
      nextPre.textContent = "";
      renderHistoryFor(null, null);
      return;
    }
    const typeSuffix = rec.type === "initial" ? " (initial)" : "";
    detailHeader.textContent = `${rec.label} — ${fmtTime(rec.timestamp)}${typeSuffix}`;
    prevTitle.textContent = rec.type === "initial" ? "Previous (none)" : "Previous";
    prevPre.textContent = rec.type === "initial" ? "(no previous snapshot)" : stringify(rec.previous);
    nextTitle.textContent = rec.type === "initial" ? "Initial value" : "Next";
    nextPre.textContent = stringify(rec.next);
    renderHistoryFor(rec.label, selectedRecord);
  }

  function renderHistoryFor(label: string | null, selectedIdx: number | null) {
    historyList.innerHTML = "";
    if (!label) {
      const empty = document.createElement("p");
      empty.className = "dd-card-description";
      empty.textContent = "Select a log entry to inspect the value history.";
      historyList.appendChild(empty);
      return;
    }

    const relevant = records
      .map((rec, idx) => ({ rec, idx }))
      .filter(({ rec }) => rec.label === label);

    if (!relevant.length) {
      const empty = document.createElement("p");
      empty.className = "dd-card-description";
      empty.textContent = "No history recorded yet.";
      historyList.appendChild(empty);
      return;
    }

    relevant.forEach(({ rec, idx }, order) => {
      const item = document.createElement("div");
      item.style.display = "flex";
      item.style.flexDirection = "column";
      item.style.gap = "6px";
      item.style.padding = "10px 12px";
      item.style.borderRadius = "12px";
      item.style.border = "1px solid rgba(255,255,255,.12)";
      const isSelected = idx === selectedIdx;
      item.style.background = isSelected ? "rgba(92,126,255,.16)" : "rgba(11,16,22,.85)";
      item.style.borderColor = isSelected ? "rgba(92,126,255,.42)" : "rgba(255,255,255,.12)";
      item.style.cursor = "pointer";

      item.addEventListener("mouseenter", () => {
        if (!isSelected) item.style.borderColor = "rgba(255,255,255,.24)";
      });
      item.addEventListener("mouseleave", () => {
        item.style.borderColor = isSelected ? "rgba(92,126,255,.42)" : "rgba(255,255,255,.12)";
      });
      item.addEventListener("click", () => {
        selectedRecord = idx;
        renderRecords(false);
        updateDetails(records[selectedRecord]);
      });

      const head = document.createElement("div");
      head.style.display = "flex";
      head.style.alignItems = "center";
      head.style.justifyContent = "space-between";

      const meta = document.createElement("div");
      meta.style.display = "flex";
      meta.style.alignItems = "center";
      meta.style.gap = "8px";

      const orderBadge = document.createElement("span");
      orderBadge.textContent = `#${order + 1}`;
      orderBadge.style.fontSize = "11px";
      orderBadge.style.letterSpacing = ".04em";
      orderBadge.style.textTransform = "uppercase";
      orderBadge.style.padding = "2px 6px";
      orderBadge.style.borderRadius = "999px";
      orderBadge.style.background = "rgba(255,255,255,.08)";
      orderBadge.style.border = "1px solid rgba(255,255,255,.16)";

      const type = document.createElement("span");
      type.textContent = rec.type === "initial" ? "Initial" : "Update";
      type.style.fontSize = "11px";
      type.style.opacity = "0.75";
      type.style.textTransform = "uppercase";

      meta.append(orderBadge, type);

      const ts = document.createElement("span");
      ts.textContent = fmtTime(rec.timestamp);
      ts.style.fontSize = "12px";
      ts.style.opacity = "0.75";

      head.append(meta, ts);

      const val = document.createElement("pre");
      stylePre(val);
      val.style.margin = "0";
      val.textContent = stringify(rec.next);

      item.append(head, val);
      historyList.appendChild(item);
    });
  }

  async function toggleRecording() {
    if (recording) {
      stopRecording();
      return;
    }
    if (!entries.size) {
      toast("Select at least one atom");
      return;
    }
    try {
      await ensureStore();
    } catch (e: any) {
      toast(e?.message || "Unable to capture store");
      return;
    }
    recording = true;
    updateControls();
    for (const label of Array.from(entries.keys())) {
      const ok = await attachEntry(label);
      if (!ok) entries.delete(label);
    }
    if (!entries.size) {
      stopRecording();
    }
    updateSelectedInfo();
    updateControls();
  }

  function stopRecording() {
    if (!recording) return;
    recording = false;
    for (const entry of entries.values()) {
      if (entry.unsubscribe) {
        try { entry.unsubscribe(); } catch {}
        entry.unsubscribe = null;
      }
    }
    updateControls();
  }

  async function attachEntry(label: string): Promise<boolean> {
    const entry = entries.get(label);
    if (!entry) return false;
    if (entry.unsubscribe) {
      try { entry.unsubscribe(); } catch {}
      entry.unsubscribe = null;
    }
    try {
      const initialValue = snapshot(await jGet(entry.atom));
      entry.lastValue = initialValue;
      const unsub = await jSub(entry.atom, async () => {
        const previous = snapshot(entry.lastValue);
        let nextValue: any;
        try { nextValue = await jGet(entry.atom); }
        catch (err: any) { nextValue = err?.message || String(err); }
        const nextSnap = snapshot(nextValue);
        entry.lastValue = nextSnap;
        const rec: AtomLiveRecord = {
          label,
          timestamp: Date.now(),
          previous,
          next: nextSnap,
          type: "update",
        };
        records.push(rec);
        if (selectedRecord == null) selectedRecord = records.length - 1;
        renderRecords(true);
        updateDetails(records[selectedRecord]);
        updateControls();
      });
      const initialRecord: AtomLiveRecord = {
        label,
        timestamp: Date.now(),
        previous: null,
        next: snapshot(initialValue),
        type: "initial",
      };
      records.push(initialRecord);
      if (selectedRecord == null) selectedRecord = records.length - 1;
      renderRecords(true);
      updateDetails(records[selectedRecord]);
      entry.unsubscribe = () => { try { unsub(); } catch {}; };
      return true;
    } catch (err: any) {
      toast(err?.message || `Unable to subscribe to ${label}`);
      entries.delete(label);
      updateSelectedInfo();
      updateControls();
      return false;
    }
  }

  function copyLog() {
    if (!records.length) return;
    const text = records
      .map((rec) => {
        const prev = rec.previous == null ? "(no previous snapshot)" : stringify(rec.previous);
        const next = stringify(rec.next);
        const type = rec.type === "initial" ? "initial" : "update";
        return `[${fmtTime(rec.timestamp)}] ${rec.label} (${type})\nprevious: ${prev}\nnext: ${next}`;
      })
      .join("\n\n");
    copy(text);
  }

  function snapshot<T = any>(value: T): T {
    if (value == null) return value;
    try {
      if (typeof structuredClone === "function") return structuredClone(value);
    } catch {}
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  function stringify(value: any): string {
    if (typeof value === "string") return value;
    try { return JSON.stringify(value, null, 2); }
    catch { return String(value); }
  }

  function summarizeValue(value: any): string {
    const str = stringify(value).replace(/\s+/g, " ").trim();
    return str.length > 140 ? str.slice(0, 140) + "…" : str;
  }

  refreshMatches();
  updateControls();

  (view as any).__atoms_live_cleanup__ = () => {
    stopRecording();
    for (const entry of entries.values()) {
      if (entry.unsubscribe) {
        try { entry.unsubscribe(); } catch {}
      }
    }
    entries.clear();
    records.length = 0;
    selectedRecord = null;
  };
}

