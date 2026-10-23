"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowRightLeft, Banknote, BellRing, Grid2X2, List, QrCode, Check, CheckCheck, ChefHat, ChevronDown, Clock3, Eye, History, LoaderCircle, LogOut, ReceiptText, ShieldCheck, Smartphone, Table2, UserRound, UtensilsCrossed, X } from "lucide-react";
import { money, statuses, normalizeOrderItem, canCancelOrder, type DiningTable, type Order, type OrderStatus, type ServiceRequest } from "@/lib/menu";
import type { TableTransfer } from "@/lib/table-transfer-types";
import type { Permission } from "@/lib/staff-permissions";
import type { AdminTableSession, TableSessionAction } from "./table-session-admin";
import "./open-table-board.css";
import {QRCodeSVG} from "qrcode.react";
import {activeStoreId} from "@/lib/store-links";
import {tableQrPath} from "@/lib/qr-entry";

type BoardFilter = "all" | "support" | "new" | "preparing" | "ready" | "pending" | "bill" | "service";
type OpenTable = {
  session: AdminTableSession;
  table: DiningTable | undefined;
  name: string;
  orders: Order[];
  validOrders: Order[];
  newOrders: Order[];
  calls: ServiceRequest[];
  transfers: TableTransfer[];
  preparing: number;
  ready: number;
  total: number;
  paid: number;
  unpaid: number;
  outstanding: number;
};

export type OpenTableBoardProps = {
  showZones?:boolean;
  initialView?: "matrix" | "manage";
  mode?: "tables" | "orders" | "support";
  permissions: Permission[];
  tables: DiningTable[];
  sessions: AdminTableSession[];
  orders: Order[];
  calls: ServiceRequest[];
  transfers: TableTransfer[];
  working: boolean;
  isBusy?: (id: string) => boolean;
  focusTableId: string | null;
  focusRevision: number;
  onSessionAction: (id: string, action: TableSessionAction) => Promise<boolean>;
  onOrderStatus: (order: Order, next: OrderStatus) => Promise<boolean>;
  onLineStatus?: (orderId: string, orderLineId: string, toStatus: OrderStatus, count?: number,fromStatus?:"new"|"preparing"|"ready") => Promise<boolean>;
  onCollect: (order: Order) => void;
  onCollectTable: (sessionId: string) => void;
  onCancel: (order: Order) => void;
  onViewOrder: (order: Order) => void;
  onResolveCall: (call: ServiceRequest) => Promise<boolean>;
  onTransfer: (session: AdminTableSession) => void;
};

const tableTime = (value: number) => new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh",
}).format(new Date(value));
const orderTime = (value: number) => new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh",
}).format(new Date(value));

function buildOpenTables(tables: DiningTable[], sessions: AdminTableSession[], orders: Order[], calls: ServiceRequest[], transfers: TableTransfer[]): OpenTable[] {
  const live = new Map<string, AdminTableSession>();
  for (const session of [...sessions].sort((a, b) => a.updated_at - b.updated_at)) {
    if (session.status === "active" || session.status === "pending") live.set(session.table_id, session);
  }
  const bySession = new Map<string, Order[]>();
  for (const order of orders) {
    if (!order.dining_session_id) continue;
    const list = bySession.get(order.dining_session_id) || [];
    list.push(order);
    bySession.set(order.dining_session_id, list);
  }
  return [...live.values()].map(session => {
    const table = tables.find(value => value.id === session.table_id);
    const sessionOrders = (bySession.get(session.id) || []).filter(order => order.table_id === session.table_id).sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
    const validOrders = sessionOrders.filter(order => order.status !== "cancelled");
    const paid = validOrders.filter(order => !!order.paid).reduce((sum, order) => sum + order.total, 0);
    const total = validOrders.reduce((sum, order) => sum + order.total, 0);
    return {
      session, table, name: table?.name || session.table_name || "Bàn " + session.table_id,
      orders: sessionOrders, validOrders, newOrders: sessionOrders.filter(order => order.status === "new"),
      calls: calls.filter(call => call.status === "open" && call.table_id === session.table_id && call.session_id === session.id).sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id)),
      transfers: transfers.filter(transfer => transfer.sessionId === session.id).sort((a, b) => b.transferredAt - a.transferredAt || b.id.localeCompare(a.id)),
      preparing: sessionOrders.filter(order => order.status === "preparing").length,
      ready: sessionOrders.filter(order => order.status === "ready").length,
      total, paid, unpaid: total - paid,
      outstanding: validOrders.filter(order => !order.paid || order.status !== "served").length,
    };
  }).sort((a, b) => {
    const priority = (row: OpenTable) => row.calls.length || row.newOrders.length ? 0 : row.session.status === "pending" ? 1 : row.ready ? 2 : 3;
    return priority(a) - priority(b) || a.name.localeCompare(b.name, "vi", { numeric: true });
  });
}

