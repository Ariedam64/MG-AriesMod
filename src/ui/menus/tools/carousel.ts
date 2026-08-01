// Carousel component for displaying tool images
import { fetchImageBlob } from "./image";

export function renderCarousel(images: string[]): { root: HTMLElement } {
  const root = document.createElement("div");
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.gap = "12px";
  root.style.width = "100%";

  if (!images.length) {
    return { root };
  }

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
  imageWrapper.style.display = "flex";
  imageWrapper.style.alignItems = "center";
  imageWrapper.style.justifyContent = "center";

  const img = document.createElement("img");
  img.alt = "Tool preview";
  img.style.maxWidth = "100%";
  img.style.maxHeight = "100%";
  img.style.objectFit = "contain";
  img.style.display = "block";
  img.style.cursor = "zoom-in";

  let currentIndex = 0;
  const cachedUrls = new Map<string, string>();

  let zoomed = false;
  let lastOrigin = "center center";

  const openImageZoom = (imageUrl: string) => {
    let objectUrl: string | undefined;
    let closed = false;

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.85)";
    overlay.style.backdropFilter = "blur(4px)";
    overlay.style.zIndex = "9999";
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

    const close = document.createElement("button");
    close.textContent = "✕";
    close.style.position = "absolute";
    close.style.top = "8px";
    close.style.right = "8px";
    close.style.border = "1px solid #ffffff33";
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

    close.onclick = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      closed = true;
      overlay.remove();
    };

    const status = document.createElement("div");
    status.textContent = "Loading zoom...";
    status.style.padding = "14px 18px";
    status.style.fontSize = "13px";
    status.style.opacity = "0.85";

    const zoomImg = document.createElement("img");
    zoomImg.alt = "Zoomed image";
    zoomImg.style.display = "block";
    zoomImg.style.maxWidth = "100%";
    zoomImg.style.maxHeight = "90vh";
    zoomImg.style.objectFit = "contain";
    zoomImg.style.transition = "transform 200ms ease";
    zoomImg.style.cursor = "zoom-in";
    zoomImg.style.display = "none";

    let zoomedState = false;
    const toggleZoom = (event?: MouseEvent) => {
      if (!zoomedState && event) {
        const rect = zoomImg.getBoundingClientRect();
        const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1) * 100;
        const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1) * 100;
        lastOrigin = `${x}% ${y}%`;
        zoomImg.style.transformOrigin = lastOrigin;
      }
      zoomedState = !zoomedState;
      zoomImg.style.transform = zoomedState ? "scale(1.8)" : "scale(1)";
      zoomImg.style.cursor = zoomedState ? "zoom-out" : "zoom-in";
    };

    zoomImg.onclick = (event) => {
      event.stopPropagation();
      toggleZoom(event);
    };

    box.append(close, status, zoomImg);
    overlay.appendChild(box);
    overlay.onclick = (ev) => {
      if (ev.target === overlay) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        closed = true;
        overlay.remove();
      }
    };

    document.body.appendChild(overlay);

    void (async () => {
      try {
        const blob = await fetchImageBlob(imageUrl);
        if (closed) return;
        objectUrl = URL.createObjectURL(blob);
        zoomImg.src = objectUrl;
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

  const loadImage = async (index: number) => {
    if (index < 0 || index >= images.length) return;

    currentIndex = index;
    const imageUrl = images[index];

    // Check cache first
    if (cachedUrls.has(imageUrl)) {
      img.src = cachedUrls.get(imageUrl)!;
      updateIndicators();
      return;
    }

    // Lazy load
    try {
      const blob = await fetchImageBlob(imageUrl);
      const objUrl = URL.createObjectURL(blob);
      cachedUrls.set(imageUrl, objUrl);
      img.src = objUrl;
      updateIndicators();
    } catch (error) {
      console.warn("[Carousel] Failed to load image:", imageUrl, error);
      img.src = ""; // Fallback to broken image
    }
  };

  const updateIndicators = () => {
    dotsContainer.querySelectorAll("button").forEach((dot, idx) => {
      dot.style.opacity = idx === currentIndex ? "1" : "0.4";
    });
  };

  img.onclick = () => openImageZoom(images[currentIndex]);
  imageWrapper.appendChild(img);

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "‹";
  prevBtn.type = "button";
  prevBtn.style.position = "absolute";
  prevBtn.style.left = "12px";
  prevBtn.style.top = "50%";
  prevBtn.style.transform = "translateY(-50%)";
  prevBtn.style.background = "#000000aa";
  prevBtn.style.border = "1px solid #ffffff33";
  prevBtn.style.color = "#fff";
  prevBtn.style.width = "40px";
  prevBtn.style.height = "40px";
  prevBtn.style.borderRadius = "50%";
  prevBtn.style.cursor = "pointer";
  prevBtn.style.fontSize = "24px";
  prevBtn.style.display = "flex";
  prevBtn.style.alignItems = "center";
  prevBtn.style.justifyContent = "center";
  prevBtn.style.zIndex = "1";
  prevBtn.style.transition = "background 150ms ease";
  prevBtn.onmouseenter = () => {
    prevBtn.style.background = "#000000dd";
  };
  prevBtn.onmouseleave = () => {
    prevBtn.style.background = "#000000aa";
  };
  prevBtn.onclick = () => loadImage(currentIndex - 1);

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "›";
  nextBtn.type = "button";
  nextBtn.style.position = "absolute";
  nextBtn.style.right = "12px";
  nextBtn.style.top = "50%";
  nextBtn.style.transform = "translateY(-50%)";
  nextBtn.style.background = "#000000aa";
  nextBtn.style.border = "1px solid #ffffff33";
  nextBtn.style.color = "#fff";
  nextBtn.style.width = "40px";
  nextBtn.style.height = "40px";
  nextBtn.style.borderRadius = "50%";
  nextBtn.style.cursor = "pointer";
  nextBtn.style.fontSize = "24px";
  nextBtn.style.display = "flex";
  nextBtn.style.alignItems = "center";
  nextBtn.style.justifyContent = "center";
  nextBtn.style.zIndex = "1";
  nextBtn.style.transition = "background 150ms ease";
  nextBtn.onmouseenter = () => {
    nextBtn.style.background = "#000000dd";
  };
  nextBtn.onmouseleave = () => {
    nextBtn.style.background = "#000000aa";
  };
  nextBtn.onclick = () => loadImage(currentIndex + 1);

  container.append(imageWrapper, prevBtn, nextBtn);

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
    dot.onclick = () => loadImage(idx);
    dotsContainer.appendChild(dot);
  });

  root.append(container, dotsContainer);

  // Load first image
  void loadImage(0);

  return { root };
}
