import { button } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { radioGroup, select, textInput } from "../../ui/kit/fields";
import { flexRow } from "../../ui/kit/layout";
import { toggleChip } from "../../ui/kit/toggles";
import {
  Frame,
  FrameBuffer,
  fmtTime,
  escapeLite,
  installWSHookIfNeeded,
  getWSInfos,
  getWSStatusText,
  quinoaWS,
  wsFrames,
} from "./wsCapture";
import { copy, setBtnLabel } from "./shared";

export function renderWSTab(view: HTMLElement) {
  if (typeof (view as any).__ws_cleanup__ === "function") {
    try { (view as any).__ws_cleanup__(); } catch {}
  }
  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  // ---------- State ----------
  type FrameEx = Frame & { id: number };
  const frames = new FrameBuffer<FrameEx>(2000);
  const frameById = (fid: number) => frames.find((f) => f.id === fid);
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
      const f = frameById(fid);
      if (f) ta.value = f.text;
    }
  };
  const matchesMutes = (text: string) => mutePatterns.some(rx => rx.test(text));

  // ---------- Layout containers ----------
  const statusCard = card("📡 Live traffic", {
    tone: "muted",
    subtitle: "Monitor, filter, and replay WebSocket frames.",
  });
  view.appendChild(statusCard.root);

  const muteCard = card("🙉 Mutes (regex)", {
    tone: "muted",
    subtitle: "Hide unwanted messages.",
  });
  view.appendChild(muteCard.root);

  const logCard = card("🧾 Frame log", { tone: "muted" });
  view.appendChild(logCard.root);

  const sendCard = card("📤 Send a frame", {
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

  const sel = select({ width: "220px" });

  const btnPause = button("Pause", {
    variant: "secondary",
    onClick: () => {
      paused = !paused;
      setBtnLabel(btnPause, paused ? "Resume" : "Pause");
      btnPause.classList.toggle("active", paused);
      btnPause.title = paused ? "Resume live updates" : "Pause live updates";
    },
  });
  btnPause.title = "Suspend live updates";

  const btnClear = button("Clear", {
    variant: "ghost",
    icon: "🧹",
    onClick: () => { frames.clear(); setSelectedRow(null); repaint(true); },
  });

  const btnCopy = button("Copy visible", {
    variant: "ghost",
    icon: "📋",
    onClick: () => copyVisible(),
  });

  statusToolbar.append(lblConn, sel, btnPause, btnClear, btnCopy);

  const filterToolbar = document.createElement("div");
  filterToolbar.className = "dd-toolbar dd-toolbar--stretch";
  statusCard.body.appendChild(filterToolbar);

  const inputFilter = textInput("filter text (case-insensitive)", "");
  inputFilter.classList.add("dd-grow");
  inputFilter.addEventListener("input", () => { filterText = inputFilter.value.trim().toLowerCase(); repaint(true); });

  const inToggle = toggleChip("IN", { checked: true, icon: "←", tooltip: "Show incoming messages" });
  inToggle.input.addEventListener("change", () => { showIn = inToggle.input.checked; repaint(true); });

  const outToggle = toggleChip("OUT", { checked: true, icon: "→", tooltip: "Show outgoing messages" });
  outToggle.input.addEventListener("change", () => { showOut = outToggle.input.checked; repaint(true); });

  const currentToggle = toggleChip("Active socket", { checked: false, icon: "🎯", tooltip: "Limit to the selected socket" });
  currentToggle.input.addEventListener("change", () => { onlyCurrentSocket = currentToggle.input.checked; repaint(true); });

  const autoScrollToggle = toggleChip("Auto-scroll", { checked: true, icon: "📜", tooltip: "Keep the log aligned with the latest frames" });
  autoScrollToggle.input.addEventListener("change", () => { autoScroll = autoScrollToggle.input.checked; });

  filterToolbar.append(inputFilter, inToggle.root, outToggle.root, currentToggle.root, autoScrollToggle.root);

  // ---------- MUTE patterns ----------
  const muteRow = flexRow({ gap: 10, wrap: true, fullWidth: true });
  const muteInput = textInput("add regex (e.g. ping|keepalive)", "");
  muteInput.classList.add("dd-grow");
  const btnAddMute = button("Add", {
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
      const chip = button(`/${rx.source}/i ×`, {
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
  const asJson = radioGroup<"text" | "json">(
    "ws-send-mode",
    [{ value: "text", label: "Text" }, { value: "json", label: "JSON" }],
    "text",
    () => {}
  );
  const replayToggle = toggleChip("Use source WS", { checked: false, icon: "↩" });
  replayToggle.input.addEventListener("change", () => { replayToSource = replayToggle.input.checked; });
  const btnSend = button("Send", { variant: "primary", icon: "📨", onClick: () => doSend() });
  const btnCopyPayload = button("Copy payload", { variant: "ghost", icon: "📋", onClick: () => copy(ta.value) });

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

    const action = (label: string, run: () => void, title?: string) =>
      button(label, {
        size: "xs",
        title,
        onClick: () => run(),
      });
    const bCopy = action("Copy", () => copy(f.text));
    const bToEd = action("→ Editor", () => { ta.value = f.text; setSelectedRow(fid); });
    const bReplay = action("Replay", () => replayFrame(f), "Send right away (to current WS or source WS if enabled)");
    // A click on an action must not also select the row underneath.
    acts.addEventListener("click", (e) => e.stopPropagation());

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
    arrow.className = f.dir === "in" ? "arrow is-in" : "arrow is-out";
    arrow.textContent = f.dir === "in" ? "←" : "→";

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
    const wsAlt = (selectedId != null && replayToSource) ? (frameById(selectedId)?.ws ?? null) : null;
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
  installWSHookIfNeeded();
  const stopFrames = wsFrames.on((f) => {
    if (paused) return;
    const ex: FrameEx = { ...f, id: ++seq };
    frames.push(ex);
    updateStatus();
    appendOne(ex);
  });
  refreshSocketPicker();
  repaint(true);

  const pollId = window.setInterval(() => { refreshSocketPicker(); }, 1000);
  (view as any).__ws_cleanup__ = () => {
    window.clearInterval(pollId);
    stopFrames();
  };
}

