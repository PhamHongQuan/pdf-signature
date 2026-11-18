/** What a placement stamps: the drawn signature, the typed full name, or both stacked. */
export type Kind = 'sign' | 'name' | 'both';
/** `angle`: degrees, clockwise as seen on screen, around the centre. `kind` defaults to 'sign'. */
export type Placement = { id: string; page: number; x: number; y: number; w: number; angle?: number; kind?: Kind };
export type Box = { x: number; y: number; width: number; height: number };
export type PdfRect = { x: number; y: number; width: number; height: number; rotate: number };

const MIN_W = 0.05;

export function normalizeRotation(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

// Exact at multiples of 90° (Math.cos(π/2) is 6e-17, not 0).
const clean = (n: number) => Math.round(n * 1e9) / 1e9;
const cos = (deg: number) => clean(Math.cos((deg * Math.PI) / 180));
const sin = (deg: number) => clean(Math.sin((deg * Math.PI) / 180));

/**
 * Converts a placement (fractions of the page as displayed, i.e. after /Rotate)
 * into PDF user space for pdf-lib's drawImage, which rotates CCW around the
 * anchor (the image's own bottom-left corner). The image turns CCW by the
 * page's /Rotate, so it looks upright once the viewer rotates the page, minus
 * the placement's clockwise screen angle.
 */
export function toPdfRect(p: Placement, box: Box, rotate: number, aspect: number): PdfRect {
  const turned = rotate === 90 || rotate === 270;
  const W = turned ? box.height : box.width;
  const H = turned ? box.width : box.height;
  const width = p.w * W;
  const height = width / aspect;
  const u = p.x * W + width / 2; // centre, from the screen's left edge
  const v = p.y * H + height / 2; // centre, from the screen's top edge
  const { x: bx, y: by, width: bw, height: bh } = box;
  const [cx, cy] =
    rotate === 90 ? [bx + v, by + u]
    : rotate === 180 ? [bx + bw - u, by + v]
    : rotate === 270 ? [bx + bw - v, by + bh - u]
    : [bx + u, by + bh - v];
  const phi = normalizeRotation(rotate - (p.angle ?? 0));
  const [hx, hy] = [-width / 2, -height / 2]; // bottom-left corner relative to the centre
  const x = clean(cx + hx * cos(phi) - hy * sin(phi));
  const y = clean(cy + hx * sin(phi) + hy * cos(phi));
  return { x, y, width, height, rotate: phi };
}

/** Keeps the signature at least MIN_W wide and, as rotated, fully inside the page. */
export function clampPlacement(p: Placement, aspect: number, pageAspect: number): Placement {
  // Work in units of page height: the page is pageAspect wide and 1 tall.
  const a = p.angle ?? 0;
  const c = Math.abs(cos(a));
  const s = Math.abs(sin(a));
  let w = Math.max(p.w, MIN_W);
  const extent = (ww: number) => {
    const wu = ww * pageAspect;
    const hu = wu / aspect;
    return [(wu * c + hu * s) / 2, (wu * s + hu * c) / 2]; // half size of the rotated box
  };
  const [ex0, ey0] = extent(w);
  w *= Math.min(1, pageAspect / 2 / ex0, 1 / 2 / ey0);
  const [ex, ey] = extent(w);
  const wu = w * pageAspect;
  const hu = wu / aspect;
  const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
  const cx = clamp(p.x * pageAspect + wu / 2, ex, pageAspect - ex);
  const cy = clamp(p.y + hu / 2, ey, 1 - ey);
  return { ...p, w, x: clean((cx - wu / 2) / pageAspect), y: clean(cy - hu / 2) };
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
