import { describe, expect, it } from 'vitest';
import { concatTransformationMatrix, decodePDFRawStream, degrees, PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import { openPdfLib, PdfLoadError, signPdf, verifySigned } from './sign';
import type { Placement } from './geometry';

// 1x1 opaque PNG → aspect 1
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

/** Page 1: plain 600x800. Page 2: /Rotate 90, crop box offset. Page 3: leaves a scaling `cm` open. */
async function samplePdf(text = 'Hello'): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]).drawText(text, { x: 50, y: 700 });
  const rotated = doc.addPage([600, 800]);
  rotated.drawText('Rotated', { x: 50, y: 50 });
  rotated.setCropBox(50, 100, 500, 600);
  rotated.setRotation(degrees(90));
  const messy = doc.addPage([600, 800]);
  messy.pushOperators(concatTransformationMatrix(2, 0, 0, 2, 0, 0)); // never restored
  return doc.save({ useObjectStreams: false });
}

function decodedStreams(bytes: Uint8Array, pageIndex: number) {
  return PDFDocument.load(bytes).then((doc) => {
    const contents = doc.getPage(pageIndex).node.Contents();
    const list = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
    return list.map((s) => new TextDecoder('latin1').decode(decodePDFRawStream(s as PDFRawStream).decode()));
  });
}

const p = (page: number, x: number, y: number, w: number, id = `${page}-${x}`): Placement => ({ id, page, x, y, w });

describe('signPdf', () => {
  it('draws at the expected PDF position on a plain page', async () => {
    const signed = await signPdf(await samplePdf(), PNG, [p(0, 0.5, 0.25, 0.5)]);
    const last = (await decodedStreams(signed, 0)).at(-1)!;
    // 300x300 signature, top-left at (300, 200) on screen → bottom-left at PDF (300, 300)
    expect(last).toContain('1 0 0 1 300 300 cm');
    expect(last).toMatch(/\/Image-\S+ Do/);
  });

  it('normalizes a reversed MediaBox like pdf.js', async () => {
    const doc = await PDFDocument.create();
    const pg = doc.addPage([600, 800]);
    pg.node.set(PDFName.of('MediaBox'), doc.context.obj([600, 800, 0, 0]));
    const signed = await signPdf(await doc.save({ useObjectStreams: false }), PNG, [p(0, 0.5, 0.25, 0.5)]);
    expect((await decodedStreams(signed, 0)).at(-1)!).toContain('1 0 0 1 300 300 cm');
  });

  it('treats a /Rotate that is not a multiple of 90 as 0', async () => {
    const doc = await PDFDocument.create();
    const pg = doc.addPage([600, 800]);
    pg.node.set(PDFName.of('Rotate'), PDFNumber.of(45));
    const signed = await signPdf(await doc.save({ useObjectStreams: false }), PNG, [p(0, 0.5, 0.25, 0.5)]);
    const last = (await decodedStreams(signed, 0)).at(-1)!;
    expect(last).toContain('1 0 0 1 300 300 cm\n1 0 0 1 0 0 cm');
  });

  it('accounts for /Rotate and the crop box', async () => {
    // page 2 displays 600 wide x 500 tall; signature 150x150 at the screen's top-left
    // → anchor PDF (50 + 150, 100 + 0) = (200, 100), rotated 90
    const signed = await signPdf(await samplePdf(), PNG, [p(1, 0, 0, 0.25)]);
    const last = (await decodedStreams(signed, 1)).at(-1)!;
    expect(last).toContain('1 0 0 1 200 100 cm');
  });

  it('wraps original content so an unclosed cm cannot move the signature', async () => {
    const signed = await signPdf(await samplePdf(), PNG, [p(2, 0, 0, 0.5)]);
    const streams = await decodedStreams(signed, 2);
    expect(streams[0].trim()).toBe('q');
    expect(streams.at(-2)!.trim()).toBe('Q');
  });

  it('embeds the image once however many placements', async () => {
    const one = await signPdf(await samplePdf(), PNG, [p(0, 0, 0, 0.2)]);
    const many = await signPdf(await samplePdf(), PNG, [p(0, 0, 0, 0.2), p(0, 0.5, 0.5, 0.2), p(1, 0, 0, 0.2)]);
    expect(many.length - one.length).toBeLessThan(2000);
  });
});

describe('verifySigned', () => {
  const placements = [p(0, 0.1, 0.1, 0.3), p(0, 0.5, 0.6, 0.3), p(1, 0, 0, 0.25)];

  it('accepts a correctly signed file', async () => {
    const original = await samplePdf();
    expect(await verifySigned(original, await signPdf(original, PNG, placements), placements)).toEqual([]);
  });

  it('rejects a file whose original content differs', async () => {
    const original = await samplePdf('Hello');
    const other = await signPdf(await samplePdf('Hellx'), PNG, placements);
    const problems = await verifySigned(original, other, placements);
    expect(problems.join(' ')).toContain('Trang 1');
  });

  it('rejects a missing or extra signature', async () => {
    const original = await samplePdf();
    const signed = await signPdf(original, PNG, placements);
    expect(await verifySigned(original, signed, placements.slice(1))).toHaveLength(1);
  });
});

describe('openPdfLib', () => {
  it('rejects non-PDF bytes', async () => {
    await expect(openPdfLib(new TextEncoder().encode('hello'))).rejects.toBeInstanceOf(PdfLoadError);
  });

  it('rejects an encrypted PDF with a clear message', async () => {
    // Point the trailer's /Encrypt at an existing object: enough for pdf-lib to treat it as encrypted.
    const text = new TextDecoder('latin1').decode(await samplePdf());
    const hacked = text.replace(/trailer\s*<<\s*/, (m) => `${m}/Encrypt 1 0 R\n`);
    const bytes = Uint8Array.from(hacked, (c) => c.charCodeAt(0));
    await expect(openPdfLib(bytes)).rejects.toThrow('File có mật khẩu, không hỗ trợ.');
  });
});
