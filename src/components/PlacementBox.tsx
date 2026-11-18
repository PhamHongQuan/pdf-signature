import { useRef, type PointerEvent } from 'react';
import { clampPlacement, normalizeRotation, type Placement } from '../lib/geometry';

interface Props {
  p: Placement;
  url: string;
  aspect: number;
  pageAspect: number;
  /** Selected: shows the frame and the remove/rotate/resize handles. */
  selected: boolean;
  onSelect: () => void;
  onChange: (p: Placement) => void;
  onRemove: (id: string) => void;
}

type Mode = 'move' | 'resize' | 'rotate';
type Drag = {
  mode: Mode;
  x: number;
  y: number;
  start: Placement;
  rect: DOMRect; // the page overlay
  centre: { x: number; y: number }; // signature centre, in client pixels
  id: number;
};

const SNAP = 5; // degrees: snap to 0/90/180/270 when this close

function snap(angle: number): number {
  const a = normalizeRotation(angle);
  const nearest = Math.round(a / 90) * 90;
  return Math.abs(a - nearest) <= SNAP ? normalizeRotation(nearest) : a;
}

/** A placed signature: drag to move, corner to resize, top knob to rotate, × to remove. */
export function PlacementBox({ p, url, aspect, pageAspect, selected, onSelect, onChange, onRemove }: Props) {
  const drag = useRef<Drag | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const angle = p.angle ?? 0;

  const begin = (mode: Mode) => (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    if (!e.isPrimary || e.button !== 0) return;
    onSelect();
    const overlay = e.currentTarget.closest('.page-overlay') as HTMLElement;
    const b = boxRef.current!.getBoundingClientRect(); // a rotated box's bounding rect shares its centre
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      mode,
      x: e.clientX,
      y: e.clientY,
      start: p,
      rect: overlay.getBoundingClientRect(),
      centre: { x: b.left + b.width / 2, y: b.top + b.height / 2 },
      id: e.pointerId,
    };
  };

  // Captured events from the handles bubble here too.
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const { start, rect } = d;
    let next: Placement;
    if (d.mode === 'move') {
      next = { ...start, x: start.x + (e.clientX - d.x) / rect.width, y: start.y + (e.clientY - d.y) / rect.height };
    } else if (d.mode === 'rotate') {
      // The knob sits above the centre, so pointing straight up is 0°.
      const deg = (Math.atan2(e.clientY - d.centre.y, e.clientX - d.centre.x) * 180) / Math.PI + 90;
      next = { ...start, angle: snap(deg) };
    } else {
      // Grow along the signature's own axis, keeping its (rotated) top-left corner in place.
      const t = ((start.angle ?? 0) * Math.PI) / 180;
      const [ax, ay] = [Math.cos(t), Math.sin(t)]; // local x axis on screen
      const [bx, by] = [-Math.sin(t), Math.cos(t)]; // local y axis on screen
      const w0 = start.w * rect.width;
      const h0 = w0 / aspect;
      const w1 = Math.max(1, w0 + (e.clientX - d.x) * ax + (e.clientY - d.y) * ay);
      const h1 = w1 / aspect;
      const cornerX = d.centre.x - (w0 / 2) * ax - (h0 / 2) * bx;
      const cornerY = d.centre.y - (w0 / 2) * ay - (h0 / 2) * by;
      const cx = cornerX + (w1 / 2) * ax + (h1 / 2) * bx - rect.left;
      const cy = cornerY + (w1 / 2) * ay + (h1 / 2) * by - rect.top;
      next = { ...start, w: w1 / rect.width, x: (cx - w1 / 2) / rect.width, y: (cy - h1 / 2) / rect.height };
    }
    onChange(clampPlacement(next, aspect, pageAspect));
  };

  const end = (e: PointerEvent<HTMLElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  return (
    <div
      ref={boxRef}
      className={selected ? 'placement selected' : 'placement'}
      style={{
        left: `${p.x * 100}%`,
        top: `${p.y * 100}%`,
        width: `${p.w * 100}%`,
        aspectRatio: aspect,
        transform: angle ? `rotate(${angle}deg)` : undefined,
      }}
      onPointerDown={begin('move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onClick={(e) => e.stopPropagation()}
    >
      <img src={url} alt="Chữ ký" draggable={false} />
      {selected && (
        <>
          <button
            className="placement-remove"
            aria-label="Xoá chữ ký này"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onRemove(p.id)}
          >
            ×
          </button>
          <span className="placement-rotate" aria-hidden="true" onPointerDown={begin('rotate')} />
          <span className="placement-resize" aria-hidden="true" onPointerDown={begin('resize')} />
        </>
      )}
    </div>
  );
}
