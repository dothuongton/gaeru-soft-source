# Cập nhật vận hành nhân viên — 23/10/2026

Dựa trên main `fd92022` và yêu cầu chủ dự án trong phiên làm việc.

- Chế độ âm thanh và giọng đọc lưu trên trình duyệt theo tài khoản + quán. Không lưu giả quyền trình duyệt hoặc trạng thái mở khóa âm thanh. Tablet dùng chung không lấy cấu hình của tài khoản khác.
- Push dùng icon điện thoại, kiểm tra trạng thái server và đăng ký cục bộ song song; status trả luôn public config, giảm một lượt API. Không chặn icon bằng spinner khi mount, không đợi `serviceWorker.ready` trong kiểm tra thụ động. Quyền bị chặn, key VAPID đổi, lỗi mạng vẫn hiển thị đúng; không tự xin quyền/tự đăng ký lại. Chỉ thao tác bật/tắt do người dùng bấm mới thực hiện ghi.
- Icon hỗ trợ chỉ có số yêu cầu đang mở, không có chấm live, ở header và menu.
- Chi tiết bàn là hóa đơn cả phiên: lượng, tên, đơn giá/thành tiền, ghi chú món/lượt, nguồn lượt gọi và tiến độ. Một nút thanh toán cả bàn; danh sách cuộn riêng, tổng tiền cố định. Thao tác phục vụ và đổi/đóng bàn thu vào mục phụ. Đơn hủy không tính tiền và không làm đổi số thứ tự lượt gọi sau nó.
- Đơn món gộp theo table ID + session ID, ba bộ lọc Cần nhận / Chờ phục vụ / Đã phục vụ. Chờ phục vụ gộp preparing + ready; không thay dữ liệu lịch sử hay trạng thái thanh toán. Hành động được gửi theo đúng nguồn từng suất. Nếu kết quả chưa chắc chắn hoặc dữ liệu chưa tải lại được, dừng chuỗi và chờ đối chiếu. Các bàn khác vẫn thao tác được.
- Cài đặt → Quản lý khu vực có CRUD và bật/tắt hiển thị. Quyền tables.manage; dữ liệu theo quán trong settings hiện có, không cần migration. Sửa tên cùng transaction với các bàn; xóa chỉ khu vực rỗng; phiên/QR không đổi. CAS ngăn ghi đè khi hai người sửa. Board ETag gồm revision của khu vực.
- Cài đặt → Thống kê hóa đơn dành cho revenue.view, lazy load. Dữ liệu lấy từ phiếu thanh toán thực tế; đơn thanh toán riêng từ trước vẫn thấy nhưng không đếm lại đơn đã thuộc phiếu cả bàn. Không cần đóng bàn mới thấy phiếu đã trả. Lọc theo ngày/giờ thu UTC+7, tìm bàn/khách/mã, phân trang máy chủ 20/50/100 (mặc định 20), sort ổn định paidAt/id. Tổng tiền/số phiếu của toàn bộ kỳ độc lập với trang. Chi tiết dùng snapshot món/giá đã đặt, chỉ đọc.

## API thêm hoặc mở rộng

- GET admin/push/status: thêm enabled/vapidPublicKey công khai vào kết quả cũ.
- PATCH admin/order line_transition: fromStatus tùy chọn xác định đúng new/preparing/ready; từ chối thiếu suất thay vì chuyển nhầm món mới. Optimistic update so sánh cả items và updated_at, kể cả va chạm thời gian.
- PATCH admin/zones: create/rename/delete/toggle với version bắt buộc, tables.manage.
- GET admin/invoices: from/to (ngày), fromTime/toTime (phút, kết thúc hết phút chọn), search, page, pageSize 20/50/100; tối đa 366 ngày, revenue.view.
- GET admin/invoices/:id: chỉ công khai thông tin phiếu và publicOrder thuộc chính phiếu, không cookie/token/hash.

## Xác minh

Typecheck/build; bộ kiểm thử hồi quy gồm API thật với SQLite trong bộ nhớ: quyền, store isolation, CAS, phần món, thanh toán, mốc giờ Việt Nam, pagination, không đếm trùng phiếu. Browser QA dùng thành phần thật và dữ liệu giả lập riêng ở cổng 5174: giữ chế độ qua reload/đổi tài khoản, số hỗ trợ, bill và queue mobile, trang hóa đơn 20/50/100. Bằng chứng ở `.sites-runtime/qa/staff-notifications-2026-10-23/`.

Chưa deploy, merge main hoặc thay dữ liệu production. Browser desktop/viewport không thay thế kiểm thử Safari/PWA iPhone thật và gửi push thật.
