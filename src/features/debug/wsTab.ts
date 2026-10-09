import { pill, setTone } from "../../ui/kit/badges";
import { button } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { h, refreshWhileVisible } from "../../ui/kit/dom";
import { select, textInput } from "../../ui/kit/fields";
import { segmented } from "../../ui/kit/segmented";
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
import { bar, barEnd, copy, emptyNote, grow, setBtnLabel, tabRoot } from "./shared";

export function renderWSTab(view: HTMLElement) {
  if (typeof (view as any).__ws_cleanup__ === "function") {
    try { (view as any).__ws_cleanup__(); } catch {}
  }
  const root = tabRoot(view);

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

  // ---------- Live traffic ----------
  const lblConn = pill("");
  const trafficCard = card("Live traffic", {
    subtitle: "Every frame the game sends and receives. Click one to load it below.",
    actions: [lblConn],
  });
  root.appendChild(trafficCard.root);

  const sel = grow(select());
  sel.title = "Socket";

  const btnPause = button("Pause", {
    size: "sm",
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
    size: "sm",
    onClick: () => { frames.clear(); setSelectedRow(null); repaint(true); },
  });

  const btnCopy = button("Copy shown", {
    variant: "ghost",
    size: "sm",
    onClick: () => copyVisible(),
  });

  const inputFilter = grow(textInput("Filter text", ""));
  inputFilter.addEventListener("input", () => { filterText = inputFilter.value.trim().toLowerCase(); repaint(true); });

  const inToggle = toggleChip("In", { checked: true, icon: "←", tooltip: "Show incoming messages" });
  inToggle.input.addEventListener("change", () => { showIn = inToggle.input.checked; repaint(true); });

  const outToggle = toggleChip("Out", { checked: true, icon: "→", tooltip: "Show outgoing messages" });
  outToggle.input.addEventListener("change", () => { showOut = outToggle.input.checked; repaint(true); });

  const currentToggle = toggleChip("This socket only", { checked: false, tooltip: "Limit to the selected socket" });
  currentToggle.input.addEventListener("change", () => { onlyCurrentSocket = currentToggle.input.checked; repaint(true); });

  const autoScrollToggle = toggleChip("Auto-scroll", { checked: true, tooltip: "Keep the log aligned with the latest frames" });
  autoScrollToggle.input.addEventListener("change", () => { autoScroll = autoScrollToggle.input.checked; });

  // ---------- Hidden patterns ----------
  const muteInput = grow(textInput("Hide frames matching a regex, e.g. ping", ""));
  const addMute = () => {
    const raw = muteInput.value.trim();
    if (!raw) return;
    try {
      mutePatterns.push(new RegExp(raw, "i"));
      muteInput.value = "";
      repaintMutes();
      repaint(true);
    } catch { /* ignore invalid */ }
  };
  muteInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); addMute(); }
  });
  const btnAddMute = button("Hide", { size: "sm", onClick: addMute });

  const mutesWrap = h("div", "dd-mutes");

  function repaintMutes() {
    mutesWrap.innerHTML = "";
    mutePatterns.forEach((rx, i) => {
      const chip = button(`/${rx.source}/i ×`, {
        size: "xs",
        title: "Show these frames again",
        onClick: () => { mutePatterns.splice(i, 1); repaintMutes(); repaint(true); },
      });
      chip.classList.add("dd-mute");
      mutesWrap.appendChild(chip);
    });
  }

  // ---------- Log ----------
  const logWrap = h("div", "dd-well dd-frames qmm-scroll");
  const emptyState = emptyNote("");
  logWrap.appendChild(emptyState);

  trafficCard.body.append(
    bar(sel, btnPause, barEnd(btnClear, btnCopy)),
    bar(inputFilter, inToggle.root, outToggle.root, currentToggle.root, autoScrollToggle.root),
    bar(muteInput, btnAddMute),
    mutesWrap,
    logWrap,
  );

  // ---------- Send a frame ----------
  const sendCard = card("Send a frame", { subtitle: "Edit a captured frame or write your own." });
  root.appendChild(sendCard.root);

  const ta = h("textarea", "qmm-input dd-textarea");
  ta.placeholder = "Click a frame above, or paste a payload here.";

  const sendMode = segmented<"text" | "json">(
    [{ value: "text", label: "Text" }, { value: "json", label: "JSON" }],
    "text",
    undefined,
    { ariaLabel: "Send as" },
  );
  const replayToggle = toggleChip("Use the frame's socket", {
    checked: false,
    tooltip: "Send to the socket the selected frame came from",
  });
  replayToggle.input.addEventListener("change", () => { replayToSource = replayToggle.input.checked; });
  const btnSend = button("Send", { variant: "primary", size: "sm", onClick: () => doSend() });
  const btnCopyPayload = button("Copy", { variant: "ghost", size: "sm", onClick: () => copy(ta.value) });

  const sendControls = h("div", "dd-send");
  sendControls.append(sendMode, replayToggle.root, barEnd(btnCopyPayload, btnSend));
  sendCard.body.append(ta, sendControls);

  // ---------- Socket picker ----------
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
    const low = getWSStatusText().toLowerCase();
    const open = /open|connected|ready/.test(low);
    lblConn.textContent = open ? "Connected" : "Not connected";
    setTone(lblConn, open ? "ok" : "warn");
  }

  // ---------- Rendering helpers ----------
  function updateEmptyState() {
    const hasRows = logWrap.querySelector(".dd-frame") != null;
    emptyState.hidden = hasRows;
    emptyState.textContent = frames.toArray().length
      ? "No frame matches these filters."
      : "No frames yet. They show here as the game talks to the server.";
  }
  function passesFilters(f: FrameEx): boolean {
    if ((f.dir === "in" && !showIn) || (f.dir === "out" && !showOut)) return false;
    if (filterText && !f.text.toLowerCase().includes(filterText)) return false;
    if (onlyCurrentSocket && f.ws && currentWS() && f.ws !== currentWS()) return false;
    if (matchesMutes(f.text)) return false;
    return true;
  }

  function rowActions(fid: number, f: FrameEx) {
    const acts = h("div", "dd-frame__acts");

    const action = (label: string, run: () => void, title?: string) =>
      button(label, {
        size: "xs",
        title,
        onClick: () => run(),
      });
    const bCopy = action("Copy", () => copy(f.text));
    const bToEd = action("To editor", () => { ta.value = f.text; setSelectedRow(fid); });
    const bReplay = action("Replay", () => replayFrame(f), "Send right away (to current WS or source WS if enabled)");
    // A click on an action must not also select the row underneath.
    acts.addEventListener("click", (e) => e.stopPropagation());

    acts.append(bCopy, bToEd, bReplay);
    return acts;
  }

  function buildRow(f: FrameEx) {
    const row = h("div", "dd-frame");
    row.dataset.fid = String(f.id);

    const ts = h("div", "dd-frame__ts", fmtTime(f.t));
    const arrow = h("div", f.dir === "in" ? "dd-frame__dir is-in" : "dd-frame__dir is-out", f.dir === "in" ? "←" : "→");
    arrow.title = f.dir === "in" ? "Received" : "Sent";

    const body = h("div", "dd-frame__body");
    body.innerHTML = `<code>${escapeLite(f.text)}</code>`;

    row.append(ts, arrow, body, rowActions(f.id, f));

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
    logWrap.querySelectorAll(".dd-frame").forEach((n) => n.remove());
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
    if (sendMode.get() === "json") {
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

    if (sendMode.get() === "json") {
      try { target.send(JSON.parse(ta.value)); } catch { target.send(ta.value); }
    } else {
      target.send(ta.value);
    }
  }

  // ---------- Hook & stream ----------
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

  const stopPolling = refreshWhileVisible(root, refreshSocketPicker, 1000);
  (view as any).__ws_cleanup__ = () => {
    stopPolling();
    stopFrames();
  };
}
