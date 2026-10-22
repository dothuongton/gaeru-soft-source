"use client";
import {activeStoreId} from "@/lib/store-links";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Check, Clock3, Download, LoaderCircle, LockKeyhole, LogOut, Pencil, Plus, QrCode, Printer, ReceiptText, ShieldCheck, Smartphone, Table2, Trash2, UserRound, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { money, type DiningTable, type Order } from "@/lib/menu";
import { tableQrPath } from "@/lib/qr-entry";
import "./table-session-admin.css";

export type AdminTableSession = {
  id: string;
  table_id: string;
  table_name?: string;
  customer_name: string;
  status: "pending" | "active" | "closed" | "rejected";
  created_at: number;
  updated_at: number;
};

export type TableSessionAction = "approve" | "reject" | "close";
type SessionActionHandler = (id: string, action: TableSessionAction) => Promise<boolean>;
type SessionOrder = Order & { dining_session_id?: string | null };

function requestTime(value: number) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function getSessionOrders(orders: Order[], session: Pick<AdminTableSession, "id" | "table_id">) {
  const tableOrders = (orders as SessionOrder[]).filter(order => order.table_id === session.table_id && order.status !== "cancelled");
  return {
    count: tableOrders.filter(order => order.dining_session_id === session.id).length,
    outstanding: tableOrders.filter(order => !order.paid || order.status !== "served").length,
    unpaid: tableOrders.filter(order => !order.paid).reduce((sum, order) => sum + order.total, 0),
  };
}

