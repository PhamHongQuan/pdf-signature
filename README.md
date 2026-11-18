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
