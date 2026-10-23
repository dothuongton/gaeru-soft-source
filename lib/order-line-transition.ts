import {OrderError,type NormalizedOrderItem,type OrderStatus} from "./menu";

/** An explicit source never falls through to newly arrived portions on a stale screen. */
export function transitionFromStage(item:NormalizedOrderItem,from:unknown,to:OrderStatus,count:unknown):NormalizedOrderItem {
  if(from==="waiting"&&to==="served"){
    if(typeof count!=="number"||!Number.isSafeInteger(count)||count<1||count>item.preparingCount+item.readyCount)throw new OrderError("Số suất chờ phục vụ vừa thay đổi. Vui lòng kiểm tra lại.",409);
    const ready=Math.min(count,item.readyCount);return {...item,readyCount:item.readyCount-ready,preparingCount:item.preparingCount-(count-ready),servedCount:item.servedCount+count};
  }
  const field=from==="new"?"newCount":from==="preparing"?"preparingCount":from==="ready"?"readyCount":null;
  if(!field || !((from==="new"&&to==="preparing")||(from==="preparing"&&(to==="ready"||to==="served"))||(from==="ready"&&to==="served")))throw new OrderError("Bước cập nhật món không hợp lệ.");
  if(typeof count!=="number"||!Number.isSafeInteger(count)||count<1)throw new OrderError("Số suất cần cập nhật không hợp lệ.");
  if(count>item[field])throw new OrderError("Số suất đã được nhân viên khác cập nhật. Vui lòng kiểm tra lại.",409);
  const target=to==="preparing"?"preparingCount":to==="ready"?"readyCount":"servedCount";
  return {...item,[field]:item[field]-count,[target]:item[target]+count};
}


/** Cancel only unpaid, unserved portions. Keep their original snapshot and audit. */
export function cancelUnservedLine(item:NormalizedOrderItem,count:unknown,reason:string,requestId:string,at:number):NormalizedOrderItem {
 if(typeof count!=="number"||!Number.isSafeInteger(count)||count<1)throw new OrderError("Số suất cần hủy không hợp lệ.");
 if(count>item.quantity-item.servedCount)throw new OrderError("Chỉ hủy được số suất chưa phục vụ. Món có thể vừa được nhân viên khác cập nhật.",409);
 let remaining=count;
 const next={...item};
 for(const stage of ["newCount","preparingCount","readyCount"] as const){const remove=Math.min(remaining,next[stage]);next[stage]-=remove;remaining-=remove;}
 if(remaining)throw new OrderError("Trạng thái món đã thay đổi. Vui lòng tải lại.",409);
 next.quantity-=count;next.total=next.unitPrice*next.quantity;
 next.cancellations=[...(item.cancellations??[]),{requestId,quantity:count,reason,at}];
 return next;
}