export function OpeningRequests({ sessions, tables, working, onAction }: {
  sessions: AdminTableSession[];
  tables: DiningTable[];
  working: boolean;
  onAction: SessionActionHandler;
}) {
  const titleId = useId();
  const [busyId, setBusyId] = useState<string | null>(null);
  const actionLock = useRef(false);
  const pending = sessions.filter(session => session.status === "pending").sort((a, b) => a.created_at - b.created_at);
  const busy = working || busyId !== null;

  async function act(id: string, action: "approve" | "reject") {
    if (busy || actionLock.current) return;
    actionLock.current = true;
    setBusyId(id);
    try { await onAction(id, action); }
    finally { actionLock.current = false; setBusyId(null); }
  }

  if (!pending.length) return null;
  return <section className="table-opening-queue no-print" aria-labelledby={titleId}>
    <div className="table-opening-heading">
      <span className="table-opening-icon"><Smartphone size={21} /></span>
      <div><h2 id={titleId}>Yêu cầu mở bàn <span>{pending.length}</span></h2><p>Đối chiếu tên khách tại bàn trước khi duyệt quyền gọi món.</p></div>
      <span className="table-opening-pulse" aria-hidden="true" />
    </div>
    <div className="table-opening-list">
      {pending.map(session => {
        const tableName = tables.find(table => table.id === session.table_id)?.name || session.table_name || "Bàn " + session.table_id;
        return <article className="table-opening-row" key={session.id}>
          <div className="table-opening-customer">
            <span className="table-opening-avatar" aria-hidden="true"><UserRound size={19} /></span>
            <div><strong>{session.customer_name}</strong><p><span>{tableName}</span><span className="table-opening-time"><Clock3 size={12} />{requestTime(session.created_at)}</span></p></div>
          </div>
          <div className="table-opening-actions">
            <button type="button" className="secondary table-session-reject" disabled={busy} onClick={() => void act(session.id, "reject")} aria-label={"Từ chối mở " + tableName + " cho " + session.customer_name}><X size={15} />Từ chối</button>
            <button type="button" className="primary" disabled={busy} onClick={() => void act(session.id, "approve")} aria-label={"Duyệt mở " + tableName + " cho " + session.customer_name}>{busyId === session.id ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Duyệt mở bàn</button>
          </div>
        </article>;
      })}
    </div>
    <p className="table-opening-footnote"><LockKeyhole size={13} />Bàn đang chờ duyệt sẽ từ chối kết nối mới.</p>
  </section>;
}

function CloseTableDialog({ session, tableName, outstanding, working, error, onClose, onConfirm }: {
  session: AdminTableSession;
  tableName: string;
  outstanding: number;
  working: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialogRef} className="modal table-close-dialog" aria-labelledby={headingId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); if (!working) onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget || working) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <div className="modal-header"><h2 id={headingId}>Đóng {tableName}?</h2><button type="button" className="icon-btn" aria-label="Đóng hộp xác nhận" disabled={working} onClick={onClose}><X size={20} /></button></div>
    <div className="table-close-body">
      <span className="table-close-icon"><LogOut size={26} /></span>
      <p className="table-close-customer"><span>Kết thúc lượt phục vụ</span><strong>{session.customer_name}</strong></p>
      <p id={descriptionId}>Trình duyệt đang kết nối sẽ mất quyền gọi món. Sau khi đóng bàn, khách tiếp theo có thể quét QR và gửi yêu cầu mở bàn mới.</p>
      {outstanding > 0 ? <p className="table-close-warning" role="status">Còn {outstanding} đơn chưa phục vụ xong hoặc chưa thanh toán. Hãy xử lý các đơn này trước khi đóng bàn.</p> : <p className="table-close-ready"><ShieldCheck size={17} />Các đơn của lượt này đã được xử lý.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="table-close-actions"><button ref={cancelRef} type="button" className="secondary" disabled={working} onClick={onClose}>Quay lại</button><button type="button" className="primary" disabled={working || outstanding > 0} onClick={() => void onConfirm()}>{working ? <LoaderCircle className="spin" size={16} /> : <LogOut size={16} />}Đóng bàn</button></div>
    </div>
  </dialog>;
}

function downloadQr(table: DiningTable) {
  const svg = document.getElementById("table-session-qr-" + table.id)?.querySelector("svg");
  if (!svg) return;
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "QR-" + table.name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, "-") + ".svg";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TableManagement({ tables, sessions, orders, shopName, origin, working, onAction, onEditTable, onAddTable, onViewOrders, onDeleteTable }: {
  tables: DiningTable[];
  sessions: AdminTableSession[];
  orders: Order[];
  shopName: string;
  origin: string;
  working: boolean;
  onAction: SessionActionHandler;
  onEditTable: (table: DiningTable) => void;
  onAddTable: () => void;
  onViewOrders: (tableId: string) => void;
  onDeleteTable: (table: DiningTable) => void;
}) {
  const [closeId, setCloseId] = useState<string | null>(null);
  const [qrTable,setQrTable]=useState<DiningTable|null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const actionLock = useRef(false);
  const busy = working || busyId !== null;
  const liveSessions = new Map<string, AdminTableSession>();
  for (const session of [...sessions].sort((a, b) => a.updated_at - b.updated_at)) {
    if (session.status === "active" || session.status === "pending") liveSessions.set(session.table_id, session);
  }
  const pendingCount = tables.filter(table => liveSessions.get(table.id)?.status === "pending").length;
  const activeCount = tables.filter(table => liveSessions.get(table.id)?.status === "active").length;
  const selectedSession = sessions.find(session => session.id === closeId && session.status === "active");
  const selectedTable = selectedSession ? tables.find(table => table.id === selectedSession.table_id) : null;

  async function act(id: string, action: TableSessionAction) {
    if (busy || actionLock.current) return false;
    actionLock.current = true;
    setBusyId(id);
    setActionError("");
    try {
      const completed = await onAction(id, action);
      if (!completed) setActionError("Chưa xác nhận được thao tác. Vui lòng kiểm tra lại tình trạng bàn rồi thử lại.");
      return completed;
    }
    catch (error) {setActionError(error instanceof Error ? error.message : "Chưa thực hiện được thao tác. Vui lòng thử lại."); return false;}
    finally { actionLock.current = false; setBusyId(null); }
  }

  return <section className="table-session-management">
    <div className="section-heading table-management-heading">
      <div><p>Thêm, sửa, xóa bàn và quản lý mã QR của quán.</p></div>
      <div className="table-management-actions no-print"><button type="button" className="primary" disabled={busy} onClick={onAddTable}><Plus size={19}/>Thêm bàn</button><button type="button" className="secondary" disabled={!origin} onClick={() => window.print()}><Printer size={17} />In tất cả mã QR</button></div>
    </div>
    <div className="table-session-overview no-print" aria-label="Tình trạng các bàn">
      <span><i className="table-state-dot free" /><strong>{tables.length - pendingCount - activeCount}</strong> bàn trống</span>
      <span><i className="table-state-dot pending" /><strong>{pendingCount}</strong> chờ duyệt</span>
      <span><i className="table-state-dot active" /><strong>{activeCount}</strong> đang phục vụ</span>
      <p><LockKeyhole size={14} />Mỗi bàn chỉ có một trình duyệt được gọi món.</p>
    </div>
    {actionError && !selectedSession && <p className="inline-error no-print" role="alert">{actionError}</p>}
    <div className="aw-managed-tables no-print">{tables.map(table=><article key={table.id} className="aw-managed-table"><div><strong>{table.name}</strong><small>{table.zone} · {liveSessions.get(table.id)?.status==="active"?"Đang phục vụ":liveSessions.get(table.id)?.status==="pending"?"Chờ duyệt":"Bàn trống"}</small></div><div><button type="button" className="aw-icon" aria-label={"Mã QR "+table.name} onClick={()=>setQrTable(table)}><QrCode size={19}/></button><button type="button" className="aw-icon" disabled={busy} aria-label={"Sửa "+table.name} onClick={()=>onEditTable(table)}><Pencil size={18}/></button><button type="button" className="aw-icon" disabled={busy||liveSessions.has(table.id)} aria-label={"Xóa "+table.name} onClick={()=>onDeleteTable(table)}><Trash2 size={18}/></button></div></article>)}</div>
    {qrTable&&<TableQrPreview table={qrTable} origin={origin} onClose={()=>setQrTable(null)}/>}
    <div className="table-grid table-session-grid aw-print-tables">
      {tables.map(table => {
        const session = liveSessions.get(table.id);
        const state = session?.status || "free";
        const summary = session ? getSessionOrders(orders, session) : null;
        const canClose = session?.status === "active" && summary?.outstanding === 0;
        return <article className={"qr-card table-session-card " + state} key={table.id}>
          <div className="qr-card-head"><strong>{table.name}</strong><button type="button" className="icon-btn no-print" disabled={busy} aria-label={"Đổi tên " + table.name} onClick={() => onEditTable(table)}><Pencil size={15} /></button><button type="button" className="icon-btn no-print" disabled={busy||!!session} aria-label={"Xóa "+table.name} onClick={()=>onDeleteTable(table)}><Trash2 size={16}/></button></div>
          <span className="qr-zone">{table.zone}</span>
          <div className={"table-state-badge " + state + " no-print"}><i className={"table-state-dot " + state} />{state === "pending" ? "Chờ duyệt mở bàn" : state === "active" ? "Đang phục vụ" : "Bàn trống"}</div>
          <div className="table-session-customer no-print">
            <span className="table-session-customer-icon">{session ? <UserRound size={18} /> : <Table2 size={18} />}</span>
            <div><strong>{session?.customer_name || "Sẵn sàng đón khách"}</strong><small>{session ? "Yêu cầu lúc " + requestTime(session.created_at) : "Quét QR để yêu cầu mở bàn"}</small></div>
          </div>
          <div className="table-session-controls no-print">
            {session?.status === "pending" && <><p className="table-session-lock"><LockKeyhole size={13} />Đang giữ bàn cho yêu cầu này.</p><div className="table-session-pending-actions"><button type="button" className="primary" disabled={busy} onClick={() => void act(session.id, "approve")} aria-label={"Duyệt mở " + table.name}>{busyId === session.id ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}Duyệt mở bàn</button><button type="button" className="secondary table-session-reject" disabled={busy} onClick={() => void act(session.id, "reject")} aria-label={"Từ chối mở " + table.name}><X size={14} />Từ chối</button></div></>}
            {session?.status === "active" && summary && <><p className="table-session-lock"><LockKeyhole size={13} />Đang giữ bàn cho lượt phục vụ này.</p><button type="button" className="table-session-order-link" onClick={() => onViewOrders(table.id)}><span><ReceiptText size={14} />{summary.count} đơn trong lượt này</span><ArrowUpRight size={15} /></button><div className="table-session-unpaid"><span>Chưa thanh toán</span><strong>{money(summary.unpaid)}</strong></div><button type="button" className="secondary full table-session-close" disabled={busy || !canClose} aria-describedby={"close-note-" + table.id} onClick={() => { setActionError(""); setCloseId(session.id); }}><LogOut size={14} />Đóng bàn</button><p id={"close-note-" + table.id} className={"table-session-lock" + (summary.outstanding ? " needs-action" : "")}>{summary.outstanding ? <><Clock3 size={13} />Còn {summary.outstanding} đơn cần phục vụ hoặc thanh toán.</> : <><ShieldCheck size={13} />Sẵn sàng kết thúc lượt phục vụ.</>}</p></>}
            {!session && <p className="table-session-free-note"><Smartphone size={16} />Khách nhập tên sau khi quét mã. Yêu cầu mở bàn sẽ xuất hiện trên trang quản trị.</p>}
          </div>
          <div className="table-session-qr-block">
            <div className="qr-image" id={"table-session-qr-" + table.id}>{origin && <QRCodeSVG value={origin + tableQrPath(table.token,activeStoreId())} size={170} marginSize={4} level="M" fgColor="#163d2e" title={"QR gọi món " + table.name} />}</div>
            <strong className="qr-store-name">{shopName}</strong>
            <p className="table-session-qr-caption">Quét mã · Nhập tên · Chờ mở bàn</p>
            <div className="qr-actions no-print"><button type="button" className="secondary" disabled={!origin} onClick={() => downloadQr(table)}><Download size={15} />Tải QR</button><a className="icon-btn bordered" href={tableQrPath(table.token,activeStoreId())} target="_blank" rel="noopener" aria-label={"Mở thực đơn " + table.name}><ArrowUpRight size={17} /></a></div>
          </div>
        </article>;
      })}
    </div>
    {selectedSession && <CloseTableDialog session={selectedSession} tableName={selectedTable?.name || selectedSession.table_name || "bàn"} outstanding={getSessionOrders(orders, selectedSession).outstanding} working={busy} error={actionError} onClose={() => { setActionError(""); setCloseId(null); }} onConfirm={async () => { if (getSessionOrders(orders, selectedSession).outstanding > 0) return; if (await act(selectedSession.id, "close")) setCloseId(null); }} />}
  </section>;
}

function TableQrPreview({table,origin,onClose}:{table:DiningTable;origin:string;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),heading=useId();
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();previous?.focus({preventScroll:true});};},[]);
 return <dialog ref={dialog} className="modal" aria-labelledby={heading} onCancel={event=>{event.preventDefault();onClose();}}><div className="modal-header"><h2 id={heading}>Mã QR · {table.name}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng mã QR"><X size={20}/></button></div><div className="aw-qr-preview">{origin&&<QRCodeSVG value={origin+tableQrPath(table.token,activeStoreId())} size={220} marginSize={4} title={"Mã QR "+table.name}/>}<p>Quét mã · Nhập tên · Chờ mở bàn</p><button type="button" className="secondary" onClick={()=>downloadQr(table)}><Download size={18}/>Tải mã QR</button></div></dialog>;
}
