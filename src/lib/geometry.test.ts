import { describe, expect, it } from 'vitest';
import { clampPlacement, toPdfRect, trimBounds, type Placement } from './geometry';

const page = { x: 0, y: 0, width: 600, height: 800 };
const at = (x: number, y: number, w: number): Placement => ({ id: 'a', page: 0, x, y, w });

describe('toPdfRect', () => {
  it('rotate 0: anchor is the bottom-left corner seen on screen', () => {
    // 300x100 signature, top-left at (300, 200) from the page's top-left
    expect(toPdfRect(at(0.5, 0.25, 0.5), page, 0, 3)).toEqual({ x: 300, y: 500, width: 300, height: 100, rotate: 0 });
  });

  it('honours a crop box that does not start at the origin', () => {
    const box = { x: 50, y: 100, width: 600, height: 800 };
    expect(toPdfRect(at(0.5, 0.25, 0.5), box, 0, 3)).toMatchObject({ x: 350, y: 600 });
  });

  it('rotate 90: top-left of the screen is the PDF bottom-left', () => {
    // displayed 800x600; signature 200x100 in the screen's top-left corner
    // → occupies PDF x 0..100, y 0..200; drawn CCW 90 from (100, 0)
    expect(toPdfRect(at(0, 0, 0.25), page, 90, 2)).toEqual({ x: 100, y: 0, width: 200, height: 100, rotate: 90 });
  });

  it('rotate 180: top-left of the screen is the PDF bottom-right', () => {
    expect(toPdfRect(at(0, 0, 0.5), page, 180, 3)).toEqual({ x: 600, y: 100, width: 300, height: 100, rotate: 180 });
  });

  it('rotate 270: top-left of the screen is the PDF top-right', () => {
    // occupies PDF x 500..600, y 600..800
    expect(toPdfRect(at(0, 0, 0.25), page, 270, 2)).toEqual({ x: 500, y: 800, width: 200, height: 100, rotate: 270 });
  });
});

describe('toPdfRect with a free rotation', () => {
  // centre of the drawn image, from pdf-lib's anchor (bottom-left) and CCW rotation
  const centre = (r: { x: number; y: number; width: number; height: number; rotate: number }) => {
    const a = (r.rotate * Math.PI) / 180;
    return [r.x + (r.width / 2) * Math.cos(a) - (r.height / 2) * Math.sin(a), r.y + (r.width / 2) * Math.sin(a) + (r.height / 2) * Math.cos(a)];
  };

  it('angle 90 on a plain page: turns clockwise on screen around the centre', () => {
    // 300x100 centred at screen (450, 250) → PDF centre (450, 550); clockwise 90 = CCW 270
    expect(toPdfRect({ ...at(0.5, 0.25, 0.5), angle: 90 }, page, 0, 3)).toEqual({ x: 400, y: 700, width: 300, height: 100, rotate: 270 });
  });

  it('keeps the centre for any angle on a /Rotate 90 page', () => {
    // displayed 800x600; 200x100 centred at screen (100, 50) → PDF centre (50, 100)
    const r = toPdfRect({ ...at(0, 0, 0.25), angle: 30 }, page, 90, 2);
    expect(r.rotate).toBe(60);
    const [cx, cy] = centre(r);
    expect(cx).toBeCloseTo(50);
    expect(cy).toBeCloseTo(100);
  });
});

describe('clampPlacement', () => {
  it('keeps the signature inside the page', () => {
    // page aspect 0.75, signature aspect 3 → full width is 0.25 of page height
    expect(clampPlacement(at(-1, 0.9, 2), 3, 0.75)).toMatchObject({ x: 0, y: 0.75, w: 1 });
  });

  it('limits width so a tall signature still fits vertically', () => {
    expect(clampPlacement(at(0, 0, 0.9), 0.5, 1).w).toBe(0.5);
  });

  it('keeps a rotated signature inside the page', () => {
    // portrait page; 90° turns a wide signature upright: 0.25 of page width, 0.75 of page height
    expect(clampPlacement({ ...at(0, 0, 1), angle: 90 }, 3, 0.75)).toMatchObject({ x: 0, y: 0.25, w: 1 });
  });

  it('shrinks a rotated signature that cannot fit', () => {
    // landscape page 1.5:1; upright 3:1 signature at full width would be 1.5 page heights tall
    expect(clampPlacement({ ...at(0, 0, 1), angle: 90 }, 3, 1.5).w).toBeCloseTo(2 / 3);
  });

  it('enforces a minimum size', () => {
    expect(clampPlacement(at(0.5, 0.5, 0.001), 3, 0.75).w).toBe(0.05);
  });
});

describe('trimBounds', () => {
  it('returns null for an empty canvas', () => {
    expect(trimBounds(new Uint8ClampedArray(4 * 3 * 4), 4, 3)).toBeNull();
  });

  it('finds the box around painted pixels', () => {
    const data = new Uint8ClampedArray(4 * 3 * 4);
    data[(1 * 4 + 1) * 4 + 3] = 255; // (1,1)
    data[(2 * 4 + 2) * 4 + 3] = 10; // (2,2)
    expect(trimBounds(data, 4, 3)).toEqual({ x: 1, y: 1, w: 2, h: 2 });
  });
});
