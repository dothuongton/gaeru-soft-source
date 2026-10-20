"use client";

import {useEffect,useId,useRef,useState} from "react";
import {ArrowRight,CheckCircle2,Clock,LoaderCircle,LockKeyhole,QrCode,RefreshCw,Smartphone,UserRound,X} from "lucide-react";
import type {DiningTable} from "@/lib/menu";
import type {Connection} from "@/lib/table-sessions";
import "./table-connection.css";

type Props={
 connection:Connection;
 table:DiningTable;
 onRequest:(customerName:string)=>Promise<void>;
 onRefresh:()=>Promise<unknown>;
};

export function TableConnectionPanel({connection,table,onRequest,onRefresh}:Props){
 const [dialogOpen,setDialogOpen]=useState(false),[retryName,setRetryName]=useState(false);
 const [customerName,setCustomerName]=useState(""),[working,setWorking]=useState(false),[refreshing,setRefreshing]=useState(false),[error,setError]=useState("");
 const dialog=useRef<HTMLDialogElement>(null),nameInput=useRef<HTMLInputElement>(null),titleId=useId(),descriptionId=useId(),errorId=useId();
 const requestLock=useRef(false),previousState=useRef("");
 const state=connection.state,active=state==="active",pending=state==="pending",preview=state==="preview",blocked=state==="blocked";
 const form=state==="available"||(retryName&&(state==="closed"||state==="rejected"));
 useEffect(()=>{
  const key=table.id+":"+state+":"+(connection.session?.id||"");
  if(previousState.current!==key){
   previousState.current=key;setRetryName(false);setError("");
   if(state==="available"||state==="closed"||state==="rejected")setCustomerName("");
   setDialogOpen(!["preview","active"].includes(state));
  }
 },[table.id,state,connection.session?.id]);
 useEffect(()=>{
  if(!dialogOpen||active||preview)return;
  const element=dialog.current,previous=document.activeElement as HTMLElement|null;
  if(element&&!element.open)element.showModal();
  const overflow=document.body.style.overflow;document.body.style.overflow="hidden";
  return()=>{element?.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[dialogOpen,active,preview]);
 useEffect(()=>{if(dialogOpen&&form)nameInput.current?.focus();},[dialogOpen,form]);
 async function refresh(){if(refreshing||working)return;setRefreshing(true);setError("");try{await onRefresh();}catch(e){setError((e as Error).message);}finally{setRefreshing(false);}}
 async function request(){
  if(requestLock.current)return;
  if(!customerName.trim()){setError("Vui lòng nhập tên để nhân viên nhận đúng bàn của bạn.");nameInput.current?.focus();return;}
  requestLock.current=true;setWorking(true);setError("");
  try{await onRequest(customerName.trim());setRetryName(false);}catch(e){setError((e as Error).message);void onRefresh().catch(()=>{});}finally{requestLock.current=false;setWorking(false);}
 }
 const title=form?"Mời bạn mở bàn":pending?"Đang chờ mở bàn":blocked?"Bàn chưa sẵn sàng kết nối":state==="rejected"?"Yêu cầu chưa được chấp nhận":"Lượt phục vụ đã kết thúc";
 const description=form?"Nhập tên để gửi yêu cầu mở bàn. Nhân viên xác nhận xong, bạn có thể bắt đầu gọi món.":pending?"Yêu cầu đã gửi đến quản trị. Trang sẽ tự cập nhật khi nhân viên duyệt mở bàn.":connection.message||(blocked?"Bàn đang được giữ cho một thiết bị khác. Khách mới chỉ có thể kết nối sau khi quản trị đóng lượt trước.":state==="rejected"?"Nhân viên đã từ chối yêu cầu mở bàn này. Vui lòng trao đổi trực tiếp với nhân viên nếu bạn đang ngồi tại bàn.":"Quản trị đã đóng bàn. Thiết bị này đã kết thúc quyền gọi món của lượt vừa rồi.");
 if(preview)return <div className="table-connection-banner preview"><QrCode size={20}/><div><strong>Thực đơn xem trước</strong><p>Quét mã QR tại bàn, nhập tên và chờ nhân viên mở bàn để gọi món.</p></div></div>;
 return <>
  <section className={"table-connection-banner "+(active?"connected":pending?"waiting":"restricted")} aria-label="Kết nối bàn">
   {active?<Smartphone size={21}/>:pending?<Clock size={21}/>:<LockKeyhole size={21}/>}
   <div><strong>{active?`${table.name} · ${connection.session?.customer_name||"Khách"}`:pending?`${table.name} · Chờ nhân viên mở bàn`:blocked?`${table.name} · Đã có thiết bị kết nối`:state==="available"?`${table.name} · Nhập tên để mở bàn`:title}</strong><p>{active?"Đã kết nối máy này · Sẵn sàng gọi món":pending?"Chỉ máy đã gửi yêu cầu được tiếp tục lượt này.":blocked?"Vui lòng chờ quản trị đóng lượt khách trước.":"Mỗi lượt phục vụ chỉ có một thiết bị gọi món."}</p></div>
   {active?<span className="connection-confirmed"><CheckCircle2 size={15}/>Đã mở bàn</span>:<button className="secondary" onClick={()=>setDialogOpen(true)}>{pending?"Xem yêu cầu":blocked?"Chi tiết":"Mở kết nối"}<ArrowRight size={15}/></button>}
  </section>
  {dialogOpen&&!active&&<dialog ref={dialog} className="modal table-connection-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event=>{event.preventDefault();if(!working)setDialogOpen(false);}}>
   <div className="modal-header"><span className="connection-table"><QrCode size={17}/>{table.name}<small>{table.zone}</small></span><button className="icon-btn" disabled={working} aria-label="Xem thực đơn trước" onClick={()=>setDialogOpen(false)}><X size={21}/></button></div>
   <div className="connection-body">
    <span className={"connection-symbol "+(pending?"waiting":"")}>{form?<UserRound size={29}/>:pending?<Clock size={29}/>:<LockKeyhole size={29}/>}</span>
    <p className="eyebrow">CHÀO MỪNG BẠN ĐẾN BÀN</p><h2 id={titleId}>{title}</h2><p id={descriptionId} className="connection-description">{description}</p>
    {form?<form className="connection-name-form" onSubmit={event=>{event.preventDefault();void request();}}>
     <label className="field"><span>Tên khách hàng <span aria-hidden="true">*</span></span><input ref={nameInput} autoComplete="name" name="customerName" placeholder="Ví dụ: Anh Minh" maxLength={80} required value={customerName} disabled={working} aria-describedby={error?errorId:undefined} onChange={event=>{setCustomerName(event.target.value);setError("");}}/></label>
     <div className="connection-device-note"><Smartphone size={19}/><p>Máy đang dùng sẽ là máy duy nhất được gọi món cho lượt này.</p></div>
     {error&&<p className="inline-error" id={errorId} role="alert">{error}</p>}
     <button className="primary full" disabled={working||!customerName.trim()} type="submit">{working?<LoaderCircle className="spin" size={18}/>:<ArrowRight size={18}/>} {working?"Đang gửi yêu cầu…":"Gửi yêu cầu mở bàn"}</button>
    </form>:<>
     {pending&&<div className="connection-request-summary"><span>Khách hàng</span><strong>{connection.session?.customer_name}</strong><span>Thiết bị gọi món</span><strong><Smartphone size={15}/>Máy này</strong></div>}
     {blocked&&<p className="connection-help">Nếu bạn đã đăng ký trước đó, hãy dùng đúng trình duyệt đã đăng ký. Nhân viên có thể hỗ trợ kiểm tra tại bàn.</p>}
     {error&&<p className="inline-error" id={errorId} role="alert">{error}</p>}
     {(pending||blocked)?<button className="secondary full" disabled={refreshing} onClick={()=>void refresh()}><RefreshCw className={refreshing?"spin":""} size={17}/>{refreshing?"Đang kiểm tra…":"Kiểm tra trạng thái"}</button>:<button className="primary full" onClick={()=>{setRetryName(true);setCustomerName("");setError("");}}>Yêu cầu lượt mới<ArrowRight size={17}/></button>}
    </>}
    <button className="text-button connection-browse" disabled={working} onClick={()=>setDialogOpen(false)}>{pending?"Xem thực đơn trong khi chờ":"Xem thực đơn trước"}</button>
   </div>
  </dialog>}
 </>;
}
