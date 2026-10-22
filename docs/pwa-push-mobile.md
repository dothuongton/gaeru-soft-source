# Tài liệu Vận hành PWA, Web Push & Tối ưu Giao diện Mobile/Tablet

Tài liệu hướng dẫn kỹ thuật, quy trình cấu hình, nghiệm thu và ma trận giao diện cho **Issue #1** trên hệ thống **GAERU Soft** (`dothuongton/gaeru-soft-source`).

---

## 1. Tổng quan triển khai

| Hạng mục | Chi tiết kỹ thuật |
| :--- | :--- |
| **Framework & Runtime** | React 19 + TypeScript + Vinext/Vite + Cloudflare Workers / D1 |
| **PWA & Offline** | Web App Manifest (`/manifest.webmanifest`), Service Worker (`/sw.js`), Offline fallback (`/offline.html`) |
| **Web Push** | WebCrypto P-256 (`@block65/webcrypto-web-push`), VAPID keys, request-scoped `waitUntil` bridge |
| **Cơ sở dữ liệu** | Migration `0010_staff_push_subscriptions.sql` (bảng `staff_push_subscriptions` phân tách theo `store_id`) |
| **Bảo mật & Quyền** | SSRF allowlist endpoint, kiểm tra quyền thời gian thực (`orders.view`, `tables.manage`), không chứa PII trong payload push |

---

## 2. Ma trận Giao diện & Bằng chứng Visual QA (A4)

Đã kiểm tra trực quan và đo lường kích thước trên Google Chrome (v155) qua các breakpoint:

| Viewport | Thiết bị đại diện | Màn hình kiểm tra | Ảnh bằng chứng | Trạng thái |
| :--- | :--- | :--- | :--- | :--- |
| **360 × 780** | Điện thoại nhỏ (Galaxy S/A) | Preview xem trước | `docs/screenshots/preview-360.png` | Đạt — Không tràn, nút chạm $\ge 44$px |
| **360 × 780** | Điện thoại nhỏ | Khách gọi món (Table QR) | `docs/screenshots/customer-360.png` | Đạt — Giỏ hàng dock cố định, hiển thị rõ ràng |
| **390 × 844** | iPhone 12/13/14/15 | Preview xem trước | `docs/screenshots/preview-390.png` | Đạt — Hero co giãn mượt, nav chuẩn |
| **390 × 844** | iPhone chuẩn | Khách gọi món (Table QR) | `docs/screenshots/customer-390.png` | Đạt — Chừa safe-area, giỏ hàng không che CTA |
| **390 × 844** | Mobile Offline | Mất mạng ngoại tuyến | `docs/screenshots/offline-390.png` | Đạt — Trang tĩnh tiếng Việt, nút thử lại |
| **768 × 1024** | iPad dọc | Preview / Khách | `docs/screenshots/preview-768.png` | Đạt — Lưới 2 cột cân đối |
| **768 × 1024** | iPad dọc | Bảng quản trị bàn / đơn | `docs/screenshots/admin-768.png` | Đạt — Tab chuyển nhanh, nút âm thanh & push |
| **820 × 1180** | iPad Air dọc | Quản trị bàn & vận hành | `docs/screenshots/admin-820.png` | Đạt — Thẻ bàn tự động bố trí không vỡ chữ |
| **1024 × 768** | iPad ngang | Quản trị bàn / thu ngân | `docs/screenshots/admin-1024.png` | Đạt — Đầy đủ thông tin, thao tác nhanh |
| **1180 × 820** | iPad Air ngang | Bảng điều khiển admin | `docs/screenshots/admin-1180.png` | Đạt — Lưới bàn 3 cột thoáng, không tràn |
| **1366 × 900** | Desktop / iPad Pro | Quản trị toàn diện | `docs/screenshots/admin-1366.png` | Đạt — Bảng số liệu & biểu đồ chuẩn |

### Đo lường số thao tác (UX Efficiency)
- **Luồng khách đặt món:** Quét QR $\to$ Nhập tên $\to$ Chọn món $\to$ Xác nhận: **3 bước chạm trực tiếp**, giảm thao tác thừa, giỏ hàng hiển thị liên tục.
- **Luồng nhân viên duyệt & nhận đơn:** Chạm tab Bàn $\to$ Bấm "Duyệt mở bàn" (1 chạm) $\to$ Bấm "Nhận đơn" (1 chạm), phân biệt rõ với nút "Hủy đơn" và "Đóng bàn".

