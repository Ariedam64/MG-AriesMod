import { button } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { textInput } from "../../ui/kit/fields";
import { flexRow } from "../../ui/kit/layout";
import {
  ensureStore,
  isStoreCaptured,
  findAtomsByLabel,
  getAtomByLabel,
  jGet,
  jSet,
  jSub,
} from "../../game/store/jotai";
import { copy, createTwoColumns, safeRegex, stylePre, toast } from "./shared";

export function renderJotaiTab(view: HTMLElement) {
  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  const { leftCol, rightCol } = createTwoColumns(view);

  // LEFT: Capture store + helpers
  {
    const section = card("🗄️ Capture store", {
      tone: "muted",
      subtitle: "Initialize the Jotai store so atoms can be inspected.",
    });
    leftCol.appendChild(section.root);

    const status = document.createElement("span");
    status.className = "dd-status-chip";
    const refreshStatus = () => {
      const captured = isStoreCaptured();
      status.textContent = captured ? "Store captured" : "Store not captured";
      status.classList.toggle("is-ok", captured);
      status.classList.toggle("is-warn", !captured);
    };
    refreshStatus();

    const actions = flexRow({ gap: 10, align: "center", wrap: true });
    const btnCap = button("Capture store", {
      variant: "primary",
      icon: "⏺",
      onClick: async () => {
        try { await ensureStore(); } catch {}
        refreshStatus();
      },
    });

    actions.append(btnCap, status);
    section.body.appendChild(actions);
  }

  // LEFT: Find / List atoms
  {
    const section = card("🔍 Explore atoms", {
      tone: "muted",
      subtitle: "Filter labels using a regular expression.",
    });
    leftCol.appendChild(section.root);

    const queryRow = flexRow({ gap: 10, wrap: true, fullWidth: true });
    const q = textInput("regex label (ex: position|health)", "");
    q.classList.add("dd-grow");
    const btnList = button("List", { icon: "📄", onClick: () => doList() });
    const btnCopy = button("Copy", { icon: "📋", onClick: () => copy(pre.textContent || "") });
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

    section.body.append(queryRow, pre);
  }

  // RIGHT: Get / Subscribe
  {
    const section = card("🧭 Inspect an atom", {
      tone: "muted",
      subtitle: "Get the current value or subscribe to updates.",
    });
    rightCol.appendChild(section.root);

    const controls = flexRow({ gap: 10, wrap: true, fullWidth: true });
    const q = textInput("atom label (ex: positionAtom)", "");
    q.classList.add("dd-grow");
    const pre = document.createElement("pre");
    stylePre(pre);
    pre.style.minHeight = "160px";
    let unsubRef: null | (() => void) = null;

    const btnGet = button("Get", {
      icon: "👁",
      onClick: async () => {
        const atom = getAtomByLabel(q.value.trim());
        if (!atom) { pre.textContent = `Atom "${q.value}" not found`; return; }
        try { setText(pre, await jGet(atom)); }
        catch (e: any) { setText(pre, e?.message || String(e)); }
      },
    });
    const btnSub = button("Subscribe", {
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
    const btnCopy = button("Copy", { icon: "📋", onClick: () => copy(pre.textContent || "") });
    controls.append(q, btnGet, btnSub, btnCopy);

    const note = document.createElement("p");
    note.className = "dd-inline-note";
    note.textContent = "Tip: subscriptions keep the value updated after each mutation.";

    section.body.append(controls, note, pre);
  }

  // RIGHT: Set atom
  {
    const section = card("✏️ Update an atom", {
      tone: "muted",
      subtitle: "Publish a new value (JSON).",
    });
    rightCol.appendChild(section.root);

    const controls = flexRow({ gap: 10, wrap: true, fullWidth: true });
    const q = textInput("atom label (ex: activeModalStateAtom)", "");
    q.classList.add("dd-grow");
    const ta = document.createElement("textarea");
    ta.className = "qmm-input dd-textarea";
    ta.placeholder = `JSON or text value, e.g. inventory or { "x": 1, "y": 2 }`;

    const btnSet = button("Set", {
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
          toast(fallback ? "Set OK (raw text)" : "Set OK", "success");
        } catch (e: any) {
          toast(e?.message || "Set failed");
        }
      },
    });
    const btnCopy = button("Copy JSON", { icon: "📋", onClick: () => copy(ta.value) });
    controls.append(q, btnSet, btnCopy);

    section.body.append(controls, ta);
  }

  function setText(el: HTMLElement, v: any) {
    el.textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  }
}

