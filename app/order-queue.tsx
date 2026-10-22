"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Check, ChefHat, Clock3, Eye, Flame, History, LoaderCircle, ReceiptText, UtensilsCrossed, X } from "lucide-react";
import { money, statuses, type DiningTable, type Order, type OrderStatus } from "@/lib/menu";
import type { Permission } from "@/lib/staff-permissions";
import "./order-queue.css";

export type OrderQueueFilter = "all" | "new" | "preparing" | "ready" | "history";

export type MutationOutcome =
  | { state: "confirmed" }
  | { state: "uncertain"; message: string }
  | { state: "rejected"; message: string }
  | { state: "committed_stale"; message: string }
  | boolean;

export type OrderQueueProps = {
  orders: Order[];
  tables: DiningTable[];
  permissions: Permission[];
  onOrderStatus: (order: Order, next: OrderStatus) => Promise<MutationOutcome>;
  onCancel: (order: Order) => void;
  onViewOrder: (order: Order) => void;
  isBusy?: (id: string) => boolean;
  focusOrderId?: string | null;
  onFocusHandled?: () => void;
  initialFilter?: OrderQueueFilter;
};

const orderTime = (value: number) => new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh",
}).format(new Date(value));

export function OrderQueue({
  orders,
  tables,
  permissions,
  onOrderStatus,
  onCancel,
  onViewOrder,
  isBusy,
  focusOrderId,
  onFocusHandled,
  initialFilter,
}: OrderQueueProps) {
  const [filter, setFilter] = useState<OrderQueueFilter>(() => {
    if (initialFilter) return initialFilter;
    const hasNew = orders.some(o => o.status === "new");
    return hasNew ? "new" : "all";
  });
  const [zone, setZone] = useState("all");
  const [now, setNow] = useState(Date.now());
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [uncertainOrderIds, setUncertainOrderIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState("");
  const headingId = useId();

  const canManageOrders = permissions.includes("orders.manage");
  const canCancelOrders = permissions.includes("orders.cancel");
  const canSeeMoney = permissions.includes("payments.collect") || permissions.includes("revenue.view");

  // Client-side timer to update wait times without API polling
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const tableZoneMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tables) map.set(t.id, t.zone);
    return map;
  }, [tables]);

  // Select filter and scroll to focused order if specified (consumed once per request)
  const lastFocusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusOrderId || lastFocusedRef.current === focusOrderId) return;
    const targetOrder = orders.find(o => o.id === focusOrderId);
    if (targetOrder) {
      lastFocusedRef.current = focusOrderId;
      const targetZone = tableZoneMap.get(targetOrder.table_id);
      if (zone !== "all" && targetZone && targetZone !== zone) {
        setZone("all");
      }
      if (targetOrder.status === "new") setFilter("new");
      else if (targetOrder.status === "preparing") setFilter("preparing");
      else if (targetOrder.status === "ready") setFilter("ready");
      else setFilter("history");

      requestAnimationFrame(() => {
        const element = document.getElementById("order-card-" + focusOrderId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      onFocusHandled?.();
    }
  }, [focusOrderId, orders, zone, tableZoneMap, onFocusHandled]);

  const zones = useMemo(() => [...new Set(tables.map(t => t.zone).filter(Boolean))], [tables]);

  const counts = useMemo(() => ({
    all: orders.filter(o => o.status !== "served" && o.status !== "cancelled").length,
    new: orders.filter(o => o.status === "new").length,
    preparing: orders.filter(o => o.status === "preparing").length,
    ready: orders.filter(o => o.status === "ready").length,
    history: orders.filter(o => o.status === "served" || o.status === "cancelled").length,
  }), [orders]);

  // Default to 'all' if no 'new' orders
  useEffect(() => {
    if (filter === "new" && counts.new === 0 && counts.all > 0) {
      setFilter("all");
    }
  }, [counts.new, counts.all, filter]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const orderZone = tableZoneMap.get(order.table_id) || "";
      if (zone !== "all" && orderZone !== zone) return false;
      if (filter === "new") return order.status === "new";
      if (filter === "preparing") return order.status === "preparing";
      if (filter === "ready") return order.status === "ready";
      if (filter === "history") return order.status === "served" || order.status === "cancelled";
      return order.status !== "served" && order.status !== "cancelled";
    }).sort((a, b) => {
      // History: newest first
      if (filter === "history") return b.created_at - a.created_at || b.id.localeCompare(a.id);
      // Active orders: FIFO oldest first
      return a.created_at - b.created_at || a.id.localeCompare(b.id);
    });
  }, [orders, filter, zone, tableZoneMap]);

  async function handleAdvance(order: Order) {
    const nextStatus = statuses[order.status]?.next;
    if (!nextStatus || !canManageOrders) return;
    if (isItemBusy(order.id) || busyOrderId === order.id || uncertainOrderIds.has(order.id)) return;
    setBusyOrderId(order.id);
    setActionError("");
    try {
      const outcome = await onOrderStatus(order, nextStatus);
      if (typeof outcome === "object" && outcome !== null) {
        if (outcome.state === "uncertain") {
          setUncertainOrderIds(prev => new Set(prev).add(order.id));
          setActionError("Chưa nhận được xác nhận từ máy chủ cho đơn #" + order.code + ". Hệ thống đang tự động đối chiếu.");
        } else if (outcome.state === "rejected") {
          setActionError(outcome.message || "Chưa cập nhật được đơn #" + order.code + ".");
        } else {
          setUncertainOrderIds(prev => {
            if (!prev.has(order.id)) return prev;
            const next = new Set(prev);
            next.delete(order.id);
            return next;
          });
        }
      } else if (!outcome) {
        setActionError("Chưa cập nhật được đơn #" + order.code + ".");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Thao tác thất bại.");
    } finally {
      setBusyOrderId(null);
    }
  }

  const isItemBusy = (orderId: string) => (isBusy ? isBusy(orderId) : false) || busyOrderId === orderId;

  return (
    <section className="order-queue-panel" aria-labelledby={headingId}>
      <header className="oq-header">
        <div className="oq-heading-row">
          <h2 id={headingId}>Hàng đợi đơn món</h2>
          {zones.length > 1 && (
            <label className="oq-zone-select">
              <span>Khu vực</span>
              <select value={zone} onChange={e => setZone(e.target.value)}>
                <option value="all">Tất cả khu vực</option>
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="oq-filter-bar" role="group" aria-label="Lọc đơn món">
          {([
            { id: "new", label: "Cần nhận", count: counts.new, attention: counts.new > 0 },
            { id: "preparing", label: "Đang làm", count: counts.preparing, attention: false },
            { id: "ready", label: "Chờ phục vụ", count: counts.ready, attention: false },
            { id: "all", label: "Tất cả", count: counts.all, attention: false },
            { id: "history", label: "Lịch sử", count: counts.history, attention: false },
          ] as const).map(option => (
            <button
              type="button"
              key={option.id}
              className={"oq-filter-btn " + (filter === option.id ? "selected " : "") + (option.attention ? "has-attention" : "")}
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
            >
              <span>{option.label}</span>
              <b>{option.count}</b>
            </button>
          ))}
        </div>
      </header>

      {actionError && <p className="oq-error" role="alert">{actionError}</p>}

      {filteredOrders.length === 0 ? (
        <div className="oq-empty">
          <UtensilsCrossed size={36} />
          <h3>{filter === "new" ? "Không có đơn cần nhận" : filter === "preparing" ? "Không có món đang làm" : filter === "ready" ? "Không có món chờ phục vụ" : "Chưa có đơn món nào"}</h3>
          <p>{filter === "new" ? "Khi khách gọi món, các đơn mới sẽ xuất hiện ngay tại đây theo thứ tự gọi trước làm trước." : "Chọn bộ lọc khác để xem tiến độ các đơn hàng."}</p>
        </div>
      ) : (
        <div className="oq-grid">
          {filteredOrders.map(order => {
            const waitMinutes = Math.max(0, Math.floor((now - order.created_at) / 60_000));
            const isUrgent = waitMinutes >= 15 && order.status !== "served" && order.status !== "cancelled";
            const isWarning = waitMinutes >= 10 && !isUrgent && order.status !== "served" && order.status !== "cancelled";
            const isUncertain = uncertainOrderIds.has(order.id);
            const isOrderWorking = isItemBusy(order.id) || isUncertain;
            const isFocused = focusOrderId === order.id;

            return (
              <article
                key={order.id}
                id={"order-card-" + order.id}
                className={"oq-card " + order.status + (isUrgent ? " urgent" : isWarning ? " warning" : "") + (isFocused ? " focused" : "")}
                aria-label={"Đơn " + order.code + " tại " + order.table_name}
              >
                <div className="oq-card-head">
                  <div className="oq-head-meta">
                    <span className="oq-table-name">{order.table_name}</span>
                    {tableZoneMap.get(order.table_id) && <small className="oq-zone-badge">{tableZoneMap.get(order.table_id)}</small>}
                    <span className="oq-order-code">#{order.code}</span>
                  </div>

                  <div className="oq-head-right">
                    {isUncertain ? (
                      <span className="oq-wait-badge warning" title="Chưa nhận được xác nhận từ máy chủ. Đang tự động đối chiếu.">
                        <AlertCircle size={13} />
                        Đang đối chiếu…
                      </span>
                    ) : order.status !== "served" && order.status !== "cancelled" ? (
                      <span className={"oq-wait-badge" + (isUrgent ? " urgent" : isWarning ? " warning" : "")}>
                        {isUrgent ? <Flame size={13} /> : <Clock3 size={13} />}
                        Chờ {waitMinutes}p
                      </span>
                    ) : (
                      <span className={"status-badge " + order.status}>{statuses[order.status]?.short}</span>
                    )}
                  </div>
                </div>

                {order.customer_name && (
                  <p className="oq-customer-name">Khách: <strong>{order.customer_name}</strong></p>
                )}

                <div className="oq-items">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="oq-item-row">
                      <b className="oq-item-qty">{item.quantity}×</b>
                      <div className="oq-item-info">
                        <span className="oq-item-name">{item.name}</span>
                        {[...item.extras, item.taste, item.note].some(Boolean) && (
                          <small className="oq-item-extras">
                            {[...item.extras, item.taste, item.note].filter(Boolean).join(" · ")}
                          </small>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {order.note && (
                  <div className="oq-note" role="note">
                    <AlertCircle size={14} />
                    <span>Ghi chú: {order.note}</span>
                  </div>
                )}

                {order.status === "cancelled" && order.cancel_reason && (
                  <div className="oq-note cancelled" role="note">
                    <span>Lý do hủy: {order.cancel_reason}</span>
                  </div>
                )}

                <div className="oq-card-footer">
                  <div className="oq-footer-info">
                    <time dateTime={new Date(order.created_at).toISOString()}>{orderTime(order.created_at)}</time>
                    {canSeeMoney && (
                      <strong className="oq-total">{money(order.total)}</strong>
                    )}
                  </div>

                  <div className="oq-actions">
                    {canManageOrders && statuses[order.status]?.next && (
                      <button
                        type="button"
                        className={"oq-btn-cta " + (order.status === "new" ? "primary" : order.status === "preparing" ? "preparing" : "ready")}
                        disabled={isOrderWorking}
                        onClick={() => void handleAdvance(order)}
                      >
                        {isUncertain ? (
                          <><AlertCircle size={15} />Đang đối chiếu…</>
                        ) : isOrderWorking ? (
                          <><LoaderCircle size={15} className="spin" />Đang lưu…</>
                        ) : order.status === "new" ? (
                          <><Check size={16} />Nhận & làm</>
                        ) : order.status === "preparing" ? (
                          <><ChefHat size={16} />Sẵn sàng</>
                        ) : (
                          <><ArrowRight size={16} />Đã phục vụ</>
                        )}
                      </button>
                    )}

                    {canCancelOrders && (order.status === "new" || order.status === "preparing") && !order.paid && (
                      <button
                        type="button"
                        className="oq-btn-cancel"
                        disabled={isOrderWorking}
                        onClick={() => onCancel(order)}
                        aria-label={"Hủy đơn #" + order.code}
                      >
                        Hủy
                      </button>
                    )}

                    <button
                      type="button"
                      className="oq-btn-detail icon-btn"
                      onClick={() => onViewOrder(order)}
                      aria-label={"Xem chi tiết đơn #" + order.code}
                      title="Xem chi tiết đơn"
                    >
                      <Eye size={17} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
