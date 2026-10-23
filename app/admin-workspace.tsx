"use client";
import {readStartupBranding} from "@/lib/staff-startup-branding";
import {activeStoreId} from "@/lib/store-links";
import {useRef,useEffect,useState} from "react";
import type {ReactNode,RefObject} from "react";
import {Bell,ChevronLeft,ChevronRight,ChartNoAxesCombined,Mic,Settings2,Store,Table2,UtensilsCrossed,Volume2,VolumeX,LoaderCircle} from "lucide-react";
import {money,shopInitials,type Shop} from "@/lib/menu";
import type {StaffAccess} from "@/lib/staff-permissions";

function useAdminViewport(workspace:RefObject<HTMLElement|null>){
 useEffect(()=>{
  const shell=workspace.current?.closest<HTMLElement>('.app-shell');
  if(!shell)return;
  const viewport=window.visualViewport;
  const update=()=>{
   // Preserve pinch zoom; resize only the normal-scale application viewport.
   if(viewport && Math.abs(viewport.scale-1)>.01)return;
   shell.style.setProperty('--aw-viewport-height',`${viewport?.height??window.innerHeight}px`);
   shell.style.setProperty('--aw-viewport-top',`${viewport?.offsetTop??0}px`);
  };
  update();
  window.addEventListener('resize',update);
  window.addEventListener('pageshow',update);
  viewport?.addEventListener('resize',update);
  viewport?.addEventListener('scroll',update);
  return()=>{
   window.removeEventListener('resize',update);
   window.removeEventListener('pageshow',update);
   viewport?.removeEventListener('resize',update);
   viewport?.removeEventListener('scroll',update);
   shell.style.removeProperty('--aw-viewport-height');
   shell.style.removeProperty('--aw-viewport-top');
  };
 },[]);
}

export function AdminStartup(){
 const [branding,setBranding]=useState<{name:string;logo:string}|null>(null);
 useEffect(()=>{let storage:Storage|null=null;try{storage=window.localStorage;}catch{}
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate public branding after matching server HTML, never account or board data.
  setBranding(readStartupBranding(storage,activeStoreId()));
 },[]);
 const workspace=useRef<HTMLElement>(null);
 useAdminViewport(workspace);
 return <section ref={workspace} className="admin-workspace aw-startup" aria-busy="true" aria-label="Đang mở quản trị cửa hàng">
  <header className="aw-header"><div className="aw-startup-brand">{branding?.logo&&<img src={branding.logo} alt=""/>}<strong>{branding?.name||"Quản trị cửa hàng"}</strong></div><LoaderCircle size={20} className="spin"/></header>
  <div className="aw-content"><h1>Sơ đồ bàn</h1><p role="status">Đang đồng bộ với quán…</p><div className="aw-startup-grid" aria-hidden="true">{[1,2,3,4].map(id=><div key={id}/>)}</div></div>
  <div className="aw-nav aw-startup-nav" aria-hidden="true">{[1,2,3,4].map(id=><span key={id}><i/><i/></span>)}</div>
 </section>;
}

export function SupportRequestBadge({count}:{count:number}){
 return count>0?<b className="aw-support-badge" aria-hidden="true">{count>99?"99+":count}</b>:null;
}