function CloseVisitDialog({ row, busy, error, onDismiss, onConfirm }: {
  row: OpenTable;
  busy: boolean;
  error: string;
  onDismiss: () => void;
  onConfirm: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    cancel.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={ref} className="modal otb-close-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); if (!busy) onDismiss(); }}
    onClick={event => {
      if (event.target !== event.currentTarget || busy) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onDismiss();
    }}>
    <div className="modal-header"><h2 id={titleId}>Đóng {row.name} & quyết toán</h2><button type="button" className="icon-btn" disabled={busy} onClick={onDismiss} aria-label="Đóng hộp xác nhận"><X size={20} /></button></div>
    <div className="otb-close-body">
      <span className="otb-close-icon"><ShieldCheck size={28} /></span>
      <p className="otb-close-customer"><span>Kết thúc lượt phục vụ</span><strong>{row.session.customer_name}</strong></p>
      <div className="otb-close-summary"><span>{row.validOrders.length} đơn hợp lệ<strong>{money(row.total)}</strong></span><span>Đã thanh toán<strong>{money(row.paid)}</strong></span>{row.orders.length > row.validOrders.length && <small>{row.orders.length - row.validOrders.length} đơn hủy được giữ trong lịch sử.</small>}</div>
      <p id={descriptionId}>Lượt phục vụ này sẽ được lưu vào <strong>Doanh thu → Quyết toán bàn</strong>. Bàn trở về trạng thái trống để đón khách mới.</p>
      <p className="otb-close-device"><Smartphone size={15} />Máy đang kết nối sẽ kết thúc quyền gọi món của lượt này.</p>
      {error && <p className="otb-action-error" role="alert">{error}</p>}
      {row.outstanding > 0 && <p className="otb-action-error" role="status">Còn {row.outstanding} đơn chưa phục vụ xong hoặc chưa thanh toán. Hãy xử lý trước khi đóng bàn.</p>}
      <div className="otb-close-actions"><button type="button" ref={cancel} className="secondary" disabled={busy} onClick={onDismiss}>Quay lại</button><button type="button" className="primary" disabled={busy || row.outstanding > 0} onClick={() => void onConfirm()}>{busy ? <LoaderCircle size={17} className="spin" /> : <LogOut size={17} />}Đóng bàn & lưu</button></div>
    </div>
  </dialog>;
}

function TransferHistory({ transfers }: { transfers: TableTransfer[] }) {
  const latest = transfers[0];
  if (!latest) return null;
  const heading = <><ArrowRightLeft size={20} /><span><strong>{latest.fromTableName} → {latest.toTableName}</strong><time dateTime={new Date(latest.transferredAt).toISOString()}>{tableTime(latest.transferredAt)} · {transfers.length === 1 ? "Đã đổi bàn" : transfers.length + " lần đổi bàn"}</time></span></>;
  if (transfers.length === 1) return <div className="otb-transfers"><div className="otb-transfer-summary">{heading}</div></div>;
  return <details className="otb-transfers"><summary>{heading}<ChevronDown size={20} /></summary><ol>{transfers.map(transfer => <li key={transfer.id}><span>{transfer.fromTableName} → {transfer.toTableName}</span><time dateTime={new Date(transfer.transferredAt).toISOString()}>{tableTime(transfer.transferredAt)}</time></li>)}</ol></details>;
}

export type GroupedItem = {
  key: string;
  itemId: string;
  name: string;
  unitPrice: number;
  totalQuantity: number;
  totalPrice: number;
  extras: string[];
  taste: string;
  note: string;
  newCount: number;
  preparingCount: number;
  readyCount: number;
  servedCount: number;
  rounds: {
    orderId: string;
    orderLineId: string;
    roundNumber: number;
    orderCode: string;
    createdAt: number;
    quantity: number;
    newCount: number;
    preparingCount: number;
    readyCount: number;
    servedCount: number;
  }[];
};

export function groupOrderItems(orders: Order[]): GroupedItem[] {
  const validOrders = orders
    .sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));

  const groups = new Map<string, GroupedItem>();

  validOrders.forEach((order, orderIdx) => {
    if (order.status === "cancelled") return;
    const roundNumber = orderIdx + 1;
    order.items.forEach((item, itemIdx) => {
      const norm = normalizeOrderItem(item, order.status, itemIdx);
      const sortedExtras = [...norm.extras].sort();
      const groupKey = JSON.stringify([norm.itemId,norm.name,norm.unitPrice,sortedExtras,norm.taste,norm.note]);

      let group = groups.get(groupKey);
      if (!group) {
        group = {
          key: groupKey,
          itemId: norm.itemId,
          name: norm.name,
          unitPrice: norm.unitPrice,
          totalQuantity: 0,
          totalPrice: 0,
          extras: norm.extras,
          taste: norm.taste,
          note: norm.note,
          newCount: 0,
          preparingCount: 0,
          readyCount: 0,
          servedCount: 0,
          rounds: [],
        };
        groups.set(groupKey, group);
      }

      group.totalQuantity += norm.quantity;
      group.totalPrice += norm.total;
      group.newCount += norm.newCount;
      group.preparingCount += norm.preparingCount;
      group.readyCount += norm.readyCount;
      group.servedCount += norm.servedCount;
      group.rounds.push({
        orderId: order.id,
        orderLineId: norm.orderLineId,
        roundNumber,
        orderCode: order.code,
        createdAt: order.created_at,
        quantity: norm.quantity,
        newCount: norm.newCount,
        preparingCount: norm.preparingCount,
        readyCount: norm.readyCount,
        servedCount: norm.servedCount,
      });
    });
  });

  return Array.from(groups.values());
}

