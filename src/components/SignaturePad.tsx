import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { trimBounds } from '../lib/geometry';
import { stack, textCanvas, toStamp, type Stamps } from '../lib/stamp';
import { Sheet } from './Sheet';

export type Signature = { name: string; stamps: Stamps };

const PAD = 4; // transparent margin kept around the trimmed strokes
const NAME_PX = 64; // name image font size, in image pixels
const NAME_KEY = 'ky-pdf-name';

function storedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Draw-on-screen signature (finger, mouse or pen) plus an optional full name.
 * Produces up to three transparent PNGs: the signature trimmed to the ink,
 * the name, and the signature with the name centred below it.
 */
export function SignaturePad({ onDone, onClose }: { onDone: (s: Signature) => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);
  const [name, setName] = useState(storedName);
  const trimmedName = name.trim();

  useEffect(() => {
    const c = canvasRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    c.width = Math.round(c.clientWidth * dpr);
    c.height = Math.round(c.clientHeight * dpr);
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  }, []);

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const line = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    setEmpty(false);
  };

  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!e.isPrimary || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    last.current = p;
    line(p, { x: p.x + 0.01, y: p.y }); // a tap leaves a dot
  };

  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return;
    const p = point(e);
    line(last.current, p);
    last.current = p;
  };

  const up = () => {
    last.current = null;
  };

  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    setEmpty(true);
  };

  const done = async () => {
    const c = canvasRef.current!;
    const box = trimBounds(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    if (!box && !trimmedName) return;
    let ink: HTMLCanvasElement | null = null;
    if (box) {
      ink = document.createElement('canvas');
      ink.width = box.w + PAD * 2;
      ink.height = box.h + PAD * 2;
      ink.getContext('2d')!.drawImage(c, box.x, box.y, box.w, box.h, PAD, PAD, box.w, box.h);
    }
    const stamps: Stamps = {};
    if (ink) stamps.sign = await toStamp(ink);
    if (trimmedName) {
      stamps.name = await toStamp(textCanvas(trimmedName, NAME_PX));
      // Under the signature the name is about a third of the signature's height.
      if (ink) stamps.both = await toStamp(stack(ink, textCanvas(trimmedName, Math.min(Math.max(ink.height * 0.3, 24), 96))));
    }
    try {
      localStorage.setItem(NAME_KEY, trimmedName);
    } catch {
      /* storage unavailable: the name is just not remembered */
    }
    onDone({ name: trimmedName, stamps });
  };

  return (
    <Sheet
      title="Vẽ chữ ký"
      onClose={onClose}
      footer={
        <>
          <button className="btn block" onClick={clear} disabled={empty}>
            Xoá
          </button>
          <button className="btn primary block" onClick={done} disabled={empty && !trimmedName}>
            Xong
          </button>
        </>
      }
    >
      <canvas
        ref={canvasRef}
        className="pad"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Khung ký tên"
      />
      <p className="pad-hint">Ký vào khung trắng bằng ngón tay, chuột hoặc bút.</p>
      <input
        className="name-input"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Họ và tên (không bắt buộc)"
        autoComplete="name"
        aria-label="Họ và tên"
        maxLength={80}
      />
    </Sheet>
  );
}
