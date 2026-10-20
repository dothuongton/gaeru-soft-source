# Mộc — Gọi món bằng QR

Ứng dụng mẫu tiếng Việt cho quán ăn/cà phê, tối ưu điện thoại. Tên quán, thực đơn, giá và tên 12 bàn có thể thay đổi trong phần quản lý.

## Luồng sử dụng

- Khách quét QR tại bàn. Hộp nhập tên tự mở, khách gửi yêu cầu mở bàn và chờ quản trị duyệt. Chỉ xem thực đơn không giữ bàn; trang gốc không có QR chỉ là chế độ xem trước.
- Bàn được giữ cho một trình duyệt ngay khi yêu cầu mở bàn được tạo. Một trình duyệt khác sẽ bị từ chối trong cả trạng thái chờ duyệt và đang phục vụ. Tải lại đúng trình duyệt sẽ tiếp tục lượt hiện tại.
- Quản trị đối chiếu tên khách tại bàn rồi chọn **Duyệt mở bàn** hoặc **Từ chối**. Sau khi duyệt, khách mới được thêm món, gửi đơn, gọi nhân viên hoặc yêu cầu hóa đơn.
- Đơn được lưu trong Cloudflare D1. Giỏ nháp được lưu theo từng lượt phục vụ trong trình duyệt. Quyền gọi món nằm trong cookie bảo mật do máy chủ cấp. Kết nối bàn và màn hình nhân viên tự cập nhật mỗi 5 giây, đơn khách mỗi 7 giây khi trang đang mở.
- Nhân viên nhận đơn, chuyển sang đang chuẩn bị, sẵn sàng và đã phục vụ; hủy đơn chưa thanh toán kèm lý do. Thanh toán chỉ được đánh dấu sau thao tác xác nhận riêng.
- Khách gọi nhân viên hoặc yêu cầu hóa đơn. Yêu cầu hỗ trợ được khử trùng và kiểm soát phiên bản để không đóng nhầm yêu cầu mới.
- Quản lý đổi giá, thêm món, bật/tắt tình trạng bán, sửa tên bàn, tải QR SVG hoặc in toàn bộ 12 bàn.
- Trong **Bàn & mã QR**, quản trị thấy trạng thái trống/chờ duyệt/đang phục vụ, tên khách và đơn còn cần xử lý. **Đóng bàn** chỉ được thực hiện sau khi mọi đơn của bàn đã phục vụ xong và thanh toán, hoặc được hủy hợp lệ. Thao tác này thu hồi quyền của lượt cũ và kết thúc các yêu cầu hỗ trợ của lượt đó.
- Quản trị có thể thanh toán riêng từng lần gọi món hoặc thu toàn bộ phần còn lại của lượt bàn. Thanh toán không tự đóng bàn. Khách mới chỉ có thể gửi yêu cầu khi quản trị đã đóng lượt trước hoặc từ chối yêu cầu đang chờ.

## Hai cách chọn món và xác nhận trên điện thoại

Mỗi thẻ món có hai nút rõ nhãn. **Thêm vào giỏ** mở phần số lượng, món thêm, khẩu vị và ghi chú; xác nhận xong giữ vị trí trong thực đơn và hiện thông báo món vừa thêm, số phần, tổng giỏ cùng nút **Xem giỏ**. **Gọi món ngay** mở cùng lựa chọn nhưng nút cuối là **Xác nhận gọi món**; chỉ món đang chọn được gửi thành một lần gọi riêng. Các món và ghi chú chung đang có trong giỏ được giữ nguyên.

Thanh giỏ hàng nằm phía trên điều hướng điện thoại, có khoảng chừa vùng an toàn. Thông báo thêm món và thanh giỏ nằm cùng một khối để chữ lớn không chồng nhau. Thông báo tự ẩn sau năm giây và chờ thêm khi người dùng đang đặt chuột hoặc bàn phím trong thông báo. Hộp giỏ có danh sách cuộn và phần đặt món riêng; màn hình ngắn vẫn cuộn được đến nút xác nhận. Khi gửi thành công, hộp xác nhận hiển thị bàn, mã đơn, số phần, tổng tiền và các nút theo dõi đơn, gọi thêm, hoặc xem phần giỏ còn lại.

Trước lần gửi đầu tiên, ứng dụng chụp toàn bộ nội dung, giá và mã yêu cầu. Trong lúc gửi hoặc chưa biết kết quả, không cho sửa nội dung đó. Lỗi mất mạng, hết thời gian chờ hoặc phản hồi không đầy đủ chuyển sang hộp **Kiểm tra lần gửi món**, hiển thị bản đã chụp và gửi lại đúng nội dung. Mỗi yêu cầu có bản lưu riêng theo lượt khách và mã yêu cầu, để tab khác không ghi đè hoặc xóa nhầm. Nếu lưu trữ trình duyệt bị chặn, bản chụp vẫn dùng trong tab đang mở nhưng không bảo đảm phục hồi sau tải lại. Lượt khách mới không đọc bản chờ của lượt cũ.

