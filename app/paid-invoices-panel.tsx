"use client";
import {useEffect,useId,useRef,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,ReceiptText,RefreshCw,Search,X} from 'lucide-react';
import {api} from '@/lib/api-client';
import {money} from '@/lib/menu';
import {paymentLabels} from '@/lib/revenue-types';
import type {PaidInvoiceDetail,PaidInvoicePage} from '@/lib/paid-invoices';
import './paid-invoices-panel.css';
const day=(value:number)=>new Date(value+25200000).toISOString().slice(0,10);
const clock=(value:number)=>new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'}).format(value);
const dateLabel=(value:string)=>value.split('-').reverse().join('/');
const initial=()=>({from:day(Date.now()),to:day(Date.now()),fromTime:'',toTime:'',search:'',page:1,pageSize:20});
type Filters=ReturnType<typeof initial>;
function useInvoicesResource<T>(path:string){
 const [resource,setResource]=useState<{path:string;data:T|null;error:string}>({path:'',data:null,error:''});
 useEffect(()=>{let cancelled=false;void api<T>(path).then(data=>{if(!cancelled)setResource({path,data,error:''});},error=>{if(!cancelled)setResource({path,data:null,error:error.message||'Chưa tải được hóa đơn.'});});return()=>{cancelled=true;};},[path]);
 return resource.path===path?{...resource,loading:false}:{path,data:null,error:'',loading:true};
}
function InvoiceDialog({id,shopName,onClose}:{id:string;shopName:string;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),heading=useId();
 const resource=useInvoicesResource<PaidInvoiceDetail>('admin/invoices/'+encodeURIComponent(id));
 useEffect(()=>{const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;const dialog=ref.current;dialog?.showModal();return()=>{dialog?.close();if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
 const data=resource.data;
 return <dialog ref={ref} className="modal paid-invoice-detail" aria-labelledby={heading} onCancel={event=>{event.preventDefault();onClose();}}><div className="modal-header"><h2 id={heading}>Hóa đơn đã thanh toán</h2><button type="button" className="aw-icon" aria-label="Đóng hóa đơn" onClick={onClose}><X size={20}/></button></div><div className="paid-invoice-detail-content">
  {resource.loading?<p role="status">Đang tải hóa đơn…</p>:resource.error?<p role="alert">{resource.error}</p>:data&&<><h3>{shopName}</h3><p>{data.invoice.tableName} · {data.invoice.customerName||'Khách tại bàn'}</p><p>{dateLabel(day(data.invoice.paidAt))} · {clock(data.invoice.paidAt)} · {paymentLabels[data.invoice.method]}</p>
   {data.orders.map((order,index)=><section key={order.id}><div className="paid-invoice-order"><strong>Lượt {index+1}</strong><span>#{order.code}</span></div>{order.note&&<p className="invoice-note">Ghi chú lượt gọi: {order.note}</p>}{order.items.map((item,index)=><div className="paid-invoice-line" key={index}><b>{item.quantity}×</b><div><strong>{item.name}</strong>{[...item.extras,item.taste,item.note].some(Boolean)&&<small>{[...item.extras,item.taste,item.note].filter(Boolean).join(' · ')}</small>}<small>Đơn giá {money(item.unitPrice)}</small></div><strong>{money(item.total)}</strong></div>)}</section>)}
   <div className="paid-invoice-detail-total"><span>Đã thanh toán</span><strong>{money(data.invoice.amount)}</strong></div><small>Mã phiếu: {data.invoice.id.split(':')[1]}</small>
  </>}
 </div></dialog>;
}
export function PaidInvoicesPanel({shopName}:{shopName:string}){
 const [applied,setApplied]=useState<Filters>(initial),[draft,setDraft]=useState<Filters>(initial),[revision,setRevision]=useState(0),[selected,setSelected]=useState<string|null>(null);
 const [filterError,setFilterError]=useState('');
 const listTop=useRef<HTMLDivElement>(null),scrollRequested=useRef(false);
 const query=new URLSearchParams(Object.fromEntries(Object.entries(applied).map(([key,value])=>[key,String(value)])));
 query.set('refresh',String(revision));
 const resource=useInvoicesResource<PaidInvoicePage>('admin/invoices?'+query),page=resource.data;
 useEffect(()=>{if(page&&scrollRequested.current){listTop.current?.scrollIntoView({block:"start",behavior:"instant"});scrollRequested.current=false;}},[page]);
 const days=page?[...new Set(page.invoices.map(invoice=>day(invoice.paidAt)))]:[];
 const apply=(next:Filters)=>{if(!next.from||!next.to||next.from>next.to){setFilterError('Chọn khoảng ngày hợp lệ.');return;}setFilterError('');setDraft({...next,page:1});setApplied({...next,page:1});};
 const preset=(offset:number)=>{const now=Date.now(),from=day(now+offset*86400000),to=day(now);apply({...initial(),pageSize:applied.pageSize,from,to:offset===-1?from:to});};
 const pagination=page&&<div className="invoice-pagination"><label><span>Hóa đơn / trang</span><select aria-label="Số hóa đơn mỗi trang" value={applied.pageSize} onChange={event=>{const size=Number(event.target.value);scrollRequested.current=true;setApplied(value=>({...value,pageSize:size,page:1}));setDraft(value=>({...value,pageSize:size,page:1}));}}>{[20,50,100].map(size=><option key={size} value={size}>{size}</option>)}</select></label><small>{page.total?(page.page-1)*page.pageSize+1:0}–{Math.min(page.page*page.pageSize,page.total)} / {page.total}</small><div><button type="button" className="aw-icon" aria-label="Trang hóa đơn trước" disabled={page.page<=1} onClick={()=>{scrollRequested.current=true;setApplied(value=>({...value,page:Math.max(1,page.page-1)}));}}><ChevronLeft size={19}/></button><span>{page.page} / {Math.max(1,page.pages)}</span><button type="button" className="aw-icon" aria-label="Trang hóa đơn sau" disabled={page.page>=page.pages} onClick={()=>{scrollRequested.current=true;setApplied(value=>({...value,page:page.page+1}));}}><ChevronRight size={19}/></button></div></div>;
 return <section className="paid-invoices-panel"><div className="invoice-toolbar"><p>Tra cứu theo thời điểm thu tiền · Giờ Việt Nam</p><button type="button" className="aw-icon" aria-label="Tải lại danh sách hóa đơn" disabled={resource.loading} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={18}/></button></div>
  <div className="invoice-presets"><button type="button" onClick={()=>preset(0)}>Hôm nay</button><button type="button" onClick={()=>preset(-1)}>Hôm qua</button><button type="button" onClick={()=>preset(-6)}>7 ngày</button></div>
  <form className="invoice-filters" onSubmit={event=>{event.preventDefault();apply(draft);}}><details className="invoice-custom-range"><summary><CalendarDays size={15}/>Khoảng ngày & giờ</summary><div className="invoice-date-fields"><label><span>Từ ngày</span><input type="date" value={draft.from} required onChange={event=>setDraft(value=>({...value,from:event.target.value}))}/></label><label><span>Đến ngày</span><input type="date" value={draft.to} required onChange={event=>setDraft(value=>({...value,to:event.target.value}))}/></label>
   <details className="invoice-hours"><summary><CalendarDays size={15}/>Giờ cụ thể</summary><div><label><span>Từ giờ</span><input type="time" value={draft.fromTime} onChange={event=>setDraft(value=>({...value,fromTime:event.target.value}))}/></label><label><span>Đến hết phút</span><input type="time" value={draft.toTime} onChange={event=>setDraft(value=>({...value,toTime:event.target.value}))}/></label></div></details>
   </div></details><label className="invoice-search"><span>Tìm hóa đơn</span><input type="search" placeholder="Tên bàn, khách hoặc mã phiếu" maxLength={100} value={draft.search} onChange={event=>setDraft(value=>({...value,search:event.target.value}))}/></label><button type="submit" className="primary"><Search size={16}/>Tìm kiếm</button>
  </form>
  {filterError&&<p role="alert">{filterError}</p>}
  {resource.loading?<p role="status">Đang tải hóa đơn đã thanh toán…</p>:resource.error?<div role="alert"><p>{resource.error}</p><button type="button" className="secondary" onClick={()=>setRevision(value=>value+1)}>Thử lại</button></div>:page&&<>
   <div className="invoice-period-total"><span>{page.total} hóa đơn đã thanh toán</span><strong>{money(page.totalAmount)}</strong><small>{dateLabel(page.range.from)} — {dateLabel(page.range.to)}</small></div>
   <div ref={listTop}/>{pagination}
   {days.map(date=><section key={date} className="invoice-day"><h3>{dateLabel(date)}</h3>{page.invoices.filter(invoice=>day(invoice.paidAt)===date).map(invoice=><button type="button" className="invoice-row" key={invoice.id} onClick={()=>setSelected(invoice.id)} aria-label={'Xem hóa đơn '+invoice.tableName+' · '+money(invoice.amount)}><ReceiptText size={20}/><span><strong>{invoice.tableName}</strong><small>{clock(invoice.paidAt)} · {invoice.customerName||'Khách tại bàn'} · {invoice.orderCount} lượt</small><small>{paymentLabels[invoice.method]} · #{invoice.id.split(':')[1].slice(0,8)}</small></span><strong>{money(invoice.amount)}</strong><ChevronRight size={17}/></button>)}</section>)}
   {!page.invoices.length&&<p className="invoice-empty">Không có hóa đơn đã thanh toán trong khoảng đã chọn.</p>}
   {pagination}
  </>}
  {selected&&<InvoiceDialog id={selected} shopName={shopName} onClose={()=>setSelected(null)}/>}
 </section>;
}