export const operationalTabs=["orders","order-list","support"];
export function AdminWorkspace({shop,access,tab,onSwitch,onAudio,soundMode="voice",pushControl,canOrders,canTables,pendingCount,supportCount,newOrdersCount=0,children}:{shop:Shop;access:StaffAccess|null;tab:string;onSwitch:(tab:string)=>void;onAudio:()=>void;onListen:()=>void;soundReady:boolean;soundMode?:"voice"|"chime"|"silent";pushControl?:ReactNode;canOrders:boolean;canTables:boolean;pendingCount:number;supportCount:number;newOrdersCount?:number;children:ReactNode}){
 const workspace=useRef<HTMLElement>(null);
 const scroller=useRef<HTMLDivElement>(null);
 useAdminViewport(workspace);
 useEffect(()=>{scroller.current?.scrollTo({top:0,behavior:"instant"});},[tab]);
 const settings=!operationalTabs.includes(tab);
 return <section ref={workspace} className="admin-workspace" aria-label={shop.name+" · Quản trị cửa hàng"}>
  <header className="aw-header"><button type="button" className="aw-brand" onClick={()=>onSwitch("accounts")} aria-label="Tài khoản và thông tin cửa hàng"><span className="aw-logo">{shop.logo?<img src={shop.logo} alt=""/>:shopInitials(shop.name)}</span><span><strong>{shop.name}</strong><small>{access?.profile?.fullName||access?.account?.name||(access?.isOwner?"Chủ cửa hàng":"Nhân viên")}</small></span></button><div className="aw-header-actions">{(canOrders||canTables)&&<><button type="button" className="aw-icon" onClick={onAudio} aria-label={"Âm thanh: "+(soundMode==="silent"?"Im lặng":soundMode==="chime"?"Âm báo":"Giọng nói")+". Chọn chế độ"} title="Chọn chế độ âm thanh">{soundMode==="silent"?<VolumeX size={20}/>:soundMode==="chime"?<Volume2 size={20}/>:<Mic size={20}/>}</button>{pushControl}</>}{canOrders&&<button type="button" className="aw-icon" onClick={()=>onSwitch("support")} aria-label={"Hỗ trợ · "+supportCount+" yêu cầu chưa xử lý"} title={supportCount+" yêu cầu hỗ trợ chưa xử lý"}><Bell size={20}/><SupportRequestBadge count={supportCount}/></button>}</div></header>
  <nav className="aw-nav" aria-label="Điều hướng quản trị">{[{id:"orders",label:"Bàn",icon:Table2,allowed:canOrders,count:pendingCount},{id:"order-list",label:"Đơn món",icon:UtensilsCrossed,allowed:canOrders,count:newOrdersCount},{id:"support",label:"Hỗ trợ",icon:Bell,allowed:canOrders,count:supportCount},{id:"home",label:"Cài đặt",icon:Settings2,allowed:true,count:0}].filter(item=>item.allowed).map(item=><button key={item.id} type="button" onClick={()=>onSwitch(item.id)} className={(item.id==="home"?settings:tab===item.id)?"active":""} aria-current={(item.id==="home"?settings:tab===item.id)?"page":undefined} aria-label={item.label+(item.count>0?" · "+item.count+" yêu cầu chưa xử lý":"")}><span><item.icon size={22}/>{item.id==="support"?<SupportRequestBadge count={item.count}/>:item.count>0&&<b>{item.count>99?"99+":item.count}</b>}</span><span>{item.label}</span></button>)}</nav>
  <div className="aw-content" ref={scroller} id="admin-content">
   {children}
  </div>
 </section>;
}
export function AdminSettingsHome({tabs,onSwitch,collected,orderCount,activeTables,updated}:{tabs:{id:string;label:string;icon:typeof Store}[];onSwitch:(tab:string)=>void;collected:number|null;orderCount:number|null;activeTables:number;updated:string}){
 const descriptions:Record<string,string>={invoices:"Hóa đơn đã thanh toán, tìm theo ngày và thời gian",zones:"Bật/tắt hiển thị, thêm, sửa và xóa khu vực",tables:"Thêm, sửa, xóa bàn và mã QR",menu:"Món, giá bán và trạng thái còn món",settings:"Thông tin và thiết lập cửa hàng",promotions:"Ưu đãi và thời gian áp dụng",revenue:"Thu tiền, đơn hàng và quyết toán bàn",accounts:"Hồ sơ và phân quyền",stores:"Quản trị các cửa hàng"};
 const revenue=tabs.some(tab=>tab.id==="revenue");
 return <><h1 className="aw-page-title">Cài đặt</h1>{revenue&&<section className="aw-overview"><button type="button" onClick={()=>onSwitch("revenue")}><strong><ChartNoAxesCombined size={18}/>Tổng quan hôm nay</strong><ChevronRight size={18}/></button><small>Tiền đã xác nhận thanh toán · Cập nhật {updated}</small><div><span><b>{collected===null?"—":money(collected)}</b><small>Đã thu</small></span><span><b>{orderCount??"—"}</b><small>Đơn tạo hôm nay</small></span><span><b>{activeTables}</b><small>Bàn đang mở</small></span></div></section>}<div className="aw-settings-list">{tabs.filter(t=>!operationalTabs.includes(t.id)&&t.id!=="home").map(item=><button type="button" key={item.id} onClick={()=>onSwitch(item.id)}><span className="aw-setting-icon"><item.icon size={21}/></span><span><strong>{item.label}</strong><small>{descriptions[item.id]}</small></span><ChevronRight size={18}/></button>)}</div></>;
}
export function AdminBack({title,onBack}:{title:string;onBack:()=>void}){return <div className="aw-back"><button type="button" className="aw-icon" onClick={onBack} aria-label="Trở về Cài đặt"><ChevronLeft size={22}/></button><h1>{title}</h1></div>;}
