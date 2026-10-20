# Bàn giao mã nguồn GAERU Soffware

Phiên bản 32; commit de7aa1452812f4a1d5a69eff4c9ce7efdaf47e52.
Tên miền đích: https://soft.gaeru.com

## Gói này chứa gì
Toàn bộ tệp mã nguồn được quản lý bằng Git, ảnh mẫu, âm báo, migration cơ sở dữ liệu và kiểm thử. Không bao gồm node_modules, bí mật, token truy cập, dữ liệu khách/đơn thực tế hay bản sao D1. Ảnh món và hồ sơ đã tải lên nằm trong dữ liệu D1, không phải tệp nguồn.

## Trạng thái triển khai
Ứng dụng đang chạy trên Sites/Cloudflare Workers. Đã đăng ký tên miền soft.gaeru.com; chưa xác minh DNS, chưa xác nhận SSL hoặc đăng nhập tại miền mới. Gắn miền không chuyển máy chủ sang Hostinger.

Cấu hình trong vùng DNS gaeru.com:
- CNAME: soft -> custom-domains.chatgpt.site.
- TXT: _openai-site-verification.soft -> openai-site-verification=IWP6m3jF_ZMjKZMYhiMLrSuvTCMz-21i6YoRs5a3fdU
- TXT: _cf-custom-hostname.soft -> 6c84a452-7347-4dc2-8e57-0796621ac445

Không đổi bản ghi gốc gaeru.com hoặc www. Kiểm tra bản ghi soft hiện có trước khi thay đổi để tránh trỏ nhầm dịch vụ. Sau khi DNS xác minh, kiểm tra HTTPS, đăng nhập, gửi/nhận đơn và tải lại QR từ miền mới. Phiên khách dùng cookie theo hostname nên không tự chuyển giữa hai tên miền; chuyển trong thời gian không còn bàn đang phục vụ.

## Phụ thuộc khi tự hosting
Đây không phải gói PHP hoặc WordPress. Nền tảng: React/TypeScript, Vinext, Cloudflare Workers, D1.
- lib/server.ts và lib/store-database.ts sử dụng D1 binding DB.
- lib/staff-access.ts nhận danh tính từ gateway Sites qua oai-authenticated-user-id/email.
- STAFF_EMAILS là cấu hình phía máy chủ, không nằm trong gói.
- Không được tin các header danh tính do khách tự gửi khi triển khai độc lập: phải thay bằng xác thực phía máy chủ và phiên bảo mật.
- Cần cơ sở dữ liệu tương thích, chuyển dữ liệu thật, thay tích hợp đăng nhập, cấu hình runtime và kiểm thử trước khi triển khai độc lập ở Hostinger.

README.md có mô tả chức năng và môi trường phát triển hiện tại. Các lệnh trong scripts có phụ thuộc môi trường Sites; không phải bộ cài Hostinger tự động.

Kiểm tra gần nhất: 276 kiểm thử tự động đạt; production build thành công. Chưa kiểm tra chạy độc lập ở Hostinger.
