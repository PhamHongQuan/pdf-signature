import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { openPdfLib, PdfLoadError } from './sign';

GlobalWorkerOptions.workerSrc = workerUrl;

export type OpenPdf = { name: string; bytes: Uint8Array; view: PDFDocumentProxy };

export async function loadPdf(file: File): Promise<OpenPdf> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lib = await openPdfLib(bytes);
  let view: PDFDocumentProxy;
  try {
    // pdf.js transfers the buffer to its worker, so hand it a copy.
    view = await getDocument({
      data: bytes.slice(),
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs/standard_fonts/',
      isEvalSupported: false,
    }).promise;
  } catch {
    throw new PdfLoadError('Không hiển thị được file PDF: file có thể bị hỏng.');
  }
  if (view.numPages === 0 || view.numPages !== lib.getPageCount()) {
    await view.destroy();
    throw new PdfLoadError('File PDF không có trang hoặc cấu trúc trang không nhất quán.');
  }
  return { name: file.name, bytes, view };
}
