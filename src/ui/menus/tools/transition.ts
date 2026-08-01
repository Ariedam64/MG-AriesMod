// View transition animation with Web Animations API
// Follows the same easing/duration convention as .qmm-seg__indicator in menu.ts

export async function swapViews(
  container: HTMLElement,
  from: HTMLElement,
  to: HTMLElement,
  direction: "forward" | "back"
): Promise<void> {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduced) {
    // Skip animation if user prefers reduced motion
    from.style.display = "none";
    to.style.display = "block";
    return;
  }

  // Ensure wrapper has proper styles for animation
  container.style.position = "relative";
  container.style.overflow = "hidden";

  // Restore incoming view display (both views use flex)
  to.style.display = "flex";

  // Position the outgoing panel absolutely so the incoming one can be laid out below
  from.style.position = "absolute";
  from.style.inset = "0";

  // Setup animations based on direction
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

  // Wait for both animations to complete
  await Promise.all([fromAnim.finished, toAnim.finished]);

  // Cleanup after animation
  from.style.display = "none";
  from.style.position = "";
  from.style.inset = "";
  from.style.transform = "";
  from.style.opacity = "";

  to.style.transform = "";
  to.style.opacity = "";
}
