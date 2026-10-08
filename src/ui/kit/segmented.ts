import { h } from "./dom";

export type SegmentedItem<T extends string> = { value: T; label: string; disabled?: boolean };

/** The control's root, plus a getter and setter for the selected value. */
export type SegmentedControl<T extends string> = HTMLDivElement & {
  get(): T;
  set(value: T): void;
};

/**
 * A row of mutually exclusive options with a sliding highlight. Arrow keys,
 * Home and End move the selection. `onChange` also fires when the current
 * option is clicked again.
 */
export function segmented<T extends string>(
  items: Array<SegmentedItem<T>>,
  selected: T,
  onChange?: (value: T) => void,
  opts: { fullWidth?: boolean; id?: string; ariaLabel?: string } = {},
): SegmentedControl<T> {
  const root = h("div", "qmm-seg") as SegmentedControl<T>;
  if (opts.fullWidth) root.classList.add("qmm-seg--full");
  if (opts.id) root.id = opts.id;
  root.setAttribute("role", "radiogroup");
  if (opts.ariaLabel) root.setAttribute("aria-label", opts.ariaLabel);

  const rail = h("div", "qmm-seg__indicator");
  root.appendChild(rail);
  const indicator = slidingIndicator(root, rail);

  let value: T = selected;
  const buttons: HTMLButtonElement[] = [];
  const activeButton = () => buttons.find((b) => b.dataset.value === value);

  const select = (next: T, focus: boolean) => {
    if (next !== value) {
      value = next;
      for (const b of buttons) {
        const active = b.dataset.value === next;
        b.setAttribute("aria-checked", active ? "true" : "false");
        b.tabIndex = active ? 0 : -1;
        b.classList.toggle("active", active);
      }
      indicator.moveTo(activeButton(), buttons, true);
    }
    if (focus) activeButton()?.focus();
    onChange?.(value);
  };

  for (const item of items) {
    const btn = h("button", "qmm-seg__btn");
    btn.type = "button";
    btn.dataset.value = String(item.value);
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", item.value === selected ? "true" : "false");
    btn.tabIndex = item.value === selected ? 0 : -1;
    btn.classList.toggle("active", item.value === selected);
    btn.disabled = !!item.disabled;
    btn.appendChild(h("span", "qmm-seg__btn-label", item.label));

    btn.addEventListener("click", () => {
      if (!btn.disabled) select(item.value, false);
    });
    btn.addEventListener("keydown", (e) => {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      if (e.key === "Home") return select(items[0].value, true);
      if (e.key === "End") return select(items[items.length - 1].value, true);
      const dir = e.key === "ArrowRight" ? 1 : -1;
      let j = items.findIndex((it) => it.value === value);
      for (let k = 0; k < items.length; k++) {
        j = (j + dir + items.length) % items.length;
        if (!items[j].disabled) return select(items[j].value, true);
      }
    });

    buttons.push(btn);
    root.appendChild(btn);
  }

  const relayout = () => indicator.moveTo(activeButton(), buttons, false);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(relayout).observe(root);
  window.addEventListener("resize", relayout);
  queueMicrotask(relayout);

  root.get = () => value;
  root.set = (next) => select(next, false);
  return root;
}

/** Positions the highlight under the active button, animating between positions. */
function slidingIndicator(root: HTMLElement, rail: HTMLElement) {
  const reduceMotion = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  const canAnimate = typeof rail.animate === "function";
  // The CSS transition would fight the Web Animation, so it only serves as a fallback.
  if (canAnimate) rail.style.transition = "none";

  let current: { left: number; width: number } | null = null;
  let animation: Animation | null = null;

  const apply = (left: number, width: number) => {
    rail.style.transform = `translate3d(${left}px,0,0)`;
    rail.style.width = `${width}px`;
  };

  return {
    moveTo(active: HTMLButtonElement | undefined, buttons: HTMLButtonElement[], animate: boolean) {
      if (!active) return;
      const i = buttons.indexOf(active);
      const n = buttons.length;
      const cs = getComputedStyle(root);
      const gap = parseFloat(cs.gap || cs.columnGap || "0") || 0;
      const borderLeft = parseFloat(cs.borderLeftWidth || "0") || 0;
      const borderRight = parseFloat(cs.borderRightWidth || "0") || 0;
      const rootRect = root.getBoundingClientRect();
      const btnRect = active.getBoundingClientRect();

      // Relative to the padding box. The end segments reach the padding edge and
      // inner ones take half the gap on each side, so the highlight tiles.
      let left = btnRect.left - rootRect.left - borderLeft;
      let width = btnRect.width;
      const inner = rootRect.width - borderLeft - borderRight;
      if (n === 1) {
        left = 0;
        width = inner;
      } else if (i === 0) {
        width = left + width + gap / 2;
        left = 0;
      } else if (i === n - 1) {
        left -= gap / 2;
        width = inner - left;
      } else {
        left -= gap / 2;
        width += gap;
      }

      // Snapping to device pixels avoids a one-pixel ghost edge.
      const dpr = window.devicePixelRatio || 1;
      const snap = (x: number) => Math.round(x * dpr) / dpr;
      const target = { left: snap(left), width: snap(width) };
      const previous = current;
      current = target;

      animation?.cancel();
      animation = null;
      const shouldAnimate = animate && canAnimate && !reduceMotion?.matches
        && previous != null && previous.width > 0 && target.width > 0;
      if (!shouldAnimate) {
        apply(target.left, target.width);
        return;
      }
      apply(previous.left, previous.width);
      animation = rail.animate(
        [
          { transform: `translate3d(${previous.left}px,0,0)`, width: `${previous.width}px`, opacity: 0.92 },
          { transform: `translate3d(${target.left}px,0,0)`, width: `${target.width}px`, opacity: 1 },
        ],
        { duration: 260, easing: "cubic-bezier(.22,.7,.28,1)", fill: "forwards" },
      );
      const finish = () => {
        apply(target.left, target.width);
        animation = null;
      };
      animation.addEventListener("finish", finish, { once: true });
      animation.addEventListener("cancel", finish, { once: true });
    },
  };
}
