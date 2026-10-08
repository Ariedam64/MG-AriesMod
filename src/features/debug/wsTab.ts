import { Menu } from "../../ui/kit/menu";
import {
  Frame,
  FrameBuffer,
  fmtTime,
  escapeLite,
  installWSHookIfNeeded,
  getWSInfos,
  getWSStatusText,
  quinoaWS,
} from "./wsCapture";
import { copy } from "./shared";

export function renderWSTab(view: HTMLElement, ui: Menu) {
  if (typeof (view as any).__ws_cleanup__ === "function") {
    try { (view as any).__ws_cleanup__(); } catch {}
  }
  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  // ---------- State ----------
  type FrameEx = Frame & { id: number };
  const frames = new FrameBuffer<FrameEx>(2000);
  const framesMap = new Map<number, FrameEx>();
  let seq = 0;

  let paused = false;
  let autoScroll = true;
  let showIn = true;
  let showOut = true;
  let filterText = "";
  let onlyCurrentSocket = false;
  let replayToSource = false;
  let selectedId: number | null = null;
  let mutePatterns: RegExp[] = [];

  // ---------- Helpers ----------
  const setSelectedRow = (fid: number | null) => {
    selectedId = fid;
    [...logWrap.querySelectorAll<HTMLElement>('[data-fid]')].forEach(row => {
      row.classList.toggle("selected", String(fid || "") === row.dataset.fid);
    });
    if (fid != null) {
      const f = framesMap.get(fid);
      if (f) ta.value = f.text;
    }
  };
  const matchesMutes = (text: string) => mutePatterns.some(rx => rx.test(text));

  // ---------- Layout containers ----------
  const statusCard = ui.card("📡 Live traffic", {
    tone: "muted",
    subtitle: "Monitor, filter, and replay WebSocket frames.",
  });
  view.appendChild(statusCard.root);

  const muteCard = ui.card("🙉 Mutes (regex)", {
    tone: "muted",
    subtitle: "Hide unwanted messages.",
  });
  view.appendChild(muteCard.root);

  const logCard = ui.card("🧾 Frame log", { tone: "muted" });
  view.appendChild(logCard.root);

  const sendCard = ui.card("📤 Send a frame", {
    tone: "muted",
    subtitle: "Pick or compose a payload and send it.",
  });
  view.appendChild(sendCard.root);

  // ---------- SOCKET PICKER & CONTROLS ----------
  const statusToolbar = document.createElement("div");
  statusToolbar.className = "dd-toolbar dd-toolbar--stretch";
  statusCard.body.appendChild(statusToolbar);

  const lblConn = document.createElement("span");
  lblConn.className = "dd-status-chip";

  const sel = ui.select({ width: "220px" });

  const btnPause = ui.btn("Pause", {
    variant: "secondary",
    onClick: () => {
      paused = !paused;
      setPauseLabel(paused ? "Resume" : "Pause");
      btnPause.classList.toggle("active", paused);
      btnPause.title = paused ? "Resume live updates" : "Pause live updates";
    },
  });
  const setPauseLabel = (text: string) => {
    const label = btnPause.querySelector<HTMLElement>(".label");
    if (label) label.textContent = text; else btnPause.textContent = text;
  };
  setPauseLabel("Pause");
  btnPause.title = "Suspend live updates";

  const btnClear = ui.btn("Clear", {
    variant: "ghost",
    icon: "🧹",
    onClick: () => { frames.clear(); framesMap.clear(); setSelectedRow(null); repaint(true); },
  });

  const btnCopy = ui.btn("Copy visible", {
    variant: "ghost",
    icon: "📋",
    onClick: () => copyVisible(),
  });

  statusToolbar.append(lblConn, sel, btnPause, btnClear, btnCopy);

  const filterToolbar = document.createElement("div");
  filterToolbar.className = "dd-toolbar dd-toolbar--stretch";
  statusCard.body.appendChild(filterToolbar);

  const inputFilter = ui.inputText("filter text (case-insensitive)", "");
  inputFilter.classList.add("dd-grow");
  inputFilter.addEventListener("input", () => { filterText = inputFilter.value.trim().toLowerCase(); repaint(true); });

  const inToggle = ui.toggleChip("IN", { checked: true, icon: "←", tooltip: "Show incoming messages" });
  inToggle.input.addEventListener("change", () => { showIn = inToggle.input.checked; repaint(true); });

  const outToggle = ui.toggleChip("OUT", { checked: true, icon: "→", tooltip: "Show outgoing messages" });
  outToggle.input.addEventListener("change", () => { showOut = outToggle.input.checked; repaint(true); });

  const currentToggle = ui.toggleChip("Active socket", { checked: false, icon: "🎯", tooltip: "Limit to the selected socket" });
  currentToggle.input.addEventListener("change", () => { onlyCurrentSocket = currentToggle.input.checked; repaint(true); });

  const autoScrollToggle = ui.toggleChip("Auto-scroll", { checked: true, icon: "📜", tooltip: "Keep the log aligned with the latest frames" });
  autoScrollToggle.input.addEventListener("change", () => { autoScroll = autoScrollToggle.input.checked; });

  filterToolbar.append(inputFilter, inToggle.root, outToggle.root, currentToggle.root, autoScrollToggle.root);

  // ---------- MUTE patterns ----------
  const muteRow = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
  const muteInput = ui.inputText("add regex (e.g. ping|keepalive)", "");
  muteInput.classList.add("dd-grow");
  const btnAddMute = ui.btn("Add", {
    icon: "➕",
    onClick: () => {
      const raw = muteInput.value.trim();
      if (!raw) return;
      try {
        mutePatterns.push(new RegExp(raw, "i"));
        muteInput.value = "";
        repaintMutes();
        repaint(true);
      } catch { /* ignore invalid */ }
    },
  });
  muteRow.append(muteInput, btnAddMute);
  muteCard.body.appendChild(muteRow);

  const mutesWrap = document.createElement("div");
  mutesWrap.className = "dd-mute-chips";
  muteCard.body.appendChild(mutesWrap);

  function repaintMutes() {
    mutesWrap.innerHTML = "";
    mutePatterns.forEach((rx, i) => {
      const chip = ui.btn(`/${rx.source}/i ×`, {
        variant: "ghost",
        size: "sm",
        onClick: () => { mutePatterns.splice(i, 1); repaintMutes(); repaint(true); },
      });
      mutesWrap.appendChild(chip);
    });
  }

  // ---------- LOG AREA ----------
  const logWrap = document.createElement("div");
  logWrap.className = "dd-log";
  logWrap.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  logWrap.style.fontSize = "12px";
  logWrap.style.lineHeight = "1.4";
  logWrap.style.userSelect = "text";
  const emptyState = document.createElement("div");
  emptyState.className = "dd-log__empty";
  emptyState.textContent = "No frames visible yet.";
  logWrap.appendChild(emptyState);
  logCard.body.appendChild(logWrap);

  // ---------- SEND AREA ----------
  const ta = document.createElement("textarea");
  ta.className = "qmm-input dd-textarea";
  ta.placeholder = `Select a frame or paste a payload here. Choose Text or JSON below.`;

  const sendControls = document.createElement("div");
  sendControls.className = "dd-send-controls";
  const asJson = ui.radioGroup<"text" | "json">(
    "ws-send-mode",
    [{ value: "text", label: "Text" }, { value: "json", label: "JSON" }],
    "text",
    () => {}
  );
  const replayToggle = ui.toggleChip("Use source WS", { checked: false, icon: "↩" });
  replayToggle.input.addEventListener("change", () => { replayToSource = replayToggle.input.checked; });
  const btnSend = ui.btn("Send", { variant: "primary", icon: "📨", onClick: () => doSend() });
  const btnCopyPayload = ui.btn("Copy payload", { variant: "ghost", icon: "📋", onClick: () => copy(ta.value) });

  sendControls.append(asJson, replayToggle.root, btnSend, btnCopyPayload);
  sendCard.body.append(ta, sendControls);

  // ---------- SOCKET PICKER ----------
  function refreshSocketPicker() {
    const wsArr = getWSInfos();
    sel.innerHTML = "";
    wsArr.forEach((info, idx) => {
      const op = document.createElement("option");
      op.value = String(idx);
      op.textContent = info.id + (info.ws === quinoaWS ? " • page" : "");
      sel.appendChild(op);
    });
    if (!sel.value && sel.options.length) sel.value = "0";
    updateStatus();
  }

  function currentWS(): WebSocket | null {
    const idx = Number(sel.value);
    const vals = getWSInfos();
    return Number.isFinite(idx) ? (vals[idx]?.ws ?? null) : null;
  }

  function updateStatus() {
    const text = getWSStatusText();
    lblConn.textContent = text;
    const low = text.toLowerCase();
    lblConn.classList.toggle("is-ok", /open|connected|ready/.test(low));
    lblConn.classList.toggle("is-warn", /closing|connecting|pending/.test(low));
  }

  // ---------- Rendering helpers ----------
  function updateEmptyState() {
    const hasRows = logWrap.querySelector(".ws-row") != null;
    emptyState.style.display = hasRows ? "none" : "";
  }
  function passesFilters(f: FrameEx): boolean {
    if ((f.dir === "in" && !showIn) || (f.dir === "out" && !showOut)) return false;
    if (filterText && !f.text.toLowerCase().includes(filterText)) return false;
    if (onlyCurrentSocket && f.ws && currentWS() && f.ws !== currentWS()) return false;
    if (matchesMutes(f.text)) return false;
    return true;
  }

  function rowActions(fid: number, f: FrameEx) {
    const acts = document.createElement("div");
    acts.className = "acts";

    const bCopy = document.createElement("button");
    bCopy.className = "qmm-btn"; bCopy.textContent = "Copy";
    bCopy.onclick = (e) => { e.stopPropagation(); copy(f.text); };

    const bToEd = document.createElement("button");
    bToEd.className = "qmm-btn"; bToEd.textContent = "→ Editor";
    bToEd.onclick = (e) => { e.stopPropagation(); ta.value = f.text; setSelectedRow(fid); };

    const bReplay = document.createElement("button");
    bReplay.className = "qmm-btn"; bReplay.textContent = "Replay";
    bReplay.title = "Send right away (to current WS or source WS if enabled)";
    bReplay.onclick = (e) => { e.stopPropagation(); replayFrame(f); };

    acts.append(bCopy, bToEd, bReplay);
    return acts;
  }

  function buildRow(f: FrameEx) {
    const row = document.createElement("div");
    row.className = "ws-row";
    row.dataset.fid = String(f.id);

    const ts = document.createElement("div");
    ts.className = "ts";
    ts.textContent = fmtTime(f.t);

    const arrow = document.createElement("div");
    arrow.className = "arrow";
    arrow.textContent = f.dir === "in" ? "←" : "→";
    arrow.style.color = f.dir === "in" ? "#4bd17a" : "#8ab4ff";

    const body = document.createElement("div");
    body.className = "body";
    body.innerHTML = `<code>${escapeLite(f.text)}</code>`;

    const acts = rowActions(f.id, f);

    row.append(ts, arrow, body, acts);

    row.onclick = () => setSelectedRow(f.id);
    row.ondblclick = () => { ta.value = f.text; setSelectedRow(f.id); };
    return row;
  }

  function appendOne(f: FrameEx) {
    if (!passesFilters(f)) return;
    const row = buildRow(f);
    logWrap.appendChild(row);
    updateEmptyState();
    if (autoScroll) logWrap.scrollTop = logWrap.scrollHeight;
  }

  function repaint(_full = false) {
    logWrap.querySelectorAll(".ws-row").forEach((n) => n.remove());
    frames.toArray().forEach((f: any) => { if (passesFilters(f)) logWrap.appendChild(buildRow(f)); });
    updateEmptyState();
    if (selectedId != null) setSelectedRow(selectedId);
    if (autoScroll) logWrap.scrollTop = logWrap.scrollHeight;
  }

  function copyVisible() {
    const lines = frames.toArray()
      .filter((f: any) => passesFilters(f))
      .map((f: any) => `[${fmtTime(f.t)}] ${f.dir === "in" ? "<-" : "->"} ${f.text}`)
      .join("\n");
    copy(lines);
  }

  function replayFrame(f: FrameEx) {
    const target = (replayToSource && f.ws) ? f.ws : currentWS();
    if (!target || target.readyState !== WebSocket.OPEN) return;
    const mode = (asJson.querySelector('input[type="radio"]:checked') as HTMLInputElement)?.value || "text";
    if (mode === "json") {
      try { target.send(JSON.parse(f.text)); }
      catch { target.send(f.text); }
    } else {
      target.send(f.text);
    }
  }

  function doSend() {
    const ws = currentWS();
    const wsAlt = (selectedId != null && replayToSource) ? (framesMap.get(selectedId)?.ws ?? null) : null;
    const target = (replayToSource ? wsAlt : ws) || ws;
    if (!target || target.readyState !== WebSocket.OPEN) return;

    const mode = (asJson.querySelector('input[type="radio"]:checked') as HTMLInputElement)?.value || "text";
    if (mode === "json") {
      try { target.send(JSON.parse(ta.value)); } catch { target.send(ta.value); }
    } else {
      target.send(ta.value);
    }
  }

  // ---------- HOOK & STREAM ----------
  installWSHookIfNeeded((f) => {
    if (paused) return;
    const ex: FrameEx = { ...f, id: ++seq };
    frames.push(ex);
    framesMap.set(ex.id, ex);
    updateStatus();
    appendOne(ex);
  });
  refreshSocketPicker();
  repaint(true);

  const pollId = window.setInterval(() => { refreshSocketPicker(); }, 1000);
  (view as any).__ws_cleanup__ = () => { window.clearInterval(pollId); };
}

