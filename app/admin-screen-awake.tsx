"use client";
import {useEffect,useState} from "react";
export function AdminScreenAwake({enabled,onChange}:{enabled:boolean;onChange:(value:boolean)=>void}){
 const [status,setStatus]=useState("off");
 useEffect(()=>{if(!enabled){setStatus("off");return;}let disposed=false,pending=false;let lock:WakeLockSentinel|null=null;
 async function acquire(){if(disposed||pending||lock&&!lock.released||document.visibilityState!=="visible")return;if(!("wakeLock" in navigator)){setStatus("unsupported");return;}pending=true;setStatus("requesting");try{const next=await navigator.wakeLock.request("screen");if(disposed){await next.release();return;}lock=next;setStatus("active");next.addEventListener("release",()=>{if(lock===next)lock=null;if(!disposed)setStatus("paused");},{once:true});}catch{if(!disposed)setStatus("blocked");}finally{pending=false;}}
 const visible=()=>{if(document.visibilityState==="visible")void acquire();};void acquire();document.addEventListener("visibilitychange",visible);return()=>{disposed=true;document.removeEventListener("visibilitychange",visible);void lock?.release().catch(()=>{});};
 },[enabled]);
 const label=status==="active"?"Đang giữ màn hình sáng":status==="requesting"?"Đang bật giữ màn hình…":status==="unsupported"?"Thiết bị chưa hỗ trợ giữ màn hình":status==="blocked"?"Không thể giữ sáng · Bấm để tắt":status==="paused"?"Giữ màn hình đang tạm dừng":"Giữ màn hình sáng";
 return <div className="admin-awake"><button type="button" className="secondary" aria-pressed={enabled} onClick={()=>onChange(!enabled)}>{label}</button><small role="status">{enabled?"Giữ trang quản trị mở để nghe tiếng Việt. Khóa màn hình hoặc để máy ngủ có thể ngừng thông báo.":"Bật để hạn chế màn hình tự tắt khi trực đơn."}</small></div>;
}
