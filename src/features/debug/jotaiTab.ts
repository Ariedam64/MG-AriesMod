import { pill, setTone } from "../../ui/kit/badges";
import { button } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import { textInput } from "../../ui/kit/fields";
import { flexRow, settingRow } from "../../ui/kit/layout";
import {
  ensureStore,
  isStoreCaptured,
  findAtomsByLabel,
  getAtomByLabel,
  jGet,
  jSet,
  jSub,
} from "../../game/store/jotai";
import { bar, barEnd, cardColumns,codeBox, copy, grow, safeRegex, setBtnLabel, tabRoot, toast } from "./shared";

export function renderJotaiTab(view: HTMLElement) {
  const root = tabRoot(view);

  // Store status
  {
    const status = pill("");
    const refreshStatus = () => {
      const captured = isStoreCaptured();
      status.textContent = captured ? "Captured" : "Not captured";
      setTone(status, captured ? "ok" : "warn");
    };
    refreshStatus();

    const btnCap = button("Capture store", {
      variant: "primary",
      size: "sm",
      onClick: async () => {
        try { await ensureStore(); } catch {}
        refreshStatus();
      },
    });

    const controls = flexRow({ gap: 8 });
    controls.append(status, btnCap);
    const { row } = settingRow("Jotai store", "Atoms can be read and written once it is captured.", controls);
    row.classList.add("dd-status");
    root.appendChild(row);
  }

  const [left, right] = cardColumns(root);

  // Find atoms
  {
    const section = card("Find atoms", { subtitle: "Filter atom labels with a regular expression." });
    left.appendChild(section.root);

    const q = grow(textInput("Regex, e.g. position|health", ""));
    const pre = codeBox("Matching labels show here.", true);
    pre.classList.add("dd-code--list");

    function doList() {
      const raw = q.value.trim();
      const rx = safeRegex(raw || ".*");
      const all = findAtomsByLabel(/.*/);
      const atoms = all.filter(a => rx.test(String(a?.debugLabel || a?.label || "")));
      const labels = atoms.map(a => String(a?.debugLabel || a?.label || "<?>"));
      pre.textContent = labels.join("\n");
    }
    q.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); doList(); }
    });

    const btnList = button("List", { variant: "primary", size: "sm", onClick: () => doList() });
    const btnCopy = button("Copy", { variant: "ghost", size: "sm", onClick: () => copy(pre.textContent || "") });
    section.body.append(bar(q, btnList, btnCopy), pre);
  }

  // Read an atom, once or as it changes
  {
    const section = card("Inspect an atom", { subtitle: "Read its value once, or follow it as it changes." });
    right.appendChild(section.root);

    const q = textInput("Atom label, e.g. positionAtom", "");
    q.classList.add("dd-full");
    const pre = codeBox("The value shows here.", true);
    let unsubRef: null | (() => void) = null;

    const btnGet = button("Get", {
      variant: "primary",
      size: "sm",
      onClick: async () => {
        const atom = getAtomByLabel(q.value.trim());
        if (!atom) { pre.textContent = `Atom "${q.value}" not found`; return; }
        try { setText(pre, await jGet(atom)); }
        catch (e: any) { setText(pre, e?.message || String(e)); }
      },
    });
    const btnSub = button("Follow", {
      size: "sm",
      title: "Update the value after each change",
      onClick: async () => {
        const label = q.value.trim();
        if (!label) return;
        const atom = getAtomByLabel(label);
        if (!atom) { pre.textContent = `Atom "${label}" not found`; return; }
        if (unsubRef) {
          unsubRef();
          unsubRef = null;
          setBtnLabel(btnSub, "Follow");
          btnSub.setActive(false);
          return;
        }
        unsubRef = await jSub(atom, async () => { try { setText(pre, await jGet(atom)); } catch {} });
        setBtnLabel(btnSub, "Stop following");
        btnSub.setActive(true);
      },
    });
    const btnCopy = button("Copy", { variant: "ghost", size: "sm", onClick: () => copy(pre.textContent || "") });

    section.body.append(q, bar(barEnd(btnCopy, btnSub, btnGet)), pre);
  }

  // Write an atom
  {
    const section = card("Write an atom", { subtitle: "Sends JSON, or plain text when it does not parse." });
    right.appendChild(section.root);

    const q = textInput("Atom label, e.g. activeModalStateAtom", "");
    q.classList.add("dd-full");
    const ta = h("textarea", "qmm-input dd-textarea");
    ta.placeholder = `{ "x": 1, "y": 2 }`;

    const btnSet = button("Set value", {
      variant: "primary",
      size: "sm",
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
    const btnCopy = button("Copy", { variant: "ghost", size: "sm", onClick: () => copy(ta.value) });

    section.body.append(q, ta, bar(barEnd(btnCopy, btnSet)));
  }

  function setText(el: HTMLElement, v: any) {
    el.textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  }
}
