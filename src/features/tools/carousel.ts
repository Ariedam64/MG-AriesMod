// Image carousel for a tool's screenshots and the changelog's, with a
// full-screen zoom on click.

import { h } from "../../ui/kit/dom";
import { fetchImageBlob } from "./image";

const SWAP_DURATION_MS = 320;
const SWAP_EASING = "cubic-bezier(.22,.7,.28,1)";
const SWAP_OFFSET_PX = 40;
const ZOOM_SCALE = 1.8;

type Slide = { root: HTMLElement; img: HTMLImageElement };

export function renderCarousel(images: string[]): { root: HTMLElement } {
  const root = document.createElement("div");
  root.className = "mgt-carousel";

  if (!images.length) {
    return { root };
  }

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The whole stage opens the zoom, not just the <img>: the image is letterboxed
  // inside it, and clicking the empty margins should work too.
  const stage = document.createElement("div");
  stage.className = "mgt-carousel__stage";
  stage.setAttribute("role", "button");
  stage.tabIndex = 0;
  stage.title = "Click to enlarge";
  stage.setAttribute("aria-label", "Enlarge image");
  stage.onclick = () => openImageZoom(images[currentIndex]);
  stage.onkeydown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openImageZoom(images[currentIndex]);
  };

  let currentIndex = 0;
  let transitioning = false;
  const cachedUrls = new Map<string, string>();

  /** Fetches (once) and caches a blob URL for a remote image. */
  const resolveImageUrl = async (imageUrl: string): Promise<string> => {
    const cached = cachedUrls.get(imageUrl);
    if (cached) return cached;

    const blob = await fetchImageBlob(imageUrl);
    const objectUrl = URL.createObjectURL(blob);
    cachedUrls.set(imageUrl, objectUrl);
    return objectUrl;
  };

  const openImageZoom = (imageUrl: string) => {
    let closed = false;

    const overlay = h("div", "mgt-zoom");
    const box = h("div", "mgt-zoom__box");

    const dismiss = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKeyDown);

    const close = h("button", "mgt-nav mgt-zoom__close", "✕");
    close.type = "button";
    close.title = "Close";
    close.onclick = dismiss;

    const status = h("p", "mgt-state__text mgt-zoom__status", "Loading image...");

    const zoomImg = h("img", "mgt-zoom__img");
    zoomImg.alt = "Zoomed image";

    let zoomedState = false;
    zoomImg.onclick = (event) => {
      event.stopPropagation();
      if (!zoomedState) {
        const rect = zoomImg.getBoundingClientRect();
        const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1) * 100;
        const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1) * 100;
        zoomImg.style.transformOrigin = `${x}% ${y}%`;
      }
      zoomedState = !zoomedState;
      zoomImg.style.transform = zoomedState ? `scale(${ZOOM_SCALE})` : "scale(1)";
      zoomImg.classList.toggle("is-zoomed", zoomedState);
    };

    box.append(close, status, zoomImg);
    overlay.appendChild(box);
    overlay.onclick = (event) => {
      if (event.target === overlay) dismiss();
    };

    document.body.appendChild(overlay);

    void (async () => {
      try {
        // Reuses the carousel's cached blob URL. The carousel owns it, so it is never revoked here.
        const blobUrl = await resolveImageUrl(imageUrl);
        if (closed) return;
        zoomImg.src = blobUrl;
        status.remove();
        zoomImg.classList.add("is-loaded");
      } catch (error) {
        if (closed) return;
        console.warn("[Carousel] Failed to load zoom image:", error);
        status.textContent = "Unable to load image.";
        status.classList.add("is-error");
      }
    })();
  };

  const createSlide = (): Slide => {
    const slideRoot = document.createElement("div");
    slideRoot.className = "mgt-carousel__slide";

    // Decorative: the stage carries the accessible name and the click target.
    const img = document.createElement("img");
    img.alt = "";

    slideRoot.appendChild(img);
    return { root: slideRoot, img };
  };

  // Two layers: the visible one and the one being swapped in.
  let activeSlide = createSlide();
  let pendingSlide = createSlide();
  pendingSlide.root.style.opacity = "0";
  stage.append(activeSlide.root, pendingSlide.root);

  const dots = document.createElement("div");
  dots.className = "mgt-dots";

  const updateIndicators = () => {
    dots.querySelectorAll("button").forEach((dot, index) => {
      dot.classList.toggle("is-active", index === currentIndex);
    });
  };

  /** Wraps around both ends so navigation is infinite. */
  const normalizeIndex = (index: number) =>
    ((index % images.length) + images.length) % images.length;

  const goTo = async (rawIndex: number, direction: "next" | "prev") => {
    if (transitioning || images.length === 0) return;

    const index = normalizeIndex(rawIndex);
    if (index === currentIndex) return;

    transitioning = true;
    try {
      pendingSlide.img.src = await resolveImageUrl(images[index]);
      // Waits for actual pixels, so the swap never animates a blank frame.
      await pendingSlide.img.decode().catch(() => undefined);

      const offset = direction === "next" ? SWAP_OFFSET_PX : -SWAP_OFFSET_PX;
      const running: Animation[] = [];

      if (!prefersReduced) {
        const outgoing = activeSlide.root.animate(
          [
            { transform: "translateX(0)", opacity: 1 },
            { transform: `translateX(${-offset}px)`, opacity: 0 },
          ],
          { duration: SWAP_DURATION_MS, easing: SWAP_EASING, fill: "forwards" }
        );

        const incoming = pendingSlide.root.animate(
          [
            { transform: `translateX(${offset}px)`, opacity: 0 },
            { transform: "translateX(0)", opacity: 1 },
          ],
          { duration: SWAP_DURATION_MS, easing: SWAP_EASING, fill: "forwards" }
        );

        running.push(outgoing, incoming);
        await Promise.all([outgoing.finished, incoming.finished]);
      }

      // The incoming slide becomes the active one; recycle the old one for the next swap.
      activeSlide.root.style.transform = "";
      activeSlide.root.style.opacity = "0";
      pendingSlide.root.style.transform = "";
      pendingSlide.root.style.opacity = "1";

      // Inline styles now hold the end state, so releasing the fill:forwards
      // animations can't flash the pre-animation frame.
      running.forEach((animation) => animation.cancel());

      const previousActive = activeSlide;
      activeSlide = pendingSlide;
      pendingSlide = previousActive;

      currentIndex = index;
      updateIndicators();
    } catch (error) {
      console.warn("[Carousel] Failed to load image:", images[index], error);
    } finally {
      transitioning = false;
    }
  };

  if (images.length > 1) {
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "mgt-nav mgt-nav--prev";
    prevBtn.textContent = "‹";
    prevBtn.title = "Previous image";
    // Without this the click bubbles to the stage and opens the zoom too.
    prevBtn.onclick = (event) => {
      event.stopPropagation();
      void goTo(currentIndex - 1, "prev");
    };

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "mgt-nav mgt-nav--next";
    nextBtn.textContent = "›";
    nextBtn.title = "Next image";
    nextBtn.onclick = (event) => {
      event.stopPropagation();
      void goTo(currentIndex + 1, "next");
    };

    stage.append(prevBtn, nextBtn);

    images.forEach((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = index === 0 ? "mgt-dot is-active" : "mgt-dot";
      dot.title = `Image ${index + 1}`;
      dot.onclick = () => void goTo(index, index > currentIndex ? "next" : "prev");
      dots.appendChild(dot);
    });

    root.append(stage, dots);
  } else {
    root.appendChild(stage);
  }

  // Initial image: no animation, straight into the active slide.
  void (async () => {
    try {
      activeSlide.img.src = await resolveImageUrl(images[0]);
    } catch (error) {
      console.warn("[Carousel] Failed to load image:", images[0], error);
    }
  })();

  return { root };
}
