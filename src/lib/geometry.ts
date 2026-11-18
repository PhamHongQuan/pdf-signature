export type Placement = { id: string; page: number; x: number; y: number; w: number };
export type Box = { x: number; y: number; width: number; height: number };
export type PdfRect = { x: number; y: number; width: number; height: number; rotate: number };

const MIN_W = 0.05;

export function normalizeRotation(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Converts a placement (fractions of the page as displayed, i.e. after /Rotate)
 * into PDF user space for pdf-lib's drawImage: the anchor is the signature's
 * bottom-left corner as seen on screen, and the image is rotated CCW by the
 * page's /Rotate so it appears upright once the viewer rotates the page.
 */
export function toPdfRect(p: Placement, box: Box, rotate: number, aspect: number): PdfRect {
  const turned = rotate === 90 || rotate === 270;
  const W = turned ? box.height : box.width;
  const H = turned ? box.width : box.height;
  const width = p.w * W;
  const height = width / aspect;
  const u = p.x * W; // from the screen's left edge
  const v = p.y * H + height; // from the screen's top edge, to the bottom of the signature
  const { x: bx, y: by, width: bw, height: bh } = box;
  const [x, y] =
    rotate === 90 ? [bx + v, by + u]
    : rotate === 180 ? [bx + bw - u, by + v]
    : rotate === 270 ? [bx + bw - v, by + bh - u]
    : [bx + u, by + bh - v];
  return { x, y, width, height, rotate };
}

/** Keeps the signature at least MIN_W wide and fully inside the page. */
export function clampPlacement(p: Placement, aspect: number, pageAspect: number): Placement {
  const w = Math.min(Math.max(p.w, MIN_W), 1, aspect / pageAspect);
  const h = (w * pageAspect) / aspect; // as a fraction of page height
  const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);
  return { ...p, w, x: clamp(p.x, 1 - w), y: clamp(p.y, 1 - h) };
}

/** Bounding box of non-transparent pixels in RGBA data, or null if nothing is drawn. */
export function trimBounds(rgba: Uint8ClampedArray, width: number, height: number) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