Khi máy chủ từ chối rõ ràng, giỏ hoặc lựa chọn trực tiếp mở lại cùng số lượng và ghi chú để khách sửa. Nếu quán thay nhóm món, tùy chọn không còn hợp lệ được bỏ và có lời nhắc kiểm tra lại. Thông báo lỗi nằm trong hộp đang thao tác, kể cả yêu cầu hỗ trợ và các hộp quản trị chỉnh món/bàn, hủy đơn, thanh toán hoặc đóng bàn. Mỗi giỏ tối đa 30 lựa chọn, 60 phần, 20 phần cho cùng lựa chọn; giới hạn được kiểm tra cả giao diện và API.

## Truy cập và dữ liệu

Trang quản lý `/?view=admin` kiểm tra danh tính do Sites xác thực và quyền trong D1 ở phía máy chủ. Danh sách `STAFF_EMAILS` giữ các tài khoản chủ quán ban đầu được bảo vệ; nhân viên mới được thêm qua **Tài khoản & phân quyền**. Không đưa giá trị cấu hình này vào mã nguồn. Việc trang thực đơn được công khai không cấp quyền quản trị cho khách.

QR sử dụng token bàn ngẫu nhiên. QR không tự cấp quyền gọi món hoặc đọc đơn. Cookie `__Host-moc-device` có `Secure`, `HttpOnly`, `SameSite=Lax`, chỉ dùng trên cùng host; cơ sở dữ liệu chỉ giữ bản băm của giá trị ngẫu nhiên. Khóa duy nhất có điều kiện trong D1 bảo đảm mỗi bàn chỉ có một lượt chờ duyệt/đang phục vụ, kể cả khi hai thiết bị gửi đồng thời. API đơn và yêu cầu hỗ trợ kiểm tra cả cookie, bàn, mã lượt và trạng thái được duyệt ngay trong câu lệnh ghi dữ liệu.

QR in, tải xuống và nút mở thực đơn dùng chung đường dẫn gốc `/?table=<token>`, không kèm màn quản trị hoặc phiên khách. Cả trang khách và API từ chối mã rỗng, liên kết có nhiều tham số bàn/phiên hoặc tham số không hợp lệ. QR giữ màu tối trên nền trắng và viền trắng bốn mô-đun, không chịu tác động của cài đặt màu giao diện. Kiểm tra SSR dùng component quản lý thật cùng bộ tạo QR thật để xác minh 12 giá trị URL, tỷ lệ vuông và viền trắng; việc này không thay thế thử quét bằng camera thực tế.

“Một thiết bị” ở đây là một trình duyệt với cùng cookie, không phải nhận dạng phần cứng. Trình duyệt khác, chế độ riêng tư hoặc xóa cookie được xem là thiết bị mới và bị chặn khi bàn đang có khách. Các tab cùng trình duyệt có thể tiếp tục cùng lượt. Không tự chiếm lại hoặc chuyển máy khi mất cookie; cần nhân viên xử lý các đơn còn lại, đóng bàn rồi duyệt lượt mới. QR được chia sẻ vẫn có thể gửi yêu cầu khi bàn trống, vì vậy nhân viên cần đối chiếu tên khách trước khi duyệt.

Yêu cầu mở bàn giới hạn sáu lượt mới trong mười phút trên một cookie; gửi lại yêu cầu hợp lệ không tạo thêm lượt. Khi bàn đóng, mọi yêu cầu dùng mã lượt cũ bị từ chối, kể cả từ đúng trình duyệt từng được duyệt. Các lượt cũ và đơn vẫn được giữ trong cơ sở dữ liệu; khách mới không nhận giỏ nháp hoặc lịch sử của khách trước.

Giá được tính lại từ thực đơn phía máy chủ, lưu ảnh chụp tên món/giá/tùy chọn trong từng đơn và chống gửi trùng bằng khóa yêu cầu duy nhất. Các thao tác thanh toán/hủy và đóng yêu cầu hỗ trợ dùng điều kiện cập nhật nguyên tử.

Trang quản lý giữ mọi đơn đang làm/chưa thanh toán, mọi đơn thuộc lượt phục vụ chưa đóng, cùng 200 đơn lịch sử gần nhất. Báo cáo doanh thu truy vấn trực tiếp dữ liệu đầy đủ và không bị giới hạn bởi danh sách 200 đơn này.

Trang **Đơn của bạn** trả đầy đủ đơn của lượt phục vụ hiện tại, không còn cắt ở 40 đơn. API vẫn kiểm tra đúng trình duyệt, bàn và lượt; đơn của khách trước không xuất hiện. Mã yêu cầu phải là chuỗi UUID đầy đủ, và phản hồi tải lịch sử cũ không được ghi đè một lần tải mới hơn.

## Tài khoản quản trị và phân quyền nhân viên

Mở **Quản trị → Tài khoản** (`/?view=admin&tab=accounts`) để xem hồ sơ đang đăng nhập. Người có quyền **Quản lý tài khoản nhân viên** được xem danh sách, tìm theo tên/email/vai trò, lọc trạng thái, thêm nhân viên, chỉnh quyền, tạm ngưng và kích hoạt lại. Mọi nhân viên đang hoạt động đều có trang hồ sơ riêng và nút đăng xuất; chỉ các mục và thao tác được cấp quyền mới xuất hiện.

