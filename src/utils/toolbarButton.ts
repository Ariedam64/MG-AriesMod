// Inject a resilient button into the game's top-right toolbar.
// Strategy: detect toolbar via known aria-labels, fallback to game CSS class.

type Options = {
  onClick: () => void;
  iconUrl?: string;
  ariaLabel?: string;
  onMounted?: (btn: HTMLButtonElement) => void;
};

const KNOWN_ARIA = ["Chat", "Leaderboard", "Stats", "Open Activity Log"];
const TOOLBAR_FALLBACK_CLASS = "css-14caowy";
const OWN_BTN_SEL = '[data-qws-btn="true"]';

export function startInjectGamePanelButton(opts: Options): () => void {
  const { onClick, iconUrl = "", ariaLabel = "" } = opts;

  // Unique ID for this invocation — prevents reusing a stale wrapper/button
  // left in the DOM by a previous call whose cleanup didn't fully execute.
  const instanceId = Math.random().toString(36).slice(2, 9);

  let mountedBtn: HTMLButtonElement | null = null;
  let mountedWrap: HTMLDivElement | null = null;
  let isMounting = false;
  let mounted = false;

  const esc = (v: string) => {
    try {
      return typeof CSS?.escape === "function" ? CSS.escape(v) : v.replace(/"/g, '\\"');
    } catch {
      return v;
    }
  };

  function findToolbarRoot(): HTMLElement | null {
    // 1) Try known English aria-labels
    const selector = KNOWN_ARIA.map(a => `button[aria-label="${esc(a)}"]`).join(",");
    const knownBtn = document.querySelector(selector);

    if (knownBtn) {
      let parent = knownBtn.parentElement;
      while (parent && parent !== document.body) {
        const count = KNOWN_ARIA.reduce(
          (acc, a) => acc + parent!.querySelectorAll(`button[aria-label="${esc(a)}"]`).length,
          0,
        );
        if (count >= 2) return parent;
        parent = parent.parentElement;
      }
    }

    // 2) Fallback: game toolbar CSS class
    return document.querySelector<HTMLElement>(`.${TOOLBAR_FALLBACK_CLASS}`) ?? null;
  }

  function getReference(root: HTMLElement) {
    const all = Array.from(
      root.querySelectorAll<HTMLButtonElement>(`button:not(${OWN_BTN_SEL})`),
    );
    if (!all.length) return { refBtn: null, refWrapper: null };

    const filtered = all.filter(
      b => b.getAttribute("aria-label") !== ariaLabel,
    );
    const list = filtered.length ? filtered : all;

    const idx = list.length >= 2 ? list.length - 2 : list.length - 1;
    const refBtn = list[idx];

    const parent = refBtn?.parentElement;
    const refWrapper =
      parent?.parentElement === root && parent.tagName === "DIV" ? parent : null;

    return { refBtn, refWrapper };
  }

  function cloneButton(ref: HTMLButtonElement): HTMLButtonElement {
    const btn = ref.cloneNode(false) as HTMLButtonElement;
    btn.type = "button";
    btn.setAttribute("aria-label", ariaLabel);
    btn.title = ariaLabel;
    btn.dataset.qwsBtn = "true";
    btn.style.pointerEvents = "auto";
    btn.removeAttribute("id");

    if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.alt = "QWS";
      Object.assign(img.style, {
        pointerEvents: "none",
        userSelect: "none",
        width: "60%",
        height: "60%",
        objectFit: "contain",
        display: "block",
        margin: "auto",
      });
      btn.appendChild(img);
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { onClick(); } catch (e) { console.error("[ToolbarButton] onClick error:", ariaLabel, e); }
    });

    return btn;
  }

  function mount(): boolean {
    if (isMounting) return false;
    isMounting = true;

    try {
      const root = findToolbarRoot();
      if (!root) return false;

      const { refBtn, refWrapper } = getReference(root);
      if (!refBtn) return false;

      if (!mountedWrap) {
        // Only reuse a wrapper that belongs to THIS invocation (instanceId matches).
        // This prevents picking up a stale wrapper left by a previous hub that
        // wasn't fully cleaned up, which would bind us to its old click handler.
        mountedWrap = root.querySelector<HTMLDivElement>(
          `div[data-qws-wrapper="true"][data-qws-instance="${instanceId}"]`,
        );
        if (!mountedWrap) {
          // Remove only orphaned wrappers that belong to THIS button (same ariaLabel).
          // Using a label-scoped selector prevents destroying wrappers of other buttons
          // (e.g. "Notifications") which would cause an infinite mutual-remount loop.
          root.querySelectorAll<HTMLElement>(`div[data-qws-wrapper="true"][data-qws-label="${esc(ariaLabel)}"]`).forEach(el => el.remove());
          if (refWrapper) {
            mountedWrap = refWrapper.cloneNode(false) as HTMLDivElement;
            mountedWrap.dataset.qwsWrapper = "true";
            mountedWrap.dataset.qwsInstance = instanceId;
            mountedWrap.dataset.qwsLabel = ariaLabel;
            mountedWrap.removeAttribute("id");
          }
        }
      }

      if (!mountedBtn) {
        mountedBtn =
          mountedWrap?.querySelector<HTMLButtonElement>('button[data-qws-btn="true"]') || null;
        if (!mountedBtn) {
          // When there is no wrapper, also remove any stale root-level buttons
          // left by a previous invocation so we don't end up with duplicates.
          // Scoped to this button's aria-label to avoid touching other buttons.
          if (!mountedWrap) {
            root.querySelectorAll<HTMLButtonElement>(`button[data-qws-btn="true"][aria-label="${esc(ariaLabel)}"]`).forEach(el => el.remove());
          }
          mountedBtn = cloneButton(refBtn);
          if (mountedWrap) {
            mountedWrap.appendChild(mountedBtn);
          } else {
            root.appendChild(mountedBtn);
          }
        }
      }

      if (mountedWrap && mountedWrap.parentElement !== root) {
        root.appendChild(mountedWrap);
      }

      const inDOM = document.contains(mountedBtn);
      if (inDOM && !mounted) {
        mounted = true;
        console.log("[ToolbarButton] Mounted:", ariaLabel);
        try { opts.onMounted?.(mountedBtn); } catch {}
      }

      return inDOM;
    } finally {
      isMounting = false;
    }
  }

  const host = document.getElementById("App") || document.body;
  let timer: number | null = null;

  const observer = new MutationObserver(() => {
    if (mounted && mountedBtn && document.contains(mountedBtn)) return;

    if (mountedBtn && !document.contains(mountedBtn)) {
      console.warn("[ToolbarButton] Removed from DOM, retrying:", ariaLabel);
      mounted = false;
      mountedBtn = null;
      mountedWrap = null;
    }

    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      mount();
    }, 100);
  });

  const pollingInterval = window.setInterval(() => {
    if (mounted && mountedBtn && !document.contains(mountedBtn)) {
      console.warn("[ToolbarButton] Detected missing button (polling), remounting:", ariaLabel);
      mounted = false;
      mountedBtn = null;
      mountedWrap = null;
      mount();
    } else if (!mounted || !mountedBtn) {
      mount();
    }
  }, 2000);

  mount();
  observer.observe(host, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    clearInterval(pollingInterval);
    mountedWrap?.remove();
    // Also remove the button directly: when there is no wrapper the button
    // is a direct child of root. Without this, the orphan stays in the
    // toolbar across script reloads and accumulates with each invocation.
    mountedBtn?.remove();
    mountedBtn = null;
    mountedWrap = null;
  };
}
