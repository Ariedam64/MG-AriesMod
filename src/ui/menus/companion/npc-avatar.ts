// src/ui/menus/companion/npc-avatar.ts
// Compose le portrait du PNJ à partir de ses cosmétiques, cadré sur la tête.
//
// Le jeu empile des PNG pour dessiner un personnage ; on fait la même chose
// dans un canvas. Les images passent par `setImageSafe`, qui les route via GM
// dans l'Activity Discord où le chargement direct est bloqué.

import { readNpcOutfit, cosmeticUrl } from "../../../services/companion/avatar";
import { setImageSafe } from "../../../utils/discordCsp";

/** Les calques sont carrés ; cette taille sert de toile, pas d'affichage. */
const CANVAS_PX = 128;
/** Côté du portrait découpé. Assez grand pour rester net à 32 px. */
const PORTRAIT_PX = 64;

/**
 * Marge autour de la tête, en fraction de sa largeur.
 *
 * Un cadrage collé au personnage donne un portrait étouffé ; un peu d'air
 * autour, et ça ressemble à une photo de profil.
 */
const HEAD_PADDING = 0.22;

/**
 * Cadrage de repli, en fractions de la toile.
 *
 * Sert quand la mesure est impossible — un canvas teinté par une image
 * cross-origin refuse de rendre ses pixels. Un personnage debout a la tête en
 * haut et au centre : c'est tout ce que suppose ce repli.
 */
const FALLBACK_CROP = { x: 0.28, y: 0.04, size: 0.44 };

const pending = new Map<string, Promise<HTMLCanvasElement | null>>();

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Sans ça, une image d'une autre origine teinte le canvas et interdit d'en
    // relire les pixels — donc de mesurer où se trouve la tête.
    img.crossOrigin = "anonymous";
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () => resolve(null));
    setImageSafe(img, url);
  });
}

type Box = { x: number; y: number; width: number; height: number };

/**
 * Boîte englobante des pixels visibles.
 *
 * Les calques de cosmétiques sont très majoritairement transparents : leur
 * partie opaque, c'est le personnage. Rend `null` si la mesure est refusée ou
 * si rien n'est visible.
 */
function opaqueBounds(canvas: HTMLCanvasElement): Box | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  let pixels: Uint8ClampedArray;
  try {
    pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return null;
  }

  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      // Un alpha résiduel n'est pas du dessin : on ignore le quasi-transparent.
      if (pixels[(y * canvas.width + x) * 4 + 3] < 16) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Le carré à découper pour obtenir un portrait.
 *
 * La tête d'un personnage debout occupe le haut de sa silhouette, et sa largeur
 * d'épaules donne l'échelle : un carré de ce côté, posé sur le sommet et centré
 * horizontalement, cadre la tête et les épaules. Rien n'est mesuré en dur — le
 * cadrage suit le dessin, quel qu'il soit.
 */
function headCrop(canvas: HTMLCanvasElement): Box {
  const bounds = opaqueBounds(canvas);
  if (!bounds) {
    return {
      x: canvas.width * FALLBACK_CROP.x,
      y: canvas.height * FALLBACK_CROP.y,
      width: canvas.width * FALLBACK_CROP.size,
      height: canvas.height * FALLBACK_CROP.size,
    };
  }

  const side = Math.min(bounds.width * (1 + HEAD_PADDING * 2), bounds.height, canvas.height);
  const centreX = bounds.x + bounds.width / 2;
  // Ancré sur le sommet du personnage, remonté d'un souffle pour l'air du haut.
  const top = Math.max(0, bounds.y - side * (HEAD_PADDING / 2));

  return {
    x: Math.max(0, Math.min(centreX - side / 2, canvas.width - side)),
    y: Math.min(top, Math.max(0, canvas.height - side)),
    width: side,
    height: side,
  };
}

async function compose(npcId: string): Promise<HTMLCanvasElement | null> {
  const outfit = await readNpcOutfit(npcId).catch(() => []);
  if (outfit.length === 0) return null;

  const urls = outfit.map(cosmeticUrl).filter((url): url is string => url !== null);
  if (urls.length === 0) return null;

  const layers = await Promise.all(urls.map(loadImage));
  const drawable = layers.filter((img): img is HTMLImageElement => img !== null);
  // Rien n'a chargé : on rend la main au repli plutôt qu'un carré vide.
  if (drawable.length === 0) return null;

  const full = document.createElement("canvas");
  full.width = CANVAS_PX;
  full.height = CANVAS_PX;
  const ctx = full.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  for (const layer of drawable) ctx.drawImage(layer, 0, 0, CANVAS_PX, CANVAS_PX);

  const crop = headCrop(full);

  const portrait = document.createElement("canvas");
  portrait.width = PORTRAIT_PX;
  portrait.height = PORTRAIT_PX;
  const out = portrait.getContext("2d");
  if (!out) return null;
  // Le dessin est petit et agrandi : lissé, il baverait.
  out.imageSmoothingEnabled = false;
  out.drawImage(full, crop.x, crop.y, crop.width, crop.height, 0, 0, PORTRAIT_PX, PORTRAIT_PX);
  return portrait;
}

/**
 * Le portrait d'un PNJ, composé une seule fois par identité.
 *
 * Le résultat est mémorisé : le fil redessine ses bulles à chaque message, et
 * recomposer quatre PNG à chaque fois serait du gâchis. Rend `null` quand la
 * tenue n'est pas connue — l'appelant garde alors son repli.
 */
export function npcPortrait(npcId: string): Promise<HTMLCanvasElement | null> {
  let known = pending.get(npcId);
  if (!known) {
    known = compose(npcId).catch(() => null);
    pending.set(npcId, known);
  }
  return known;
}

/** Pose le portrait dans un conteneur, en gardant ce qu'il contient s'il n'y en a pas. */
export function fillWithPortrait(box: HTMLElement, npcId: string | null): void {
  if (!npcId) return;
  void npcPortrait(npcId).then((source) => {
    if (!source || !box.isConnected) return;

    // Un canvas ne peut être qu'à un endroit : chaque bulle a besoin du sien.
    const view = document.createElement("canvas");
    view.width = source.width;
    view.height = source.height;
    view.getContext("2d")?.drawImage(source, 0, 0);
    view.style.width = "100%";
    view.style.height = "100%";
    view.style.imageRendering = "pixelated";
    box.replaceChildren(view);
  });
}