Khi thêm nhân viên, nhập tên và đúng email tài khoản ChatGPT của họ. Chọn vai trò mẫu hoặc tùy chỉnh từng quyền, sau đó lưu. Người phụ trách sao chép liên kết đăng nhập để tự gửi cho nhân viên; ứng dụng không tự gửi email. Nhân viên đăng nhập bằng cơ chế xác thực sẵn có của Sites, không có mật khẩu ứng dụng riêng. Tài khoản được ràng buộc với mã danh tính nền tảng ổn định ở lần đăng nhập đầu; thay đổi email của cùng danh tính không làm mất quyền, còn người khác dùng lại email đã ràng buộc không được nhận quyền.

| Vai trò mẫu | Quyền mặc định |
| --- | --- |
| Quản lý | Toàn bộ 10 quyền, gồm quản lý nhân viên |
| Thu ngân | Xem đơn, quản lý bàn/QR/hỗ trợ, chuyển bàn, thu tiền, xem doanh thu |
| Phục vụ | Xem và xử lý đơn, quản lý bàn/QR/hỗ trợ, chuyển bàn |
| Bếp | Xem và cập nhật tiến độ đơn |
| Xem báo cáo | Doanh thu, lịch sử quyết toán và báo cáo CSV |
| Tùy chỉnh | Chọn riêng các quyền phù hợp |

Mười quyền riêng gồm xem đơn, xử lý đơn, hủy đơn, quản lý bàn và QR, chuyển bàn, thu tiền, xem doanh thu, quản lý thực đơn, cài đặt quán và quản lý nhân viên. Các quyền thao tác với đơn/bàn/thu tiền tự kèm quyền xem đơn. Quyền xử lý đơn không bao gồm hủy hoặc thu tiền; quyền quản lý bàn bao gồm duyệt mở, từ chối, đóng bàn đủ điều kiện và xác nhận đã hỗ trợ khách. Quyền xem báo cáo không cho thu tiền.

Chủ quán giữ đầy đủ quyền và không thể bị sửa hoặc khóa qua trang tài khoản. Người quản lý nhân viên không được tự sửa quyền/trạng thái của mình, cấp quyền mình không có hoặc sửa tài khoản đang có quyền cao hơn phạm vi được giao. Email tài khoản đã tạo không sửa trực tiếp; khi thay người dùng, tạm ngưng tài khoản cũ và thêm email mới. Khóa tài khoản ngừng các yêu cầu quản trị tiếp theo và giữ nguyên dữ liệu đơn hàng. Quyền được đọc lại ở mỗi yêu cầu, không dựa vào vai trò lưu trong trình duyệt.

API kiểm tra từng quyền trước mọi thao tác. Bảng quản trị chỉ trả dữ liệu vận hành khi có quyền xem đơn, doanh thu khi có quyền xem doanh thu, và token QR khi có quyền quản lý bàn. Dữ liệu lịch sử đã đóng không nằm trong bảng của nhân viên chỉ làm vận hành. Giao diện đóng hộp thao tác và ẩn các mục không còn quyền sau lần đồng bộ tiếp theo.

Sửa tài khoản dùng phiên bản để chặn ghi đè thay đổi của người khác. Thay đổi và lịch sử phân quyền nằm cùng một giao dịch; yêu cầu cấp quyền đang chờ cũng bị từ chối nếu người thực hiện đã bị khóa hoặc thay quyền trước khi ghi. Khi mất phản hồi, hộp chỉnh sửa giữ nguyên nội dung và đối chiếu lại kết quả trước khi thử lại. Lịch sử hiển thị các lần thêm, chỉnh quyền, tạm ngưng và kích hoạt lại cùng người thao tác và thời điểm Việt Nam.

Kiểm tra: `node tests/api.integration.test.mjs`, `node tests/staff-permissions.test.mjs`, `node tests/staff-ui.test.mjs`. Kiểm tra SSR dùng các component thật để xác nhận nút thao tác theo quyền, không mở trình duyệt hoặc gửi yêu cầu trên dữ liệu quán thật.

## Thanh toán từng lần hoặc cả bàn

Trong **Bàn đang mở**, chọn **Lịch sử gọi món** hoặc **Xử lý đơn & lịch sử** để mở các lần gọi món. Nút **Thanh toán lần này** ghi nhận tiền cho đúng đơn được chọn; những lần khác tiếp tục chưa thanh toán. Chọn phương thức và chỉ xác nhận khi quán đã nhận đủ tiền.

Nút **Thanh toán cả bàn** nằm ngay trong ô bàn có số tiền chưa thu. Bảng xác nhận hiển thị tổng lượt, đã thanh toán, còn cần thu và toàn bộ lần gọi món chưa trả tiền của lượt khách hiện tại. Quản trị chọn **Tiền mặt**, **Chuyển khoản** hoặc **Khác**, rồi xác nhận đã nhận đủ số tiền còn lại. Các đơn đã thanh toán hoặc đã hủy không được thu lại; toàn bộ đơn mới được thu cùng lúc nhận chung thời điểm và phương thức, còn khoản đã thu trước giữ nguyên dữ liệu.

