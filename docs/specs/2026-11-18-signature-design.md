# Ký PDF — Design Spec

Ngày: 2026-11-18 · Tham khảo: `PDF/` (Folio)

## Mục tiêu

Web app cho phép **một người** vẽ chữ ký tay trên màn hình (ngón tay / chuột / bút) rồi đặt chữ ký đó
lên **một hoặc nhiều vị trí** trong một file PDF, tải về PDF đã ký. Dùng được trên điện thoại và máy tính.

**Thành công khi:** mở PDF → vẽ chữ ký → đặt ở N chỗ (có thể khác trang) → tải về; mở file trong
trình đọc PDF bất kỳ thấy chữ ký đúng vị trí/cỡ, nội dung gốc không đổi.

## Ngoài phạm vi

- Chữ ký số có chứng thư (token, .p12, CA).
- Nhiều người ký / nhiều chữ ký khác nhau trong một file.
- Ghi nhớ chữ ký giữa các lần dùng, chèn chữ/ngày ký.
- Gộp nhiều file, sắp xếp/xoá trang (đã có Folio).
- PDF có mật khẩu: từ chối với thông báo rõ.

## Kiến trúc

App riêng trong `Signature/`, cùng stack giao diện Cổ điển của Folio: Vite + React 19 + TypeScript + CSS thuần (không Tailwind),
`pdfjs-dist` (hiển thị), `pdf-lib` (ghi). Chạy hoàn toàn trên trình duyệt, không server, không database,
deploy tĩnh (Vercel) như Folio.

Chép từ `PDF/` (chỉnh tối thiểu): `scripts/copy-pdfjs-assets.mjs`, `vite.config.ts`, `src/lib/download.ts`,
`src/lib/theme.ts`, `src/lib/useBackHandler.ts`, `src/lib/useMediaQuery.ts`, `src/components/Sheet.tsx`,
`src/components/Icon.tsx`, phần load/render trang trong `src/lib/pdf.ts`.

### Các đơn vị

| File | Làm gì |
|---|---|
| `src/App.tsx` | Trạng thái: file đang mở, ảnh chữ ký, danh sách vị trí đặt. Thanh tiêu đề (Mở file · Vẽ chữ ký · Tải về · Sáng/Tối). |
| `src/components/SignaturePad.tsx` | Canvas vẽ bằng Pointer Events (`touch-action: none`), nút Xoá / Xong. Trả về PNG nền trong suốt, đã cắt sát nét vẽ. Trên mobile nằm trong `Sheet`, desktop là modal. |
| `src/components/PageView.tsx` | Render một trang bằng pdfjs (lazy theo IntersectionObserver) + lớp phủ chứa các chữ ký đặt trên trang đó. Chạm vào trang trống khi đã có chữ ký → thả chữ ký tại đó. |
| `src/components/Placement.tsx` | Một chữ ký đã đặt: kéo để di chuyển, kéo góc để đổi cỡ (giữ tỉ lệ), nút × để xoá. Pointer Events, chạy được với chạm và chuột. |
| `src/lib/geometry.ts` | Hàm thuần: đổi vị trí chuẩn hoá sang toạ độ PDF, giới hạn chữ ký trong trang, cắt sát nét vẽ. |
| `src/lib/sign.ts` | Chỉ dùng pdf-lib (test được trên Node): `openPdfLib`, `signPdf`, `verifySigned`. |
| `src/lib/pdf.ts` | pdfjs (trình duyệt): `loadPdf(file)` để hiển thị. |

### Dữ liệu

```ts
type Placement = {
  id: string;
  page: number;   // 0-based
  x: number;      // 0..1, mép trái chữ ký theo bề rộng trang ĐANG HIỂN THỊ
  y: number;      // 0..1, mép trên theo chiều cao trang đang hiển thị
  w: number;      // 0..1, bề rộng chữ ký theo bề rộng trang; cao = w * tỉ lệ ảnh
};
```

Toạ độ chuẩn hoá theo trang hiển thị nên không phụ thuộc mức zoom / cỡ màn hình.

## Luồng

