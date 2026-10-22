# Khảo Sát & Đánh Giá Toàn Diện Dữ Liệu Động & Khả Năng Tùy Biến Cho Quán
**Dự án:** GAERU Soft (`dothuongton/gaeru-soft-source`)  
**Tài liệu kỹ thuật và thiết kế chức năng dành cho:** Muse & Codex  
**Thời điểm lập:** Tháng 10/2026 (Đồng bộ theo HEAD nhánh `main`)

---

## Tóm tắt mục tiêu & Bối cảnh

Mục tiêu của tài liệu này là cung cấp bức tranh chi tiết, minh bạch và có hệ thống về:
1. Hiện trạng dữ liệu của từng phân hệ: **Món ăn, Danh mục món, Thông tin quán, Khuyến mãi, Topping, Bàn ăn, Quản lý hoá đơn (kèm ghi chú)**.
2. Xác định rõ những gì **Đã có**, những gì **Chưa có / Đang bị cố định (hardcoded)** và những gì **Cần bổ sung** để chủ quán có thể cá nhân hóa, tùy chỉnh tự do (dynamic data) phù hợp với mọi mô hình F&B (quán cà phê, trà sữa, quán ăn, quán lẩu, nhà hàng).
3. Đề xuất kiến trúc CSDL, API và UI/UX mẫu để Codex và Muse dễ dàng triển khai ở các bước tiếp theo.

---

## 1. Món ăn (Menu Items)

### 1.1. Hiện trạng trong mã nguồn
- **Cơ sở dữ liệu:** Bảng `menu_items` trong Cloudflare D1.
  - Các cột: `store_id`, `id`, `name`, `description`, `category`, `price`, `image`, `badge`, `available`, `sort`.
- **Giao diện quản lý:** Component `ItemForm` trong `app/ordering-app.tsx`.
- **Thao tác hỗ trợ:**
  - **Thêm món mới:** Cho phép nhập tên, giá (1.000 – 2.000.000 ₫), mô tả, chọn ảnh (tải ảnh mới hoặc chọn ảnh có sẵn), nhãn gợi ý, tích chọn "Sẵn sàng phục vụ".
  - **Sửa món:** Cập nhật các trường trên.
  - **Bật/Tắt bán:** Có nút chuyển nhanh giữa *"Đang bán"* (`available = 1`) và *"Tạm hết"* (`available = 0`).

### 1.2. Những điểm hạn chế & Phần còn thiếu
- **CHƯA CÓ chức năng Xóa món vĩnh viễn (`DELETE`):** Hiện tại trên danh sách món ở trang quản trị chỉ có nút Sửa và nút Bật/Tắt bán; không có nút Xóa món.
- **Thiếu đơn vị tính (Unit):** Không có trường đơn vị (ví dụ: *ly, phần, dĩa, tô, lon, chai, kg, set*). Mọi món hiện chỉ hiển thị số lượng số `1×`, `2×`.
- **Sắp xếp thứ tự hiển thị (`sort`):** CSDL có cột `sort` nhưng chưa có giao diện kéo thả hoặc nút bấm tăng/giảm thứ tự hiển thị món theo ý muốn của chủ quán.
- **Biến thể kích cỡ (Sizes/Variants):** Chưa có bảng size (Nhỏ / Vừa / Lớn) với các mức giá tương ứng; quán đang phải dùng tạm topping để cộng tiền size (ví dụ: "Ly lớn +10k").
- **Khung giờ bán:** Chưa có tính năng chỉ bán món vào các khung giờ nhất định (Menu sáng, Menu trưa, Menu tối).

---

## 2. Danh mục món (Menu Categories)

### 2.1. Hiện trạng trong mã nguồn
- **Mức độ hoàn thiện:** **0% (Hoàn toàn chưa có tính năng quản lý danh mục)**.
- **Thực trạng:** Danh mục đang bị **hardcode cứng** trong `lib/menu.ts`:
  ```ts
  export type Category = "main" | "light" | "drink" | "dessert";
  export const categories = [
    { id: "all", name: "Tất cả món", short: "Tất cả" },
    { id: "main", name: "Món chính", short: "Món chính" },
    { id: "light", name: "Ăn nhẹ", short: "Ăn nhẹ" },
    { id: "drink", name: "Đồ uống", short: "Đồ uống" },
    { id: "dessert", name: "Tráng miệng", short: "Tráng miệng" }
  ];
  ```
