// Carousel component for displaying tool images
import { fetchImageBlob } from "./image";

/** Same top-layer value used by the other full-screen overlays (sellAllPets, roomPrivacyNotice). */
const OVERLAY_Z_INDEX = "2147483647";
const SWAP_DURATION_MS = 320;
const SWAP_EASING = "cubic-bezier(.22,.7,.28,1)";
const SWAP_OFFSET_PX = 40;
const ZOOM_SCALE = 1.8;

type Slide = { root: HTMLElement; img: HTMLImageElement };

export function renderCarousel(images: string[]): { root: HTMLElement } {
  const root = document.createElement("div");
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.gap = "12px";
  root.style.width = "100%";

  if (!images.length) {
    return { root };
  }

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const container = document.createElement("div");
  container.style.position = "relative";
  container.style.width = "100%";
  container.style.background = "#ffffff05";
  container.style.borderRadius = "8px";
  container.style.overflow = "hidden";
  container.style.aspectRatio = "16 / 10";

  const imageWrapper = document.createElement("div");
  imageWrapper.style.position = "relative";
  imageWrapper.style.width = "100%";
  imageWrapper.style.height = "100%";
  imageWrapper.style.overflow = "hidden";

  let currentIndex = 0;
  let transitioning = false;
  const cachedUrls = new Map<string, string>();

  const createSlide = (): Slide => {
    const slideRoot = document.createElement("div");
    slideRoot.style.position = "absolute";
    slideRoot.style.inset = "0";
    slideRoot.style.display = "flex";
    slideRoot.style.alignItems = "center";
    slideRoot.style.justifyContent = "center";

    const img = document.createElement("img");
    img.alt = "Tool preview";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "100%";
    img.style.objectFit = "contain";
    img.style.display = "block";
    img.style.cursor = "zoom-in";
    img.onclick = () => openImageZoom(images[currentIndex]);

    slideRoot.appendChild(img);
    return { root: slideRoot, img };
  };

  // Two layers: the visible one and the one being swapped in.
  let activeSlide = createSlide();
  let pendingSlide = createSlide();
  pendingSlide.root.style.opacity = "0";
  imageWrapper.append(activeSlide.root, pendingSlide.root);

  const openImageZoom = (imageUrl: string) => {
    let closed = false;

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.85)";
    overlay.style.backdropFilter = "blur(4px)";
    overlay.style.zIndex = OVERLAY_Z_INDEX;
    overlay.style.display = "grid";
    overlay.style.placeItems = "center";
    overlay.style.padding = "20px";

    const box = document.createElement("div");
    box.style.position = "relative";
    box.style.maxWidth = "90vw";
    box.style.maxHeight = "90vh";
    box.style.background = "#0f1318";
    box.style.border = "1px solid #ffffff22";
    box.style.borderRadius = "12px";
    box.style.boxShadow = "0 20px 50px rgba(0,0,0,0.45)";
    box.style.overflow = "hidden";

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

    const close = document.createElement("button");
    close.textContent = "✕";
    close.type = "button";
    close.style.position = "absolute";
    close.style.top = "8px";
    close.style.right = "8px";
    close.style.borderRadius = "8px";
    close.style.background = "#0009";
    close.style.color = "#fff";
    close.style.width = "32px";
    close.style.height = "32px";
    close.style.cursor = "pointer";
    close.style.fontSize = "16px";
    close.style.lineHeight = "1";
    close.style.display = "grid";
    close.style.placeItems = "center";
    close.style.zIndex = "2";
    close.style.border = "none";
    close.style.padding = "0";
    close.onclick = dismiss;

    const status = document.createElement("div");
    status.textContent = "Loading zoom...";
    status.style.padding = "14px 18px";
    status.style.fontSize = "13px";
    status.style.opacity = "0.85";

    const zoomImg = document.createElement("img");
    zoomImg.alt = "Zoomed image";
    zoomImg.style.maxWidth = "100%";
    zoomImg.style.maxHeight = "90vh";
    zoomImg.style.objectFit = "contain";
    zoomImg.style.transition = "transform 200ms ease";
    zoomImg.style.cursor = "zoom-in";
    zoomImg.style.display = "none";

    let zoomedState = false;
    const toggleZoom = (event: MouseEvent) => {
      if (!zoomedState) {
        const rect = zoomImg.getBoundingClientRect();
        const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1) * 100;
        const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1) * 100;
        zoomImg.style.transformOrigin = `${x}% ${y}%`;
      }
      zoomedState = !zoomedState;
      zoomImg.style.transform = zoomedState ? `scale(${ZOOM_SCALE})` : "scale(1)";
      zoomImg.style.cursor = zoomedState ? "zoom-out" : "zoom-in";
    };

    zoomImg.onclick = (event) => {
      event.stopPropagation();
      toggleZoom(event);
    };

    box.append(close, status, zoomImg);
    overlay.appendChild(box);
    overlay.onclick = (event) => {
      if (event.target === overlay) dismiss();
    };

    document.body.appendChild(overlay);

    void (async () => {
      try {
        // Reuses the carousel's cached blob URL, which the carousel owns — never revoked here.
        const blobUrl = await resolveImageUrl(imageUrl);
        if (closed) return;
        zoomImg.src = blobUrl;
        status.remove();
        zoomImg.style.display = "block";
      } catch (error) {
        if (closed) return;
        console.warn("[Carousel] Failed to load zoom image:", error);
        status.textContent = "Unable to load image.";
        status.style.color = "#ffb3b3";
      }
    })();
  };

  /** Fetches (once) and caches a blob URL for a remote image. */
  const resolveImageUrl = async (imageUrl: string): Promise<string> => {
    const cached = cachedUrls.get(imageUrl);
    if (cached) return cached;

    const blob = await fetchImageBlob(imageUrl);
    const objectUrl = URL.createObjectURL(blob);
    cachedUrls.set(imageUrl, objectUrl);
    return objectUrl;
  };

  /** Waits for the <img> to actually have pixels, so the swap never animates a blank frame. */
  const awaitDecode = (img: HTMLImageElement): Promise<void> =>
    img.decode().catch(() => undefined);

  const updateIndicators = () => {
    dotsContainer.querySelectorAll("button").forEach((dot, idx) => {
      dot.style.opacity = idx === currentIndex ? "1" : "0.4";
    });
  };

  /** Wraps around both ends so navigation is infinite. */
  const normalizeIndex = (index: number) => ((index % images.length) + images.length) % images.length;

  const goTo = async (rawIndex: number, direction: "next" | "prev") => {
    if (transitioning || images.length === 0) return;

    const index = normalizeIndex(rawIndex);
    if (index === currentIndex) return;

    transitioning = true;
    try {
      const blobUrl = await resolveImageUrl(images[index]);
      pendingSlide.img.src = blobUrl;
      await awaitDecode(pendingSlide.img);

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

  const makeNavButton = (label: string, side: "left" | "right") => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.type = "button";
    btn.style.position = "absolute";
    btn.style[side] = "12px";
    btn.style.top = "50%";
    btn.style.transform = "translateY(-50%)";
    btn.style.background = "#000000aa";
    btn.style.border = "1px solid #ffffff33";
    btn.style.color = "#fff";
    btn.style.width = "40px";
    btn.style.height = "40px";
    btn.style.borderRadius = "50%";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "24px";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.zIndex = "1";
    btn.style.transition = "background 150ms ease";
    btn.onmouseenter = () => {
      btn.style.background = "#000000dd";
    };
    btn.onmouseleave = () => {
      btn.style.background = "#000000aa";
    };
    return btn;
  };

  const prevBtn = makeNavButton("‹", "left");
  prevBtn.onclick = () => void goTo(currentIndex - 1, "prev");

  const nextBtn = makeNavButton("›", "right");
  nextBtn.onclick = () => void goTo(currentIndex + 1, "next");

  container.append(imageWrapper, prevBtn, nextBtn);

  // A single image needs no navigation affordances.
  if (images.length < 2) {
    prevBtn.style.display = "none";
    nextBtn.style.display = "none";
  }

  // Indicators
  const dotsContainer = document.createElement("div");
  dotsContainer.style.display = "flex";
  dotsContainer.style.gap = "6px";
  dotsContainer.style.justifyContent = "center";
  dotsContainer.style.padding = "0";

  images.forEach((_, idx) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.style.width = "8px";
    dot.style.height = "8px";
    dot.style.borderRadius = "50%";
    dot.style.background = "#ffffff44";
    dot.style.border = "none";
    dot.style.cursor = "pointer";
    dot.style.opacity = idx === 0 ? "1" : "0.4";
    dot.style.transition = "opacity 150ms ease";
    dot.style.padding = "0";
    dot.onclick = () => void goTo(idx, idx > currentIndex ? "next" : "prev");
    dotsContainer.appendChild(dot);
  });

  if (images.length > 1) {
    root.append(container, dotsContainer);
  } else {
    root.append(container);
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
