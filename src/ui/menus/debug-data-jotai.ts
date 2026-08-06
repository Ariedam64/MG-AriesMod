import { Menu } from "../menu";
import {
  ensureStore,
  isStoreCaptured,
  findAtomsByLabel,
  getAtomByLabel,
  jGet,
  jSet,
  jSub,
} from "../../store/jotai";
import { copy, createTwoColumns, safeRegex, stylePre, toast } from "./debug-data-shared";

export function renderJotaiTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  const { leftCol, rightCol } = createTwoColumns(view);

  // LEFT: Capture store + helpers
  {
    const card = ui.card("🗄️ Capture store", {
      tone: "muted",
      subtitle: "Initialize the Jotai store so atoms can be inspected.",
    });
    leftCol.appendChild(card.root);

    const status = document.createElement("span");
    status.className = "dd-status-chip";
    const refreshStatus = () => {
      const captured = isStoreCaptured();
      status.textContent = captured ? "Store captured" : "Store not captured";
      status.classList.toggle("is-ok", captured);
      status.classList.toggle("is-warn", !captured);
    };
    refreshStatus();

    const actions = ui.flexRow({ gap: 10, align: "center", wrap: true });
    const btnCap = ui.btn("Capture store", {
      variant: "primary",
      icon: "⏺",
      onClick: async () => {
        try { await ensureStore(); } catch {}
        refreshStatus();
      },
    });

    actions.append(btnCap, status);
    card.body.appendChild(actions);
  }

  // LEFT: Find / List atoms
  {
    const card = ui.card("🔍 Explore atoms", {
      tone: "muted",
      subtitle: "Filter labels using a regular expression.",
    });
    leftCol.appendChild(card.root);

    const queryRow = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
    const q = ui.inputText("regex label (ex: position|health)", "");
    q.classList.add("dd-grow");
    const btnList = ui.btn("List", { icon: "📄", onClick: () => doList() });
    const btnCopy = ui.btn("Copy", { icon: "📋", onClick: () => copy(pre.textContent || "") });
    queryRow.append(q, btnList, btnCopy);

    const pre = document.createElement("pre");
    stylePre(pre);
    pre.style.minHeight = "140px";

    async function doList() {
      const raw = q.value.trim();
      const rx = safeRegex(raw || ".*");
      const all = findAtomsByLabel(/.*/);
      const atoms = all.filter(a => rx.test(String(a?.debugLabel || a?.label || "")));
      const labels = atoms.map(a => String(a?.debugLabel || a?.label || "<?>"));
      pre.textContent = labels.join("\n");
    }

    card.body.append(queryRow, pre);
  }

  // RIGHT: Get / Subscribe
  {
    const card = ui.card("🧭 Inspect an atom", {
      tone: "muted",
      subtitle: "Get the current value or subscribe to updates.",
    });
    rightCol.appendChild(card.root);

    const controls = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
    const q = ui.inputText("atom label (ex: positionAtom)", "");
    q.classList.add("dd-grow");
    const pre = document.createElement("pre");
    stylePre(pre);
    pre.style.minHeight = "160px";
    let unsubRef: null | (() => void) = null;

    const btnGet = ui.btn("Get", {
      icon: "👁",
      onClick: async () => {
        const atom = getAtomByLabel(q.value.trim());
        if (!atom) { pre.textContent = `Atom "${q.value}" not found`; return; }
        try { setText(pre, await jGet(atom)); }
        catch (e: any) { setText(pre, e?.message || String(e)); }
      },
    });
    const btnSub = ui.btn("Subscribe", {
      icon: "🔔",
      onClick: async () => {
        const label = q.value.trim();
        if (!label) return;
        const atom = getAtomByLabel(label);
        if (!atom) { pre.textContent = `Atom "${label}" not found`; return; }
        if (unsubRef) {
          unsubRef();
          unsubRef = null;
          btnSub.textContent = "Subscribe";
          return;
        }
        unsubRef = await jSub(atom, async () => { try { setText(pre, await jGet(atom)); } catch {} });
        btnSub.textContent = "Unsubscribe";
      },
    });
    const btnCopy = ui.btn("Copy", { icon: "📋", onClick: () => copy(pre.textContent || "") });
    controls.append(q, btnGet, btnSub, btnCopy);

    const note = document.createElement("p");
    note.className = "dd-inline-note";
    note.textContent = "Tip: subscriptions keep the value updated after each mutation.";

    card.body.append(controls, note, pre);
  }

  // RIGHT: Set atom
  {
    const card = ui.card("✏️ Update an atom", {
      tone: "muted",
      subtitle: "Publish a new value (JSON).",
    });
    rightCol.appendChild(card.root);

    const controls = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
    const q = ui.inputText("atom label (ex: activeModalStateAtom)", "");
    q.classList.add("dd-grow");
    const ta = document.createElement("textarea");
    ta.className = "qmm-input dd-textarea";
    ta.placeholder = `JSON or text value, e.g. inventory or { "x": 1, "y": 2 }`;

    const btnSet = ui.btn("Set", {
      icon: "✅",
      variant: "primary",
      onClick: async () => {
        const label = q.value.trim();
        if (!label) { toast("Enter an atom label"); return; }

        try {
          await ensureStore();
        } catch (e: any) {
          toast(e?.message || "Unable to capture store");
          return;
        }
        if (!isStoreCaptured()) {
          toast("Store not captured. Use \"Capture store\" first.");
          return;
        }

        const atom = getAtomByLabel(label);
        if (!atom) { toast(`Atom "${label}" not found`); return; }

        const raw = ta.value;
        const trimmed = raw.trim();
        let val: any = raw;
        let fallback = false;
        if (trimmed) {
          try {
            val = JSON.parse(trimmed);
          } catch {
            fallback = true;
          }
        } else {
          val = "";
        }

        try {
          await jSet(atom, val);
          toast(fallback ? "Set OK (raw text)" : "Set OK");
        } catch (e: any) {
          toast(e?.message || "Set failed");
        }
      },
    });
    const btnCopy = ui.btn("Copy JSON", { icon: "📋", onClick: () => copy(ta.value) });
    controls.append(q, btnSet, btnCopy);

    card.body.append(controls, ta);
  }

  function setText(el: HTMLElement, v: any) {
    el.textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  }
}

