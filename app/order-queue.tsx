"use client";

import {useEffect,useId,useMemo,useRef,useState} from "react";
import {AlertCircle,ArrowRight,Check,ChevronDown,Clock3,LoaderCircle,ReceiptText,UtensilsCrossed} from "lucide-react";
import {canCancelOrder,normalizeOrderItem,type DiningTable,type Order,type OrderStatus} from "@/lib/menu";
import type {Permission} from "@/lib/staff-permissions";
import {groupQueueOrders,queueActions,queueQuantity,type QueueStage,type QueueLine,type QueueGroup} from "@/lib/grouped-order-queue";
import "./order-queue.css";

export type OrderQueueFilter=QueueStage;
export type MutationOutcome={state:"confirmed"}|{state:"uncertain";message:string}|{state:"rejected";message:string}|{state:"committed_stale";message:string}|boolean;
export type OrderQueueProps={
 orders:Order[];tables:DiningTable[];permissions:Permission[];
 onOrderStatus:(order:Order,next:OrderStatus)=>Promise<MutationOutcome>;
 onLineStatus?:(order:Order,lineId:string,to:OrderStatus,count:number,from:QueueLine["from"])=>Promise<MutationOutcome>;
 onCancel:(order:Order)=>void;onViewOrder:(order:Order)=>void;onOpenTable?:(tableId:string)=>void;
 isBusy?:(id:string)=>boolean;focusOrderId?:string|null;onFocusHandled?:()=>void;initialFilter?:OrderQueueFilter;showZones?:boolean;
};
const time=(value:number)=>new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Ho_Chi_Minh"}).format(new Date(value));
const choices=[{id:"new",label:"Cần nhận"},{id:"waiting",label:"Chờ phục vụ"},{id:"served",label:"Đã phục vụ"}] as const;