export function TableDetailSheet({row,busy,showZones=true,permissions,isItemBusy,onOrderStatus,onLineStatus,onCollectTable,onTransfer,onCancel,onResolveCall,onRequestClose}:{
  row:OpenTable;busy:boolean;showZones?:boolean;permissions:Permission[];isItemBusy:(key:string)=>boolean;
  onOrderStatus:(order:Order,next:OrderStatus)=>Promise<boolean>;
  onLineStatus?:(orderId:string,orderLineId:string,toStatus:OrderStatus,count?:number,fromStatus?:"new"|"preparing"|"ready")=>Promise<boolean>;
  onCollectTable:(sessionId:string)=>void;onTransfer:(session:AdminTableSession)=>void;
  onCancel:(order:Order)=>void;onResolveCall:(call:ServiceRequest)=>Promise<boolean>;onRequestClose:(sessionId:string)=>void;
}) {
  const [tab,setTab]=useState<"items"|"rounds">("items");
  const [actionError,setActionError]=useState("");
  const actionLock=useRef(false);
  const [updating,setUpdating]=useState(false);
  const canManage=permissions.includes("orders.manage"),canCollect=permissions.includes("payments.collect");
  const canTransfer=permissions.includes("tables.transfer"),canClose=permissions.includes("tables.manage");
  const canCancel=permissions.includes("orders.cancel");
  const items=useMemo(()=>groupOrderItems(row.orders),[row.orders]);
  const rounds=useMemo(()=>[...row.orders].sort((a,b)=>a.created_at-b.created_at||a.id.localeCompare(b.id)),[row.orders]);
  const portions=items.reduce((sum,item)=>sum+item.totalQuantity,0);
  const pending=items.reduce((sum,item)=>sum+item.newCount+item.preparingCount+item.readyCount,0);
  const locked=busy||updating;
  const tabId=useId();

  async function advance(group:GroupedItem,to:OrderStatus){
    if(!canManage||actionLock.current||busy)return;
    actionLock.current=true;setUpdating(true);setActionError("");
    try {
      for(const round of group.rounds){
        // Only advance the requested stage; a served/preparing sibling must not
        // accidentally pull a newly received portion forward.
        const count=to==="preparing"?round.newCount:to==="ready"?round.preparingCount:round.readyCount;
        if(!count)continue;
        const order=row.orders.find(order=>order.id===round.orderId);
        const ok=onLineStatus?await onLineStatus(round.orderId,round.orderLineId,to,count,to==="preparing"?"new":to==="ready"?"preparing":"ready"):order&&statuses[order.status]?.next===to?await onOrderStatus(order,to):false;
        if(!ok){setActionError("Chưa cập nhật được món. Đã giữ nguyên các món còn lại; hãy kiểm tra rồi thử lại.");break;}
      }
    } catch {setActionError("Kết nối bị gián đoạn. Kiểm tra trạng thái món trước khi thử lại.");}
    finally{actionLock.current=false;setUpdating(false);}
  }

  const stages=(item:{newCount:number;preparingCount:number;readyCount:number;servedCount:number})=><span className="otb-bill-stages">
    {item.newCount>0&&<span className="stage-badge new">{item.newCount} chờ nhận</span>}
    {item.preparingCount>0&&<span className="stage-badge preparing">{item.preparingCount} đang làm</span>}
    {item.readyCount>0&&<span className="stage-badge ready">{item.readyCount} sẵn sàng</span>}
    {item.servedCount>0&&<span className="stage-badge served">{item.servedCount} đã phục vụ</span>}
  </span>;

  return <div className="otb-detail-sheet otb-bill">
    <div className="otb-detail-scroll">
      <div className="otb-bill-meta">
        <span><UserRound size={14}/>{row.session.customer_name||"Khách tại bàn"}{showZones&&row.table?.zone?" · "+row.table.zone:""}</span>
        <span><Clock3 size={13}/>{orderTime(row.session.created_at)} · {portions} suất · {row.orders.length} lượt gọi</span>
      </div>
      {row.calls.length>0&&<details className="otb-bill-support"><summary><BellRing size={15}/>{row.calls.length} yêu cầu chưa xử lý<ChevronDown size={14}/></summary>{row.calls.map(call=><div key={call.id}><span>{call.kind==="bill"?"Tính tiền":"Gọi nhân viên"} · {orderTime(call.created_at)}{call.note&&<small>{call.note}</small>}</span>{canClose&&<button type="button" disabled={locked||isItemBusy("call:"+call.id)} onClick={()=>void onResolveCall(call)}>Đã hỗ trợ</button>}</div>)}</details>}
      <div className="otb-detail-tabs" role="tablist" aria-label="Cách xem hóa đơn">
        {([{id:"items",label:"Theo món",count:items.length},{id:"rounds",label:"Theo lượt gọi",count:rounds.length}] as const).map(value=><button type="button" role="tab" id={tabId+value.id} key={value.id} aria-selected={tab===value.id} aria-controls={tabId+"-body"} className={tab===value.id?"selected":""} onClick={()=>setTab(value.id)}>{value.label}<span className="tab-pill">{value.count}</span></button>)}
      </div>
      {actionError&&<p role="alert" className="otb-action-error">{actionError}</p>}
      <div className="otb-bill-columns" aria-hidden="true"><span>SL</span><span>Món / ghi chú</span><span>Thành tiền</span></div>
      <div className="otb-detail-body" role="tabpanel" id={tabId+"-body"} aria-labelledby={tabId+tab}>
        {tab==="items"?items.map(item=><article className="otb-bill-line" key={item.key}>
          <div className="otb-bill-line-heading"><b className="otb-bill-qty">{item.totalQuantity}×</b><div><strong>{item.name}</strong><small>Đơn giá {money(item.unitPrice)}</small></div><strong className="otb-bill-price">{money(item.totalPrice)}</strong></div>
          {[...item.extras,item.taste,item.note].some(Boolean)&&<p className="otb-bill-note">{[...item.extras,item.taste,item.note].filter(Boolean).join(" · ")}</p>}
          <p className="otb-bill-rounds">{item.rounds.map(round=>"Lượt "+round.roundNumber+" · "+orderTime(round.createdAt)+" ("+round.quantity+"×)").join("; ")}</p>
          {item.rounds.map(round=>{const note=row.orders.find(order=>order.id===round.orderId)?.note;return note?<p className="otb-bill-note" key={round.orderId+round.orderLineId}>Ghi chú lượt {round.roundNumber}: {note}</p>:null;})}
          {stages(item)}

        </article>):rounds.map((order,index)=><section key={order.id} className={"otb-bill-round "+(order.status==="cancelled"?"is-cancelled":"")}>
          <header><strong>Lượt {index+1} · {orderTime(order.created_at)}</strong><span>{statuses[order.status].short}</span></header>
          <small className="otb-bill-round-code">#{order.code} · {order.status==="cancelled"?"Không tính vào bill":order.paid?"Đã thanh toán":"Chưa thanh toán"}</small>
          {order.note&&<p className="otb-bill-note">Ghi chú lượt gọi: {order.note}</p>}
          {order.items.map((item,index)=>{const line=normalizeOrderItem(item,order.status,index);return <article className="otb-bill-line" key={line.orderLineId}>
            <div className="otb-bill-line-heading"><b className="otb-bill-qty">{line.quantity}×</b><div><strong>{line.name}</strong><small>Đơn giá {money(line.unitPrice)}</small></div><strong className="otb-bill-price">{money(line.total)}</strong></div>
            {[...line.extras,line.taste,line.note].some(Boolean)&&<p className="otb-bill-note">{[...line.extras,line.taste,line.note].filter(Boolean).join(" · ")}</p>}
            {order.status!=="cancelled"&&stages(line)}
          </article>;})}
          {order.cancel_reason&&order.status==="cancelled"&&<p className="otb-bill-note">Lý do hủy: {order.cancel_reason}</p>}
          <p className="otb-bill-round-total"><span>{order.status==="cancelled"?"Đã hủy":"Tổng lượt"}</span><strong>{money(order.total)}</strong></p>
          {(canManage&&statuses[order.status].next||canCancel&&canCancelOrder(order))&&<details className="otb-bill-line-actions"><summary>Thao tác lượt {index+1}<ChevronDown size={13}/></summary><div>
            {canManage&&statuses[order.status].next&&<button type="button" disabled={locked||isItemBusy(order.id)} onClick={()=>void onOrderStatus(order,statuses[order.status].next!)}>{statuses[order.status].action}</button>}
            {canCancel&&canCancelOrder(order)&&<button type="button" disabled={locked||isItemBusy(order.id)} onClick={()=>onCancel(order)}>Hủy lượt gọi</button>}
          </div></details>}
        </section>)}
        {!items.length&&tab==="items"&&<p className="otb-empty-history">Chưa có món tính tiền trong phiên này.{row.orders.length>0?" Xem lượt gọi để kiểm tra các đơn đã hủy.":""}</p>}
      </div>
      {canManage&&items.some(item=>item.servedCount<item.totalQuantity)&&<details className="otb-bill-secondary"><summary>Cập nhật món<ChevronDown size={15}/></summary><div className="otb-bill-progress-actions">{items.filter(item=>item.servedCount<item.totalQuantity).map(item=><section key={item.key}><strong>{item.name}</strong><div>
        {item.newCount>0&&<button type="button" disabled={locked} onClick={()=>void advance(item,"preparing")}>Nhận {item.newCount} suất</button>}
        {item.preparingCount>0&&<button type="button" disabled={locked} onClick={()=>void advance(item,"ready")}>Sẵn sàng {item.preparingCount} suất</button>}
        {item.readyCount>0&&<button type="button" disabled={locked} onClick={()=>void advance(item,"served")}>Phục vụ {item.readyCount} suất</button>}
      </div></section>)}</div></details>}
      {row.orders.some(order=>order.status==="cancelled")&&tab==="items"&&<p className="otb-bill-rounds">{row.orders.filter(order=>order.status==="cancelled").length} lượt đã hủy, không tính vào bill. Xem trong “Theo lượt gọi”.</p>}
      {row.transfers.length>0&&<TransferHistory transfers={row.transfers}/>}
      {(canTransfer||canClose)&&<details className="otb-bill-secondary"><summary>Thao tác bàn<ChevronDown size={15}/></summary><div>
        {canTransfer&&<button type="button" disabled={locked||isItemBusy("transfer:"+row.session.id)} onClick={()=>onTransfer(row.session)}><ArrowRightLeft size={16}/>Đổi bàn</button>}
        {canClose&&<button type="button" disabled={locked||isItemBusy("close:"+row.session.id)||row.outstanding>0} onClick={()=>onRequestClose(row.session.id)}><LogOut size={16}/>Đóng bàn</button>}
      </div>{row.outstanding>0&&<p>Chỉ đóng bàn khi phục vụ xong và đã thu đủ tiền.</p>}</details>}
    </div>
    <footer className="otb-detail-footer otb-bill-footer">
      <p className="otb-bill-total-meta"><span>Tổng bill <strong>{money(row.total)}</strong></span><span>Đã thu <strong>{money(row.paid)}</strong></span></p>
      <div className="otb-bill-due"><span>{row.unpaid>0?"Cần thu":row.validOrders.length?"Đã thu đủ":"Chưa phát sinh"}</span><strong>{money(row.unpaid)}</strong></div>
      {canCollect&&row.unpaid>0&&<button type="button" className="primary otb-bill-pay" disabled={locked||isItemBusy("pay:"+row.session.id)} onClick={()=>onCollectTable(row.session.id)}><Banknote size={18}/>Thanh toán cả bàn<strong>{money(row.unpaid)}</strong></button>}
      {pending>0&&<p className="otb-bill-pending">{pending} suất chưa phục vụ xong</p>}
    </footer>
  </div>;
}

