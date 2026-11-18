import { decodePDFRawStream, degrees, PDFArray, PDFDocument, PDFRawStream, type PDFImage, type PDFPage } from 'pdf-lib';
import { normalizeRotation, toPdfRect, type Box, type Kind, type Placement } from './geometry';

export class PdfLoadError extends Error {}

export async function openPdfLib(bytes: Uint8Array): Promise<PDFDocument> {
  // The header may follow junk bytes; the spec allows it within the first 1024 bytes.
  if (!new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-')) {
    throw new PdfLoadError('File không phải PDF hợp lệ.');
  }
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (err instanceof Error && /encrypt/i.test(err.message)) {
      throw new PdfLoadError('File có mật khẩu, không hỗ trợ.');
    }
    throw new PdfLoadError('Không đọc được file PDF: file có thể bị hỏng.');
  }
}

/** pdf.js normalizes reversed rectangles (negative width/height). */
const norm = (b: Box): Box => ({
  x: Math.min(b.x, b.x + b.width),
  y: Math.min(b.y, b.y + b.height),
  width: Math.abs(b.width),
  height: Math.abs(b.height),
});

/** CropBox ∩ MediaBox — the area pdf.js shows as the page (MediaBox if they don't overlap). */
function viewBox(page: PDFPage): Box {
  const c = norm(page.getCropBox());
  const m = norm(page.getMediaBox());
  const x = Math.max(c.x, m.x);
  const y = Math.max(c.y, m.y);
  const width = Math.min(c.x + c.width, m.x + m.width) - x;
  const height = Math.min(c.y + c.height, m.y + m.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : m;
}

/**
 * Draws the signature at every placement. pdf-lib wraps the page's original
 * content streams in q/Q and appends a new stream; original bytes are untouched.
 */
export async function signPdf(
  bytes: Uint8Array,
  images: Partial<Record<Kind, Uint8Array>>,
  placements: Placement[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const embedded = new Map<Kind, PDFImage>(); // each kind embedded once, drawn many times
  for (const p of placements) {
    const kind = p.kind ?? 'sign';
    let image = embedded.get(kind);
    if (!image) {
      const png = images[kind];
      if (!png) throw new Error(`Thiếu ảnh cho loại "${kind}".`);
      image = await doc.embedPng(png);
      embedded.set(kind, image);
    }
    const page = doc.getPage(p.page);
    const n = normalizeRotation(page.getRotation().angle);
    const rot = n % 90 === 0 ? n : 0; // pdf.js ignores a /Rotate that is not a multiple of 90
    const r = toPdfRect(p, viewBox(page), rot, image.width / image.height);
    page.drawImage(image, { x: r.x, y: r.y, width: r.width, height: r.height, rotate: degrees(r.rotate) });
  }
  return doc.save({ useObjectStreams: false });
}

function contentStreams(doc: PDFDocument, pageIndex: number): PDFRawStream[] {
  const contents = doc.getPage(pageIndex).node.Contents();
  if (!contents) return [];
  const list = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
  return list.filter((s): s is PDFRawStream => s instanceof PDFRawStream);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Index where `needle` appears as a contiguous run inside `hay` (by raw bytes), or -1. */
function findRun(hay: PDFRawStream[], needle: PDFRawStream[]): number {
  for (let start = 0; start + needle.length <= hay.length; start++) {
    if (needle.every((s, i) => sameBytes(s.getContents(), hay[start + i].getContents()))) return start;
  }
  return -1;
}

/**
 * Re-reads the signed file and checks, page by page, that the page box and
 * rotation are unchanged, the original content streams are present byte for
 * byte and in order, and the added streams draw exactly one image per placement.
 */
export async function verifySigned(original: Uint8Array, signed: Uint8Array, placements: Placement[]): Promise<string[]> {
  const a = await PDFDocument.load(original, { updateMetadata: false });
  const b = await PDFDocument.load(signed, { updateMetadata: false });
  if (a.getPageCount() !== b.getPageCount()) {
    return [`Số trang khác bản gốc (${a.getPageCount()} / ${b.getPageCount()}).`];
  }
  const problems: string[] = [];
  for (let i = 0; i < a.getPageCount(); i++) {
    const label = `Trang ${i + 1}`;
    const shape = (pg: PDFPage) => JSON.stringify([pg.getMediaBox(), pg.getCropBox(), pg.getRotation().angle]);
    if (shape(a.getPage(i)) !== shape(b.getPage(i))) {
      problems.push(`${label}: kích thước hoặc góc xoay khác bản gốc.`);
    }
    const orig = contentStreams(a, i);
    const out = contentStreams(b, i);
    const at = findRun(out, orig);
    if (at < 0) {
      problems.push(`${label}: nội dung gốc bị thay đổi.`);
      continue;
    }
    const added = [...out.slice(0, at), ...out.slice(at + orig.length)];
    const ops = added.map((s) => new TextDecoder('latin1').decode(decodePDFRawStream(s).decode())).join('\n');
    const draws = ops.match(/\sDo\b/g)?.length ?? 0;
    const expected = placements.filter((p) => p.page === i).length;
    if (draws !== expected) problems.push(`${label}: cần ${expected} chữ ký, file có ${draws}.`);
  }
  return problems;
}