- Backend (`app/api/[...path]/route.ts`) kiểm tra nghiêm ngặt `b.category` phải thuộc 4 nhóm trên.
- CSDL D1 **hoàn toàn chưa có bảng `categories`**.

### 2.2. Những phần cần bổ sung cho dữ liệu động
1. **Bảng CSDL mới (`menu_categories`):**
   - `id`: Mã định danh (slug hoặc UUID).
   - `store_id`: Tách biệt theo từng quán.
   - `name`: Tên danh mục (ví dụ: *Khai vị, Món nướng, Món lẩu, Cơm & Mì, Trà hoa quả, Topping, Bia & Nước ngọt*).
   - `short_name`: Tên ngắn gọn hiển thị trên tab mobile.
   - `icon`: Tên icon hoặc biểu tượng SVG hiển thị trên thanh bên.
   - `sort_order`: Thứ tự sắp xếp các tab danh mục.
   - `is_active`: Bật/tắt hiển thị toàn bộ danh mục.
2. **Giao diện quản lý danh mục:**
   - Thêm danh mục mới.
   - Đổi tên / Sửa icon.
   - Kéo thả sắp xếp thứ tự danh mục.
   - Xóa danh mục (kèm ràng buộc kiểm tra nếu còn món thuộc danh mục đó).

---

## 3. Thông tin quán & Nhận diện thương hiệu (Store Branding)

### 3.1. Hiện trạng trong mã nguồn
- **Lưu trữ:** Lưu dạng JSON trong bảng `settings` với key `shop`.
- **Các trường đã cho phép tùy chỉnh:**
  - `name`: Tên cửa hàng (tối đa 40 ký tự).
  - `tagline`: Slogan / Giới thiệu ngắn dưới tên (tối đa 60 ký tự).
  - `hours`: Giờ mở cửa / phục vụ (tối đa 50 ký tự).
  - `address`: Địa chỉ quán (tối đa 140 ký tự).
  - `open`: Trạng thái nhận khách (bật/tắt nhận món).
  - `logo`: Tải ảnh logo riêng của quán (cắt ảnh base64, sinh favicon & icon header).
- **Cài đặt hiển thị & màu sắc đã có:**
  - `themeSettings`: Chọn màu thương hiệu (`brandColor`), hệ thống tự động tính toán màu nền, màu chữ và độ tương phản WCAG AA.
  - `displaySettings`: Cỡ chữ (`fontScale`), kích thước ảnh món (`foodImageScale`), thời gian hiển thị thông báo popup (`popupSeconds`).

### 3.2. Những trường dữ liệu động cần bổ sung
- **Thông tin liên hệ & Thanh toán:**
  - `phone` / `hotline`: Số điện thoại quán (rất cần thiết để in lên hóa đơn và để khách gọi hỗ trợ).
  - `wifi_ssid` & `wifi_password`: Tên và mật khẩu WiFi của quán để tự động hiện trên đầu trang thực đơn (khách quét QR vào quán là thấy WiFi ngay).
  - `bank_account`: Thông tin chuyển khoản gồm *Tên ngân hàng, Số tài khoản, Chủ tài khoản* để tích hợp tự động tạo mã VietQR thanh toán.
- **Thông tin hóa đơn & Pháp lý:**
  - `tax_code`: Mã số thuế của hộ kinh doanh / công ty.
  - `invoice_footer_note`: Lời cảm ơn hoặc lưu ý dưới chân hóa đơn (ví dụ: *"Cảm ơn quý khách và hẹn gặp lại! Quý khách vui lòng kiểm tra hóa đơn trước khi rời đi"*).
- **Liên kết mạng xã hội:** Link Fanpage Facebook, Zalo OA, TikTok, Google Maps đánh giá.

---

## 4. Khuyến mãi (Promotions)