function TableVisitPopup({title,busy,onDismiss,children,receipt=false}:{title:string;busy:boolean;onDismiss:()=>void;children:ReactNode;receipt?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null), heading=useId();
  useEffect(()=>{
    const dialog=ref.current, previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    dialog?.showModal();
    return ()=>{dialog?.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return <dialog ref={ref} className={"modal otb-visit-popup"+(receipt?" otb-receipt-popup":"")} aria-labelledby={heading}
    onCancel={event=>{event.preventDefault();if(!busy)onDismiss();}}
    onClick={event=>{if(event.target!==event.currentTarget||busy)return;const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)onDismiss();}}>
    <div className="modal-header"><h2 id={heading}>{title}</h2><button type="button" className="icon-btn" aria-label="Đóng xử lý bàn" disabled={busy} onClick={onDismiss}><X size={22}/></button></div>
    <div className="otb-visit-content" tabIndex={0} role="region" aria-label="Danh sách đơn tại bàn">{children}</div>
  </dialog>;
}

export function OpenTableBoard({ showZones=true, initialView = "matrix", mode = "tables", permissions, tables, sessions, orders, calls, transfers, working, isBusy, focusTableId, focusRevision, onSessionAction, onOrderStatus, onLineStatus, onCollectTable, onCancel, onViewOrder, onResolveCall, onTransfer }: OpenTableBoardProps) {
  const [matrixLayout,setMatrixLayout]=useState<"grid"|"list">("grid");
  const [qrTable,setQrTable]=useState<DiningTable|null>(null);
  const [boardView,setBoardView]=useState<"matrix"|"manage">(initialView);
  const [popupSessionId, setPopupSessionId] = useState<string | null>(() => {
    if (focusTableId) {
      const target = sessions.find(s => s.table_id === focusTableId && (s.status === "active" || s.status === "pending"));
      return target?.id || null;
    }
    return null;
  });
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [zone, setZone] = useState("all");
  const [matrixFilter, setMatrixFilter] = useState<"all" | "active" | "free" | "pending" | "bill" | "support">("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closeId, setCloseId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const handledFocus = useRef("");
  const id = useId();
  const canManageTables = permissions.includes("tables.manage");
  const canManageOrders = permissions.includes("orders.manage");
  const canCancelOrders = permissions.includes("orders.cancel");
  const canTransfer = permissions.includes("tables.transfer");
  const canCollect = permissions.includes("payments.collect");
  const rows = useMemo(() => buildOpenTables(tables, sessions, orders, calls, transfers), [tables, sessions, orders, calls, transfers]);
  const isItemBusy = (key: string) => (isBusy ? isBusy(key) : working) || busyId === key;
  const busy = isBusy ? isBusy("board") || busyId !== null : (working || busyId !== null);
  const zones = [...new Set(tables.map(table => table.zone).filter(Boolean))];
  const queueRows=rows.filter(row=>mode==="orders"?row.session.status==="active"&&row.orders.length>0:mode==="support"?row.session.status==="active"&&row.calls.length>0:true);
  const counts = {
    all: queueRows.length,
    new: queueRows.filter(row => row.newOrders.length > 0).length,
    support: queueRows.filter(row => row.session.status === "active" && row.calls.length > 0).length,
    preparing: queueRows.filter(row => row.preparing > 0).length,
    ready: queueRows.filter(row => row.ready > 0).length,
    pending: queueRows.filter(row => row.session.status === "pending").length,
    bill: queueRows.filter(row=>row.calls.some(call=>call.kind==="bill")).length,
    service: queueRows.filter(row=>row.calls.some(call=>call.kind!=="bill")).length,
  };

  const effectiveZone=showZones?zone:"all";
  const visible = queueRows.filter(row => (effectiveZone === "all" || row.table?.zone === effectiveZone) && (
    filter === "all" || filter === "bill" && row.calls.some(call=>call.kind==="bill") || filter === "service" && row.calls.some(call=>call.kind!=="bill") || filter === "support" && row.session.status === "active" && row.calls.length > 0 || filter === "new" && row.newOrders.length > 0 || filter === "preparing" && row.preparing > 0 || filter === "ready" && row.ready > 0 || filter === "pending" && row.session.status === "pending"
  ));
  const byTable = new Map(rows.map(row => [row.session.table_id, row]));
  const zoneTables = tables.filter(table => effectiveZone === "all" || table.zone === effectiveZone);
  const matrixCounts = {
    all: zoneTables.length,
    active: zoneTables.filter(table => byTable.get(table.id)?.session.status === "active").length,
    pending: zoneTables.filter(table => byTable.get(table.id)?.session.status === "pending").length,
    free: zoneTables.filter(table => !byTable.has(table.id)).length,
    bill: zoneTables.filter(table=>byTable.get(table.id)?.calls.some(call=>call.kind==="bill")).length,
    support: zoneTables.filter(table=>byTable.get(table.id)?.calls.some(call=>call.kind!=="bill")).length,
  };
  const matrixTables = zoneTables.filter(table => matrixFilter === "all" || (matrixFilter==="bill"?byTable.get(table.id)?.calls.some(call=>call.kind==="bill"):matrixFilter==="support"?byTable.get(table.id)?.calls.some(call=>call.kind!=="bill"):(byTable.get(table.id)?.session.status ?? "free") === matrixFilter))
    .sort((a, b) => a.name.localeCompare(b.name, "vi", { numeric: true }));


  const popupRow=rows.find(row=>row.session.id===popupSessionId);
  function selectMatrixTable(row: OpenTable) {setActionError("");setPopupSessionId(row.session.id);}
  useEffect(()=>{
    if(mode!=="tables")return;
    const sync=()=>setBoardView(new URL(window.location.href).searchParams.get("board")==="manage"?"manage":"matrix");
    sync();window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync);
  },[mode]);
  const closing = canManageTables ? rows.find(row => row.session.id === closeId && row.session.status === "active") : undefined;

  useEffect(() => {
    if (!canManageTables) { setCloseId(null); setActionError(""); }
  }, [canManageTables]);

  useEffect(() => {
    if (!focusTableId) return;
    const request = focusTableId + ":" + focusRevision;
    if (handledFocus.current === request) return;
    const target = rows.find(row => row.session.table_id === focusTableId);
    if (!target) return;
    handledFocus.current = request;
    setActionError("");
    setPopupSessionId(target.session.id);
  }, [focusTableId, focusRevision, rows]);

  async function act(key: string, permission: Permission, action: () => Promise<boolean>) {
    if (!permissions.includes(permission)) return false;
    if (isItemBusy(key) || busyId === key) return false;
    setBusyId(key);
    setActionError("");
    try {
      const completed = await action();
      if (!completed) setActionError("Chưa xác nhận được thao tác. Vui lòng kiểm tra lại tình trạng bàn rồi thử lại.");
      return completed;
    }
    catch (error) { setActionError(error instanceof Error ? error.message : "Chưa thực hiện được thao tác. Vui lòng thử lại."); return false; }
    finally { setBusyId(null); }
  }

  function toggle(sessionId: string) {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId); else next.add(sessionId);
      return next;
    });
  }

  function renderTable(row:OpenTable,inPopup=false) {
        const { session } = row;
        const isExpanded = inPopup || expanded.has(session.id);
        const contextId=id+(inPopup?"-popup":"-page");
        const isPending = session.status === "pending";
        const hasNew = row.newOrders.length > 0;
        const needsSupport = !isPending && row.calls.length > 0;
        const canClose = !isPending && row.outstanding === 0;
        const latest = row.newOrders[0] || row.validOrders[0];
        const preview = latest?.items.slice(0, 2).map(item => item.quantity + "× " + item.name).join(" · ");
        const historyId = contextId + "-orders-" + session.id;
        return <article key={session.id} tabIndex={-1} aria-label={row.name + ", " + session.customer_name + (hasNew ? ", " + row.newOrders.length + " đơn chờ nhận" : "") + (needsSupport ? ", bàn cần hỗ trợ" : "")} className={"otb-card" + (hasNew ? " has-new" : "") + (needsSupport ? " has-support" : "") + (isPending ? " is-pending" : "") + (isExpanded ? " expanded" : "")}>
          <div className="otb-card-heading"><div><h3>{row.name}</h3>{showZones&&row.table?.zone && <span>{row.table.zone}</span>}</div>{hasNew ? <span className="otb-new-badge"><BellRing size={15} /><strong>{row.newOrders.length}</strong> đơn mới</span> : isPending ? <span className="otb-state-badge pending"><Clock3 size={13} />Chờ mở bàn</span> : row.ready ? <span className="otb-state-badge ready"><UtensilsCrossed size={13} />{row.ready} chờ phục vụ</span> : row.preparing ? <span className="otb-state-badge preparing"><ChefHat size={13} />{row.preparing} đang làm</span> : canClose && row.orders.length ? <span className="otb-state-badge settled"><CheckCheck size={13} />Đã xử lý xong</span> : <span className="otb-state-badge"><Table2 size={13} />Đang mở</span>}</div>
          <div className="otb-customer"><UserRound size={15} /><strong>{session.customer_name}</strong><time dateTime={new Date(session.created_at).toISOString()}><Clock3 size={12} />{tableTime(session.created_at)}</time></div>
          {isPending ? <div className="otb-pending-content"><p>{canManageTables ? "Khách đã quét QR và nhập tên. Đối chiếu khách tại bàn để mở quyền gọi món." : "Yêu cầu đang chờ người có quyền quản lý bàn duyệt."}</p>{canManageTables && <div><button type="button" className="primary" disabled={isItemBusy(session.id)} onClick={() => void act(session.id, "tables.manage", () => onSessionAction(session.id, "approve"))}>{busyId === session.id ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Duyệt mở bàn</button><button type="button" className="secondary" disabled={isItemBusy(session.id)} onClick={() => void act(session.id, "tables.manage", () => onSessionAction(session.id, "reject"))}><X size={16} />Từ chối</button></div>}</div> : <>
            {needsSupport && <section className="otb-support" aria-label={"Yêu cầu hỗ trợ của " + row.name}><div className="otb-support-title"><BellRing size={25} /><strong>Bàn cần hỗ trợ</strong><span>{row.calls.length}</span></div>{row.calls.map(call => <div className="otb-support-call" key={call.id}><div><strong>{call.kind === "bill" ? <ReceiptText size={21} /> : <BellRing size={21} />}{call.kind === "bill" ? "Yêu cầu thanh toán" : "Gọi nhân viên"}</strong><time dateTime={new Date(call.created_at).toISOString()}>{tableTime(call.created_at)}</time>{call.note&&<p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{call.note}</p>}</div>{canManageTables && <button type="button" disabled={isItemBusy("call:" + call.id)} onClick={() => void act("call:" + call.id, "tables.manage", () => onResolveCall(call))}>{busyId === "call:" + call.id ? <LoaderCircle size={21} className="spin" /> : <Check size={21} />}Đã hỗ trợ</button>}</div>)}</section>}
            <div className="otb-card-totals"><span>Tổng lượt này<strong>{money(row.total)}</strong><small>{row.validOrders.length} đơn hợp lệ{row.orders.length > row.validOrders.length ? " · " + (row.orders.length - row.validOrders.length) + " đã hủy" : ""}</small></span><span className={row.unpaid ? "unpaid" : "paid"}>{row.unpaid ? "Chưa thanh toán" : "Đã thanh toán"}<strong>{money(row.unpaid || row.paid)}</strong><small>{row.unpaid > 0 ? "Đã thu " + money(row.paid) : row.orders.length ? "Không còn tiền chưa thu" : "Chưa phát sinh đơn"}</small></span></div>
            {latest ? <div className={"otb-latest" + (hasNew ? " new" : "")}><span>{hasNew ? <BellRing size={13} /> : <ReceiptText size={13} />}{hasNew ? "Đơn đang chờ nhận" : "Gọi gần nhất"}<time dateTime={new Date(latest.created_at).toISOString()}>{orderTime(latest.created_at)}</time></span><p>{preview}{latest.items.length > 2 ? " · +" + (latest.items.length - 2) + " món" : ""}</p></div> : <div className="otb-no-orders"><UtensilsCrossed size={17} /><p>{row.orders.length ? "Các đơn của lượt này đã hủy." : "Bàn đã mở, đang chờ khách chọn món."}</p></div>}
            {canCollect && row.unpaid > 0 && <button type="button" className="otb-table-pay" disabled={isItemBusy("pay:" + session.id)} aria-label={"Thanh toán số tiền còn lại của " + row.name} onClick={() => onCollectTable(session.id)}><Banknote size={24} />Thanh toán cả bàn</button>}
            <div className="otb-card-controls"><button type="button" className={"otb-history-toggle" + (hasNew ? " attention" : "")} aria-expanded={isExpanded} aria-controls={historyId} onClick={() => toggle(session.id)}><span>{hasNew ? <BellRing size={15} /> : <History size={15} />}{hasNew && canManageOrders ? "Xử lý đơn & lịch sử" : "Lịch sử gọi món"}<b>{row.orders.length}</b></span><ChevronDown size={17} className={isExpanded ? "turned" : ""} /></button>{canTransfer && <button type="button" className="otb-transfer-button" disabled={isItemBusy("transfer:" + session.id)} onClick={() => onTransfer(session)}><ArrowRightLeft size={22} />Đổi bàn</button>}{canManageTables && <button type="button" className="otb-close-button" disabled={isItemBusy("close:" + session.id) || !canClose} aria-describedby={contextId + "-close-note-" + session.id} onClick={() => { setActionError(""); setCloseId(session.id); }}><LogOut size={15} />Đóng bàn</button>}</div>
            <p id={contextId + "-close-note-" + session.id} className={"otb-close-note" + (canClose ? " ready" : "")}>{canClose ? <><ShieldCheck size={12} />Sẵn sàng đóng bàn và lưu quyết toán.</> : <><Clock3 size={12} />Còn {row.outstanding} đơn cần phục vụ hoặc thanh toán.</>}</p>
            <TransferHistory transfers={row.transfers} />
            <div id={historyId} className="otb-history" hidden={!isExpanded}>
              <div className="otb-history-heading"><strong>Lịch sử lượt phục vụ</strong><span>{inPopup?"Ưu tiên đơn mới":"Mới nhất trước"}</span></div>
              {row.orders.length ? <div className="otb-order-list">{(inPopup ? [...row.orders].sort((a,b)=>Number(b.status==="new")-Number(a.status==="new")||b.created_at-a.created_at) : row.orders).map(order => <section key={order.id} className={"otb-order " + order.status} aria-label={"Đơn " + order.code}>
                <div className="otb-order-heading"><div><strong>#{order.code}</strong><time dateTime={new Date(order.created_at).toISOString()}>{tableTime(order.created_at)}</time></div><span className={"status-badge " + order.status}>{statuses[order.status].short}</span></div>
                <div className="otb-order-items">{order.items.map((item, index) => <div key={index}><b>{item.quantity}×</b><span><strong>{item.name}</strong>{[...item.extras, item.taste, item.note].some(Boolean) && <small>{[...item.extras, item.taste, item.note].filter(Boolean).join(" · ")}</small>}</span><strong>{money(item.total)}</strong></div>)}</div>
                {order.note && <p className="otb-order-note">Ghi chú: {order.note}</p>}
                {order.status === "cancelled" && order.cancel_reason && <p className="otb-order-note cancelled">Lý do hủy: {order.cancel_reason}</p>}
                <div className="otb-order-total"><span className={order.paid ? "paid" : ""}>{order.status === "cancelled" ? "Không tính vào tổng" : order.paid ? "Đã thanh toán" : "Chưa thanh toán"}</span><strong>{money(order.total)}</strong></div>
                <div className="otb-order-actions">{canManageOrders && statuses[order.status].next && <button type="button" className="primary" disabled={isItemBusy(order.id)} onClick={() => void act(order.id, "orders.manage", () => onOrderStatus(order, statuses[order.status].next!))}>{busyId === order.id ? <LoaderCircle size={14} className="spin" /> : order.status === "new" ? <Check size={14} /> : <ArrowRight size={14} />}{statuses[order.status].action}</button>}{canCancelOrders && !order.paid && (order.status === "new" || order.status === "preparing") && <button type="button" className="otb-cancel-order" disabled={isItemBusy(order.id)} onClick={() => onCancel(order)}>Hủy đơn</button>}<button type="button" className="otb-view-order" aria-label={"Xem chi tiết đơn " + order.code} onClick={() => onViewOrder(order)}><Eye size={16} /></button></div>
              </section>)}</div> : <p className="otb-empty-history">Chưa có đơn trong lượt phục vụ này.</p>}
            </div>
          </>}
        </article>;
  }

  const zonePicker = showZones&&zones.length>1&&<label className="otb-zone"><span>Khu vực</span><select value={zone} onChange={event=>setZone(event.target.value)}><option value="all">Tất cả khu vực</option>{zones.map(value=><option key={value} value={value}>{value}</option>)}</select></label>;

  return <section className="open-table-board" aria-labelledby={id + "-title"}>
    <header className={"otb-heading aw-board-heading"+(mode==="tables"?" aw-table-heading":"")}><h2 id={id + "-title"}>{mode==="orders"?"Đơn món":mode==="support"?"Hỗ trợ":"Sơ đồ bàn"}</h2>{mode==="tables"&&zonePicker}{mode==="tables"&&<div className="aw-view-toggle" role="group" aria-label="Cách hiển thị bàn"><button type="button" aria-label="Dạng lưới" aria-pressed={matrixLayout==="grid"} onClick={()=>{setMatrixLayout("grid");setBoardView("matrix");}}><Grid2X2 size={18}/></button><button type="button" aria-label="Dạng danh sách" aria-pressed={matrixLayout==="list"} onClick={()=>{setMatrixLayout("list");setBoardView("matrix");}}><List size={18}/></button></div>}</header>
    {mode!=="tables"&&zonePicker}
    {boardView==="matrix" && <section className="table-matrix" aria-labelledby={id + "-matrix-title"}>
      <div className="table-matrix-filters" role="group" aria-label="Lọc sơ đồ bàn">
        {([{ id: "all", label: "Tất cả" }, { id: "pending", label: "Chờ duyệt" }, { id: "bill", label: "Yêu cầu thanh toán" }, { id: "active", label: "Đang phục vụ" }, { id: "support", label: "Cần hỗ trợ" }, { id: "free", label: "Trống" }] as const).map(option => <button type="button" key={option.id} className={"table-matrix-filter " + option.id + (matrixFilter === option.id ? " selected" : "")} aria-label={option.label+": "+matrixCounts[option.id]+" bàn"} aria-pressed={matrixFilter === option.id} onClick={() => setMatrixFilter(option.id)}><strong>{matrixCounts[option.id]}</strong><span className="aw-filter-label">{option.label}</span></button>)}
      </div>
      <div className="aw-board-meta"><span>{matrixTables.length} bàn{showZones?" · "+(zone==="all"?"Tất cả khu vực":zone):""}</span></div>
      <div className={"aw-table-grid "+(matrixLayout==="list"?"is-list":"")}>
      {matrixTables.map(table=>{const row=byTable.get(table.id),state=row?.session.status??"free";
        const bill=row?.calls.some(call=>call.kind==="bill"),support=row?.calls.some(call=>call.kind!=="bill"),hasNew=!!row?.newOrders.length;
        return <article className={"aw-table-tile "+state+(bill||support||hasNew?" needs-action":"")} key={table.id}>
          <h3>{table.name}</h3><span className="aw-table-state">{state==="pending"?"Chờ duyệt":state==="active"?"Đang phục vụ":"Bàn trống"}</span>
          <div className="aw-table-alert">{state==="pending"?"Chờ mở bàn":bill?"Yêu cầu thanh toán":hasNew?row!.newOrders.length+" đơn mới"+(support?" · Cần hỗ trợ":""):support?"Cần hỗ trợ":row?.ready?row.ready+" chờ phục vụ":row?.preparing?row.preparing+" đang làm":row?"Chưa thu "+money(row.unpaid):"Sẵn sàng đón khách"}</div>
          <div className="aw-table-actions">{row&&<button type="button" className="primary" onClick={()=>selectMatrixTable(row)} aria-label={"Xử lý "+table.name}>{state==="pending"?"Duyệt":bill?"Thanh toán":support&&!hasNew?"Hỗ trợ":"Xử lý"}</button>}{canManageTables&&table.token&&<button type="button" className="aw-icon" aria-label={"Mã QR "+table.name} onClick={()=>setQrTable(table)}><QrCode size={19}/></button>}</div>
        </article>;
      })}</div>
      {!matrixTables.length && <p className="table-matrix-empty" role="status">Không có bàn phù hợp với bộ lọc đã chọn.</p>}
      <p className="table-matrix-note">Bàn đang phục vụ chỉ trở về trạng thái trống sau khi đóng lượt phục vụ.</p>
    </section>}
    {boardView==="manage" && <>

    <div className="otb-toolbar">
      <div className="otb-filters" role="group" aria-label="Lọc tình trạng bàn">
        {(mode==="support"?[{id:"all",label:"Tất cả"},{id:"bill",label:"Yêu cầu thanh toán"},{id:"service",label:"Gọi nhân viên"}] as const:mode==="orders"?[{id:"all",label:"Tất cả"},{id:"new",label:"Cần nhận đơn"},{id:"preparing",label:"Đang làm"},{id:"ready",label:"Chờ phục vụ"}] as const:[{ id: "all", label: "Tất cả" }, { id: "support", label: "Cần hỗ trợ" }, { id: "new", label: "Cần nhận đơn" }, { id: "preparing", label: "Đang làm" }, { id: "ready", label: "Chờ phục vụ" }, { id: "pending", label: "Chờ mở" }] as const).map(option => <button type="button" key={option.id} className={(filter === option.id ? "selected " : "") + (option.id === "new" && counts.new ? "has-new" : option.id === "support" && counts.support ? "has-support" : "")} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}<span>{counts[option.id]}</span></button>)}
      </div>

    </div>
    {actionError && <p className="otb-action-error" role="alert">{actionError}</p>}
    {visible.length ? <div className="otb-grid">
      {visible.map(row => renderTable(row))}
    </div> : <div className="otb-empty"><Table2 size={37} /><h3>{rows.length ? "Chưa có bàn phù hợp" : mode==="orders"?"Chưa có đơn cần xử lý":mode==="support"?"Chưa có yêu cầu hỗ trợ":"Chưa có bàn đang mở"}</h3><p>{rows.length ? "Chọn tình trạng hoặc khu vực khác để xem các bàn đang phục vụ." : "Khi khách quét QR và gửi tên, yêu cầu mở bàn sẽ xuất hiện tại đây."}</p>{(filter !== "all" || zone !== "all") && <button type="button" className="secondary" onClick={() => { setFilter("all"); setZone("all"); }}>Xem tất cả bàn</button>}</div>}
    <p className="otb-footnote"><History size={13} />Bàn đã đóng và lịch sử quyết toán được lưu trong mục Doanh thu.</p>
    </>}
    {popupSessionId && (
      popupRow?.session.status === "active" ? (
        <TableVisitPopup receipt title={"Hóa đơn · " + popupRow.name} busy={busy} onDismiss={() => { setPopupSessionId(null); setActionError(""); }}>
          {actionError && <p className="otb-action-error" role="alert">{actionError}</p>}
          <TableDetailSheet
            showZones={showZones}
            row={popupRow}
            busy={busy}
            permissions={permissions}
            isItemBusy={isItemBusy}
            onOrderStatus={onOrderStatus}
            onLineStatus={onLineStatus}
            onCollectTable={onCollectTable}
            onTransfer={onTransfer}
            onCancel={onCancel}
            onResolveCall={onResolveCall}
            onRequestClose={id => { setActionError(""); setCloseId(id); }}
          />
        </TableVisitPopup>
      ) : (
        <TableVisitPopup title={popupRow ? "Xử lý " + popupRow.name : "Lượt phục vụ đã kết thúc"} busy={busy} onDismiss={() => { setPopupSessionId(null); setActionError(""); }}>
          {actionError && <p className="otb-action-error" role="alert">{actionError}</p>}
          {popupRow ? renderTable(popupRow, true) : <p className="otb-popup-ended" role="status">Bàn đã đóng hoặc yêu cầu mở bàn đã được xử lý. Sơ đồ bàn đã cập nhật trạng thái mới.</p>}
        </TableVisitPopup>
      )
    )}
    {qrTable&&canManageTables&&<TableVisitPopup title={"Mã QR · "+qrTable.name} busy={false} onDismiss={()=>setQrTable(null)}><div className="aw-qr-preview"><QRCodeSVG value={(typeof window!=="undefined"?window.location.origin:"")+tableQrPath(qrTable.token,activeStoreId())} size={220} marginSize={4} title={"Mã QR "+qrTable.name}/><p>Quét mã · Nhập tên · Chờ mở bàn</p></div></TableVisitPopup>}
    {closing && <CloseVisitDialog row={closing} busy={busy} error={actionError} onDismiss={() => { setActionError(""); setCloseId(null); }} onConfirm={async () => { if (!canManageTables || closing.outstanding > 0) return; if (await act(closing.session.id, "tables.manage", () => onSessionAction(closing.session.id, "close"))) setCloseId(null); }} />}
  </section>;
}