API `GET /api/admin/table-payment?session=<id>` đọc tổng và danh sách chưa thanh toán trong cùng ảnh chụp dữ liệu. `PATCH /api/admin/table-payment` nhận `sessionId`, UUID `requestId`, danh sách `orderIds` đã xem, `expectedTotal` và `paymentMethod`. Máy chủ so sánh chính xác danh sách và số tiền ngay trong giao dịch ghi biên nhận và cập nhật đơn. Nếu có thêm đơn, một đơn được trả riêng hoặc hủy trước lúc xác nhận, giao dịch bị từ chối toàn bộ; màn hình tải tổng mới và yêu cầu quản trị kiểm tra, chọn lại phương thức. Mỗi lần xác nhận hỗ trợ tối đa 600 đơn.

Mỗi yêu cầu thành công có một biên nhận duy nhất trong `table_payment_receipts`. Gửi lại đúng nội dung và mã yêu cầu trả biên nhận cũ, kể cả khi bàn đã gọi thêm hoặc đã đóng; không thu các đơn đến sau. Khi mạng chậm hoặc chưa nhận được kết quả, nút **Kiểm tra lại giao dịch** gửi lại đúng yêu cầu đang chờ. Không đổi phương thức hoặc số tiền của yêu cầu chưa rõ kết quả. Đổi nội dung nhưng dùng lại mã cũ bị từ chối.

Thanh toán cả bàn không tự chuyển món sang đã phục vụ hoặc tự đóng bàn. Doanh thu tiếp tục được tính từ từng đơn đã thu, không cộng thêm biên nhận tổng bàn. Khi đóng bàn hợp lệ, phiếu quyết toán lưu đầy đủ lịch sử thanh toán và không ghi nhận thêm tiền.

## Cài đặt popup, cỡ chữ và ảnh món

Mở **Cài đặt quán → Chữ, ảnh & thông báo** (`/?view=admin&tab=settings`). Quản trị có thể nhập số nguyên, kéo thanh hoặc chọn nhanh thời gian popup **1–30 giây**, cỡ chữ và ảnh món **100–250%**. Mặc định là **3 giây / 200% / 200%**. Hệ số hiển thị bằng phần trăm chia 200, áp dụng trên bố cục riêng của từng cỡ màn hình; chữ có mức tối thiểu dễ đọc và ảnh giới hạn theo khoảng trống khả dụng. Tối ưu điện thoại không ghi đè các phần trăm quán đã lưu.

Khung xem trước dùng bản nháp cục bộ cho chữ và ảnh. **Thử popup** hiện thông báo mẫu đúng thời gian được chọn; không tạo đơn hay phát âm thanh. **Lưu thiết lập** mới áp dụng cho quán. **Về mặc định** cũng chỉ thay đổi bản nháp đến khi lưu; **Bỏ thay đổi** trở về cấu hình đã lưu mới nhất. Làm mới dữ liệu nền không xóa phần đang chỉnh; nếu quản trị khác đổi cấu hình, giao diện thông báo và vẫn giữ bản nháp.

Cấu hình được lưu riêng dưới khóa `display-settings` trong bảng `settings`, không trộn với thông tin quán và không cần migration. API quản trị kiểm tra quyền, cùng nguồn và đủ ba số nguyên trong giới hạn trước khi lưu cả cấu hình bằng một thao tác. Chưa có cấu hình hoặc dữ liệu cũ không hợp lệ thì dùng mặc định. Trang khách và quản trị nhận cấu hình qua lần cập nhật dữ liệu tiếp theo; trang xem trước thực đơn có chu kỳ cập nhật 20 giây, khách tại bàn 5 giây và quản trị 3 giây khi đang hiển thị.

Cỡ chữ áp dụng cho thực đơn khách, kết nối QR và các màn quản trị. Biến ảnh món áp dụng cho thực đơn, ảnh chi tiết, giỏ hàng và danh sách quản lý món; ảnh co theo chiều rộng khả dụng trên điện thoại. Bố cục và nút được phép xuống dòng, tăng chiều cao theo nội dung; không phóng to toàn trang bằng CSS `zoom` hoặc `transform: scale`.

## Cài đặt màu và nút thao tác

Trong **Cài đặt quán → Màu giao diện & màu chữ**, chọn màu bằng bảng chọn, nhập mã hex sáu chữ số hoặc dùng bảng màu **Xanh lá**, **Xanh dương**, **Nâu đất**, **Tím**. Khung xem trước chỉ đổi cục bộ; **Lưu màu sắc** mới áp dụng cho quán. Bản nháp được giữ khi polling, nút bỏ thay đổi dùng cấu hình mới nhất và phản hồi xác nhận từ máy chủ được ưu tiên khi lưu. Những lần GET thực đơn khởi chạy trước một cập nhật quản trị không được khôi phục cấu hình cũ.

Màu nền nút dùng đúng màu chủ đạo đã chọn. Chữ trên các nền chủ đạo tự chọn trắng hoặc đen; màu chủ đạo dùng làm chữ trên nền sáng được làm đậm khi cần để giữ khả năng đọc. Màu chữ chính và phụ lấy từ cài đặt màu chữ; panel báo khi chữ quá nhạt trên nền trắng. Các màu báo lỗi, cần hỗ trợ và trạng thái nghiệp vụ có ý nghĩa riêng. Các nút thao tác dùng góc bo, viền, bóng nổi và trạng thái nhấn/focus rõ; các nút biểu tượng có vùng chạm tối thiểu 44px.

