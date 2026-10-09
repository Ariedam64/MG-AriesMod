import { pill } from "../../ui/kit/badges";
import { button } from "../../ui/kit/button";
import { card, sectionLabel } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import { textInput } from "../../ui/kit/fields";
import { ensureStore, findAtomsByLabel, jGet, jSub } from "../../game/store/jotai";
import { fmtTime } from "./wsCapture";
import { snapshot, stringify, summarizeValue } from "./atomValues";
import {
  bar,
  barEnd,
  cardGrid,
  codeBox,
  copy,
  emptyNote,
  grow,
  hint,
  safeRegex,
  setBtnLabel,
  tabRoot,
  toast,
} from "./shared";

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

export function renderLiveAtomsTab(view: HTMLElement) {
  if (typeof (view as any).__atoms_live_cleanup__ === "function") {
    try { (view as any).__atoms_live_cleanup__(); } catch {}
  }

  const root = tabRoot(view);

  const entries = new Map<string, AtomLiveEntry>();
  const records: AtomLiveRecord[] = [];
  let recording = false;
  let selectedRecord: number | null = null;

  const grid = cardGrid(root);

  // ---------- Atoms to watch ----------
  const selectedInfo = pill("");
  const selectCard = card("Atoms to watch", {
    subtitle: "Filter with a regex, then tick the atoms to record.",
    actions: [selectedInfo],
  });
  grid.appendChild(selectCard.root);

  const filterInput = grow(textInput("Regex, e.g. position|health", ""));
  const btnFilter = button("Refresh", { size: "sm", onClick: () => refreshMatches() });
  const matchesWrap = h("div", "dd-well dd-well--short qmm-scroll");
  selectCard.body.append(bar(filterInput, btnFilter), matchesWrap);

  filterInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      refreshMatches();
    }
  });

  // ---------- Change log ----------
  const recordingPill = pill("Recording", "ok");
  recordingPill.hidden = true;
  const logCard = card("Change log", {
    subtitle: "Every change of the ticked atoms while recording.",
    actions: [recordingPill],
  });
  grid.appendChild(logCard.root);

  const btnRecord = button("Start recording", {
    variant: "primary",
    size: "sm",
    onClick: () => toggleRecording(),
  });
  const btnClear = button("Clear", {
    variant: "ghost",
    size: "sm",
    onClick: () => {
      records.length = 0;
      selectedRecord = null;
      renderRecords(false);
      updateDetails(null);
      updateControls();
    },
  });
  const btnCopyLog = button("Copy", {
    variant: "ghost",
    size: "sm",
    onClick: () => copyLog(),
  });
  logCard.body.appendChild(bar(btnRecord, barEnd(btnClear, btnCopyLog)));

  const logWrap = h("div", "dd-well qmm-scroll");
  const logEmpty = emptyNote("Nothing recorded yet. Tick some atoms, then start recording.");
  logWrap.appendChild(logEmpty);
  logCard.body.appendChild(logWrap);

  // ---------- Change details ----------
  const detailCard = card("Change details");
  root.appendChild(detailCard.root);

  const detailHeader = hint("");
  const prevTitle = sectionLabel("Before");
  const prevPre = codeBox("Nothing to show.");
  const nextTitle = sectionLabel("After");
  const nextPre = codeBox("Nothing to show.");
  const compare = h("div", "dd-grid dd-grid--tight");
  const prevBox = h("div", "dd-stack");
  prevBox.append(prevTitle, prevPre);
  const nextBox = h("div", "dd-stack");
  nextBox.append(nextTitle, nextPre);
  compare.append(prevBox, nextBox);

  const historyList = h("div", "dd-well qmm-scroll");
  const historyBox = h("div", "dd-stack");
  historyBox.append(sectionLabel("History of this atom"), historyList);

  detailCard.body.append(detailHeader, compare, historyBox);

  // ---------- Logic helpers ----------
  function refreshMatches() {
    const raw = filterInput.value.trim();
    const rx = safeRegex(raw || ".*");
    const atoms = findAtomsByLabel(rx);
    matchesWrap.innerHTML = "";
    if (!atoms.length) matchesWrap.appendChild(emptyNote("No atom matches this filter."));
    atoms
      .map((atom) => ({ atom, label: String(atom?.debugLabel || atom?.label || "<unknown>") }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .forEach(({ atom, label }) => {
        const row = h("label", "dd-pick");
        row.title = label;

        const checkbox = h("input");
        checkbox.type = "checkbox";
        checkbox.checked = entries.has(label);
        row.classList.toggle("is-on", checkbox.checked);

        row.append(checkbox, h("span", undefined, label));

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
          row.classList.toggle("is-on", checkbox.checked);
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
    selectedInfo.textContent = `${entries.size} selected`;
  }

  function updateControls() {
    setBtnLabel(btnRecord, recording ? "Stop recording" : "Start recording");
    btnRecord.classList.toggle("active", recording);
    recordingPill.hidden = !recording;
    btnRecord.disabled = !recording && !entries.size;
    btnClear.disabled = records.length === 0;
    btnCopyLog.disabled = records.length === 0;
  }

  function entryHead(title: string, time: string): HTMLDivElement {
    const head = h("div", "dd-entry__head");
    head.append(h("span", "dd-entry__title", title), h("span", "dd-entry__time", time));
    return head;
  }

  function renderRecords(autoScroll = false) {
    logWrap.innerHTML = "";
    if (!records.length) {
      logWrap.appendChild(logEmpty);
      renderHistoryFor(null, null);
      return;
    }
    records.forEach((rec, idx) => {
      const row = h("div", selectedRecord === idx ? "dd-entry is-selected" : "dd-entry");
      row.dataset.idx = String(idx);
      const time = `${fmtTime(rec.timestamp)}${rec.type === "initial" ? " · initial" : ""}`;
      row.append(entryHead(rec.label, time), h("div", "dd-entry__text", summarizeValue(rec.next)));
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
      detailHeader.textContent = "Pick an entry in the log to compare its values.";
      prevTitle.textContent = "Before";
      prevPre.textContent = "";
      nextTitle.textContent = "After";
      nextPre.textContent = "";
      renderHistoryFor(null, null);
      return;
    }
    const typeSuffix = rec.type === "initial" ? " (initial)" : "";
    detailHeader.textContent = `${rec.label} · ${fmtTime(rec.timestamp)}${typeSuffix}`;
    prevTitle.textContent = rec.type === "initial" ? "Before (none)" : "Before";
    prevPre.textContent = rec.type === "initial" ? "(no previous snapshot)" : stringify(rec.previous);
    nextTitle.textContent = rec.type === "initial" ? "Initial value" : "After";
    nextPre.textContent = stringify(rec.next);
    renderHistoryFor(rec.label, selectedRecord);
  }

  function renderHistoryFor(label: string | null, selectedIdx: number | null) {
    historyList.innerHTML = "";
    if (!label) {
      historyList.appendChild(emptyNote("Pick an entry in the log to see every value its atom took."));
      return;
    }

    const relevant = records
      .map((rec, idx) => ({ rec, idx }))
      .filter(({ rec }) => rec.label === label);

    if (!relevant.length) {
      historyList.appendChild(emptyNote("No history recorded yet."));
      return;
    }

    relevant.forEach(({ rec, idx }, order) => {
      const item = h("div", idx === selectedIdx ? "dd-entry is-selected" : "dd-entry");
      item.addEventListener("click", () => {
        selectedRecord = idx;
        renderRecords(false);
        updateDetails(records[selectedRecord]);
      });

      const val = codeBox("");
      val.textContent = stringify(rec.next);
      const title = `#${order + 1} ${rec.type === "initial" ? "Initial" : "Update"}`;
      item.append(entryHead(title, fmtTime(rec.timestamp)), val);
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

  refreshMatches();
  updateDetails(null);
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
