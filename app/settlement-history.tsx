"use client";
import {withStore} from "@/lib/store-links";

import { useEffect, useId, useState } from "react";
import { Archive, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clock3, Eye, History, LoaderCircle, ReceiptText, RefreshCw, Table2, Wallet } from "lucide-react";
import { money, statuses, type Order } from "@/lib/menu";
import { paymentLabels } from "@/lib/revenue-types";
import type { SettlementDetail, SettlementPage, TableSettlement } from "@/lib/settlement-types";
import "./settlement-history.css";

export type SettlementHistoryProps = {
  from: string;
  to: string;
  table: string;
  refreshKey: number;
  onViewOrder: (order: Order) => void;
};

const moment = (value: number) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
const day = (value: string) => value.split("-").reverse().join("/");

function useSettlementResource<T>(path: string, revision: string) {
  const key = path + "|" + revision;
  const [stored, setStored] = useState<{ path: string; data: T } | null>(null);
  const [state, setState] = useState<{ key: string; loading: boolean; error: string }>({ key: "", loading: true, error: "" });
  useEffect(() => {
    let cancelled = false;
    let timedOut = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
    setState({ key, loading: true, error: "" });
    void (async () => {
      try {
        const response = await fetch(withStore(path), { credentials: "same-origin", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const error = data && typeof data === "object" ? (data as { error?: unknown }).error : null;
          throw new Error(typeof error === "string" ? error : "Chưa tải được quyết toán. Vui lòng thử lại.");
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Dữ liệu chưa hợp lệ. Vui lòng tải lại quyết toán.");
        if (!cancelled) { setStored({ path, data: data as T }); setState({ key, loading: false, error: "" }); }
      } catch (error) {
        if (!cancelled) {
          setStored(null);
          setState({ key, loading: false, error: timedOut ? "Kết nối quá thời gian chờ. Vui lòng thử lại." : error instanceof Error ? error.message : "Chưa tải được quyết toán." });
        }
      } finally { window.clearTimeout(timeout); }
    })();
    return () => { cancelled = true; window.clearTimeout(timeout); controller.abort(); };
  }, [key, path]);
  return { data: stored?.path === path ? stored.data : null, loading: state.key !== key || state.loading, error: state.key === key ? state.error : "" };
}

function SettlementError({ error, retry }: { error: string; retry: () => void }) {
  return <div className="sth-error" role="alert"><CircleAlert size={21} /><p>{error}</p><button type="button" className="secondary" onClick={retry}><RefreshCw size={14} />Thử lại</button></div>;
}

function VisitDetails({ sessionId, refreshKey, onViewOrder }: { sessionId: string; refreshKey: number; onViewOrder: (order: Order) => void }) {
  const [retry, setRetry] = useState(0);
  const resource = useSettlementResource<SettlementDetail>("/api/admin/revenue/settlements/" + encodeURIComponent(sessionId), refreshKey + ":" + retry);
  if (resource.error) return <SettlementError error={resource.error} retry={() => setRetry(value => value + 1)} />;
  if (!resource.data) return <div className="sth-loading" role="status"><LoaderCircle size={19} className="spin" />Đang tải lịch sử lượt phục vụ…</div>;
  const { settlement, orders, transfers = [] } = resource.data;
  return <div className="sth-details" aria-busy={resource.loading}>
    {transfers.length > 0 && <details className="sth-transfer-history"><summary><History size={22} />Lịch sử đổi bàn · {transfers.length} lần</summary><ol>{transfers.map(transfer => <li key={transfer.id}><strong>{transfer.fromTableName} → {transfer.toTableName}</strong><time dateTime={new Date(transfer.transferredAt).toISOString()}>{moment(transfer.transferredAt)}</time></li>)}</ol></details>}
    <div className="sth-detail-heading"><div><ReceiptText size={16} /><strong>{settlement.orderCount} đơn trong lượt này</strong><span>{settlement.validOrderCount} hợp lệ{settlement.cancelledCount ? " · " + settlement.cancelledCount + " đã hủy" : ""}</span></div>{resource.loading && <small><LoaderCircle size={12} className="spin" />Đang cập nhật</small>}</div>
    {orders.length ? <div className="sth-detail-orders">{orders.map(order => <div key={order.id} className={"sth-detail-order" + (order.status === "cancelled" ? " cancelled" : "")}>
      <div className="sth-detail-order-main"><div><strong>#{order.code}</strong><span className={"status-badge " + order.status}>{statuses[order.status].short}</span></div><time dateTime={new Date(order.created_at).toISOString()}>Gọi lúc {moment(order.created_at)}</time><p>{order.items.map(item => item.quantity + "× " + item.name).join(" · ")}</p>{order.cancel_reason && order.status === "cancelled" && <small>Lý do hủy: {order.cancel_reason}</small>}</div>
      <div className="sth-detail-payment"><strong>{money(order.total)}</strong><span>{order.status === "cancelled" ? "Không tính vào tổng" : order.paid ? paymentLabels[order.payment_method || "unknown"] : "Chưa thanh toán"}</span>{!!order.paid && order.status !== "cancelled" && <small>{order.paid_at ? "Thu " + moment(order.paid_at) : "Chưa lưu thời điểm thu"}</small>}</div>
      <button type="button" className="secondary" onClick={() => onViewOrder(order)} aria-label={"Xem chi tiết đơn " + order.code}><Eye size={14} /><span>Chi tiết đơn</span></button>
    </div>)}</div> : <p className="sth-no-detail-orders">Lượt phục vụ này kết thúc khi chưa phát sinh đơn.</p>}
    <div className="sth-detail-summary"><span>Giá trị đơn hợp lệ<strong>{money(settlement.total)}</strong></span><span>Đã thu<strong>{money(settlement.paidTotal)}</strong></span>{settlement.cancelledCount > 0 && <span>Giá trị đơn hủy<strong>{money(settlement.cancelledTotal)}</strong></span>}</div>
    {settlement.source === "reconstructed" && <p className="sth-source-note"><History size={13} />Lượt phục vụ cũ: số liệu được tổng hợp từ lịch sử đơn đã lưu.</p>}
  </div>;
}

function SettlementRow({ settlement, expanded, onToggle, detailId, refreshKey, onViewOrder }: { settlement: TableSettlement; expanded: boolean; onToggle: () => void; detailId: string; refreshKey: number; onViewOrder: (order: Order) => void }) {
  return <article className={"sth-visit" + (expanded ? " expanded" : "")}>
    <div className="sth-visit-row">
      <div className="sth-visit-customer"><span className="sth-table-icon"><Table2 size={18} /></span><div><strong>{settlement.tableName}</strong><p>{settlement.customerName}</p></div></div>
      <div className="sth-visit-time"><span>Bắt đầu lượt</span><time dateTime={new Date(settlement.openedAt).toISOString()}>{moment(settlement.openedAt)}</time></div>
      <div className="sth-visit-time closed"><span>Đóng bàn</span><time dateTime={new Date(settlement.closedAt).toISOString()}>{moment(settlement.closedAt)}</time></div>
      <div className="sth-visit-count"><strong>{settlement.validOrderCount} đơn</strong><span>{settlement.cancelledCount ? "+ " + settlement.cancelledCount + " đã hủy" : "hợp lệ"}</span></div>
      <div className="sth-visit-total"><strong>{money(settlement.total)}</strong><span><CheckCheck size={12} />Đã thu {money(settlement.paidTotal)}</span></div>
      <button type="button" className="sth-expand" aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}><span>{expanded ? "Thu gọn" : "Chi tiết"}</span><ChevronDown size={16} /></button>
    </div>
    {expanded && <div id={detailId}><VisitDetails sessionId={settlement.sessionId} refreshKey={refreshKey} onViewOrder={onViewOrder} /></div>}
  </article>;
}

export function SettlementHistory({ from, to, table, refreshKey, onViewOrder }: SettlementHistoryProps) {
  const id = useId();
  const rangeKey = from + "|" + to + "|" + table;
  const [pagination, setPagination] = useState({ rangeKey, page: 1 });
  const [expanded, setExpanded] = useState<{ rangeKey: string; sessionId: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const page = pagination.rangeKey === rangeKey ? pagination.page : 1;
  const params = new URLSearchParams({ from, to, table, page: String(page) });
  const resource = useSettlementResource<SettlementPage>("/api/admin/revenue/settlements?" + params.toString(), refreshKey + ":" + retry);
  const data = resource.data;
  const displayPage = data?.page || page;

  return <section id="quyet-toan-ban" className="settlement-history" aria-labelledby={id + "-heading"} aria-busy={resource.loading}>
    <div className="sth-heading"><div><h3 id={id + "-heading"}><Archive size={19} />Quyết toán bàn đã đóng</h3><p>Theo ngày đóng bàn. Tiền thu tính theo thời điểm xác nhận thanh toán; đóng bàn không cộng thêm khoản thu.</p></div><span className="sth-period"><Clock3 size={13} />{day(from)} – {day(to)}</span></div>
    {resource.error ? <SettlementError error={resource.error} retry={() => setRetry(value => value + 1)} /> : !data ? <div className="sth-loading" role="status"><LoaderCircle size={23} className="spin" />Đang tải quyết toán các bàn…</div> : <>
      <div className="sth-summary"><div><span><Table2 size={15} />Lượt bàn đã đóng</span><strong>{data.summary.count}</strong></div><div><span><ReceiptText size={15} />Giá trị đơn hợp lệ</span><strong>{money(data.summary.total)}</strong></div><div><span><Wallet size={15} />Đã thu của các lượt này</span><strong>{money(data.summary.paidTotal)}</strong></div>{data.summary.cancelledTotal > 0 && <p>Giá trị đơn hủy: <strong>{money(data.summary.cancelledTotal)}</strong> · Đã loại khỏi tổng.</p>}</div>
      {resource.loading && <p className="sth-updating" role="status"><LoaderCircle size={12} className="spin" />Đang cập nhật quyết toán…</p>}
      {data.settlements.length ? <div className="sth-visits">{data.settlements.map(settlement => <SettlementRow key={settlement.sessionId} settlement={settlement} expanded={expanded?.rangeKey === rangeKey && expanded.sessionId === settlement.sessionId} onToggle={() => setExpanded(current => current?.rangeKey === rangeKey && current.sessionId === settlement.sessionId ? null : { rangeKey, sessionId: settlement.sessionId })} detailId={id + "-detail-" + settlement.sessionId} refreshKey={refreshKey} onViewOrder={onViewOrder} />)}</div> : <div className="sth-empty"><Archive size={28} /><p>Chưa có bàn đóng trong khoảng ngày và bàn đang chọn.</p></div>}
      <div className="sth-pagination"><p>{data.total ? "Hiển thị " + ((displayPage - 1) * data.pageSize + 1) + "–" + Math.min(displayPage * data.pageSize, data.total) + " / " + data.total + " lượt bàn" : "0 lượt bàn"}<small>Tổng hợp phía trên tính toàn bộ kết quả trong bộ lọc.</small></p><div><button type="button" className="secondary" aria-label="Trang quyết toán trước" disabled={resource.loading || displayPage <= 1} onClick={() => setPagination({ rangeKey, page: displayPage - 1 })}><ChevronLeft size={15} />Trước</button><span>{displayPage} / {Math.max(1, data.pages)}</span><button type="button" className="secondary" aria-label="Trang quyết toán tiếp theo" disabled={resource.loading || displayPage >= data.pages} onClick={() => setPagination({ rangeKey, page: displayPage + 1 })}>Sau<ChevronRight size={15} /></button></div></div>
    </>}
  </section>;
}