API `PATCH /api/admin/theme-settings` nhận đủ `{accentColor,textColor}` dưới dạng `#RRGGBB`, chuẩn hóa về chữ thường và lưu riêng khóa `theme-settings`. API kiểm tra quản trị/cùng nguồn và chỉ lưu trường được hỗ trợ. Cấu hình cũ không bị thay đổi; không cần migration. Mặc định là chủ đạo `#244f3c`, chữ `#27382e`. Kiểm tra màu và khả năng đọc: `node tests/theme-settings.test.mjs`.

## Bố cục điện thoại và máy tính

Trang gọi món dùng đầu trang gọn, danh mục cuộn ngang, ô tìm món toàn chiều rộng và một cột món trên điện thoại nhỏ. Thanh giỏ hàng và điều hướng cố định có khoảng chừa cho mép an toàn iPhone. Các hộp chọn món/giỏ hàng tận dụng chiều cao màn hình, nội dung cuộn bên trong; nút thêm món và số lượng vẫn dễ chạm. Trạng thái kết nối bàn luôn nhìn thấy. Ảnh món và chữ tiếp tục nhận hệ số đã lưu; các ô nhập có chữ tối thiểu 16px.

Trang quản trị dùng một cột bàn trên điện thoại, tự tăng lên hai hoặc ba cột khi đủ chiều rộng. Tab và bộ lọc cuộn riêng; doanh thu, hỗ trợ và hành động trong bàn được xuống dòng. Bảng đối soát dài cuộn trong vùng bảng thay vì làm tràn cả trang. Hộp thanh toán, đổi bàn và đóng bàn có nội dung cuộn phù hợp màn hình. Các quy tắc tối ưu chỉ áp dụng cho màn hình, giữ bố cục in QR; viewport hỗ trợ vùng an toàn và không khóa zoom.

## Quản trị doanh thu

Mở `/?view=admin&tab=revenue` bằng tài khoản quản lý. Chọn khoảng ngày, lọc theo bàn và xem các chỉ số, biểu đồ, món gọi nhiều, phương thức thanh toán cùng danh sách đối soát có phân trang. Khoảng ngày tính theo múi giờ Việt Nam (UTC+7), bao gồm cả ngày bắt đầu và kết thúc, tối đa 366 ngày mỗi báo cáo. Kỳ so sánh có cùng số ngày và nằm ngay trước kỳ đã chọn.

| Chỉ số | Cách tính |
| --- | --- |
| Tiền thu trong kỳ | Tổng tiền của đơn được xác nhận thanh toán trong kỳ, dựa trên `paid_at`; loại trừ đơn hủy. Đơn có thể đã được tạo từ kỳ trước. |
| Giá trị đơn hàng | Tổng giá trị các đơn tạo trong kỳ và chưa bị hủy. Bao gồm cả đơn đang chờ xác nhận hoặc chuẩn bị. |
| Đã thanh toán | Trạng thái hiện tại của các đơn tạo trong kỳ, kể cả nếu tiền được thu ngoài kỳ. |
| Chưa thanh toán | Tổng tiền còn chưa được xác nhận thanh toán của các đơn tạo trong kỳ; loại trừ đơn hủy. |
| Món gọi nhiều | Tối đa 20 món theo số phần trong đơn hợp lệ tạo trong kỳ. Giá trị dùng tên món, số lượng, giá và tùy chọn đã lưu trong đơn. |

Khi xác nhận đã nhận tiền, nhân viên chọn **Tiền mặt**, **Chuyển khoản** hoặc **Khác**. Máy chủ tự ghi thời điểm đầu tiên xác nhận thanh toán. Gửi lại hoặc hai nhân viên xác nhận đồng thời không đổi thời điểm/phương thức đã được ghi nhận và không tạo thêm khoản thu. Cơ chế này ghi nhận thanh toán do nhân viên xác nhận; không tự kiểm tra giao dịch ngân hàng.

Đơn đã thanh toán trước khi có chức năng này vẫn giữ nguyên trạng thái và giá trị. Vì dữ liệu cũ chưa lưu thời điểm thu, `paid_at` được để trống và phương thức là **Chưa ghi nhận**. Những đơn đó vẫn xuất hiện trong số liệu theo ngày tạo đơn, nhưng không được tự gán vào tiền thu của một ngày. Báo cáo hiển thị tổng khoản đã thanh toán chưa biết ngày thu trên toàn bộ lịch sử của phạm vi bàn đã chọn.

Biểu đồ theo ngày, tổng hợp theo bàn và theo phương thức được đọc trong cùng một giao dịch để báo cáo xuất ra nhất quán khi cửa hàng đang tiếp nhận thanh toán. Bộ lọc danh sách đơn có thể dùng ngày tạo hoặc ngày thu, trạng thái và phương thức; bộ lọc riêng của danh sách không thay đổi các số tổng hợp phía trên.

