import { useRef, type PointerEvent } from 'react';
import { clampPlacement, type Placement } from '../lib/geometry';

interface Props {
  p: Placement;
  url: string;
  aspect: number;
  pageAspect: number;
  onChange: (p: Placement) => void;
  onRemove: (id: string) => void;
}

type Drag = { mode: 'move' | 'resize'; x: number; y: number; start: Placement; rect: DOMRect; id: number };

/** A placed signature: drag to move, drag the corner to resize, × to remove. */
export function PlacementBox({ p, url, aspect, pageAspect, onChange, onRemove }: Props) {
  const drag = useRef<Drag | null>(null);

  const begin = (mode: Drag['mode']) => (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    if (!e.isPrimary || e.button !== 0) return;
    const overlay = e.currentTarget.closest('.page-overlay') as HTMLElement;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: p, rect: overlay.getBoundingClientRect(), id: e.pointerId };
  };

  // Captured events from the resize handle bubble here too.
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = (e.clientX - d.x) / d.rect.width;
    const dy = (e.clientY - d.y) / d.rect.height;
    const next = d.mode === 'move' ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy } : { ...d.start, w: d.start.w + dx };
    onChange(clampPlacement(next, aspect, pageAspect));
  };

  const end = () => {
    drag.current = null;
  };

  return (
    <div
      className="placement"
      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%`, aspectRatio: aspect }}
      onPointerDown={begin('move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onClick={(e) => e.stopPropagation()}
    >
      <img src={url} alt="Chữ ký" draggable={false} />
      <button
        className="placement-remove"
        aria-label="Xoá chữ ký này"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onRemove(p.id)}
      >
        ×
      </button>
      <span className="placement-resize" aria-hidden="true" onPointerDown={begin('resize')} />
    </div>
  );
}
