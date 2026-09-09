// src/ui/menus/companion/modal.ts
// Coquille commune des popups du companion.
//
// Les fenêtres du HUD remontent leur z-index au focus, et une popup vit hors de
// la fenêtre qui l'ouvre : les deux détails ci-dessous sont la raison d'être de
// ce fichier, et les dupliquer dans chaque popup revenait à les oublier une
// fois sur deux.

import { BORDER, CARD_BG, TEAL, TEXT, TEXT_DIM, css } from "../panel-ui";

export type MenuCardOptions = {
  name: string;
  /** Une ligne : ce que l'entrée fait, ou pourquoi elle ne peut rien faire. */
  detail: string;
  /** Rendue grisée, et le détail passe en teal pour se lire comme une raison. */
  disabled?: boolean;
  onClick(): void;
};

/**
 * Entrée cliquable d'une liste : un nom, une ligne d'explication.
 *
 * Une entrée indisponible reste visible mais grisée : la faire disparaître
 * laisserait croire qu'elle n'existe pas.
 */
export function menuCard(options: MenuCardOptions): HTMLButtonElement {
  const disabled = options.disabled === true;

  const card = document.createElement("button");
  card.type = "button";
  card.disabled = disabled;
  css(card, {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "3px",
    padding: "11px 12px",
    borderRadius: "12px",
    border: `1px solid ${BORDER}`,
    background: CARD_BG,
    cursor: disabled ? "default" : "pointer",
    textAlign: "left",
    font: "inherit",
    opacity: disabled ? "0.55" : "1",
    transition: "background 120ms ease, border-color 120ms ease",
  });

  const name = document.createElement("div");
  css(name, { fontSize: "13px", fontWeight: "600", color: disabled ? TEXT_DIM : TEXT });
  name.textContent = options.name;

  const detail = document.createElement("div");
  css(detail, { fontSize: "11.5px", lineHeight: "1.45", color: disabled ? TEAL : TEXT_DIM });
  detail.textContent = options.detail;

  card.append(name, detail);

  if (!disabled) {
    card.addEventListener("mouseenter", () => css(card, { background: "rgba(255,255,255,0.06)" }));
    card.addEventListener("mouseleave", () => css(card, { background: CARD_BG }));
    card.addEventListener("click", options.onClick);
  }

  return card;
}

export type ModalOptions = {
  /** Fenêtre du HUD d'où vient l'appel : sert au placement et à la fermeture. */
  host: HTMLElement;
  title: string;
  /** Largeur maximale du panneau. */
  widthPx?: number;
  onClose?: () => void;
};

export type Modal = {
  /** Corps défilant : c'est là que le contenu va. */
  body: HTMLElement;
  /** Barre du bas, vide tant qu'on n'y met rien. */
  footer: HTMLElement;
  close(): void;
  isOpen(): boolean;
};

export function openModal(options: ModalOptions): Modal {
  let closed = false;

  const scrim = document.createElement("div");
  // Le z-index se déduit de la fenêtre appelante : les fenêtres du HUD montent
  // d'un cran à chaque focus, une constante finirait par passer dessous.
  const hostZ = Number.parseInt(getComputedStyle(options.host).zIndex, 10);
  css(scrim, {
    position: "fixed",
    inset: "0",
    zIndex: String((Number.isFinite(hostZ) ? hostZ : 2_000_001) + 1),
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
    background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(4px)",
  });

  const panel = document.createElement("div");
  css(panel, {
    display: "flex",
    flexDirection: "column",
    width: `min(${options.widthPx ?? 420}px, 100%)`,
    maxHeight: "min(520px, 88vh)",
    borderRadius: "16px",
    border: `1px solid ${BORDER}`,
    background: "#101620",
    boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
    overflow: "hidden",
  });
  // Un clic dans la popup ne doit pas la refermer.
  panel.addEventListener("click", (event) => event.stopPropagation());

  const header = document.createElement("div");
  css(header, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 14px",
    borderBottom: `1px solid ${BORDER}`,
    flex: "0 0 auto",
  });

  const title = document.createElement("div");
  css(title, { fontSize: "14px", fontWeight: "600", color: TEXT, flex: "1", minWidth: "0" });
  title.textContent = options.title;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "✕";
  closeButton.title = "Close";
  css(closeButton, {
    width: "28px",
    height: "28px",
    flex: "0 0 auto",
    borderRadius: "8px",
    border: `1px solid ${BORDER}`,
    background: "rgba(255,255,255,0.03)",
    color: TEXT_DIM,
    cursor: "pointer",
    fontSize: "12px",
    lineHeight: "1",
  });
  closeButton.addEventListener("click", () => close());
  header.append(title, closeButton);

  const body = document.createElement("div");
  body.className = "qws-pnl-scroll";
  css(body, {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "12px 14px",
    overflowY: "auto",
    // Sans cette paire, un enfant de colonne flex refuse de descendre sous sa
    // hauteur de contenu : le corps déborderait au lieu de défiler.
    flex: "1 1 auto",
    minHeight: "0",
  });

  const footer = document.createElement("div");
  css(footer, {
    display: "none",
    alignItems: "center",
    gap: "10px",
    padding: "12px 14px",
    borderTop: `1px solid ${BORDER}`,
    flex: "0 0 auto",
  });
  // La barre n'existe que si on lui donne quelque chose à porter.
  const showFooterWhenFilled = new MutationObserver(() => {
    footer.style.display = footer.childElementCount > 0 ? "flex" : "none";
  });
  showFooterWhenFilled.observe(footer, { childList: true });

  panel.append(header, body, footer);
  scrim.append(panel);

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }

  function close(): void {
    if (closed) return;
    closed = true;
    clearInterval(hostWatch);
    showFooterWhenFilled.disconnect();
    document.removeEventListener("keydown", onKeyDown, true);
    scrim.remove();
    options.onClose?.();
  }

  // La popup survit à la fermeture de sa fenêtre : sans cette veille, elle
  // resterait seule à l'écran, sans rien pour la faire disparaître.
  const hostWatch = window.setInterval(() => {
    if (!options.host.isConnected) close();
  }, 1000);

  scrim.addEventListener("click", () => close());
  document.addEventListener("keydown", onKeyDown, true);
  (document.documentElement || document.body).appendChild(scrim);

  return {
    body,
    footer,
    close,
    isOpen: () => !closed,
  };
}