**Xuất tổng hợp CSV** tải dữ liệu của báo cáo đang hiển thị, gồm tổng hợp/kỳ so sánh, từng ngày, tối đa 20 món gọi nhiều, từng bàn, phương thức và khoản chưa biết ngày thu. File dùng UTF-8, giữ nguyên số tiền VND và bảo vệ các ô văn bản có thể bị phần mềm bảng tính hiểu thành công thức. File tổng hợp không phải bản xuất toàn bộ chi tiết đơn của các trang phân trang.

## Bàn đang mở, thông báo đơn và quyết toán

Trang quản trị mặc định mở **Bàn đang mở**, ngay dưới **Doanh thu hôm nay**. Mỗi bàn đang chờ duyệt hoặc phục vụ nằm trong một ô, với tên khách, tổng lượt, tiền đã thu/chưa thu và lịch sử có thể mở rộng ngay trong ô. Lịch sử được lọc theo đúng `dining_session_id`, gồm cả đơn hủy; không trộn lượt khách trước. API quản trị vẫn lấy toàn bộ đơn thuộc phiên còn mở, kể cả khi vượt 200 đơn lịch sử gần nhất. Bàn, lượt khách, đơn, yêu cầu hỗ trợ và lịch sử chuyển bàn được đọc trong một giao dịch để dữ liệu trên ô nhất quán khi đang đổi bàn.

**Bàn cần hỗ trợ** được treo ngay trong ô bàn đang mở, vẫn hiện khi lịch sử thu gọn. Từng yêu cầu **Gọi nhân viên** hoặc **Yêu cầu thanh toán** có thời gian và nút **Đã hỗ trợ**; bộ lọc **Cần hỗ trợ** giúp tìm nhanh. Yêu cầu chỉ hết khi máy chủ xác nhận xử lý đúng mã và thời điểm của lần gọi đó. Một yêu cầu mới đến sau không bị thao tác xác nhận cũ xóa nhầm. Không còn danh sách hỗ trợ riêng chen giữa doanh thu hôm nay và các ô bàn.

### Đổi bàn trong cùng lượt khách

Quản trị chọn **Đổi bàn** trên ô bàn đang hoạt động, chọn bàn trống và xác nhận. Màn hình tải lại tình trạng bàn trước khi chọn; bàn có khách, chờ duyệt hoặc còn đơn/yêu cầu chưa xử lý không được chọn. Máy chủ kiểm tra lại ngay trong giao dịch. Nếu bàn nguồn đã thay đổi hoặc bàn đích vừa được giữ, không chuyển một phần; quản trị xem lại danh sách mới và xác nhận lại.

Đổi bàn giữ nguyên mã lượt, tên khách, quyền của trình duyệt, thời điểm bắt đầu, toàn bộ đơn và ghi chú (kể cả đã trả tiền hoặc hủy), trạng thái món, thời điểm/phương thức thu tiền và các lần gọi hỗ trợ. Chỉ các tham chiếu bàn của lượt này chuyển sang đích; không di chuyển dữ liệu của khách trước ở bàn đi hoặc bàn đến. Bàn cũ được giải phóng cùng lúc với việc khóa bàn mới. Đổi bàn không thu tiền, không tự đóng lượt và không cộng thêm doanh thu. Các khoản thu của lượt được tổng hợp theo bàn hiện tại.

API `PATCH /api/admin/table-transfer` nhận `sessionId`, UUID `requestId`, `fromTableId`, `expectedUpdatedAt` và `toTableId`. Nhật ký `table_transfers` lưu bàn đi/đến và thời điểm. Cập nhật lượt, tất cả đơn, yêu cầu hỗ trợ và tham chiếu bàn của biên nhận thanh toán nằm trong cùng giao dịch; nếu lỗi, toàn bộ được hoàn tác. Gửi lại cùng mã và nội dung trả kết quả cũ cùng vị trí hiện tại của lượt, không đổi bàn thêm lần nữa. Trạng thái phiên tăng theo mỗi lần chuyển, nên yêu cầu cũ không được áp dụng lại khi lượt đã chuyển đi rồi quay về.

Trang khách theo phiên và cookie đã được duyệt để cập nhật sang QR bàn hiện tại. Mã phiên trong URL chỉ giúp xác định lượt, không cấp quyền truy cập. Quét QR cũ bằng đúng trình duyệt vẫn theo được lượt đã chuyển; trình duyệt khác không được nhìn thấy lượt này. Giỏ nháp và mã yêu cầu gọi món lưu theo phiên để giữ món đang chọn khi đổi bàn hoặc tải lại trang; dữ liệu giỏ theo token của bản cũ cũng được đọc lại đúng phiên. Gửi lại một đơn đã nhận trước lúc đổi bàn không tạo đơn thứ hai.

Lịch sử đổi bàn nằm gọn trong ô bàn và trong chi tiết quyết toán sau khi đóng. Thông báo đơn đang chờ đi theo cùng phiên sang bàn mới; không phát sinh thông báo đơn mới chỉ vì đổi vị trí bàn.

