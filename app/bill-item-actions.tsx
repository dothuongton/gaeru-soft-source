"use client";
import {useEffect,useRef,useState} from "react";
import {Check,Trash2,X} from "lucide-react";
import {normalizeOrderItem,type Order,type OrderStatus} from "@/lib/menu";

export type BillLineCancel=(order:Order,lineId:string,count:number,reason:string,requestId:string)=>Promise<boolean>;
type Entry={order:Order;lineId:string;round:number};
export function BillItemActions({entries,canManage,canCancel,locked,onLineStatus,onCancelLine}:{
 entries:Entry[];canManage:boolean;canCancel:boolean;locked:boolean;
 onLineStatus?:(orderId:string,lineId:string,to:OrderStatus,count?:number,from?:"new"|"preparing"|"ready"|"waiting",expectedUpdatedAt?:number)=>Promise<boolean>;
 onCancelLine?:BillLineCancel;
}){
 const [choice,setChoice]=useState<{orderId:string;lineId:string;count:number;requestId:string}|null>(null);
 const reasonInput=useRef<HTMLInputElement>(null);
 const chosenOrder=choice?.orderId,chosenLine=choice?.lineId;
 useEffect(()=>{if(chosenOrder&&chosenLine)reasonInput.current?.focus();},[chosenOrder,chosenLine]);
 const [reason,setReason]=useState("");const [error,setError]=useState("");const [working,setWorking]=useState(false);const lock=useRef(false);
 const lines=entries.flatMap(entry=>{if(entry.order.status==="cancelled")return [];const line=entry.order.items.map((item,index)=>normalizeOrderItem(item,entry.order.status,index)).find(line=>line.orderLineId===entry.lineId);return line&&line.quantity>line.servedCount?[{...entry,line}]:[];});
 async function run(action:()=>Promise<boolean>){if(locked||lock.current)return;lock.current=true;setWorking(true);setError("");try{const ok=await action();if(!ok)setError("Chưa xác nhận được cập nhật. Kiểm tra trạng thái rồi thử lại.");return ok;}catch{setError("Kết nối gián đoạn. Kiểm tra lại trước khi thao tác tiếp.");return false;}finally{lock.current=false;setWorking(false);}}
 const selected=lines.find(entry=>entry.order.id===choice?.orderId&&entry.lineId===choice?.lineId);
 if(!lines.length)return null;
 return <div className="bill-item-actions">
  {lines.map(({order,line,round})=><div className="bill-item-action-row" key={order.id+line.orderLineId}>
   {entries.length>1&&<small>Lượt {round}</small>}
   {canManage&&onLineStatus&&line.newCount>0&&<button type="button" disabled={locked||working} onClick={()=>void run(()=>onLineStatus(order.id,line.orderLineId,"preparing",line.newCount,"new",order.updated_at))}>Nhận {line.newCount} suất</button>}
   {canManage&&onLineStatus&&line.preparingCount+line.readyCount>0&&<button type="button" className="bill-serve" aria-label={"Đã phục vụ "+(line.preparingCount+line.readyCount)+" suất "+line.name+" · lượt "+round} disabled={locked||working} onClick={()=>void run(()=>onLineStatus(order.id,line.orderLineId,"served",line.preparingCount+line.readyCount,"waiting",order.updated_at))}><Check size={16}/>Đã phục vụ{line.preparingCount+line.readyCount>1?" ("+(line.preparingCount+line.readyCount)+")":""}</button>}
   {canCancel&&onCancelLine&&!order.paid&&<button type="button" className="bill-cancel" aria-label={"Hủy món "+line.name+" · lượt "+round} disabled={locked||working} onClick={()=>{setChoice({orderId:order.id,lineId:line.orderLineId,count:line.quantity-line.servedCount,requestId:crypto.randomUUID()});setReason("");setError("");}}><Trash2 size={16}/>Hủy món</button>}
  </div>)}
  {choice&&<form className="bill-cancel-confirm" onSubmit={event=>{event.preventDefault();if(!selected||!onCancelLine||!reason.trim())return;void run(()=>onCancelLine(selected.order,selected.lineId,choice.count,reason.trim(),choice.requestId)).then(ok=>{if(ok)setChoice(null);});}}>
   <strong>Hủy phần chưa phục vụ{selected?" · lượt "+selected.round:""}</strong>
   {!selected?<p>Món đã được cập nhật. Đóng phần hủy và kiểm tra lại.</p>:<><label>Số suất<input type="number" min={1} max={selected.line.quantity-selected.line.servedCount} value={choice.count} required disabled={working} onChange={event=>setChoice({...choice,count:Number(event.target.value),requestId:crypto.randomUUID()})}/></label><label>Lý do<input ref={reasonInput} value={reason} maxLength={180} required disabled={working} placeholder="Ví dụ: Khách đặt nhầm" onChange={event=>{setReason(event.target.value);setChoice({...choice,requestId:crypto.randomUUID()});}}/></label><small>Giữ nguyên món đã phục vụ. Bill sẽ trừ phần bị hủy; lịch sử vẫn được lưu.</small></>}
   <div><button type="button" disabled={working} onClick={()=>setChoice(null)}><X size={15}/>Giữ món</button>{selected&&<button type="submit" disabled={locked||working||!reason.trim()} className="bill-cancel">Xác nhận hủy {choice.count} suất</button>}</div>
  </form>}
  {error&&<p className="otb-action-error" role="alert">{error}</p>}
 </div>;
}