export function OrderQueue({orders,tables,permissions,onOrderStatus,onLineStatus,onCancel,onViewOrder,onOpenTable,isBusy,focusOrderId,onFocusHandled,initialFilter,showZones=true}:OrderQueueProps){
 const groups=useMemo(()=>groupQueueOrders(orders),[orders]);
 const [filter,setFilter]=useState<QueueStage>(()=>initialFilter??(groups.some(group=>group.stages.new.length)?"new":groups.some(group=>group.stages.waiting.length)?"waiting":"served"));
 const [zone,setZone]=useState("all"),[now,setNow]=useState(()=>Date.now());
 const [busyGroups,setBusyGroups]=useState<Set<string>>(new Set());
 const locks=useRef(new Set<string>());
 const [blocked,setBlocked]=useState<Map<string,QueueLine>>(new Map());
 const [error,setError]=useState("");
 const titleId=useId(),focusHandled=useRef<string|null>(null);
 const canManage=permissions.includes("orders.manage"),canCancel=permissions.includes("orders.cancel");
 const zoneMap=useMemo(()=>new Map(tables.map(table=>[table.id,table.zone])),[tables]);
 const zones=[...new Set(tables.map(table=>table.zone).filter(Boolean))];
 const scoped=groups.filter(group=>!showZones||zone==="all"||zoneMap.get(group.tableId)===zone);
 const counts=Object.fromEntries(choices.map(choice=>[choice.id,scoped.filter(group=>group.stages[choice.id].length>0).length])) as Record<QueueStage,number>;
 const visible=scoped.filter(group=>group.stages[filter].length>0).sort((a,b)=>filter==="served"?b.stages.served.at(-1)!.order.created_at-a.stages.served.at(-1)!.order.created_at:a.stages[filter][0].order.created_at-b.stages[filter][0].order.created_at||a.key.localeCompare(b.key));
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);

 // A cached outcome never authorizes replay. Only changed source quantities
 // in a fresh server snapshot release this line for another action.
 const blockedKeys=new Set([...blocked].filter(([,line])=>{
  const current=orders.find(order=>order.id===line.order.id);
  const item=current?.items.map((item,index)=>normalizeOrderItem(item,current.status,index)).find(item=>item.orderLineId===line.lineId);
  const source=item?.[(line.from+"Count") as "newCount"|"preparingCount"|"readyCount"|"servedCount"];
  return current?.status!=="cancelled"&&source!==undefined&&source>=line.quantity;
 }).map(([key])=>key));

 useEffect(()=>{
  if(!focusOrderId||focusHandled.current===focusOrderId)return;
  const group=groups.find(group=>group.orders.some(order=>order.id===focusOrderId));
  if(!group)return;
  const stage=choices.find(choice=>group.stages[choice.id].some(line=>line.order.id===focusOrderId))?.id;
  if(!stage){focusHandled.current=focusOrderId;onFocusHandled?.();return;}
  const frame=requestAnimationFrame(()=>{
   if(filter!==stage||zone!=="all") {setFilter(stage);setZone("all");return;}
   const element=document.getElementById(titleId+group.key);
   if(!element)return;
   element.scrollIntoView({block:"center",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
   focusHandled.current=focusOrderId;onFocusHandled?.();
  });
  return()=>cancelAnimationFrame(frame);
 },[focusOrderId,groups,filter,zone,onFocusHandled,titleId]);

 async function advance(group:QueueGroup){
  const actions=queueActions(group,filter);
  if(!canManage||!actions.length||locks.current.has(group.key)||actions.some(({line})=>blockedKeys.has(line.key)||isBusy?.(line.order.id)))return;
  locks.current.add(group.key);setBusyGroups(new Set(locks.current));setError("");
  try{
   for(const {line,to} of actions){
    // Keep API transitions exact to this snapshot. New calls received while
    // this batch runs are intentionally absent from this list.
    let outcome:MutationOutcome;
    try{
     if(onLineStatus)outcome=await onLineStatus(line.order,line.lineId,to,line.quantity,line.from);
     else if(filter==="new"&&line.order.status==="new"&&line.order.items.length===1)outcome=await onOrderStatus(line.order,"preparing");
     else {setError("Chưa có cập nhật theo món. Mở hóa đơn bàn để xử lý an toàn.");break;}
    }catch{outcome={state:"uncertain",message:"Kết nối bị gián đoạn; đang chờ đối chiếu."};}
    if(typeof outcome==="object"&&outcome.state!=="confirmed"){
     if(outcome.state!=="rejected")setBlocked(previous=>new Map(previous).set(line.key,line));
     setError(outcome.message||"Đang chờ dữ liệu xác nhận. Các món còn lại chưa được cập nhật.");break;
    }
    if(outcome===false){setError("Chưa cập nhật được món. Các món còn lại được giữ nguyên.");break;}
   }
  }finally{locks.current.delete(group.key);setBusyGroups(new Set(locks.current));}
 }
 const renderLine=(line:QueueLine)=><div className="oq-item-row" key={line.key}>
  <b className="oq-item-qty">{line.quantity}×</b><div className="oq-item-info"><strong className="oq-item-name">{line.name}</strong>
   {line.note&&<small className="oq-item-extras">{line.note}</small>}
   {line.order.note&&<small className="oq-item-order-note">Ghi chú lượt {line.round}: {line.order.note}</small>}
   <small className="oq-item-origin">Lượt {line.round} · {time(line.order.created_at)} · #{line.order.code}{line.from==="ready"?" · Sẵn sàng":""}</small>
  </div>
 </div>;

 return <section className="order-queue-panel oq-grouped" aria-labelledby={titleId}>
  <header className="oq-header"><div className="oq-heading-row"><h2 id={titleId}>Đơn món</h2>{showZones&&zones.length>1&&<label className="oq-zone-select"><span>Khu vực</span><select value={zone} onChange={event=>setZone(event.target.value)}><option value="all">Tất cả khu vực</option>{zones.map(zone=><option key={zone}>{zone}</option>)}</select></label>}</div>
   <div className="oq-filter-bar" role="group" aria-label="Trạng thái đơn món">{choices.map(choice=><button type="button" key={choice.id} className={"oq-filter-btn "+(filter===choice.id?"selected":"")} aria-pressed={filter===choice.id} aria-label={choice.label+" · "+counts[choice.id]+" bàn"} onClick={()=>setFilter(choice.id)}><span>{choice.label}</span><b>{counts[choice.id]}</b></button>)}</div>
  </header>
  {error&&<p className="oq-error" role="alert">{error}</p>}
  <p className="oq-summary">{visible.length} bàn · {visible.reduce((sum,group)=>sum+queueQuantity(group.stages[filter]),0)} suất · Gộp theo phiên bàn</p>
  {visible.length?<div className="oq-grid">{visible.map(group=>{
   const lines=group.stages[filter],quantity=queueQuantity(lines),waiting=Math.max(0,Math.floor((now-lines[0].order.created_at)/60000));
   const uncertain=lines.some(line=>blockedKeys.has(line.key));
   const busy=busyGroups.has(group.key)||lines.some(line=>isBusy?.(line.order.id));
   const customer=group.orders.find(order=>order.customer_name)?.customer_name;
   return <article key={group.key} id={titleId+group.key} className={"oq-card "+filter+(waiting>=15&&filter!=="served"?" urgent":waiting>=10&&filter!=="served"?" warning":"")} aria-label={group.name+" · "+choices.find(choice=>choice.id===filter)!.label}>
    <div className="oq-card-head"><div className="oq-head-meta"><strong className="oq-table-name">{group.name}</strong>{showZones&&zoneMap.get(group.tableId)&&<small className="oq-zone-badge">{zoneMap.get(group.tableId)}</small>}</div>{filter!=="served"&&<span className={"oq-wait-badge"+(waiting>=15?" urgent":waiting>=10?" warning":"")}><Clock3 size={12}/>{waiting}p</span>}</div>
    <p className="oq-customer-name">{customer||"Khách tại bàn"} · {new Set(lines.map(line=>line.order.id)).size} lượt · {quantity} suất</p>
    <div className="oq-table-stages">{choices.map(choice=>{const qty=queueQuantity(group.stages[choice.id]);return qty?<span key={choice.id}>{qty} {choice.label.toLocaleLowerCase("vi-VN")}</span>:null;})}</div>
    <div className="oq-items">{lines.slice(0,3).map(renderLine)}{lines.length>3&&<details className="oq-more-lines"><summary>+{lines.length-3} dòng món khác<ChevronDown size={14}/></summary>{lines.slice(3).map(renderLine)}</details>}</div>
    {uncertain&&<p className="oq-reconciling"><AlertCircle size={14}/>Đang đối chiếu, chưa gửi lại thao tác.</p>}
    <div className="oq-card-footer">{canManage&&filter!=="served"&&<button type="button" className="oq-btn-cta primary" disabled={busy||uncertain} onClick={()=>void advance(group)}>{busy?<LoaderCircle size={16} className="spin"/>:filter==="new"?<Check size={16}/>:<ArrowRight size={16}/>}<span>{busy?"Đang lưu…":uncertain?"Đang đối chiếu…":filter==="new"?"Nhận "+quantity+" suất":"Đã phục vụ "+quantity+" suất"}</span></button>}
     <button type="button" className="oq-btn-table" onClick={()=>onOpenTable?onOpenTable(group.tableId):onViewOrder(group.orders[0])} aria-label={"Xem hóa đơn "+group.name}><ReceiptText size={17}/><span>Chi tiết bàn</span></button>
    </div>
    {canCancel&&group.orders.some(canCancelOrder)&&<details className="oq-more-lines oq-cancel-rounds"><summary>Hủy lượt gọi<ChevronDown size={14}/></summary>{group.orders.filter(canCancelOrder).map(order=><button type="button" key={order.id} disabled={busy||uncertain||isBusy?.(order.id)} onClick={()=>onCancel(order)}>Hủy lượt {group.orders.indexOf(order)+1} · #{order.code}</button>)}</details>}
   </article>;
  })}</div>:<div className="oq-empty"><UtensilsCrossed size={32}/><h3>{filter==="new"?"Không có món cần nhận":filter==="waiting"?"Không có món chờ phục vụ":"Chưa có món đã phục vụ"}</h3><p>Chọn trạng thái khác để xem các bàn.</p></div>}
 </section>;
}
