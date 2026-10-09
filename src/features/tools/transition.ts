// Slides one view out and the next one in, with the same easing as the kit's
// segmented control.

export async function swapViews(
  container: HTMLElement,
  from: HTMLElement,
  to: HTMLElement,
  direction: "forward" | "back"
): Promise<void> {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Clearing the inline display hands it back to the view's own flex rule.
  if (prefersReduced) {
    from.style.display = "none";
    to.style.display = "";
    return;
  }

  container.style.position = "relative";
  container.style.overflow = "hidden";

  to.style.display = "";

  // Position the outgoing panel absolutely so the incoming one can be laid out below
  from.style.position = "absolute";
  from.style.inset = "0";

  const fromTranslate = direction === "forward" ? -24 : 24;
  const toTranslate = direction === "forward" ? 24 : -24;

  const fromAnim = from.animate(
    [
      { transform: "translateX(0)", opacity: 1 },
      { transform: `translateX(${fromTranslate}px)`, opacity: 0 },
    ],
    {
      duration: 260,
      easing: "cubic-bezier(.22,.7,.28,1)",
      fill: "forwards",
    }
  );

  const toAnim = to.animate(
    [
      { transform: `translateX(${toTranslate}px)`, opacity: 0 },
      { transform: "translateX(0)", opacity: 1 },
    ],
    {
      duration: 260,
      easing: "cubic-bezier(.22,.7,.28,1)",
      fill: "forwards",
    }
  );

  await Promise.all([fromAnim.finished, toAnim.finished]);

  from.style.display = "none";
  from.style.position = "";
  from.style.inset = "";
  from.style.transform = "";
  from.style.opacity = "";

  to.style.transform = "";
  to.style.opacity = "";

  // Left hidden, it would clip the focus ring of the cards along the edges.
  container.style.overflow = "";
}
