# Ký PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web app chạy trên trình duyệt: mở 1 PDF, vẽ chữ ký tay trên màn hình, đặt chữ ký ở nhiều chỗ, tải về PDF đã ký mà nội dung gốc không đổi byte nào.

**Architecture:** App Vite + React riêng trong `Signature/`. Phần toán toạ độ (`geometry.ts`) và phần ghi/kiểm tra PDF (`sign.ts`, chỉ dùng pdf-lib) là hàm thuần, test bằng Vitest trên Node. Phần hiển thị (`pdf.ts` + component) dùng pdfjs, kiểm tra tay trên trình duyệt.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, pdf-lib 1.17.1, pdfjs-dist 4.10, Vitest 3, CSS thuần.

**Spec:** `Signature/docs/specs/2026-11-18-signature-design.md`

## Global Constraints

- Mọi lệnh chạy trong `Signature/` trừ khi ghi khác. Repo gốc là `/Users/hongquan/demo` (Folio ở `PDF/`).
- Không server, không database, không gửi file đi đâu. Không thêm dependency ngoài danh sách trong Task 1.
- Giao diện tiếng Việt. Sáng/tối theo hệ điều hành, ghi nhớ lựa chọn, khoá localStorage `ky-pdf-theme`.
- Toạ độ `Placement` chuẩn hoá 0..1 theo trang **đang hiển thị** (đã áp `/Rotate`).
- Khung trang = CropBox ∩ MediaBox (giống `page.view` của pdfjs).
- File xuất: `<tên gốc>-signed.pdf`. Chỉ cho tải khi `verifySigned` trả về mảng rỗng.
- Tay cầm đổi cỡ và nút xoá ≥ 24px. Vùng vẽ và chữ ký đã đặt có `touch-action: none`.
- PDF có mật khẩu → "File có mật khẩu, không hỗ trợ."

## Review Focus

1. Trang có `/Rotate` 90/180/270 hoặc CropBox lệch gốc → chữ ký trong file xuất phải nằm đúng chỗ và đứng thẳng như trên màn hình (test ở Task 1 và Task 2).
2. Nội dung gốc để lại `cm` không đóng → chữ ký không bị lệch (test "wraps original content" ở Task 2).
3. Bấm "Xong" khi chưa vẽ gì → không tạo chữ ký rỗng (nút bị tắt, `trimBounds` trả `null`, test ở Task 1).
4. Kéo chữ ký ra ngoài trang, hoặc vẽ lại chữ ký có tỉ lệ khác làm chữ ký tràn trang → luôn bị kéo về trong trang (`clampPlacement`, test ở Task 1; App kẹp khi hiển thị và trước khi ký ở Task 5, kiểm tra tay bước 6).
5. Mở file mới / đóng tab khi đã đặt chữ ký chưa tải → hỏi xác nhận (Task 5, kiểm tra tay).

---

### Task 0: Tạo nhánh

- [ ] **Step 1:** Repo đang ở `main` và có nhiều thay đổi chưa commit không thuộc dự án này. Không đụng vào chúng.

```bash
cd /Users/hongquan/demo && git switch -c feat/signature
```

Mọi commit sau chỉ `git add Signature/...` — không bao giờ `git add -A`.

---

### Task 1: Khung dự án + hình học

**Files:**
- Create: `Signature/package.json`, `Signature/tsconfig.json`, `Signature/vite.config.ts`, `Signature/vercel.json`, `Signature/index.html`, `Signature/.gitignore`
- Copy từ `PDF/`: `scripts/copy-pdfjs-assets.mjs`, `public/favicon.svg`
- Create: `Signature/src/lib/geometry.ts`
- Test: `Signature/src/lib/geometry.test.ts`

**Interfaces:**
- Produces:
  - `type Placement = { id: string; page: number; x: number; y: number; w: number }`
  - `type Box = { x: number; y: number; width: number; height: number }`
  - `type PdfRect = { x: number; y: number; width: number; height: number; rotate: number }`
  - `toPdfRect(p: Placement, box: Box, rotate: number, aspect: number): PdfRect` — `aspect` = rộng/cao ảnh chữ ký, `rotate` ∈ {0,90,180,270}; trả góc neo + độ xoay cho `page.drawImage`.
  - `clampPlacement(p: Placement, aspect: number, pageAspect: number): Placement` — `pageAspect` = rộng/cao trang hiển thị.
  - `trimBounds(rgba: Uint8ClampedArray, width: number, height: number): { x: number; y: number; w: number; h: number } | null`
  - `normalizeRotation(deg: number): number`

- [ ] **Step 1: Tạo file cấu hình**