### 4.1. Hiện trạng trong mã nguồn
- **Lưu trữ:** Lưu trong bảng `settings` với key `promotion:{itemId}` gắn theo từng món ăn.
- **Cấu trúc trường dữ liệu:**
  ```ts
  type Promotion = {
    enabled: boolean;
    type: "percent" | "amount"; // Giảm theo % hoặc Giảm số tiền cụ thể
    value: number;              // 1-99% hoặc số tiền (VNĐ)
    startsAt: number | null;    // Timestamp bắt đầu
    endsAt: number | null;      // Timestamp kết thúc
  };
  ```
- **Điểm mạnh:**
  - Đã có tính năng hẹn giờ khuyến mại (tự động bật khi đến giờ và tự tắt khi hết hạn).
  - Giao diện thực đơn tự động gạch giá cũ và hiện giá khuyến mại kèm nhãn đỏ bắt mắt.
  - Kiểm tra tính hợp lệ chống giảm giá âm hoặc giá sau giảm dưới 1.000 ₫.

### 4.2. Những phần còn thiếu để mở rộng tùy biến
- **Khuyến mãi trên toàn bộ hóa đơn (Order-level promotion):**
  - Giảm giá trên tổng bill (ví dụ: Giảm 10% cho hóa đơn từ 500.000 ₫).
  - Chiết khấu linh hoạt lúc tính tiền do thu ngân áp dụng (ví dụ: Giảm 20k cho khách quen hoặc voucher thủ công).
- **Khuyến mãi theo khung giờ định kỳ (Happy Hour):**
  - Tự động áp dụng vào các khung giờ cố định trong tuần (ví dụ: Giảm 20% cà phê từ 14h - 17h từ thứ Hai đến thứ Sáu) mà không cần nhập ngày cụ thể.
- **Khuyến mãi dạng Combo / Mua kèm:**
  - Ví dụ: Mua 1 Món chính tặng 1 Đồ uống, hoặc Combo 2 người giá ưu đãi.

---

## 5. Topping & Tùy chọn món (Extras / Options)

### 5.1. Hiện trạng trong mã nguồn
- **Lưu trữ:** Bảng `settings` với key `extras:{itemId}`.
- **Trường dữ liệu:** Danh sách các object `{ id: string, label: string, price: number }`.
- **Khẩu vị (`tastes`):** Đang bị hardcode trong `lib/menu.ts` thành mảng 3 giá trị: `"Vừa vị"`, `"Ít ngọt"`, `"Không thêm đường"`.
- **Thao tác:**
  - Trong modal sửa món `ItemForm`, quán có thể bấm "Thêm lựa chọn", điền tên topping và giá tiền (ví dụ: *Thêm trứng +10.000 ₫, Thêm phô mai +15.000 ₫*).
  - Cho phép xóa từng dòng topping của món.

### 5.2. Những phần còn thiếu để cá nhân hóa hoàn toàn
- **Nhóm Topping dùng chung (Shared Option Groups):**
  - Hiện tại, nếu quán có 20 loại trà sữa, nhân viên phải nhập tay 20 lần danh sách topping cho từng món một.
  - Cần có tính năng tạo *"Nhóm Topping dùng chung"* (ví dụ: Nhóm Topping Trà Sữa gồm Trân châu đen, Thạch nha đam, Pudding...) và chỉ cần gán nhóm này vào các món mong muốn.
- **Quy tắc chọn (Selection Rules):**
  - Chưa có thiết lập: *Bắt buộc chọn* (Required) hay *Tự chọn* (Optional).
  - Chưa có giới hạn: *Chọn tối đa bao nhiêu loại topping*, *Chọn tối thiểu bao nhiêu*.
- **Tùy biến nhóm thuộc tính không tính tiền:**
  - Cần biến phần `tastes` thành động: Quán tự tạo nhóm tùy chọn như:
    + Mức đá: *100% đá, 50% đá, Không đá*.
    + Mức ngọt: *100% đường, 70% đường, 50% đường, 0% đường*.
    + Mức độ cay: *Không cay, Cay vừa, Rất cay*.
    + Khẩu vị nấu: *Nhiều hành, Không hành, Không rau mùi*.

