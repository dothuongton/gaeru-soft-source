"use client";
import {useEffect,useState} from "react";
import {History} from "lucide-react";
import {api} from "@/lib/api-client";
import {activeStoreId} from "@/lib/store-links";
import {money,type Order} from "@/lib/menu";
type Event={id:number;orderId:string;kind:string;actor:string;at:number;before:Order|null;after:Order};
export function BillHistory({sessionId,revision}:{sessionId:string;revision:string}){
 const [open,setOpen]=useState(false);
 const [resource,setResource]=useState<{key:string;data:Event[];error:string}>({key:"",data:[],error:""});
 const key=sessionId+":"+revision;const loading=resource.key!==key,data=loading?[]:resource.data,error=loading?"":resource.error;
 const [store]=useState(activeStoreId);
 useEffect(()=>{if(!open)return;let cancelled=false;void api<{history:Event[]}>("admin/bill-history?session="+encodeURIComponent(sessionId),{},store).then(value=>{if(!cancelled)setResource({key,data:value.history,error:""});},error=>{if(!cancelled)setResource({key,data:[],error:error.message});});return()=>{cancelled=true;};},[sessionId,key,open,store]);
 return <details className="otb-bill-secondary bill-history" onToggle={event=>setOpen(event.currentTarget.open)}><summary><History size={15}/>Lịch sử gọi món & điều chỉnh</summary>
  <div>{loading?<p role="status">Đang tải lịch sử…</p>:error?<p role="alert">{error}</p>:data.map(event=><article key={event.id}><strong>#{event.after.code} · {event.kind==="created"?"Đã gọi món":event.kind==="baseline"?"Dữ liệu trước cập nhật":event.kind==="payment"?"Đã thu tiền":event.kind==="cancel"?"Hủy / điều chỉnh bill":"Cập nhật phục vụ"}</strong><small>{new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(event.at)} · {event.actor}</small>{event.kind==="cancel"&&<p>{event.after.cancel_reason||event.after.items.flatMap(item=>item.cancellations??[]).map(value=>value.reason).join("; ")}</p>}<p>{event.before&&(event.before.total!==event.after.total||event.after.status==="cancelled")?money(event.before.total)+" → ":""}{money(event.after.status==="cancelled"?0:event.after.total)}{event.after.status==="cancelled"?" · Đã hủy, không thu tiền":""}</p>{event.kind==="created"&&<p>{event.after.items.map(item=>item.quantity+"× "+item.name).join(" · ")}</p>}</article>)}</div>
 </details>;
}