---

## 3. Quy trình Cấu hình VAPID & D1 / Sites

### 3.1. Tạo cặp khóa VAPID
Chạy lệnh có sẵn trong dự án:
```bash
npm run generate-vapid
```
Lệnh sẽ sinh ra cặp khóa ECDSA P-256 tương thích với chuẩn Web Push và Cloudflare Workers.

### 3.2. Cấu hình biến môi trường và Secret
1. **Môi trường phát triển cục bộ (`.env.local`):**
   ```env
   STAFF_EMAILS=owner@example.com,staff@example.com
   VAPID_PUBLIC_KEY=<Chuỗi public key sinh ra>
   VAPID_PRIVATE_KEY=<Chuỗi private key sinh ra>
   VAPID_SUBJECT=mailto:admin@example.com
   ```
2. **Môi trường Cloudflare Workers (Production / Staging):**
   ```bash
   wrangler secret put VAPID_PRIVATE_KEY
   wrangler secret put VAPID_PUBLIC_KEY
   wrangler secret put VAPID_SUBJECT
   ```

### 3.3. Áp dụng Migration D1
Chạy migration `0010_staff_push_subscriptions.sql` vào cơ sở dữ liệu D1:
```bash
# Local state
npx wrangler d1 execute <DATABASE_NAME> --local --file=drizzle/0010_staff_push_subscriptions.sql

# Production
npx wrangler d1 execute <DATABASE_NAME> --remote --file=drizzle/0010_staff_push_subscriptions.sql
```

---

## 4. Chính sách Bảo mật, Cache & Giới hạn kỹ thuật

### 4.1. Chính sách Cache Service Worker
- **Cho phép Cache (Cache-First / Stale-While-Revalidate):**
  - Tài nguyên tĩnh được hash trong build: `/_next/static/*`
  - Ảnh công khai mẫu trong `/images/*`
  - Biểu tượng ứng dụng: `/favicon.svg`, `/icon-192.png`, `/icon-512.png`, `/apple-touch-icon.png`
  - Trang offline trung tính: `/offline.html`
- **Tuyệt đối Network-Only (Không lưu cache):**
  - Mọi yêu cầu `/api/*` (bao gồm cả `/api/branding-icon`)
  - Đường dẫn xác thực `/auth/*`, `/signin-with-chatgpt`, `/signout-with-chatgpt`
  - Yêu cầu SSR, React Server Components (RSC/Flight), Next Navigation
  - URL chứa tham số bàn và phiên: `table=...`, `session=...`
- **Fallback ngoại tuyến:**
  - Khi mất mạng và người dùng điều hướng trang HTML, Service Worker trả về `/offline.html` tĩnh, không để lộ dữ liệu bàn hoặc đơn của khách trước đó.

### 4.2. Bảo vệ SSRF đối với Push Endpoint
- Endpoint của client chỉ được chấp nhận nếu dùng giao thức `https:`, cổng chuẩn 443 và thuộc danh sách dịch vụ đẩy tin cậy:
  - Google FCM: `fcm.googleapis.com`
  - Apple Web Push: `*.push.apple.com`
  - Mozilla Web Push: `*.push.services.mozilla.com`
  - Microsoft Windows Push: `*.notify.windows.com`
- Chặn tuyệt đối IP nội bộ, `localhost`, URL có chứa credentials (`user:pass@`), hoặc các tên miền giả mạo.

### 4.3. Bảo mật Dữ liệu Riêng tư (No PII in Push)
- Payload thông báo đẩy **không chứa:** tên khách hàng, số điện thoại, ghi chú của khách, token/cookie, hoặc link QR của bàn.
- Tiêu đề và nội dung trên màn hình khóa chỉ hiển thị tên bàn và mã đơn (ví dụ: `Bàn 01 — Đơn M1A2`).

