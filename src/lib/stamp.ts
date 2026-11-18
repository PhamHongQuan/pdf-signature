import type { Kind } from './geometry';

/** A transparent PNG ready to place: its bytes, an object URL to show it, and width/height. */
export type Stamp = { png: Uint8Array; url: string; aspect: number };
export type Stamps = Partial<Record<Kind, Stamp>>;

const INK = '#111827';
const FONT = "600 {px}px Inter, 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";

/**
 * The full name drawn as an image. pdf-lib's standard fonts cannot encode
 * Vietnamese, so the name goes into the PDF as a picture, like the signature.
 */
export function textCanvas(text: string, px: number): HTMLCanvasElement {
  const font = FONT.replace('{px}', String(Math.round(px)));
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const pad = Math.ceil(px * 0.15);
  const c = document.createElement('canvas');
  c.width = Math.ceil(probe.measureText(text).width) + pad * 2;
  c.height = Math.ceil(px * 1.35) + pad * 2;
  const ctx = c.getContext('2d')!;
  ctx.font = font;
  ctx.fillStyle = INK;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, c.height / 2);
  return c;
}

/** `top` above `bottom`, both centred horizontally. */
export function stack(top: HTMLCanvasElement, bottom: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(top.width, bottom.width);
  c.height = top.height + bottom.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(top, (c.width - top.width) / 2, 0);
  ctx.drawImage(bottom, (c.width - bottom.width) / 2, top.height);
  return c;
}

export async function toStamp(c: HTMLCanvasElement): Promise<Stamp> {
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Không tạo được ảnh.');
  return { png: new Uint8Array(await blob.arrayBuffer()), url: URL.createObjectURL(blob), aspect: c.width / c.height };
}

export function revokeStamps(stamps: Stamps): void {
  for (const s of Object.values(stamps)) URL.revokeObjectURL(s.url);
}
