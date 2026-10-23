import {OrderError,type NormalizedOrderItem,type OrderStatus} from "./menu";

/** An explicit source never falls through to newly arrived portions on a stale screen. */
export function transitionFromStage(item:NormalizedOrderItem,from:unknown,to:OrderStatus,count:unknown):NormalizedOrderItem {
  const field=from==="new"?"newCount":from==="preparing"?"preparingCount":from==="ready"?"readyCount":null;
  if(!field || !((from==="new"&&to==="preparing")||(from==="preparing"&&(to==="ready"||to==="served"))||(from==="ready"&&to==="served")))throw new OrderError("Bước cập nhật món không hợp lệ.");
  if(typeof count!=="number"||!Number.isSafeInteger(count)||count<1)throw new OrderError("Số suất cần cập nhật không hợp lệ.");
  if(count>item[field])throw new OrderError("Số suất đã được nhân viên khác cập nhật. Vui lòng kiểm tra lại.",409);
  const target=to==="preparing"?"preparingCount":to==="ready"?"readyCount":"servedCount";
  return {...item,[field]:item[field]-count,[target]:item[target]+count};
}