1. **Mở file** — kéo thả hoặc chọn 1 file PDF. Hiển thị các trang cuộn dọc, vừa bề rộng màn hình.
2. **Vẽ chữ ký** — nếu chưa có, chạm trang sẽ mở bảng vẽ trước. Có thể vẽ lại; vẽ lại thay ảnh cho mọi vị trí đã đặt.
3. **Đặt** — chạm trang → chữ ký xuất hiện, tâm tại điểm chạm, rộng mặc định 25% trang. Kéo/đổi cỡ/xoá tuỳ ý. Bị giới hạn trong khung trang.
4. **Tải về** — nút chỉ bật khi có ≥1 vị trí. Chạy `signPdf` → `verifySigned` → tải `<tên gốc>-signed.pdf`.

Hoàn tác: không làm (xoá bằng × là đủ). Thêm khi người dùng cần.

## Ghi chữ ký vào PDF (`signPdf`)

- `PDFDocument.load(bytes)`, `embedPng(png)` **một lần**, dùng lại cho mọi vị trí (file không phình theo số chỗ ký).
- Mỗi vị trí: `page.drawImage(...)`. pdf-lib (đã kiểm chứng với 1.17.1) bọc các stream gốc bằng một stream `q` đầu và `Q` cuối rồi thêm stream chữ ký sau cùng; stream gốc giữ nguyên byte, và ma trận biến đổi do nội dung gốc để lại không làm lệch chữ ký.
- Đổi toạ độ: trang có thể có `/Rotate` (90/180/270) và CropBox lệch gốc. Khung trang = CropBox ∩ MediaBox
  (giống `page.view` của pdfjs). Hàm thuần `toPdfRect` đổi góc dưới-trái của chữ ký (như thấy trên màn hình)
  sang toạ độ PDF và vẽ ảnh xoay ngược chiều kim đồng hồ đúng bằng `/Rotate`, để chữ ký luôn đứng thẳng
  như người dùng thấy.
- Giữ metadata gốc.

## Kiểm tra toàn vẹn (`verifySigned`)

Trước khi cho tải, so file xuất với file gốc từng trang; sai bất kỳ điều gì → báo lỗi, **không tải**:

- Số trang, kích thước (MediaBox/CropBox), góc xoay bằng nhau.
- Các content stream gốc của trang xuất hiện nguyên byte, liền nhau, đúng thứ tự trong `/Contents` của trang đã ký
  (nội dung gốc không đổi byte nào thì văn bản và vị trí chữ cũng không đổi, nên không so thêm văn bản qua pdfjs).
- Các stream thêm vào chứa đúng số lệnh vẽ ảnh (`Do`) bằng số vị trí đặt trên trang đó.

## Lỗi

- Không phải PDF / file hỏng → thông báo "Không đọc được file PDF".
- Có mật khẩu → "File có mật khẩu, không hỗ trợ".
- Kiểm tra toàn vẹn thất bại → thông báo trang nào sai, không tải.
- Rời trang khi đã đặt chữ ký mà chưa tải → `beforeunload` cảnh báo.

## Giao diện

- Responsive giống Folio; sáng/tối theo hệ điều hành, ghi nhớ lựa chọn (`theme.ts`).
- Mobile: bảng vẽ là bottom sheet, nút Back của máy đóng sheet (`useBackHandler`). Vùng vẽ ngang toàn màn hình.
- Tay cầm đổi cỡ ≥ 24px để chạm được bằng ngón tay.
- Giao diện tiếng Việt.

## Kiểm thử

- Vitest (devDependency duy nhất thêm so với Folio). `geometry.test.ts`: toạ độ ở cả 4 góc xoay và CropBox lệch,
  giới hạn trong trang, cắt nét vẽ. `sign.test.ts`: PDF mẫu tạo bằng pdf-lib ngay trong test (trang thường,
  trang `/Rotate 90` + CropBox lệch, trang để lại `cm` không đóng), assert vị trí vẽ, `verifySigned` đạt và
  bắt được file bị sửa, từ chối file không phải PDF / có mật khẩu.
- Thử tay trên trình duyệt: desktop (chuột) và viewport mobile (cảm ứng), mở file đã ký bằng trình đọc PDF khác.