Trang quản trị làm mới mỗi 3 giây khi đang hiển thị. Mỗi nhóm đơn mới của một bàn/lượt tạo một popup, hiển thị theo cấu hình đã lưu (mặc định 3.000 ms) rồi chuyển thông báo tiếp theo trong hàng đợi. Popup đã xuất hiện giữ thời lượng ban đầu khi cấu hình thay đổi; thông báo kế tiếp dùng thời lượng mới. Cập nhật dữ liệu hoặc đổi bàn trong cùng lượt không khởi động lại bộ đếm. Chọn **Xem bàn** mở đúng ô bàn. Các lần đọc lại cùng một đơn không phát thêm popup. Lần tải thành công đầu tiên dùng làm mốc theo dõi; các đơn đã chờ sẵn vẫn có dấu báo trên ô bàn. Dấu **Đơn mới** dựa trên trạng thái `new` ở máy chủ, chỉ hết khi đã nhận hoặc hủy hết đơn mới, không mất khi xem, ẩn popup hay tải lại trang. Thông báo đang chờ được loại nếu quản trị khác đã xử lý đơn.

### Âm báo khi khách gửi yêu cầu mở bàn

Sau khi khách quét đúng QR, nhập tên và gửi yêu cầu thành công, trang quản trị đọc **“Bàn 1 có khách yêu cầu mở bàn”** (dùng đúng tên bàn hiện tại). Popup **Yêu cầu mở bàn mới** hiển thị tên khách và nút **Xem yêu cầu** để mở đúng ô bàn đang chờ duyệt. Chỉ quét mã hoặc còn đang nhập tên chưa tạo thông báo; thiết bị bị từ chối do bàn đang có khách cũng không tạo thêm thông báo.

Yêu cầu mở bàn và đơn mới dùng chung hàng chờ đọc, phát lần lượt theo thứ tự nhận. Các sự kiện mới cùng một lần đồng bộ được sắp theo thời điểm phát sinh; lời đang đọc không bị một sự kiện đến sau cắt ngang. Mỗi mã lượt khách chỉ tạo một thông báo mở bàn; các lần tải lại dữ liệu không lặp. Lượt khách mới ở cùng bàn vẫn có thông báo mới. Khi quản trị duyệt/từ chối hoặc yêu cầu không còn chờ, popup và lời đọc đang chờ của yêu cầu đó được gỡ. Popup dùng thời lượng đã cài đặt; tự ẩn popup không cắt lời đọc, và ô bàn vẫn giữ trạng thái chờ duyệt cho tới khi được xử lý.

Thông báo mở bàn chỉ dành cho tài khoản có quyền **Quản lý bàn và QR**. Mất quyền sẽ bỏ đúng loại thông báo không còn được phép và giữ các thông báo khác còn quyền. Khi mở trang, đăng nhập lại hoặc được cấp lại quyền, lần tải thành công đầu tiên làm mốc theo dõi và không đọc lại các yêu cầu cũ; các yêu cầu ấy vẫn hiển thị trên ô bàn. Trang quản trị đang mở tự đồng bộ mỗi ba giây, nên yêu cầu mới thường xuất hiện trong lần đồng bộ kế tiếp.

Âm báo quản trị **luôn bật trong ứng dụng**, kể cả sau tải lại trang, không còn nút tắt. Trang thử khởi tạo âm thanh khi mở và tự tiếp tục sau tương tác thật. Nếu trình duyệt cần thao tác để cho phát, nút **Chạm để phát âm báo** và **Thử âm thanh** giúp kích hoạt; trạng thái luôn bật không khẳng định thiết bị đã phát ra tiếng. Khi có đơn mới, ứng dụng đọc **“Bàn … có đơn”**; khi có yêu cầu mở bàn mới, đọc **“Bàn … có khách yêu cầu mở bàn”**, bằng giọng tiếng Việt của thiết bị và tiếng chuông. Chỉ đánh dấu đã đọc sau khi giọng thực sự bắt đầu, nên lỗi tự phát không làm mất khả năng thử lại. Nếu thiếu giọng Việt hoặc trình duyệt chặn, giao diện nêu trạng thái. Không xin quyền microphone. Tính năng phục vụ trang quản trị đang mở; không phát thông báo đẩy khi đóng trang hoặc khóa màn hình, và không thay đổi trạng thái tắt tiếng của hệ điều hành. Popup dùng lớp nổi của trình duyệt, với phương án hiển thị cố định trên trình duyệt cũ.

**Đóng bàn** chỉ thành công khi toàn bộ đơn hợp lệ đã phục vụ và thanh toán. Cùng một giao dịch, máy chủ đóng lượt, lưu phiếu `table_settlements` duy nhất theo phiên và kết thúc yêu cầu hỗ trợ. Nếu ghi phiếu lỗi, bàn vẫn mở. Phiếu lưu nguyên thông tin bàn/khách, thời điểm bắt đầu/đóng, tổng tiền và tất cả đơn (kể cả hủy); chỉ chứa trường an toàn, không chứa cookie hoặc mã thiết bị. Đóng bàn không thay đổi `paid_at` và không cộng thêm doanh thu.

