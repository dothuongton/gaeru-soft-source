"use client";
import {useRef,useEffect} from "react";
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
 const workspace=useRef<HTMLElement>(null);
 useAdminViewport(workspace);
 return <section ref={workspace} className="admin-workspace aw-startup" aria-busy="true" aria-label="Đang mở quản trị cửa hàng">
  <header className="aw-header"><strong>Quản trị cửa hàng</strong><LoaderCircle size={20} className="spin"/></header>
  <div className="aw-content"><p role="status">Đang kết nối và kiểm tra tài khoản…</p><div className="aw-startup-grid" aria-hidden="true">{[1,2,3,4].map(id=><div key={id}/>)}</div></div>
  <nav className="aw-nav" aria-label="Điều hướng đang tải">{[{name:"Bàn",icon:Table2},{name:"Đơn món",icon:UtensilsCrossed},{name:"Hỗ trợ",icon:Bell},{name:"Cài đặt",icon:Settings2}].map(item=><button type="button" disabled key={item.name}><item.icon size={24}/><span>{item.name}</span></button>)}</nav>
 </section>;
}

export const operationalTabs=["orders","order-list","support"];
export function AdminWorkspace({shop,access,tab,onSwitch,onAudio,soundMode="voice",pushControl,canOrders,canTables,pendingCount,supportCount,children}:{shop:Shop;access:StaffAccess|null;tab:string;onSwitch:(tab:string)=>void;onAudio:()=>void;onListen:()=>void;soundReady:boolean;soundMode?:"voice"|"chime"|"silent";pushControl?:ReactNode;canOrders:boolean;canTables:boolean;pendingCount:number;supportCount:number;children:ReactNode}){
 const workspace=useRef<HTMLElement>(null);
 const scroller=useRef<HTMLDivElement>(null);
 useAdminViewport(workspace);
 useEffect(()=>{scroller.current?.scrollTo({top:0,behavior:"instant"});},[tab]);
 const settings=!operationalTabs.includes(tab);
 return <section ref={workspace} className="admin-workspace" aria-label={shop.name+" · Quản trị cửa hàng"}>
  <header className="aw-header"><button type="button" className="aw-brand" onClick={()=>onSwitch("accounts")} aria-label="Tài khoản và thông tin cửa hàng"><span className="aw-logo">{shop.logo?<img src={shop.logo} alt=""/>:shopInitials(shop.name)}</span><span><strong>{shop.name}</strong><small>{access?.profile?.fullName||access?.account?.name||(access?.isOwner?"Chủ cửa hàng":"Nhân viên")}</small></span></button><div className="aw-header-actions">{(canOrders||canTables)&&<><button type="button" className="aw-icon" onClick={onAudio} aria-label={"Âm thanh: "+(soundMode==="silent"?"Im lặng":soundMode==="chime"?"Âm báo":"Giọng nói")+". Chọn chế độ"} title="Chọn chế độ âm thanh">{soundMode==="silent"?<VolumeX size={20}/>:soundMode==="chime"?<Volume2 size={20}/>:<Mic size={20}/>}</button>{pushControl}</>}{canOrders&&<button type="button" className="aw-icon" onClick={()=>onSwitch("support")} aria-label={"Hỗ trợ · "+supportCount+" yêu cầu"}><Bell size={20}/>{supportCount>0&&<span className="aw-dot"/>}</button>}</div></header>
  <nav className="aw-nav" aria-label="Điều hướng quản trị">{[{id:"orders",label:"Bàn",icon:Table2,allowed:canOrders,count:pendingCount},{id:"order-list",label:"Đơn món",icon:UtensilsCrossed,allowed:canOrders,count:0},{id:"support",label:"Hỗ trợ",icon:Bell,allowed:canOrders,count:supportCount},{id:"home",label:"Cài đặt",icon:Settings2,allowed:true,count:0}].filter(item=>item.allowed).map(item=><button key={item.id} type="button" onClick={()=>onSwitch(item.id)} className={(item.id==="home"?settings:tab===item.id)?"active":""} aria-current={(item.id==="home"?settings:tab===item.id)?"page":undefined}><span><item.icon size={22}/>{item.count>0&&<b>{item.count>99?"99+":item.count}</b>}</span><span>{item.label}</span></button>)}</nav>
  <div className="aw-content" ref={scroller} id="admin-content">
   {children}
  </div>
 </section>;
}
export function AdminSettingsHome({tabs,onSwitch,collected,orderCount,activeTables,updated}:{tabs:{id:string;label:string;icon:typeof Store}[];onSwitch:(tab:string)=>void;collected:number|null;orderCount:number|null;activeTables:number;updated:string}){
 const descriptions:Record<string,string>={tables:"Thêm, sửa, xóa bàn và mã QR",menu:"Món, giá bán và trạng thái còn món",settings:"Thông tin và thiết lập cửa hàng",promotions:"Ưu đãi và thời gian áp dụng",revenue:"Thu tiền, đơn hàng và quyết toán bàn",accounts:"Hồ sơ và phân quyền",stores:"Quản trị các cửa hàng"};
 const revenue=tabs.some(tab=>tab.id==="revenue");
 return <><h1 className="aw-page-title">Cài đặt</h1>{revenue&&<section className="aw-overview"><button type="button" onClick={()=>onSwitch("revenue")}><strong><ChartNoAxesCombined size={18}/>Tổng quan hôm nay</strong><ChevronRight size={18}/></button><small>Tiền đã xác nhận thanh toán · Cập nhật {updated}</small><div><span><b>{collected===null?"—":money(collected)}</b><small>Đã thu</small></span><span><b>{orderCount??"—"}</b><small>Đơn tạo hôm nay</small></span><span><b>{activeTables}</b><small>Bàn đang mở</small></span></div></section>}<div className="aw-settings-list">{tabs.filter(t=>!operationalTabs.includes(t.id)&&t.id!=="home").map(item=><button type="button" key={item.id} onClick={()=>onSwitch(item.id)}><span className="aw-setting-icon"><item.icon size={21}/></span><span><strong>{item.label}</strong><small>{descriptions[item.id]}</small></span><ChevronRight size={18}/></button>)}</div></>;
}
export function AdminBack({title,onBack}:{title:string;onBack:()=>void}){return <div className="aw-back"><button type="button" className="aw-icon" onClick={onBack} aria-label="Trở về Cài đặt"><ChevronLeft size={22}/></button><h1>{title}</h1></div>;}
