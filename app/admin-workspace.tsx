"use client";
import {useRef,useEffect} from "react";
import type {ReactNode} from "react";
import {Bell,ChevronLeft,ChevronRight,ChartNoAxesCombined,Mic,Settings2,Store,Table2,UtensilsCrossed,Volume2} from "lucide-react";
import {money,shopInitials,type Shop} from "@/lib/menu";
import type {StaffAccess} from "@/lib/staff-permissions";

export const operationalTabs=["orders","order-list","support"];
export function AdminWorkspace({shop,access,tab,onSwitch,onAudio,onListen,soundReady,canOrders,canTables,pendingCount,supportCount,children}:{shop:Shop;access:StaffAccess|null;tab:string;onSwitch:(tab:string)=>void;onAudio:()=>void;onListen:()=>void;soundReady:boolean;canOrders:boolean;canTables:boolean;pendingCount:number;supportCount:number;children:ReactNode}){
 const scroller=useRef<HTMLDivElement>(null);
 useEffect(()=>{scroller.current?.scrollTo({top:0,behavior:"instant"});},[tab]);
 const settings=!operationalTabs.includes(tab);
 return <section className="admin-workspace" aria-label={shop.name+" · Quản trị cửa hàng"}>
  <header className="aw-header"><button type="button" className="aw-brand" onClick={()=>onSwitch("accounts")} aria-label="Tài khoản và thông tin cửa hàng"><span className="aw-logo">{shop.logo?<img src={shop.logo} alt=""/>:shopInitials(shop.name)}</span><span><strong>{shop.name}</strong><small>{access?.profile?.fullName||access?.account?.name||(access?.isOwner?"Chủ cửa hàng":"Nhân viên")}</small></span></button><div className="aw-header-actions">{(canOrders||canTables)&&<><button type="button" className={"aw-icon "+(soundReady?"sound-ready":"needs-gesture")} onClick={onAudio} aria-label="Thiết lập thông báo tiếng Việt" aria-pressed={soundReady}><Mic size={20}/></button><button type="button" className={"aw-icon "+(soundReady?"sound-ready":"needs-gesture")} data-audio-test="true" onClick={onListen} aria-label="Nghe thử giọng đọc"><Volume2 size={20}/></button></>}{canOrders&&<button type="button" className="aw-icon" onClick={()=>onSwitch("support")} aria-label={"Hỗ trợ · "+supportCount+" yêu cầu"}><Bell size={20}/>{supportCount>0&&<span className="aw-dot"/>}</button>}</div></header>
  <nav className="aw-nav" aria-label="Điều hướng quản trị">{[{id:"orders",label:"Bàn",icon:Table2,allowed:canOrders,count:pendingCount},{id:"order-list",label:"Đơn món",icon:UtensilsCrossed,allowed:canOrders,count:0},{id:"support",label:"Hỗ trợ",icon:Bell,allowed:canOrders,count:supportCount},{id:"home",label:"Cài đặt",icon:Settings2,allowed:true,count:0}].filter(item=>item.allowed).map(item=><button key={item.id} type="button" onClick={()=>onSwitch(item.id)} className={(item.id==="home"?settings:tab===item.id)?"active":""} aria-current={(item.id==="home"?settings:tab===item.id)?"page":undefined}><span><item.icon size={22}/>{item.count>0&&<b>{item.count>99?"99+":item.count}</b>}</span><span>{item.label}</span></button>)}</nav>
  <div className="aw-content" ref={scroller} id="admin-content">
   {!soundReady&&(canOrders||canTables)&&<div className="aw-sound-banner" role="status"><button type="button" onClick={onListen} aria-label="Bật âm thanh chuông và giọng đọc thông báo"><Volume2 size={20}/><span>Chạm để bật âm thanh thông báo (chuông &amp; giọng đọc)</span></button></div>}
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
