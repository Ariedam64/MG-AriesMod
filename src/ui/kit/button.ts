import { h, iconNode } from "./dom";

type ButtonVariant = "default" | "primary" | "secondary" | "danger" | "ghost";

export type ButtonOptions = {
  onClick?: () => void | Promise<void>;
  /** `secondary` looks like `default`; it stays accepted for older callers. */
  variant?: ButtonVariant;
  /** `md` for menus, `sm` for dense panels, `xs` for window chrome. */
  size?: "xs" | "sm" | "md";
  fullWidth?: boolean;
  /** Takes the whole line in a block container, like a `div` would. */
  block?: boolean;
  icon?: string | HTMLElement;
  iconPosition?: "left" | "right";
  tooltip?: string;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  active?: boolean;
  /**
   * Dims the button and ignores clicks until an async `onClick` settles, so a
   * slow action cannot be started twice.
   */
  lockWhilePending?: boolean;
};

/** A button handle: the element plus the two state setters menus use. */
export type KitButton = HTMLButtonElement & {
  setEnabled(enabled: boolean): void;
  setActive(active: boolean): void;
};

export function button(label: string, opts: ButtonOptions = {}): KitButton {
  const btn = h("button", "qmm-btn") as KitButton;
  btn.type = "button";

  const text = (label ?? "").trim();
  const labelEl = !opts.icon || text ? h("span", "label", label) : null;
  if (opts.icon) {
    const icon = iconNode(opts.icon, "qmm-btn__icon");
    if (opts.iconPosition === "right") icon.classList.add("is-right");
    if (!text) btn.classList.add("qmm-btn--icon");
    btn.append(icon);
  }
  if (labelEl) btn.append(labelEl);

  if (opts.variant && opts.variant !== "default" && opts.variant !== "secondary") {
    btn.classList.add(`qmm-btn--${opts.variant}`);
  }
  if (opts.size && opts.size !== "md") btn.classList.add(`qmm-btn--${opts.size}`);
  if (opts.fullWidth) btn.classList.add("qmm-btn--full");
  if (opts.block) btn.classList.add("qmm-btn--block");
  if (opts.active) btn.classList.add("active");
  if (opts.tooltip || opts.title) btn.title = opts.tooltip || opts.title || "";
  if (opts.ariaLabel) btn.setAttribute("aria-label", opts.ariaLabel);

  const onClick = opts.onClick;
  if (onClick && opts.lockWhilePending) {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      btn.classList.add("is-busy");
      try {
        await onClick();
      } finally {
        btn.classList.remove("is-busy");
      }
    });
  } else if (onClick) {
    btn.addEventListener("click", () => void onClick());
  }

  btn.setEnabled = (enabled) => setButtonEnabled(btn, enabled);
  btn.setActive = (active) => btn.classList.toggle("active", !!active);
  if (opts.disabled) setButtonEnabled(btn, false);
  return btn;
}

export function setButtonEnabled(btn: HTMLButtonElement, enabled: boolean): void {
  btn.disabled = !enabled;
  btn.classList.toggle("is-disabled", !enabled);
  btn.setAttribute("aria-disabled", String(!enabled));
}
