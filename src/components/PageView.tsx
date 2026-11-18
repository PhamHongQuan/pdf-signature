import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

interface Props {
  doc: PDFDocumentProxy;
  index: number;
  width: number;
  /** Overlay content (placed signatures), given the displayed page's width/height ratio. */
  children?: (pageAspect: number) => ReactNode;
  /** Tap on the page, as fractions 0..1 of the displayed page. */
  onTap?: (x: number, y: number, pageAspect: number) => void;
}

/** One page, rendered when scrolled near the viewport. Display only — never touches PDF bytes. */
export function PageView({ doc, index, width, children, onTap }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let off = false;
    doc.getPage(index + 1).then((p) => !off && setPage(p), () => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [doc, index]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisible(true), {
      rootMargin: '600px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!page || !visible) return;
    let task: RenderTask | null = null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / base.width) * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return setFailed(true);
    task = page.render({ canvasContext: ctx, viewport });
    task.promise.then(
      () => hostRef.current?.replaceChildren(canvas),
      (err: unknown) => {
        if (!(err instanceof Error && err.name === 'RenderingCancelledException')) setFailed(true);
      },
    );
    return () => task?.cancel();
  }, [page, visible, width]);

  const base = page?.getViewport({ scale: 1 }); // rotation defaults to the page's /Rotate
  const pageAspect = base ? base.width / base.height : 1 / Math.SQRT2;

  const tap = (e: MouseEvent<HTMLDivElement>) => {
    if (!page) return;
    const r = e.currentTarget.getBoundingClientRect();
    onTap?.((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, pageAspect);
  };

  return (
    <div ref={frameRef} className="page" style={{ width, height: width / pageAspect }}>
      <div ref={hostRef} className="page-host" />
      {failed && <div className="page-status">Không hiển thị được trang {index + 1}</div>}
      <div className="page-overlay" onClick={tap}>
        {page && children?.(pageAspect)}
      </div>
      <span className="page-number">{index + 1}</span>
    </div>
  );
}