### 4.4. Giới hạn độ tin cậy của Web Push
- Web Push trên Cloudflare Workers sử dụng `ctx.waitUntil` sau khi thay đổi D1 được commit.
- Cửa sổ thực thi của `waitUntil` tối đa **30 giây**. Đây là cơ chế gửi **best-effort** (nỗ lực tối đa), không phải message queue phân tán bền vững có bảo đảm 100%.
- Polling trong ứng dụng (mỗi 5s/7s), âm thanh TTS và huy hiệu số lượng trên giao diện vẫn là **kênh vận hành chính** của quán. Push là kênh hỗ trợ khi nhân viên không nhìn màn hình.
- Trên iOS/iPadOS: Web Push chỉ hoạt động từ phiên bản iOS 16.4 trở lên khi người dùng đã thêm ứng dụng vào Màn hình chính (PWA / Standalone mode).

### 4.5. Cơ chế Đăng xuất & Thu hồi quyền
- **Đăng xuất qua giao diện:** Nút "Tắt trên máy này" hủy đăng ký trên trình duyệt và gọi API `/api/admin/push/unsubscribe`.
- **Khóa tài khoản hoặc gỡ quyền:** Khi tài khoản nhân viên bị chuyển sang trạng thái `suspended` hoặc bị thu hồi quyền, backend tự động lọc bỏ thiết bị đó trong `dispatchStaffPush` ngay lập tức, không gửi thông báo dù trình duyệt vẫn còn token đẩy.
- **Dọn dẹp tự động:** Khi push service phản hồi mã lỗi `404 Not Found` hoặc `410 Gone`, hệ thống tự động xóa bản ghi đăng ký hết hạn khỏi D1.

---

## 5. Quy trình Cập nhật & Rollout / Rollback

### 5.1. Cập nhật ứng dụng mượt mà (Graceful Update)
1. Khi có bản build mới, Service Worker mới được tải ở trạng thái `installed` (chờ kích hoạt).
2. Thanh thông báo xuất hiện phía dưới màn hình: **"Đã có bản cập nhật mới — Tải lại"**.
3. Ứng dụng **không tự động reload** khi người dùng đang gọi món, chọn món hoặc đang điền form, tránh làm mất giỏ hàng và dữ liệu chưa gửi.
4. Khi người dùng bấm **Tải lại**, Service Worker gửi thông điệp `SKIP_WAITING` và trang được làm mới đồng bộ.

### 5.2. Kế hoạch Rollback an toàn
- Nếu cần tắt Service Worker hoặc Web Push khẩn cấp:
  1. Xóa secret `VAPID_PRIVATE_KEY` hoặc đặt `VAPID_PUBLIC_KEY=""` để vô hiệu hóa tính năng gửi push mà không ảnh hưởng luồng đặt món.
  2. Triển khai file `public/sw.js` phiên bản rỗng (self-unregistering) để giải phóng cache khỏi trình duyệt client.
  3. Dữ liệu giỏ hàng của khách lưu trong `localStorage` theo cấu trúc phiên hiện tại được bảo toàn hoàn toàn.

---

## 6. Bảng Trạng thái Nghiệm thu (Acceptance Status)

| Tiêu chí | Trạng thái | Ghi chú kiểm chứng |
| :--- | :---: | :--- |
| **1. Mã nguồn & Cấu trúc** | **HOÀN TẤT** | Đầy đủ PWA manifest, Service Worker, Push API, migration 0010, CSS responsive |
| **2. Kiểm thử tự động (Unit / Integration)** | **HOÀN TẤT** | **280 / 280 test PASS** (`npm test`), bao gồm test CRUD push, SSRF, phân quyền, store isolation, audio, QR session |
| **3. Kiểm tra kiểu (TypeScript)** | **HOÀN TẤT** | `npx tsc --noEmit` hoàn toàn không có lỗi |
| **4. Production Build** | **HOÀN TẤT** | `npm run build` thành công, tạo đầy đủ bundle client/SSR và file `dist/client/_headers` |
| **5. Visual QA & Breakpoints** | **HOÀN TẤT** | Đã chụp và kiểm chứng thực tế toàn bộ ma trận (360, 390, 768, 820, 1024, 1180, 1366 px) |
| **6. Nghiệm thu trên Thiết bị thật (iOS/Android)** | *Chờ cấu hình môi trường* | Cần triển khai lên Cloudflare Workers kèm VAPID secrets thực tế và tên miền HTTPS có cài đặt PWA |
| **7. Triển khai Production** | *Chờ phê duyệt* | Đợi chủ dự án duyệt Pull Request và kích hoạt rollout production |
