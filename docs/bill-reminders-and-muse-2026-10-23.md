# Hóa đơn, nhắc hỗ trợ và đối chiếu Muse — 23/10/2026

Base: `dbef52f` (main được xác nhận lại qua kết nối GitHub). Nhánh: `codex/bill-line-actions`.

## Thay đổi vận hành

- Trong hóa đơn, `ready` hiển thị **Chờ phục vụ**; phần đang chuẩn bị hiển thị **Chưa phục vụ**. Thao tác nhận, đã phục vụ và hủy phần chưa phục vụ nằm ngay dưới đúng món, có lượt gọi khi cần phân biệt.
- Hủy món là điều chỉnh phần phải thu, không xóa dòng gọi món. Hỗ trợ hủy một phần, giữ phần đã phục vụ; bắt buộc lý do, kiểm tra phiên bản và khóa thu tiền. Mã yêu cầu giúp retry không trừ bill hai lần.
- Chỉ hiện nút thanh toán cả bàn khi toàn bộ món hợp lệ đã phục vụ. API chốt cả bàn cũng từ chối khi còn lượt chưa phục vụ, kể cả lượt đã thu tiền từ bản cũ.
- Popup hóa đơn và thanh toán chừa khoảng trống phía dưới, theo chiều cao viewport và safe area; vùng nội dung cuộn riêng. Không dùng quy tắc modal mobile toàn màn hình.
- Nhật ký gọi món tự ghi tại DB khi tạo/cập nhật đơn. Ghi trước/sau, người thao tác, thời điểm; chặn sửa/xóa nhật ký, xóa đơn đã gọi và xóa/sửa nội dung phiếu thu. Lỗi ghi nhật ký làm thao tác hủy rollback.
- Chốt bill lưu bản chụp toàn bộ lượt gọi, gồm món đã hủy và nhật ký trước khi chốt; hóa đơn đã thu đọc từ bản chụp, không thay đổi theo dữ liệu live hoặc đổi bàn sau đó. Dữ liệu có trước khi nâng cấp được đánh dấu baseline, không tự dựng lịch sử chưa từng ghi.
- Gọi nhân viên và nhắc thanh toán có bộ đếm riêng theo phiên. Khoảng chờ 30 giây mỗi loại; trần 12 lần/10 phút. Khách thấy thời gian chờ và số lần đã gửi. Nhắc lại cùng mã không tăng đếm; xử lý yêu cầu cũ không làm mất nhắc mới.
- Thông báo nổi phân biệt đơn mới, gọi nhân viên và nhắc thanh toán; có số lần, nội dung ngắn và nút mở đúng bàn/đơn. Không tự biến thông báo nổi thành xác nhận phục vụ/thanh toán.

## Đối chiếu báo cáo Muse

| Mục | Kết quả đối chiếu và xử lý |
|---|---|
| SC-01 | Manifest quản trị theo quán đã tồn tại. Giữ ID của app đã cài; bổ sung tên quán trong manifest, chuyển app cũ mở `/gaeru` thẳng đến quán chỉ khi API xác nhận một quán active và không phải chủ nền tảng. Startup không còn nút giả; có khung bàn và branding công khai đã lưu. Không khôi phục dữ liệu khách/quyền thao tác trước xác thực. Không khẳng định đạt 2 giây trên iPhone thật. |
| SC-02 | Cả admin đầy đủ và compact dùng URL logo có phiên bản. Form gửi thiếu trường logo khi không đổi, tránh gửi URL vào bộ kiểm tra ảnh upload. |
| SC-03 | Báo cáo bỏ sót `build/sites-worker.ts`: HSTS và CSP Report-Only đã được phát ở đó. Giữ nguồn này, không nhân đôi trong `_headers`, không ép CSP thật. |
| SC-04 | Client PNG tối đa 256px, thu dần đến tối đa 30.000 byte và xem trước. Server shop chặn upload trên 45.000 byte; giữ logo cũ khi không đổi. Chưa sửa logo thật của quán. |
| SC-05 | Thêm log có cấu trúc cho gửi thử, mã đối chiếu, trạng thái nhà cung cấp và lỗi tên loại. Không log endpoint/token/khóa riêng. Không thay secret và không tuyên bố push đã đến thiết bị thật trong đợt này. |
| SC-06 | Chuẩn bị client WS theo quán, backoff, debounce, heartbeat và polling fallback; bảo toàn response 101, kiểm tra Origin, giữ tác vụ broadcast bằng waitUntil. Có fragment binding tại `docs/realtime-bindings.example.json`. Cờ mặc định vẫn tắt; chưa tạo DO hay bật dịch vụ tính phí. Cần hoàn thiện binding trong cấu hình deploy sau khi xác nhận điều kiện tài khoản, rồi kiểm thử staging. |
| SC-07 | Đã có giới hạn IP 30 lần/10 phút trong `requestTableSession`, cùng giới hạn thiết bị và khóa một phiên/bàn. Giữ nguyên để tránh siết nhầm toàn bộ khách dùng chung Wi-Fi. |
| SC-08 | Không gỡ dependency theo danh sách chỉ tìm app/lib: còn import trong components và tooling. Chưa có kết quả knip/depcheck trong môi trường này; để thành đợt cleanup riêng, không tuyên bố đã gỡ. |
| SC-09 | Hero 108.352 → 48.116 byte (960px, WebP 76); salad 81.172 → 58.418 byte (640px, WebP 78). Giữ đường dẫn; đã xem trước/sau. Các ảnh khác không vượt 60 KB. |
| SC-10 | Đo EXPLAIN trước tối ưu với 2 quán, mỗi quán 200 món và 2.000 đơn, 60 mẫu/truy vấn. SQLite dùng chỉ mục store_id, không thấy cơ sở gỡ CTE; giữ nguyên cách ly quán. P50 local: menu 0,237ms; board 4,247ms; revision 0,267ms; sessions 0,001ms; dashboard 0,128ms. Đây không phải số đo mạng/D1 production. |
| SC-11 | Tùy chọn; chưa thay cơ chế menu 304 vì cần bao phủ cả quyền phiên bàn và trạng thái hỗ trợ, tránh cache sai. |
| SC-12 | Server-Timing sau cờ ENABLE_SERVER_TIMING, mặc định tắt. |

## Triển khai và giới hạn

**Phải áp dụng migrations `0012_service_reminders.sql`, `0013_bill_audit.sql` trước khi chạy code mới.** Chưa chạy migration trên dữ liệu thật. Chưa merge/deploy nhánh này. Các trigger giữ nhật ký không bị bỏ qua bởi ứng dụng; không phải cam kết chống quản trị viên có quyền trực tiếp sửa schema/DB.

367 kiểm thử tự động đạt, gồm bảo mật/cách ly quán, xung đột hủy/phục vụ, retry thanh toán, lịch sử bất biến, nhắc hỗ trợ và cache SW; typecheck/build đạt tại checkpoint trước bàn giao. Bằng chứng/log chi tiết nằm trong `.sites-runtime/qa/bill-reminders-2026-10-23/` (ignored). Viewport và thao tác giao diện dùng dữ liệu QA riêng, không phải giao dịch thật.

Còn cần kiểm tra trên iPhone thật: cold/warm launch, Safari/PWA safe area với bàn phím, giọng đọc và nhận push. Lỗi 400 ở phiên cũ trong ảnh chưa tái hiện được trên production; đã có test phiên legacy, hỗ trợ tên tham số cũ và lỗi thiếu mã phiên rõ ràng. Cần đối chiếu request thực của thiết bị nếu còn gặp; không xóa phiên hay dữ liệu quán để né lỗi.
