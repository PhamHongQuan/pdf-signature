import { useEffect, useRef, useState } from 'react';
import { Icon } from './components/Icon';
import { PageView } from './components/PageView';
import { PlacementBox } from './components/PlacementBox';
import { Sheet } from './components/Sheet';
import { SignaturePad, type Signature } from './components/SignaturePad';
import { downloadFile, safeFileName, shareableFile } from './lib/download';
import { clampPlacement, type Kind, type Placement } from './lib/geometry';
import { loadPdf, type OpenPdf } from './lib/pdf';
import { PdfLoadError, signPdf, verifySigned } from './lib/sign';
import { revokeStamps, type Stamps } from './lib/stamp';
import { useTheme } from './lib/theme';

const pageWidth = () => Math.min(window.innerWidth - 32, 820);
const DEFAULT_W = 0.25;
const KINDS: { kind: Kind; label: string; what: string }[] = [
  { kind: 'sign', label: 'Chữ ký', what: 'chữ ký' },
  { kind: 'name', label: 'Họ tên', what: 'họ tên' },
  { kind: 'both', label: 'Cả hai', what: 'chữ ký + họ tên' },
];

/** What an existing placement shows once the stamps change, or null to drop it. */
function remapKind(kind: Kind, stamps: Stamps): Kind | null {
  if (stamps[kind]) return kind;
  if (kind === 'both') return stamps.sign ? 'sign' : stamps.name ? 'name' : null;
  return null;
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [pdf, setPdf] = useState<OpenPdf | null>(null);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [docKey, setDocKey] = useState(0);
  const [dirty, setDirty] = useState(false); // placed signatures not yet downloaded
  // The kind the next tap inserts; null = taps on the page insert nothing. One tap, then it turns off.
  const [arming, setArming] = useState<Kind | null>(null);
  // The placement showing its frame and handles; others show only the stamp.
  const [selected, setSelected] = useState<string | null>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [tip, setTip] = useState(false); // "tap where to sign", shown once after a fresh signature
  const [busy, setBusy] = useState(false);
  // Phones: the signed file waits here for a tap on "Lưu / Chia sẻ" (the share sheet needs a fresh tap).
  const [ready, setReady] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(pageWidth);
  const inputRef = useRef<HTMLInputElement>(null);
  // Displayed width/height ratio of each rendered page, recorded by PageView's overlay.
  const aspects = useRef(new Map<number, number>());

  useEffect(() => {
    const onResize = () => setWidth(pageWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // older browsers
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!arming && !selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setArming(null);
      setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [arming, selected]);

  const edit = (fn: (list: Placement[]) => Placement[]) => {
    setPlacements(fn);
    setDirty(true);
  };

  const open = async (file: File) => {
    if (dirty && !window.confirm('Bỏ các chữ ký chưa tải về và mở file khác?')) return;
    setError(null);
    try {
      const next = await loadPdf(file);
      const old = pdf;
      setPdf(next);
      setPlacements([]);
      setDirty(false);
      setTip(false);
      setArming(null);
      setSelected(null);
      setDocKey((k) => k + 1);
      await old?.view.destroy();
    } catch (err) {
      setError(err instanceof PdfLoadError ? err.message : 'Không đọc được file PDF.');
    }
  };

  const place = (page: number, x: number, y: number, pageAspect: number) => {
    setSelected(null); // a tap on the page itself (not on a stamp) clears the selection
    if (!arming) return;
    const stamp = signature?.stamps[arming];
    if (!stamp) return;
    const h = (DEFAULT_W * pageAspect) / stamp.aspect;
    const p = { id: crypto.randomUUID(), page, x: x - DEFAULT_W / 2, y: y - h / 2, w: DEFAULT_W, angle: 0, kind: arming };
    edit((list) => [...list, clampPlacement(p, stamp.aspect, pageAspect)]);
    setTip(false);
    setArming(null);
  };

  const download = async () => {
    if (!pdf || !signature) return;
    setBusy(true);
    setError(null);
    try {
      // Re-clamp: a redrawn signature with another aspect ratio may overflow the page.
      // A page with a signature has rendered its overlay, so its aspect is recorded.
      const { stamps } = signature;
      const final = placements.map((p) =>
        clampPlacement(p, stamps[p.kind ?? 'sign']!.aspect, aspects.current.get(p.page) ?? 1 / Math.SQRT2),
      );
      const images = Object.fromEntries(Object.entries(stamps).map(([k, s]) => [k, s.png]));
      const out = await signPdf(pdf.bytes, images, final);
      const problems = await verifySigned(pdf.bytes, out, final);
      if (problems.length) {
        setError(`Không tải xuống vì kiểm tra toàn vẹn thất bại: ${problems.join(' ')}`);
        return;
      }
      const name = `${safeFileName(pdf.name)}-signed.pdf`;
      const file = shareableFile(out, name, 'application/pdf');
      if (file) return setReady(file);
      downloadFile(out, name, 'application/pdf');
      setDirty(false);
    } catch {
      setError('Không tạo được file đã ký.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!ready) return;
    try {
      await navigator.share({ files: [ready], title: ready.name });
      setDirty(false);
      setReady(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // closed the share sheet
      downloadFile(new Uint8Array(await ready.arrayBuffer()), ready.name, 'application/pdf');
      setDirty(false);
      setReady(null);
    }
  };

  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) void open(file);
      }}
    >
      <header className="header">
        <strong className="brand">Ký PDF</strong>
        <div className="actions">
          <button className="btn ghost" onClick={() => inputRef.current?.click()}>
            <Icon name="file" />
            <span className="label">Mở file</span>
          </button>
          {pdf && (
            <button className="btn" onClick={() => setPadOpen(true)}>
              <Icon name="pen" />
              <span className="label">{signature ? 'Vẽ lại' : 'Vẽ chữ ký'}</span>
            </button>
          )}
          {pdf && (
            <button className="btn primary" disabled={!signature || placements.length === 0 || busy} onClick={download}>
              <Icon name="download" />
              <span className="label">{busy ? 'Đang xử lý…' : 'Tải về'}</span>
            </button>
          )}
          <button className="icon-btn" onClick={toggleTheme} aria-label="Đổi giao diện sáng/tối">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
      </header>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void open(file);
        }}
      />
      {error && (
        <div className="error" role="alert">
          <Icon name="alert" /> {error}
        </div>
      )}
      {pdf ? (
        <>
          {signature && (
            <div className="kinds" role="group" aria-label="Loại cần chèn">
              {KINDS.map(({ kind: k, label }) => (
                <button
                  key={k}
                  className={k === arming ? 'kind active' : 'kind'}
                  aria-pressed={k === arming}
                  disabled={!signature.stamps[k]}
                  onClick={() => {
                    setArming((a) => (a === k ? null : k));
                    setTip(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* One short line on phones; the extra help is hidden there (see .hint-more). */}
          <p className={arming ? 'hint arming-hint' : 'hint'}>
            {arming ? (
              <>
                Chạm vào trang để chèn {KINDS.find((k) => k.kind === arming)!.what}
                <span className="hint-more"> (Esc để huỷ)</span>
              </>
            ) : signature ? (
              <>
                Chọn loại ở trên rồi chạm vào trang để chèn.
                <span className="hint-more"> Chạm vào chữ ký đã chèn để di chuyển, đổi cỡ, xoay hoặc xoá.</span>
              </>
            ) : (
              'Bấm “Vẽ chữ ký” để bắt đầu.'
            )}
          </p>
          <main key={docKey} className={arming ? 'pages arming' : 'pages'}>
            {Array.from({ length: pdf.view.numPages }, (_, i) => (
              <PageView key={i} doc={pdf.view} index={i} width={width} onTap={(x, y, a) => place(i, x, y, a)}>
                {(pageAspect) => {
                  aspects.current.set(i, pageAspect);
                  return (
                    signature &&
                    placements
                      .filter((p) => p.page === i)
                      .map((p) => {
                        const stamp = signature.stamps[p.kind ?? 'sign']!;
                        return (
                          <PlacementBox
                            key={p.id}
                            p={clampPlacement(p, stamp.aspect, pageAspect)}
                            url={stamp.url}
                            aspect={stamp.aspect}
                            pageAspect={pageAspect}
                            selected={p.id === selected}
                            onSelect={() => setSelected(p.id)}
                            onChange={(next) => edit((list) => list.map((q) => (q.id === next.id ? next : q)))}
                            onRemove={(id) => {
                              edit((list) => list.filter((q) => q.id !== id));
                              setSelected(null);
                            }}
                          />
                        );
                      })
                  );
                }}
              </PageView>
            ))}
          </main>
        </>
      ) : (
        <button className="dropzone" onClick={() => inputRef.current?.click()}>
          <Icon name="upload" size={32} />
          <strong>Chọn hoặc kéo thả file PDF vào đây</strong>
          <span>File chỉ được xử lý trên trình duyệt, không tải lên máy chủ.</span>
        </button>
      )}
      {padOpen && (
        <SignaturePad
          onClose={() => setPadOpen(false)}
          onDone={(s) => {
            if (signature) revokeStamps(signature.stamps);
            setSignature(s);
            setArming(null);
            setPadOpen(false);
            if (placements.length) {
              // Existing placements follow the new content; a kind that no longer exists falls back or goes.
              edit((list) =>
                list.flatMap((p) => {
                  const k = remapKind(p.kind ?? 'sign', s.stamps);
                  return k ? [{ ...p, kind: k }] : [];
                }),
              );
            } else setTip(true);
          }}
        />
      )}
      {ready && (
        <Sheet
          title="Đã ký xong"
          onClose={() => setReady(null)}
          footer={
            <>
              <button className="btn block" onClick={() => setReady(null)}>
                Đóng
              </button>
              <button className="btn primary block" onClick={save}>
                <Icon name="download" />
                Lưu / Chia sẻ
              </button>
            </>
          }
        >
          <p className="sheet-text">
            Bấm “Lưu / Chia sẻ”, rồi chọn <strong>Lưu vào Tệp</strong> (iPhone) hoặc ứng dụng muốn gửi file{' '}
            <strong>{ready.name}</strong>.
          </p>
        </Sheet>
      )}
      {tip && !padOpen && (
        <div className="tip" role="status">
          <span>👆 Chọn loại ở trên, rồi chạm vào trang</span>
          <button className="icon-btn" onClick={() => setTip(false)} aria-label="Đóng gợi ý">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