`Signature/package.json`:
```json
{
  "name": "ky-pdf",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "description": "Ký PDF — vẽ chữ ký tay và đặt lên PDF ngay trên trình duyệt.",
  "scripts": {
    "predev": "node scripts/copy-pdfjs-assets.mjs",
    "dev": "vite",
    "prebuild": "node scripts/copy-pdfjs-assets.mjs",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "pdf-lib": "^1.17.1",
    "pdfjs-dist": "^4.10.38",
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  },
  "devDependencies": {
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^4.5.0",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vitest": "^3.2.4"
  }
}
```

`Signature/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`Signature/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: { manualChunks: { 'pdf-lib': ['pdf-lib'], pdfjs: ['pdfjs-dist'] } },
    },
  },
});
```

`Signature/vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "no-referrer" }
      ]
    }
  ]
}
```

`Signature/.gitignore`:
```
node_modules
dist
public/pdfjs
*.tsbuildinfo
```

`Signature/index.html`:
```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Ký PDF</title>
    <meta name="description" content="Vẽ chữ ký tay và đặt lên file PDF ngay trên trình duyệt. Không tải file lên máy chủ." />
    <script>
      // Apply the theme before first paint (kept in sync by src/lib/theme.ts).
      (function () {
        var t = null, root = document.documentElement;
        try { t = localStorage.getItem('ky-pdf-theme'); } catch (e) {}
        if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.dataset.theme = t;
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```bash
mkdir -p scripts public src/lib src/components
cp ../PDF/scripts/copy-pdfjs-assets.mjs scripts/
cp ../PDF/public/favicon.svg public/
npm install
```
Expected: cài xong, không lỗi.

- [ ] **Step 2: Viết test hình học (fail)**

`Signature/src/lib/geometry.test.ts`:
```ts
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

describe('clampPlacement', () => {
  it('keeps the signature inside the page', () => {
    // page aspect 0.75, signature aspect 3 → full width is 0.25 of page height
    expect(clampPlacement(at(-1, 0.9, 2), 3, 0.75)).toMatchObject({ x: 0, y: 0.75, w: 1 });
  });

  it('limits width so a tall signature still fits vertically', () => {
    expect(clampPlacement(at(0, 0, 0.9), 0.5, 1).w).toBe(0.5);
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
```

- [ ] **Step 3: Chạy test, phải fail**

Run: `npx vitest run src/lib/geometry.test.ts`
Expected: FAIL — `Failed to resolve import "./geometry"`.

- [ ] **Step 4: Viết `geometry.ts`**

`Signature/src/lib/geometry.ts`:
```ts
export type Placement = { id: string; page: number; x: number; y: number; w: number };
export type Box = { x: number; y: number; width: number; height: number };
export type PdfRect = { x: number; y: number; width: number; height: number; rotate: number };

const MIN_W = 0.05;

export function normalizeRotation(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Converts a placement (fractions of the page as displayed, i.e. after /Rotate)
 * into PDF user space for pdf-lib's drawImage: the anchor is the signature's
 * bottom-left corner as seen on screen, and the image is rotated CCW by the
 * page's /Rotate so it appears upright once the viewer rotates the page.
 */
export function toPdfRect(p: Placement, box: Box, rotate: number, aspect: number): PdfRect {
  const turned = rotate === 90 || rotate === 270;
  const W = turned ? box.height : box.width;
  const H = turned ? box.width : box.height;
  const width = p.w * W;
  const height = width / aspect;
  const u = p.x * W; // from the screen's left edge
  const v = p.y * H + height; // from the screen's top edge, to the bottom of the signature
  const { x: bx, y: by, width: bw, height: bh } = box;
  const [x, y] =
    rotate === 90 ? [bx + v, by + u]
    : rotate === 180 ? [bx + bw - u, by + v]
    : rotate === 270 ? [bx + bw - v, by + bh - u]
    : [bx + u, by + bh - v];
  return { x, y, width, height, rotate };
}

/** Keeps the signature at least MIN_W wide and fully inside the page. */
export function clampPlacement(p: Placement, aspect: number, pageAspect: number): Placement {
  const w = Math.min(Math.max(p.w, MIN_W), 1, aspect / pageAspect);
  const h = (w * pageAspect) / aspect; // as a fraction of page height
  const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);
  return { ...p, w, x: clamp(p.x, 1 - w), y: clamp(p.y, 1 - h) };
}

/** Bounding box of non-transparent pixels in RGBA data, or null if nothing is drawn. */
export function trimBounds(rgba: Uint8ClampedArray, width: number, height: number) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
```

- [ ] **Step 5: Chạy test, phải pass**

Run: `npx vitest run src/lib/geometry.test.ts`
Expected: PASS, 10 tests. (`clampPlacement` có thể ra `0.7500000000000001` — nếu vậy đổi assert đó sang `toBeCloseTo`, không sửa code.)

- [ ] **Step 6: Commit**

```bash
cd /Users/hongquan/demo
git add Signature/package.json Signature/package-lock.json Signature/tsconfig.json Signature/vite.config.ts Signature/vercel.json Signature/index.html Signature/.gitignore Signature/scripts Signature/public/favicon.svg Signature/src/lib/geometry.ts Signature/src/lib/geometry.test.ts Signature/docs
git commit -m "feat(signature): scaffold app and placement geometry"
```

---

### Task 2: Ghi chữ ký vào PDF + kiểm tra toàn vẹn

**Files:**
- Create: `Signature/src/lib/sign.ts`
- Test: `Signature/src/lib/sign.test.ts`

**Interfaces:**
- Consumes: `Placement`, `Box`, `toPdfRect`, `normalizeRotation` từ `./geometry`.
- Produces:
  - `class PdfLoadError extends Error`
  - `openPdfLib(bytes: Uint8Array): Promise<PDFDocument>` — ném `PdfLoadError` với thông báo tiếng Việt.
  - `signPdf(bytes: Uint8Array, png: Uint8Array, placements: Placement[]): Promise<Uint8Array>`
  - `verifySigned(original: Uint8Array, signed: Uint8Array, placements: Placement[]): Promise<string[]>` — mảng rỗng = đạt.

Hành vi pdf-lib 1.17.1 đã kiểm chứng: lần `drawImage` đầu trên một trang biến `/Contents` thành `[q, ...stream gốc, Q, stream chữ ký]`; stream gốc giữ nguyên byte. Stream chữ ký có dạng `q\n1 0 0 1 <x> <y> cm\n<xoay> cm\n<w> 0 0 <h> 0 0 cm\n... /Image-… Do\nQ`.

- [ ] **Step 1: Viết test (fail)**

`Signature/src/lib/sign.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { concatTransformationMatrix, decodePDFRawStream, degrees, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
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
```

- [ ] **Step 2: Chạy test, phải fail**

Run: `npx vitest run src/lib/sign.test.ts`
Expected: FAIL — `Failed to resolve import "./sign"`.

- [ ] **Step 3: Viết `sign.ts`**

`Signature/src/lib/sign.ts`:
```ts
import { decodePDFRawStream, degrees, PDFArray, PDFDocument, PDFRawStream, type PDFPage } from 'pdf-lib';
import { normalizeRotation, toPdfRect, type Box, type Placement } from './geometry';

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

/** CropBox ∩ MediaBox — the area pdf.js shows as the page. */
function viewBox(page: PDFPage): Box {
  const c = page.getCropBox();
  const m = page.getMediaBox();
  const x = Math.max(c.x, m.x);
  const y = Math.max(c.y, m.y);
  return {
    x,
    y,
    width: Math.min(c.x + c.width, m.x + m.width) - x,
    height: Math.min(c.y + c.height, m.y + m.height) - y,
  };
}

/**
 * Draws the signature at every placement. pdf-lib wraps the page's original
 * content streams in q/Q and appends a new stream; original bytes are untouched.
 */
export async function signPdf(bytes: Uint8Array, png: Uint8Array, placements: Placement[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const image = await doc.embedPng(png); // embedded once, drawn many times
  const aspect = image.width / image.height;
  for (const p of placements) {
    const page = doc.getPage(p.page);
    const r = toPdfRect(p, viewBox(page), normalizeRotation(page.getRotation().angle), aspect);
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
```

- [ ] **Step 4: Chạy test, phải pass**

Run: `npx vitest run`
Expected: PASS toàn bộ (geometry + sign). Nếu assert vị trí `1 0 0 1 … cm` lệch vì pdf-lib in số thập phân (vd `300.00000000000006`), sửa dữ liệu test cho ra số nguyên, không nới assert.

- [ ] **Step 5: Commit**

```bash
cd /Users/hongquan/demo
git add Signature/src/lib/sign.ts Signature/src/lib/sign.test.ts
git commit -m "feat(signature): stamp signature into PDF and verify original content"
```

---

### Task 3: Mở file và hiển thị trang

**Files:**
- Copy từ `PDF/src/`: `lib/download.ts`, `lib/theme.ts`, `lib/useBackHandler.ts`, `lib/useMediaQuery.ts`, `components/Icon.tsx`, `components/Sheet.tsx`
- Create: `Signature/src/lib/pdf.ts`, `Signature/src/components/PageView.tsx`, `Signature/src/App.tsx`, `Signature/src/main.tsx`, `Signature/src/styles.css`

**Interfaces:**
- Consumes: `openPdfLib`, `PdfLoadError` (Task 2).
- Produces:
  - `type OpenPdf = { name: string; bytes: Uint8Array; view: PDFDocumentProxy }`, `loadPdf(file: File): Promise<OpenPdf>`
  - `PageView` props (Task 5 thêm các prop chữ ký): `{ doc: PDFDocumentProxy; index: number; width: number; children?: (pageAspect: number) => ReactNode; onTap?: (x: number, y: number, pageAspect: number) => void }` — `x`,`y` là phần trăm 0..1 của điểm chạm.
  - Từ bản copy: `downloadFile`, `safeFileName` (`download.ts`), `useTheme` (`theme.ts`), `Sheet`, `Icon`.

- [ ] **Step 1: Copy file dùng lại và chỉnh**

```bash
cd /Users/hongquan/demo/Signature
cp ../PDF/src/lib/{download,theme,useBackHandler,useMediaQuery}.ts src/lib/
cp ../PDF/src/components/{Icon,Sheet}.tsx src/components/
sed -i '' "s/'folio-theme'/'ky-pdf-theme'/" src/lib/theme.ts
sed -i '' "s/folioGuard/kyPdfGuard/" src/lib/useBackHandler.ts
sed -i '' "s#root.classList.toggle('dark', theme === 'dark'); // ui-kit##; s#root.dataset.theme = theme; // classic UI#root.dataset.theme = theme;#" src/lib/theme.ts
```

Trong `src/components/Icon.tsx`, thêm vào `PATHS` (sau `paperclip`):
```ts
  pen: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
```

Expected: `grep -n "folio\|ui-kit" src/lib/*.ts src/components/*.tsx` không ra gì.

- [ ] **Step 2: `pdf.ts`**

`Signature/src/lib/pdf.ts`:
```ts
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
```

- [ ] **Step 3: `PageView.tsx`**

`Signature/src/components/PageView.tsx`:
```tsx
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
```

- [ ] **Step 4: `App.tsx`, `main.tsx`, `styles.css`**

`Signature/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`Signature/src/App.tsx` (bản Task 3, Task 5 sẽ mở rộng):
```tsx
import { useEffect, useRef, useState } from 'react';
import { Icon } from './components/Icon';
import { PageView } from './components/PageView';
import { loadPdf, type OpenPdf } from './lib/pdf';
import { PdfLoadError } from './lib/sign';
import { useTheme } from './lib/theme';

const pageWidth = () => Math.min(window.innerWidth - 32, 820);

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [pdf, setPdf] = useState<OpenPdf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(pageWidth);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onResize = () => setWidth(pageWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const open = async (file: File) => {
    setError(null);
    try {
      const next = await loadPdf(file);
      await pdf?.view.destroy();
      setPdf(next);
    } catch (err) {
      setError(err instanceof PdfLoadError ? err.message : 'Không đọc được file PDF.');
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
        <main className="pages">
          {Array.from({ length: pdf.view.numPages }, (_, i) => (
            <PageView key={i} doc={pdf.view} index={i} width={width} />
          ))}
        </main>
      ) : (
        <button className="dropzone" onClick={() => inputRef.current?.click()}>
          <Icon name="upload" size={32} />
          <strong>Chọn hoặc kéo thả file PDF vào đây</strong>
          <span>File chỉ được xử lý trên trình duyệt, không tải lên máy chủ.</span>
        </button>
      )}
    </div>
  );
}
```

`Signature/src/styles.css`:
```css
:root {
  --bg: #f6f7f9;
  --surface: #ffffff;
  --surface-2: #f1f3f5;
  --border: #e3e6ea;
  --border-strong: #cfd4da;
  --text: #111827;
  --muted: #6b7280;
  --primary: #0f766e;
  --primary-hover: #115e59;
  --danger: #dc2626;
  --danger-soft: #fef2f2;
  --shadow: 0 1px 3px rgba(17, 24, 39, 0.08), 0 4px 12px rgba(17, 24, 39, 0.05);
  --shadow-lg: 0 12px 32px rgba(17, 24, 39, 0.18);
  color-scheme: light;
  font-family: Inter, 'Segoe UI', system-ui, -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 15px;
  line-height: 1.45;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

:root[data-theme='dark'] {
  --bg: #0e1116;
  --surface: #161b22;
  --surface-2: #1d232c;
  --border: #262d37;
  --border-strong: #353e4a;
  --text: #e6e9ee;
  --muted: #8b95a3;
  --primary: #2dd4bf;
  --primary-hover: #5eead4;
  --danger: #f87171;
  --danger-soft: #3a1717;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.6);
  color-scheme: dark;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); min-height: 100vh; }
button { font: inherit; color: inherit; cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: 0.5; }

/* Header ------------------------------------------------------------------ */
.header {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 16px; padding-top: max(10px, env(safe-area-inset-top));
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}
.brand { font-size: 17px; }
.actions { display: flex; align-items: center; gap: 6px; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  height: 36px; padding: 0 14px; border-radius: 8px;
  border: 1px solid var(--border-strong); background: var(--surface);
  font-size: 14px; font-weight: 500; white-space: nowrap;
}
.btn:hover:not(:disabled) { background: var(--surface-2); }
.btn.primary { background: var(--primary); border-color: var(--primary); color: #fff; font-weight: 600; }
.btn.primary:hover:not(:disabled) { background: var(--primary-hover); border-color: var(--primary-hover); }
[data-theme='dark'] .btn.primary { color: #042f2e; }
.btn.ghost { border-color: transparent; background: transparent; color: var(--muted); }
.btn.block { flex: 1; height: 46px; font-size: 15px; }
.icon-btn {
  width: 36px; height: 36px; display: grid; place-items: center;
  border: none; border-radius: 8px; background: transparent; color: var(--muted);
}
.icon-btn:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }

@media (max-width: 520px) {
  .btn .label { display: none; }
  .btn { padding: 0 10px; }
}

/* Landing / messages ------------------------------------------------------ */
.dropzone {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  width: min(560px, calc(100% - 32px)); margin: 48px auto; padding: 48px 24px;
  border: 2px dashed var(--border-strong); border-radius: 16px;
  background: var(--surface); color: var(--muted); text-align: center;
}
.dropzone strong { color: var(--text); font-size: 16px; }
.error {
  display: flex; align-items: center; gap: 8px;
  max-width: 820px; margin: 12px auto; padding: 10px 14px;
  border-radius: 10px; background: var(--danger-soft); color: var(--danger);
}
.hint { max-width: 820px; margin: 12px auto 0; padding: 0 16px; color: var(--muted); text-align: center; }

/* Pages ------------------------------------------------------------------- */
.pages { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px 16px 48px; }
.page { position: relative; background: #fff; box-shadow: var(--shadow); }
.page-host canvas { display: block; width: 100%; height: 100%; }
.page-host { position: absolute; inset: 0; }
.page-overlay { position: absolute; inset: 0; }
.page-status { position: absolute; inset: 0; display: grid; place-items: center; color: #6b7280; }
.page-number {
  position: absolute; right: 8px; bottom: -22px;
  font-size: 12px; color: var(--muted);
}

/* Sheet (phones) / dialog (desktop) — from Folio --------------------------- */
.sheet-backdrop { position: fixed; inset: 0; z-index: 150; display: flex; background: rgba(10, 12, 16, 0.5); }
.sheet-backdrop.is-sheet { align-items: flex-end; }
.sheet-backdrop.is-dialog { align-items: center; justify-content: center; padding: 16px; }
.sheet {
  width: 100%; max-height: 85vh; display: flex; flex-direction: column;
  background: var(--surface); color: var(--text); outline: none;
  box-shadow: var(--shadow-lg); transition: transform 0.2s ease;
}
.is-sheet .sheet {
  border-radius: 20px 20px 0 0; padding-bottom: env(safe-area-inset-bottom);
  animation: sheet-up 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.is-dialog .sheet { max-width: 560px; border-radius: 16px; }
.sheet-head { padding: 8px 8px 0 20px; touch-action: none; }
.sheet-grabber {
  display: block; width: 40px; height: 5px; margin: 2px auto 6px;
  border-radius: 999px; background: var(--border-strong);
}
.sheet-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 17px; }
.sheet-body { padding: 4px 12px 8px; overflow-y: auto; }
.sheet-footer { display: flex; gap: 10px; padding: 8px 20px 16px; }
.is-dialog .btn.block { height: 40px; font-size: 14px; }
@keyframes sheet-up { from { transform: translateY(100%); } }
```

- [ ] **Step 5: Kiểm tra build và trình duyệt**

Run: `npm run build && npx vitest run`
Expected: build thành công, test vẫn pass.

Run: `npm run dev` (dùng preview tool của Claude nếu có), mở `http://localhost:5173`:
- Màn hình đầu là ô "Chọn hoặc kéo thả file PDF vào đây".
- Chọn một PDF nhiều trang → các trang hiện cuộn dọc, nét, rộng tối đa 820px; trang ngang/xoay hiện đúng chiều.
- Chọn một file `.txt` đổi đuôi `.pdf` → báo "File không phải PDF hợp lệ."
- Nút mặt trời/mặt trăng đổi giao diện, tải lại trang vẫn giữ.
- Console không có lỗi.

- [ ] **Step 6: Commit**

```bash
cd /Users/hongquan/demo
git add Signature/src
git commit -m "feat(signature): open and display PDF pages"
```

---

### Task 4: Bảng vẽ chữ ký

**Files:**
- Create: `Signature/src/components/SignaturePad.tsx`
- Modify: `Signature/src/styles.css` (thêm cuối file)

**Interfaces:**
- Consumes: `trimBounds` (Task 1), `Sheet` (Task 3).
- Produces: `type Signature = { png: Uint8Array; url: string; aspect: number }`; `SignaturePad({ onDone, onClose }: { onDone: (s: Signature) => void; onClose: () => void })`.

- [ ] **Step 1: Viết `SignaturePad.tsx`**

`Signature/src/components/SignaturePad.tsx`:
```tsx
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { trimBounds } from '../lib/geometry';
import { Sheet } from './Sheet';

export type Signature = { png: Uint8Array; url: string; aspect: number };

const PAD = 4; // transparent margin kept around the trimmed strokes

/** Draw-on-screen signature (finger, mouse or pen). Exports a transparent PNG trimmed to the ink. */
export function SignaturePad({ onDone, onClose }: { onDone: (s: Signature) => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

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
    if (!box) return;
    const out = document.createElement('canvas');
    out.width = box.w + PAD * 2;
    out.height = box.h + PAD * 2;
    out.getContext('2d')!.drawImage(c, box.x, box.y, box.w, box.h, PAD, PAD, box.w, box.h);
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
    if (!blob) return;
    onDone({
      png: new Uint8Array(await blob.arrayBuffer()),
      url: URL.createObjectURL(blob),
      aspect: out.width / out.height,
    });
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
          <button className="btn primary block" onClick={done} disabled={empty}>
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
    </Sheet>
  );
}
```

- [ ] **Step 2: CSS (thêm cuối `styles.css`)**

```css
/* Signature pad ----------------------------------------------------------- */
.pad {
  display: block; width: 100%; height: 220px;
  background: #fff; border: 1px dashed var(--border-strong); border-radius: 12px;
  touch-action: none; cursor: crosshair;
}
.pad-hint { margin: 8px 4px 0; color: var(--muted); font-size: 13px; text-align: center; }
```

- [ ] **Step 3: Nối tạm vào App để thử**

Trong `App.tsx`: thêm `import { SignaturePad, type Signature } from './components/SignaturePad';`, state `const [signature, setSignature] = useState<Signature | null>(null);` và `const [padOpen, setPadOpen] = useState(false);`, nút trong `.actions` (trước nút giao diện):
```tsx
{pdf && (
  <button className="btn" onClick={() => setPadOpen(true)}>
    <Icon name="pen" />
    <span className="label">{signature ? 'Vẽ lại' : 'Vẽ chữ ký'}</span>
  </button>
)}
```
và trước thẻ đóng `</div>` ngoài cùng:
```tsx
{padOpen && (
  <SignaturePad
    onClose={() => setPadOpen(false)}
    onDone={(s) => {
      if (signature) URL.revokeObjectURL(signature.url);
      setSignature(s);
      setPadOpen(false);
    }}
  />
)}
```

- [ ] **Step 4: Kiểm tra**

Run: `npm run build`
Expected: thành công.

Trong trình duyệt (desktop, rồi `resize_window` preset mobile và tải lại):
- "Vẽ chữ ký" mở dialog (desktop) / bottom sheet (mobile); nút Back của trình duyệt và Esc đóng nó.
- Mới mở: "Xoá" và "Xong" bị tắt. Vẽ bằng chuột / kéo chạm: nét liền, trang không cuộn theo ngón tay.
- "Xoá" làm trắng khung. "Xong" đóng sheet; nút đổi thành "Vẽ lại".
- Giao diện tối: khung vẽ vẫn trắng, nét đen nhìn rõ.

- [ ] **Step 5: Commit**

```bash
cd /Users/hongquan/demo
git add Signature/src
git commit -m "feat(signature): draw signature on screen"
```

---

### Task 5: Đặt chữ ký, kéo/đổi cỡ, tải về

**Files:**
- Create: `Signature/src/components/PlacementBox.tsx`
- Modify: `Signature/src/App.tsx`, `Signature/src/styles.css`
- Create: `Signature/README.md`

**Interfaces:**
- Consumes: `clampPlacement`, `Placement` (Task 1); `signPdf`, `verifySigned`, `PdfLoadError` (Task 2); `PageView`, `downloadFile`, `safeFileName` (Task 3); `Signature`, `SignaturePad` (Task 4).
- Produces: `PlacementBox(props: { p: Placement; url: string; aspect: number; pageAspect: number; onChange: (p: Placement) => void; onRemove: (id: string) => void })`.

- [ ] **Step 1: `PlacementBox.tsx`**

`Signature/src/components/PlacementBox.tsx`:
```tsx
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

type Drag = { mode: 'move' | 'resize'; x: number; y: number; start: Placement; rect: DOMRect };

/** A placed signature: drag to move, drag the corner to resize, × to remove. */
export function PlacementBox({ p, url, aspect, pageAspect, onChange, onRemove }: Props) {
  const drag = useRef<Drag | null>(null);

  const begin = (mode: Drag['mode']) => (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    const overlay = e.currentTarget.closest('.page-overlay') as HTMLElement;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: p, rect: overlay.getBoundingClientRect() };
  };

  // Captured events from the resize handle bubble here too.
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
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
```

- [ ] **Step 2: CSS (thêm cuối `styles.css`)**

```css
/* Placed signatures ------------------------------------------------------- */
.placement {
  position: absolute; touch-action: none; cursor: move;
  outline: 1.5px dashed var(--primary); outline-offset: 2px;
}
.placement img { display: block; width: 100%; height: 100%; pointer-events: none; user-select: none; }
.placement-remove {
  position: absolute; top: -14px; right: -14px;
  width: 26px; height: 26px; display: grid; place-items: center;
  border: none; border-radius: 999px; background: var(--danger); color: #fff;
  font-size: 18px; line-height: 1;
}
.placement-resize {
  position: absolute; right: -13px; bottom: -13px;
  width: 26px; height: 26px; border-radius: 999px;
  background: var(--primary); border: 3px solid #fff; cursor: nwse-resize; touch-action: none;
}
```

- [ ] **Step 3: Hoàn thiện `App.tsx`**

Thay toàn bộ `Signature/src/App.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { Icon } from './components/Icon';
import { PageView } from './components/PageView';
import { PlacementBox } from './components/PlacementBox';
import { SignaturePad, type Signature } from './components/SignaturePad';
import { downloadFile, safeFileName } from './lib/download';
import { clampPlacement, type Placement } from './lib/geometry';
import { loadPdf, type OpenPdf } from './lib/pdf';
import { PdfLoadError, signPdf, verifySigned } from './lib/sign';
import { useTheme } from './lib/theme';

const pageWidth = () => Math.min(window.innerWidth - 32, 820);
const DEFAULT_W = 0.25;

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [pdf, setPdf] = useState<OpenPdf | null>(null);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [dirty, setDirty] = useState(false); // placed signatures not yet downloaded
  const [padOpen, setPadOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = (fn: (list: Placement[]) => Placement[]) => {
    setPlacements(fn);
    setDirty(true);
  };

  const open = async (file: File) => {
    if (dirty && !window.confirm('Bỏ các chữ ký chưa tải về và mở file khác?')) return;
    setError(null);
    try {
      const next = await loadPdf(file);
      await pdf?.view.destroy();
      setPdf(next);
      setPlacements([]);
      setDirty(false);
    } catch (err) {
      setError(err instanceof PdfLoadError ? err.message : 'Không đọc được file PDF.');
    }
  };

  const place = (page: number, x: number, y: number, pageAspect: number) => {
    if (!signature) return setPadOpen(true);
    const h = (DEFAULT_W * pageAspect) / signature.aspect;
    const p = { id: crypto.randomUUID(), page, x: x - DEFAULT_W / 2, y: y - h / 2, w: DEFAULT_W };
    edit((list) => [...list, clampPlacement(p, signature.aspect, pageAspect)]);
  };

  const download = async () => {
    if (!pdf || !signature) return;
    setBusy(true);
    setError(null);
    try {
      // Re-clamp: a redrawn signature with another aspect ratio may overflow the page.
      // A page with a signature has rendered its overlay, so its aspect is recorded.
      const final = placements.map((p) =>
        clampPlacement(p, signature.aspect, aspects.current.get(p.page) ?? 1 / Math.SQRT2),
      );
      const out = await signPdf(pdf.bytes, signature.png, final);
      const problems = await verifySigned(pdf.bytes, out, final);
      if (problems.length) {
        setError(`Không tải xuống vì kiểm tra toàn vẹn thất bại: ${problems.join(' ')}`);
        return;
      }
      downloadFile(out, `${safeFileName(pdf.name)}-signed.pdf`, 'application/pdf');
      setDirty(false);
    } catch {
      setError('Không tạo được file đã ký.');
    } finally {
      setBusy(false);
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
          <p className="hint">
            {signature
              ? 'Chạm vào trang để đặt chữ ký. Kéo để di chuyển, kéo chấm ở góc để đổi cỡ.'
              : 'Bấm “Vẽ chữ ký”, rồi chạm vào trang để đặt chữ ký.'}
          </p>
          <main className="pages">
            {Array.from({ length: pdf.view.numPages }, (_, i) => (
              <PageView key={i} doc={pdf.view} index={i} width={width} onTap={(x, y, a) => place(i, x, y, a)}>
                {(pageAspect) => {
                  aspects.current.set(i, pageAspect);
                  return (
                    signature &&
                    placements
                      .filter((p) => p.page === i)
                      .map((p) => (
                        <PlacementBox
                          key={p.id}
                          p={clampPlacement(p, signature.aspect, pageAspect)}
                          url={signature.url}
                          aspect={signature.aspect}
                          pageAspect={pageAspect}
                          onChange={(next) => edit((list) => list.map((q) => (q.id === next.id ? next : q)))}
                          onRemove={(id) => edit((list) => list.filter((q) => q.id !== id))}
                        />
                      ))
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
            if (signature) URL.revokeObjectURL(signature.url);
            setSignature(s);
            setPadOpen(false);
            if (placements.length) setDirty(true);
          }}
        />
      )}
    </div>
  );
}
```

Vẽ lại chữ ký có tỉ lệ khác có thể làm chữ ký đã đặt tràn trang: `PlacementBox` nhận vị trí đã kẹp khi hiển thị, và `download` kẹp lại trước khi ký, nên file xuất luôn khớp màn hình.

- [ ] **Step 4: README**

`Signature/README.md`:
```md
# Ký PDF

Vẽ chữ ký tay trên màn hình (ngón tay, chuột, bút) và đặt lên một hoặc nhiều chỗ trong file PDF, ngay trên trình duyệt.

- Mở file: chọn hoặc kéo thả 1 file PDF.
- **Vẽ chữ ký**, rồi chạm vào trang để đặt. Kéo để di chuyển, kéo chấm ở góc để đổi cỡ, × để xoá.
- **Tải về** file `<tên>-signed.pdf`.

## Không làm sai lệch dữ liệu

- File không được tải lên máy chủ; không có database.
- Nội dung gốc của trang giữ nguyên từng byte; chữ ký được vẽ chồng bằng một lớp riêng (pdf-lib).
- Trước khi tải, app đọc lại file đã ký và kiểm tra: số trang, kích thước, góc xoay, nội dung gốc từng trang,
  và đúng số chữ ký mỗi trang. Sai bất kỳ điều gì thì không cho tải.
- File PDF có mật khẩu không được hỗ trợ.

Đây là chữ ký hình ảnh, không phải chữ ký số có chứng thư.

## Phát triển

    npm install
    npm run dev
    npm test
    npm run build
```

- [ ] **Step 5: Kiểm tra toàn bộ**

Run: `npx vitest run && npm run build`
Expected: test pass, build thành công.

Trong trình duyệt, desktop rồi mobile (`resize_window` preset mobile, tải lại):
1. Mở PDF nhiều trang, chạm trang khi chưa có chữ ký → mở bảng vẽ.
2. Vẽ, Xong, chạm 2 chỗ ở trang 1 và 1 chỗ ở trang 3 → 3 chữ ký, tâm tại điểm chạm, rộng 25% trang.
3. Kéo một chữ ký ra mép → dừng ở mép. Kéo chấm góc → đổi cỡ, giữ tỉ lệ, không vượt trang. × → xoá đúng cái đó. Trên mobile: kéo chữ ký không làm cuộn trang; cuộn ở chỗ trống vẫn cuộn, không đặt nhầm chữ ký.
4. Tải về → file `<tên>-signed.pdf`. Mở bằng Preview/Chrome PDF viewer: chữ ký đúng vị trí, đúng cỡ như trên màn hình.
5. Lặp lại với một PDF có trang xoay (tạo nhanh: dùng Folio ở `PDF/` xoay một trang rồi xuất) → chữ ký trong file xuất đứng thẳng, đúng chỗ.
6. Vẽ lại chữ ký dài hơn → các chữ ký đã đặt đổi hình, vẫn nằm trong trang; tải lại về và mở file → khớp.
7. Đặt chữ ký rồi đóng tab → trình duyệt hỏi xác nhận. Sau khi tải về, đóng tab → không hỏi. Mở file khác khi chưa tải → hỏi "Bỏ các chữ ký chưa tải về…".
8. Console không lỗi.

- [ ] **Step 6: Commit**

```bash
cd /Users/hongquan/demo
git add Signature/src Signature/README.md
git commit -m "feat(signature): place, move, resize signatures and download signed PDF"
```