Mục **Doanh thu → Quyết toán bàn đã đóng** lọc theo ngày đóng bàn, giờ Việt Nam; 20 lượt mỗi trang, tổng hợp tính toàn bộ kết quả. Mở chi tiết để xem đủ lịch sử của một lượt. Các lượt đã đóng trước cập nhật được tổng hợp lại từ đơn lưu sẵn và có chú thích; không giả tạo thời điểm thu. **Bắt đầu lượt** sử dụng thời điểm khách gửi yêu cầu mở bàn, vì dữ liệu trước đây chưa lưu riêng giờ quản trị duyệt. CSV doanh thu hiện xuất các phần tổng hợp đã mô tả ở trên, không xuất chi tiết từng phiếu quyết toán.

Kiểm tra tiện ích thông báo đơn: `node tests/admin-notifications.test.mjs`. Kiểm tra yêu cầu mở bàn và hàng chờ hỗn hợp: `node tests/admin-opening-alerts.test.mjs`; kiểm tra nội dung popup bằng React SSR: `node tests/admin-opening-popup.test.mjs`. Kiểm tra API, giao dịch và quyết toán: `node tests/api.integration.test.mjs`.

Kiểm tra thời lượng popup theo cấu hình và tương thích kích thước mặc định: `node tests/admin-popup-timing.test.mjs`.

Kiểm tra chính sách thử lại âm báo, phát trùng và đổi bàn: `node tests/admin-audio-policy.test.mjs`. Kiểm tra phát tiếng thực tế trên thiết bị cần trình duyệt; kiểm tra mã nguồn không xác nhận âm lượng hoặc giọng Việt của thiết bị.

Hàng chờ âm thanh tách khỏi thời gian popup: lời đọc đang chạy được đọc hết và các bàn tiếp theo lần lượt được đọc, kể cả khi popup đặt 1 giây đã tự ẩn. Đổi bàn, xử lý đơn, ẩn trang và unmount vẫn hủy lời đọc không còn phù hợp. Nếu bộ máy phát giọng không trả kết thúc, giới hạn 30 giây giải phóng hàng chờ để thông báo tiếp theo không bị giữ mãi.

Kiểm tra giữ giỏ khi đổi bàn và tách biệt lượt khách: `node tests/session-draft.test.mjs`.

## Cài đặt và kiểm tra

Dùng Node và pnpm đúng phiên bản trong `package.json`. Chạy helper cài đặt/build của Sites theo cấu hình hiện có; giữ tích hợp `sites()` và cấu hình D1 `DB`.

- Kiểm tra kiểu: `pnpm exec tsc --noEmit`
- Tạo migration mới sau khi đổi schema: `pnpm run db:generate`
- Kiểm tra nghiệp vụ không mở server: `node tests/api.integration.test.mjs`
- Kiểm tra chính sách quyền: `node tests/staff-permissions.test.mjs`
- Kiểm tra giao diện tài khoản/bàn theo quyền bằng SSR: `node tests/staff-ui.test.mjs`
- Kiểm tra QR và SVG thực tế qua SSR: `node tests/qr-entry.test.mjs`
- Kiểm tra giỏ, gọi ngay, giữ yêu cầu khi mất mạng: `node tests/customer-order.test.mjs`
- Kiểm tra phục hồi bản cũ và nhiều tab: `node tests/customer-order-review.test.mjs`
- Kiểm tra phân biệt lỗi API và kết quả chưa rõ: `node tests/api-client.test.mjs`
- Build: `pnpm run build` hoặc helper `build-site.mjs` của Sites.

Các migration đã triển khai không được sửa lại. Dữ liệu mẫu được khởi tạo có tính idempotent bên ngoài migration. Migration bổ sung phiên bàn giữ nguyên dữ liệu cũ và tạo lượt khóa cho bàn còn đơn chưa hoàn tất/chưa thanh toán hoặc yêu cầu hỗ trợ đang mở. Quản trị phải xử lý rồi đóng các lượt này để nhận khách mới.

## Phạm vi bản đầu

Chưa kết nối cổng thanh toán, máy in bếp, POS, email/SMS hoặc thông báo đẩy khi đóng trang. Mã QR cố định nhận diện bàn, không chứng minh khách đang có mặt tại bàn. Tên quán, thực đơn và ảnh hiện là dữ liệu mẫu. Bản cập nhật đã kiểm tra API trực tiếp với SQLite, kiểm tra kiểu và build; cần kiểm tra hiển thị và thao tác trên điện thoại thật trong môi trường phục vụ.

Ảnh minh họa và nguồn được ghi tại `public/images/attribution.json`.


### Thông báo hỗ trợ bằng giọng đọc
Khách có thể nhập ghi chú tối đa 300 ký tự khi gọi nhân viên hoặc yêu cầu thanh toán. Trang quản trị đọc số bàn và ghi chú bằng tiếng Việt, cùng hàng chờ với đơn mới và mở bàn. Quyền quản lý bàn được yêu cầu để nhận thông báo hỗ trợ. Không đọc lại khi polling; yêu cầu được gửi lại sau khi đã xử lý dùng thế hệ thời gian mới. Ghi chú giữ nguyên khi đổi bàn. Cần thao tác chạm để cho phép âm thanh nếu trình duyệt chặn.