---

## 6. Bàn ăn & Khu vực (Dining Tables & Zones)

### 6.1. Hiện trạng trong mã nguồn
- **Cơ sở dữ liệu:** Bảng `dining_tables` trong D1.
  - Các trường: `store_id`, `id`, `name`, `zone`, `token`.
- **Thao tác đã hỗ trợ:**
  - **Thêm bàn:** Tự động gán mã bàn tăng dần, tạo token ngẫu nhiên, sinh mã QR URL duy nhất.
  - **Sửa bàn:** Sửa tên bàn và tên khu vực.
  - **Xóa bàn:** Có chức năng xóa bàn kèm điều kiện an toàn (chỉ xóa khi bàn không có khách và không có đơn đang xử lý).
  - **In ấn & Xuất mã QR:** Tải file vector SVG của từng bàn hoặc in toàn bộ 12 bàn ra giấy qua `window.print()`.

### 6.2. Những phần còn thiếu
- **Quản lý danh mục Khu vực (Zones Management):** Hiện tại khu vực chỉ là một ô nhập text tự do trên từng bàn, chưa có danh sách khu vực riêng để phân nhóm món hoặc phân quyền nhân viên phụ trách khu vực.
- **Số lượng ghế / Sức chứa bàn:** Chưa có trường `seats` (ví dụ: Bàn 2 người, Bàn 4 người, Bàn 10 người) để phục vụ việc xếp bàn khi đông khách.
- **Sơ đồ bố trí mặt bằng (Floor Layout Map):** Hiện chỉ hiển thị dưới dạng lưới thẻ (Grid Cards), chưa có giao diện sơ đồ mặt bằng trực quan theo vị trí thực tế của quán.

---

## 7. Quản lý Hoá đơn & Ghi chú kèm (Invoices, Receipts & Notes)

### 7.1. Hiện trạng trong mã nguồn
- **Lưu trữ dữ liệu:**
  - Bảng `orders`: Có trường `note` (ghi chú chung cho toàn đơn hàng), từng phần tử trong `items` (JSON) có trường `note` riêng cho từng món (ví dụ: *"không đường"*, *"ít hành"*).
  - Bảng `table_sessions`: Lưu trữ lượt ngồi của khách, tên khách `customer_name`, thời gian mở `created_at` và đóng bàn `closed_at`.
  - Bảng `table_payment_receipts`: Lưu thông tin thu tiền (`order_ids_json`, `amount`, `payment_method`, `paid_at`).
  - Bảng `table_settlements`: Lưu tổng kết toàn bộ lượt phục vụ khi đóng bàn.
- **Hộp thoại thanh toán hiện tại (`TablePaymentDialog`):**
  - Cho phép xem danh sách các đơn chưa thanh toán.
  - Tính tổng tiền còn cần thu.
  - Chọn phương thức thanh toán (*Tiền mặt, Chuyển khoản, Khác*).
  - Bấm xác nhận *"Đã nhận đủ tiền"*.

### 7.2. Những phần còn thiếu trong Quản lý Hoá đơn
1. **Thiếu mẫu xem và In Hoá đơn thanh toán (Bill Preview & Print):**
   - Sau khi ấn thanh toán hoặc trước khi thu tiền, quán **chưa có nút "In Hoá đơn" (Print Bill)** để xuất ra mẫu hóa đơn chuẩn đưa cho khách kiểm tra.
2. **Thiếu trường Ghi chú trên Hoá đơn thanh toán:**
   - Hiện chỉ có ghi chú món ăn do khách nhập. Chưa có trường `payment_note` để thu ngân ghi chú lúc thu tiền (ví dụ: *"Bàn anh Hùng quen giảm 20k"*, *"Chuyển khoản qua Techcombank lúc 12:35"*).
3. **Thiếu Phí dịch vụ & Thuế VAT:**
   - Hệ thống chưa có cấu hình thuế VAT (8% hoặc 10%) hoặc phụ thu phí dịch vụ.
