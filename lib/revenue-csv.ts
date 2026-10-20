import type {RevenueReport, RevenueSummary} from "./revenue-types";
import {paymentLabels} from "./revenue-types";

type Cell = string | number | null | undefined;

function csvCell(value: Cell): string {
  let text = value == null ? "" : String(value);
  // Quoting alone does not stop spreadsheet applications from evaluating text.
  // Keep actual numbers numeric, and protect every untrusted text column.
  if (typeof value !== "number" && (/^\s*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text))) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

const summaryRows: {key: keyof RevenueSummary; label: string; note: string}[] = [
  {key: "collected", label: "Tiền thu trong kỳ", note: "Theo thời điểm xác nhận thu tiền; không gồm khoản chưa biết thời điểm thu."},
  {key: "collectedOrders", label: "Số đơn đã thu trong kỳ", note: "Theo thời điểm xác nhận thu tiền."},
  {key: "orderRevenue", label: "Giá trị đơn hàng", note: "Đơn tạo trong kỳ, loại trừ đơn đã hủy."},
  {key: "validOrders", label: "Số đơn hợp lệ", note: "Đơn tạo trong kỳ, loại trừ đơn đã hủy."},
  {key: "paidForOrders", label: "Đã thanh toán của đơn tạo trong kỳ", note: "Theo trạng thái thanh toán hiện tại của đơn tạo trong kỳ, kể cả thanh toán ngoài kỳ."},
  {key: "unpaidForOrders", label: "Chưa thanh toán của đơn tạo trong kỳ", note: "Theo trạng thái hiện tại; loại trừ đơn đã hủy."},
  {key: "unpaidOrders", label: "Số đơn chưa thanh toán", note: "Đơn tạo trong kỳ, loại trừ đơn đã hủy."},
  {key: "averageOrder", label: "Giá trị trung bình mỗi đơn", note: "Giá trị đơn hàng chia cho số đơn hợp lệ."},
  {key: "unitsSold", label: "Số phần đã gọi", note: "Số lượng món trong đơn hợp lệ được tạo trong kỳ."},
  {key: "cancelledOrders", label: "Số đơn đã hủy", note: "Theo ngày tạo đơn."},
  {key: "cancelledAmount", label: "Giá trị đơn đã hủy", note: "Theo ngày tạo đơn; đã loại khỏi giá trị đơn hàng."},
];

/** Export the complete loaded aggregate report, independently of the order ledger page. */
export function makeRevenueCsv(report: RevenueReport): string {
  const {range} = report;
  const rows: Cell[][] = [
    ["BÁO CÁO DOANH THU"],
    ["Từ ngày", range.from, "Đến ngày", range.to, "Số ngày", range.days],
    ["Múi giờ", range.timezone],
    ["Phạm vi bàn", range.tableId === null ? "Tất cả bàn" : range.tableId],
    ["Dữ liệu cập nhật lúc", new Intl.DateTimeFormat("vi-VN", {timeZone: range.timezone, dateStyle: "short", timeStyle: "medium"}).format(new Date(report.generatedAt))],
    ["Kỳ so sánh từ ngày", range.previousFrom, "Đến ngày", range.previousTo],
    [],
    ["TỔNG HỢP", "Kỳ đã chọn (VND hoặc số lượng)", "Kỳ trước", "Cách tính"],
    ...summaryRows.map(row => [row.label, report.summary[row.key], report.previous[row.key], row.note]),
    [],
    ["THEO NGÀY", "Tiền thu (VND)", "Giá trị đơn hàng (VND)", "Đã thanh toán của đơn tạo trong ngày (VND)", "Chưa thanh toán của đơn tạo trong ngày (VND)", "Số đơn hợp lệ", "Số đơn đã thu", "Số đơn đã hủy", "Giá trị đơn đã hủy (VND)"],
    ...report.daily.map(day => [day.date, day.collected, day.orderRevenue, day.paidForOrders, day.unpaidForOrders, day.validOrders, day.collectedOrders, day.cancelledOrders, day.cancelledAmount]),
    [],
    ["MÓN GỌI NHIỀU — TỐI ĐA 20 MÓN", "Mã món", "Số phần", "Giá trị đơn hàng (VND)", "Số đơn"],
    ["Phạm vi", "Đơn hợp lệ tạo trong kỳ; giá trị gồm tùy chọn đã gọi. Tổng số phần ở mục tổng hợp bao gồm tất cả món."],
    ...report.topItems.map(item => [item.name, item.itemId, item.quantity, item.orderRevenue, item.orderCount]),
    [],
    ["THEO BÀN", "Mã bàn", "Số đơn hợp lệ tạo trong kỳ", "Giá trị đơn hàng (VND)", "Tiền thu trong kỳ (VND)", "Số đơn đã thu trong kỳ", "Chưa thanh toán của đơn tạo trong kỳ (VND)"],
    ...report.byTable.map(table => [table.tableName, table.tableId, table.validOrders, table.orderRevenue, table.collected, table.collectedOrders, table.unpaidForOrders]),
    [],
    ["PHƯƠNG THỨC THU TIỀN", "Số đơn", "Tiền thu trong kỳ (VND)"],
    ...report.payments.map(payment => [paymentLabels[payment.method], payment.count, payment.total]),
    [],
    ["KHOẢN ĐÃ THANH TOÁN CHƯA BIẾT THỜI ĐIỂM THU", "Số đơn", "Giá trị (VND)", "Phạm vi"],
    ["Không cộng vào tiền thu trong kỳ", report.undatedPaid.count, report.undatedPaid.total, range.tableId === null ? "Toàn bộ lịch sử của tất cả bàn, không giới hạn khoảng ngày đang chọn." : `Toàn bộ lịch sử của bàn ${range.tableId}, không giới hạn khoảng ngày đang chọn.`],
  ];
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
