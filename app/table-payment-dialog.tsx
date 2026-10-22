"use client";
import {withStore} from "@/lib/store-links";

import {useEffect, useId, useRef, useState} from "react";
import {Banknote, Check, CheckCircle2, CircleAlert, Clock3, Landmark, LoaderCircle, LogOut, RefreshCw, WalletCards, X} from "lucide-react";
import {money} from "@/lib/menu";
import type {TablePaymentMethod, TablePaymentQuote, TablePaymentRequest, TablePaymentResult} from "@/lib/table-payment-types";
import "./table-payment-dialog.css";

const moment = (value: number) => new Intl.DateTimeFormat("vi-VN", {timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}).format(new Date(value));

export function TablePaymentDialog({
  sessionId,
  canClose = false,
  unservedCount = 0,
  onCloseSession,
  onClose,
  onPaid
}: {
  sessionId: string;
  canClose?: boolean;
  unservedCount?: number;
  onCloseSession?: () => Promise<void> | void;
  onClose: () => void;
  onPaid: (result: TablePaymentResult) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const heading = useId();
  const alive = useRef(true);
  const paymentLock = useRef(false);
  const paymentController = useRef<AbortController | null>(null);
  const attempt = useRef<TablePaymentRequest | null>(null);
  const [quote, setQuote] = useState<TablePaymentQuote | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<TablePaymentMethod | "">("cash");
  const [error, setError] = useState("");
  const [changeNotice, setChangeNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [paidReceipt, setPaidReceipt] = useState<TablePaymentResult["receipt"] | null>(null);
  const [closingSession, setClosingSession] = useState(false);

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    closeButton.current?.focus();
    return () => {
      alive.current = false;
      paymentController.current?.abort();
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setLoading(true);
    setQuote(null);
    setError("");
    void (async () => {
      try {
        const response = await fetch(withStore("/api/admin/table-payment?session=" + encodeURIComponent(sessionId)), {credentials: "same-origin", cache: "no-store", signal: controller.signal});
        const data = await response.json().catch(() => null) as (Partial<TablePaymentQuote> & {error?: string}) | null;
        if (!response.ok || !data) throw new Error(data?.error || "Chưa tải được số tiền của bàn. Vui lòng thử lại.");
        if (!cancelled) setQuote(data as TablePaymentQuote);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error && reason.name === "AbortError" ? "Kết nối chậm. Vui lòng tải lại số tiền của bàn." : reason instanceof Error ? reason.message : "Chưa tải được số tiền của bàn.");
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {cancelled = true; clearTimeout(timeout); controller.abort();};
  }, [sessionId, revision]);

  function refreshQuote() {
    if (paymentLock.current || uncertain) return;
    attempt.current = null;
    setPaymentMethod("");
    setRevision(value => value + 1);
  }

  async function confirmPayment() {
    if (paymentLock.current || loading || !quote || !quote.unpaidCount || (!paymentMethod && !attempt.current)) return;
    const body: TablePaymentRequest = attempt.current ?? {sessionId, requestId: crypto.randomUUID(), orderIds: quote.orders.map(order => order.id), expectedTotal: quote.unpaidTotal, paymentMethod: paymentMethod as TablePaymentMethod};
    attempt.current = body;
    paymentLock.current = true;
    setPaying(true);
    setError("");
    const controller = new AbortController();
    paymentController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(withStore("/api/admin/table-payment"), {method: "PATCH", credentials: "same-origin", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body), signal: controller.signal});
      const data = await response.json().catch(() => null) as (Partial<TablePaymentResult> & {error?: string}) | null;
      if (!alive.current) return;
      if (response.ok && data?.ok && data.receipt?.requestId === body.requestId && data.receipt.sessionId === body.sessionId && data.receipt.amount === body.expectedTotal) {
        attempt.current = null;
        setUncertain(false);
        setPaidReceipt(data.receipt);
        onPaid(data as TablePaymentResult);
        return;
      }
      if (response.status === 409) {
        attempt.current = null;
        setUncertain(false);
        setPaymentMethod("");
        setChangeNotice(data?.error || "Các đơn của bàn vừa thay đổi. Vui lòng kiểm tra lại số tiền trước khi xác nhận.");
        setRevision(value => value + 1);
        return;
      }
      if (response.status >= 400 && response.status < 500) {
        attempt.current = null;
        setUncertain(false);
        setError(data?.error || "Chưa thể ghi nhận thanh toán. Vui lòng kiểm tra lại.");
        return;
      }
      throw new Error(data?.error || "Chưa nhận được kết quả xác nhận thanh toán.");
    } catch {
      if (alive.current) {
        setUncertain(true);
        setError("Chưa nhận được kết quả thanh toán. Bấm Kiểm tra lại giao dịch để gửi lại đúng yêu cầu này; hệ thống không ghi tiền hai lần.");
      }
    } finally {
      clearTimeout(timeout);
      paymentController.current = null;
      paymentLock.current = false;
      if (alive.current) setPaying(false);
    }
  }

  function close() {if (!paymentLock.current) onClose();}

  return <dialog ref={dialog} className="modal wide table-payment-dialog" aria-labelledby={heading} onCancel={event => {event.preventDefault(); close();}}>
    <div className="tp-header"><div><span>THANH TOÁN CẢ BÀN</span><h2 id={heading}>{quote?.session.table_name || "Tổng tiền của bàn"}</h2>{quote && <p>{quote.session.customer_name}</p>}</div><button ref={closeButton} type="button" className="tp-close" disabled={paying} onClick={close} aria-label="Đóng bảng thanh toán"><X size={28}/></button></div>
    <div className="tp-body">
      {paidReceipt ? (
        <div className="tp-success-view">
          <CheckCircle2 size={44} className="tp-success-icon" />
          <h3>Đã ghi nhận thu tiền thành công</h3>
          <p className="tp-success-amount"><strong>{money(paidReceipt.amount)}</strong></p>
          <p className="tp-success-meta">
            {paidReceipt.paymentMethod === "cash" ? "Tiền mặt" : paidReceipt.paymentMethod === "bank" ? "Chuyển khoản" : "Khác"} · {paidReceipt.orderIds.length} lần gọi món
          </p>
          {unservedCount > 0 ? (
            <div className="tp-unserved-warning">
              <Clock3 size={18} />
              <span>Còn {unservedCount} lần gọi món cần phục vụ trước khi đóng bàn.</span>
            </div>
          ) : canClose && onCloseSession ? (
            <div className="tp-ready-to-close">
              <p>Tất cả đơn đã được phục vụ và thanh toán đủ. Có thể đóng bàn ngay.</p>
              <button
                type="button"
                className="tp-primary"
                disabled={closingSession}
                onClick={async () => {
                  setClosingSession(true);
                  try {
                    await onCloseSession();
                  } finally {
                    setClosingSession(false);
                  }
                }}
              >
                {closingSession ? <LoaderCircle className="spin" size={20} /> : <LogOut size={20} />}
                <span>Đóng bàn ngay</span>
              </button>
            </div>
          ) : null}
          <button type="button" className="tp-secondary" onClick={close}>
            Trở lại bàn
          </button>
        </div>
      ) : (
        <>
          {changeNotice && <div className="tp-notice" role="status"><CircleAlert size={24}/><p>{changeNotice} Kiểm tra danh sách và chọn lại phương thức thanh toán.</p></div>}
          {error && <div className="tp-error" role="alert"><CircleAlert size={24}/><p>{error}</p></div>}
          {loading ? <div className="tp-loading" role="status"><LoaderCircle className="spin" size={32}/>Đang kiểm tra các lần gọi món…</div> : !quote ? <button type="button" className="tp-secondary" onClick={refreshQuote}><RefreshCw size={22}/>Tải lại số tiền</button> : <>
            <div className="tp-totals"><div><span>Tổng lượt này</span><strong>{money(quote.total)}</strong></div><div><span>Đã thanh toán</span><strong>{money(quote.paidTotal)}</strong></div><div className="remaining"><span>Còn cần thu</span><strong>{money(quote.unpaidTotal)}</strong><small>{quote.unpaidCount} lần gọi món chưa thanh toán</small></div></div>
            {!quote.unpaidCount ? <div className="tp-all-paid"><CheckCircle2 size={38}/><h3>Bàn không còn tiền cần thu</h3><p>Các lần gọi món đã được thanh toán. Có thể đóng bàn sau khi phục vụ xong.</p><button type="button" className="tp-primary" onClick={close}>Trở lại bàn</button></div> : <>
              <div className="tp-list-heading"><h3>Các lần gọi món sẽ thanh toán</h3><button type="button" disabled={paying || uncertain} onClick={refreshQuote}><RefreshCw size={19}/>Cập nhật</button></div>
              <div className="tp-orders">{quote.orders.map(order => <article key={order.id}><div><strong>#{order.code}</strong><time dateTime={new Date(order.created_at).toISOString()}>{moment(order.created_at)}</time><p>{order.items.map(item => `${item.quantity}× ${item.name}`).join(" · ")}</p></div><strong>{money(order.total)}</strong></article>)}</div>
              <p className="tp-hint">Chỉ thu các lần gọi món chưa thanh toán trong lượt khách hiện tại. Các khoản đã thu được giữ nguyên.</p>
              <fieldset className="tp-methods" disabled={paying || uncertain}><legend>Khách thanh toán bằng</legend>{([{id:"cash",label:"Tiền mặt",icon:Banknote},{id:"bank",label:"Chuyển khoản",icon:Landmark},{id:"other",label:"Khác",icon:WalletCards}] as const).map(method => <label key={method.id} className={paymentMethod === method.id ? "selected" : ""}><input type="radio" name="table-payment-method" value={method.id} checked={paymentMethod === method.id} onChange={() => setPaymentMethod(method.id)}/><method.icon size={30}/><span>{method.label}</span></label>)}</fieldset>
              <p className="tp-hint tp-time"><Clock3 size={19}/>Thời điểm thu tiền được ghi khi quán xác nhận đã nhận đủ.</p>
              <div className="tp-footer"><button type="button" className="tp-secondary" disabled={paying} onClick={close}>Quay lại</button><button type="button" className="tp-primary" disabled={paying || (!paymentMethod && !uncertain)} onClick={() => void confirmPayment()}>{paying ? <LoaderCircle className="spin" size={24}/> : <Check size={24}/>}<span>{uncertain ? "Kiểm tra lại giao dịch" : "Xác nhận đã thu " + money(quote.unpaidTotal)}</span></button></div>
            </>}
          </>}
        </>
      )}
    </div>
  </dialog>;
}