4. **Mẫu Hoá đơn in nhiệt (Khổ 80mm / 58mm) tiêu chuẩn cần có:**
   - Header: Logo, Tên quán, Địa chỉ, Số điện thoại, Tên WiFi + Mật khẩu.
   - Thông tin phiếu: Số hóa đơn, Tên bàn, Tên khách, Thu ngân, Giờ vào, Giờ thanh toán.
   - Bảng kê chi tiết: Tên món, Số lượng, Đơn giá, Topping kèm theo, Ghi chú riêng của món, Thành tiền.
   - Tổng cộng: Tổng tiền món, Giảm giá/Khuyến mại (nếu có), Phí dịch vụ/VAT (nếu có), Tổng thanh toán cuối cùng.
   - Hình thức thanh toán: *Tiền mặt / Chuyển khoản*.
   - Footer: Lời cảm ơn của quán.

---

## 8. Ma trận Đánh giá Mức độ Động & Tùy biến (Customization Matrix)

| Phân hệ dữ liệu | Trường dữ liệu | Hiện trạng | Mức độ Động | Đề xuất bổ sung cho Codex/Muse |
| :--- | :--- | :--- | :---: | :--- |
| **Món ăn** | Tên, giá, mô tả, ảnh, nhãn, bật/tắt | Đã có | 80% | Bổ sung nút **Xóa món**, trường **Đơn vị tính** (ly, đĩa...), sắp xếp thứ tự |
| **Danh mục** | Tên, icon, thứ tự, ẩn/hiện | **Chưa có** | **0%** | **Xây dựng mới bảng `menu_categories`**, API CRUD danh mục và UI quản lý danh mục |
| **Thông tin quán** | Tên, slogan, giờ, địa chỉ, logo, màu sắc | Đã có | 75% | Thêm **SĐT quán, Tên/Pass WiFi, Thông tin STK Ngân hàng/VietQR, MST** |
| **Khuyến mại** | Giảm % hoặc tiền mặt theo món, hẹn giờ | Đã có | 70% | Thêm khuyến mại theo **Tổng bill**, Happy Hour định kỳ hàng tuần |
| **Topping/Khẩu vị**| Topping theo từng món | Đã có | 60% | Thêm **Nhóm Topping dùng chung**, chuyển khẩu vị (`tastes`) thành nhóm tùy chọn động |
| **Bàn & QR** | Tên bàn, khu vực, mã QR SVG | Đã có | 85% | Bổ sung bảng quản lý Khu vực riêng, trường số ghế của bàn |
| **Hoá đơn & Ghi chú**| Lưu đơn, ghi chú món, ghi chú đơn, biên lai | Đã có 1 phần | 50% | **Xây dựng màn hình Hoá đơn thanh toán hoàn chỉnh + Nút in Bill nhiệt khổ 80mm/58mm + Ghi chú thu tiền** |

---

## 9. Đề xuất Kế hoạch Triển khai (Action Plan cho Codex & Muse)

1. **Giai đoạn 1 — Quản lý Danh mục động (Menu Categories CRUD):**
   - Thêm migration `0011_menu_categories.sql` tạo bảng `menu_categories`.
   - Cập nhật foreign key/logic trong `menu_items`.
   - Viết API `GET/POST/PATCH/DELETE /api/admin/categories`.
   - Bổ sung tab/giao diện quản lý danh mục trên trang Admin.
2. **Giai đoạn 2 — Hoàn thiện Hoá đơn & Chức năng In Bill (Invoicing & Printing):**
   - Thiết kế component `PrintableInvoice` hỗ trợ khổ giấy in nhiệt 80mm/58mm và in qua trình duyệt.
   - Tích hợp nút **"In hoá đơn"** ngay trong dialog thanh toán cả bàn và trong chi tiết từng lượt bàn.
   - Bổ sung trường ghi chú thanh toán (`payment_note`) và thông tin liên hệ quán (SĐT, WiFi) lên hóa đơn.
3. **Giai đoạn 3 — Bổ sung Xóa món & Topping dùng chung:**
   - Thêm API và nút xóa món ăn an toàn.
   - Cho phép tạo nhóm tùy chọn (Topping, Mức đá, Mức đường) dùng chung cho nhiều món.
