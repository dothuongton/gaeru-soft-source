"use client";
import {withStore} from "@/lib/store-links";

import {useEffect, useId, useMemo, useRef, useState} from "react";
import {ArrowRight, ArrowRightLeft, BellRing, Check, CircleAlert, LoaderCircle, RefreshCw, Table2, UserRound, X} from "lucide-react";
import {money, type DiningTable, type Order, type ServiceRequest} from "@/lib/menu";
import type {TableTransferRequest, TableTransferResult} from "@/lib/table-transfer-types";
import type {AdminTableSession} from "./table-session-admin";
import "./table-transfer-dialog.css";

type TransferSnapshot = {tables: DiningTable[]; sessions: AdminTableSession[]; orders: Order[]; calls: ServiceRequest[]};
export type TableTransferDialogProps = TransferSnapshot & {
  session: AdminTableSession;
  onClose: () => void;
  onTransferred: (result: TableTransferResult) => void;
  onRefresh?: () => Promise<void>;
};

export function TableTransferDialog({session, tables, sessions, orders, calls, onClose, onTransferred, onRefresh}: TableTransferDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const heading = useId();
  const description = useId();
  const alive = useRef(true);
  const transferLock = useRef(false);
  const transferController = useRef<AbortController | null>(null);
  const attempt = useRef<TableTransferRequest | null>(null);
  const parentRefresh = useRef(onRefresh);
  parentRefresh.current = onRefresh;
  const [snapshot, setSnapshot] = useState<TransferSnapshot>({tables, sessions, orders, calls});
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [destinationId, setDestinationId] = useState("");
  const [error, setError] = useState("");
  const [changeNotice, setChangeNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const currentSession = snapshot.sessions.find(value => value.id === session.id);
  const active = currentSession?.status === "active";
  const sourceName = snapshot.tables.find(table => table.id === currentSession?.table_id)?.name || currentSession?.table_name || session.table_name || "Bàn " + session.table_id;
  const destination = snapshot.tables.find(table => table.id === destinationId);
  const destinations = useMemo(() => {
    const occupied = new Set(snapshot.sessions.filter(value => value.status === "active" || value.status === "pending").map(value => value.table_id));
    for (const order of snapshot.orders) if (order.status !== "cancelled" && (!order.paid || order.status !== "served")) occupied.add(order.table_id);
    for (const call of snapshot.calls) if (call.status === "open") occupied.add(call.table_id);
    return snapshot.tables.filter(table => table.id !== currentSession?.table_id && !occupied.has(table.id)).sort((a, b) => a.name.localeCompare(b.name, "vi", {numeric: true}));
  }, [snapshot, currentSession?.table_id]);
  const visitOrders = snapshot.orders.filter(order => order.dining_session_id === session.id && order.table_id === currentSession?.table_id);
  const validOrders = visitOrders.filter(order => order.status !== "cancelled");
  const paidTotal = validOrders.filter(order => order.paid).reduce((sum, order) => sum + order.total, 0);
  const total = validOrders.reduce((sum, order) => sum + order.total, 0);
  const openCalls = snapshot.calls.filter(call => call.status === "open" && call.session_id === session.id && call.table_id === currentSession?.table_id);

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    closeButton.current?.focus();
    return () => {
      alive.current = false;
      transferController.current?.abort();
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus({preventScroll: true});
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setLoading(true);
    setLoadFailed(false);
    setError("");
    void (async () => {
      try {
        const response = await fetch(withStore("/api/admin"), {credentials: "same-origin", cache: "no-store", signal: controller.signal});
        const data = await response.json().catch(() => null) as (Partial<TransferSnapshot> & {error?: string}) | null;
        if (!response.ok || !data || !Array.isArray(data.tables) || !Array.isArray(data.sessions) || !Array.isArray(data.orders) || !Array.isArray(data.calls)) throw new Error(data?.error || "Chưa tải được tình trạng bàn. Vui lòng thử lại.");
        if (!cancelled) {
          setSnapshot({tables: data.tables, sessions: data.sessions, orders: data.orders, calls: data.calls});
          if (revision > 0) void parentRefresh.current?.().catch(() => {});
        }
      } catch (reason) {
        if (!cancelled) {
          setLoadFailed(true);
          setError(reason instanceof Error && reason.name === "AbortError" ? "Kết nối chậm. Vui lòng tải lại tình trạng bàn." : reason instanceof Error ? reason.message : "Chưa tải được tình trạng bàn.");
        }
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {cancelled = true; clearTimeout(timeout); controller.abort();};
  }, [session.id, revision]);

  function refresh() {
    if (transferLock.current || uncertain) return;
    attempt.current = null;
    setDestinationId("");
    setRevision(value => value + 1);
  }

  async function confirmTransfer() {
    if (transferLock.current || loading || loadFailed) return;
    if (!attempt.current && (!active || !currentSession || !destinations.some(table => table.id === destinationId))) return;
    const body: TableTransferRequest = attempt.current ?? {
      sessionId: session.id,
      requestId: crypto.randomUUID(),
      fromTableId: currentSession!.table_id,
      expectedUpdatedAt: currentSession!.updated_at,
      toTableId: destinationId,
    };
    attempt.current = body;
    transferLock.current = true;
    setTransferring(true);
    setError("");
    const controller = new AbortController();
    transferController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let completed: TableTransferResult | null = null;
    try {
      const response = await fetch(withStore("/api/admin/table-transfer"), {method: "PATCH", credentials: "same-origin", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body), signal: controller.signal});
      const data = await response.json().catch(() => null) as (Partial<TableTransferResult> & {error?: string}) | null;
      if (!alive.current) return;
      if (response.ok && data?.ok && data.transfer?.requestId === body.requestId && data.transfer.sessionId === body.sessionId && data.transfer.fromTableId === body.fromTableId && data.transfer.toTableId === body.toTableId && data.session?.id === body.sessionId) {
        attempt.current = null;
        setUncertain(false);
        completed = data as TableTransferResult;
      } else if (response.status === 409) {
        attempt.current = null;
        setUncertain(false);
        setDestinationId("");
        setChangeNotice(data?.error || "Tình trạng bàn vừa thay đổi.");
        setRevision(value => value + 1);
      } else if (response.status >= 400 && response.status < 500) {
        attempt.current = null;
        setUncertain(false);
        setError(data?.error || "Chưa thể đổi bàn. Vui lòng kiểm tra lại.");
      } else {
        throw new Error("Chưa nhận được kết quả đổi bàn.");
      }
    } catch {
      if (alive.current) {
        setUncertain(true);
        setError("Chưa nhận được kết quả đổi bàn. Bấm Kiểm tra lại để tiếp tục đúng yêu cầu này; hệ thống không đổi bàn hai lần.");
      }
    } finally {
      clearTimeout(timeout);
      transferController.current = null;
      transferLock.current = false;
      if (alive.current) setTransferring(false);
    }
    if (completed && alive.current) onTransferred(completed);
  }

  function close() {if (!transferLock.current) onClose();}

  return <dialog ref={dialog} className="modal wide table-transfer-dialog" aria-labelledby={heading} aria-describedby={description} onCancel={event => {event.preventDefault(); close();}}>
    <div className="tt-header"><div><span>CHUYỂN LƯỢT PHỤC VỤ</span><h2 id={heading}>Đổi bàn</h2><p><UserRound size={23}/>{currentSession?.customer_name || session.customer_name}</p></div><button ref={closeButton} type="button" className="tt-close" disabled={transferring} onClick={close} aria-label="Đóng bảng đổi bàn"><X size={28}/></button></div>
    <div className="tt-body">
      {changeNotice && <div className="tt-notice" role="status"><CircleAlert size={24}/><p>{changeNotice} Danh sách được tải lại. Chọn bàn mới và kiểm tra trước khi xác nhận.</p></div>}
      {error && <div className="tt-error" role="alert"><CircleAlert size={24}/><p>{error}</p></div>}
      <p className="tt-description" id={description}>Chuyển khách, toàn bộ lịch sử gọi món, thanh toán và yêu cầu hỗ trợ sang bàn mới trong cùng lượt phục vụ. Bàn cũ trở về trống.</p>
      {loading ? <div className="tt-loading" role="status"><LoaderCircle className="spin" size={32}/>Đang kiểm tra bàn trống…</div> : loadFailed ? <button type="button" className="tt-secondary" onClick={refresh}><RefreshCw size={23}/>Tải lại tình trạng bàn</button> : !active ? <div className="tt-unavailable"><CircleAlert size={34}/><h3>Lượt này không còn đang mở</h3><p>Trở lại danh sách để xem tình trạng mới nhất.</p><button type="button" className="tt-secondary" onClick={close}>Trở lại bàn</button></div> : <>
        <div className="tt-route"><div><span>Từ bàn</span><strong>{sourceName}</strong><small>{snapshot.tables.find(table => table.id === currentSession.table_id)?.zone}</small></div><ArrowRight size={30}/><div className={destination ? "chosen" : ""}><span>Đến bàn</span><strong>{destination?.name || "Chọn bên dưới"}</strong><small>{destination?.zone || "Bàn trống"}</small></div></div>
        <div className="tt-visit-summary"><span><strong>{visitOrders.length}</strong> lần gọi món</span><span>Đã thu <strong>{money(paidTotal)}</strong></span><span>Còn cần thu <strong>{money(total - paidTotal)}</strong></span>{openCalls.length > 0 && <span className="support"><BellRing size={21}/><strong>{openCalls.length}</strong> yêu cầu hỗ trợ</span>}</div>
        <div className="tt-list-heading"><h3>Chọn bàn mới</h3><button type="button" disabled={transferring || uncertain} onClick={refresh}><RefreshCw size={20}/>Cập nhật</button></div>
        {destinations.length > 0 ? <fieldset className="tt-destinations" disabled={transferring || uncertain}><legend className="sr-only">Các bàn trống có thể chuyển đến</legend>{destinations.map(table => <label key={table.id} className={destinationId === table.id ? "selected" : ""}><input type="radio" name="transfer-destination" value={table.id} checked={destinationId === table.id} onChange={() => setDestinationId(table.id)}/><Table2 size={30}/><span><strong>{table.name}</strong><small>{table.zone}</small></span></label>)}</fieldset> : <div className="tt-empty"><Table2 size={32}/><p>Chưa có bàn trống để chuyển. Hãy xử lý hoặc đóng bàn đã phục vụ xong, sau đó cập nhật danh sách.</p></div>}
        <p className="tt-hint">Chỉ chọn được bàn không có khách, yêu cầu mở bàn hoặc đơn và yêu cầu hỗ trợ chưa xử lý.</p>
        {destination && <p className="tt-confirm-note"><ArrowRightLeft size={23}/><span>Xác nhận chuyển <strong>{currentSession.customer_name}</strong> từ <strong>{sourceName}</strong> sang <strong>{destination.name}</strong>.</span></p>}
        <div className="tt-footer"><button type="button" className="tt-secondary" disabled={transferring} onClick={close}>Quay lại</button><button type="button" className="tt-primary" disabled={transferring || (!uncertain && !destinations.some(table => table.id === destinationId))} onClick={() => void confirmTransfer()}>{transferring ? <LoaderCircle size={24} className="spin"/> : <Check size={24}/>}<span>{uncertain ? "Kiểm tra lại" : destination ? "Chuyển sang " + destination.name : "Xác nhận đổi bàn"}</span></button></div>
      </>}
    </div>
  </dialog>;
}
