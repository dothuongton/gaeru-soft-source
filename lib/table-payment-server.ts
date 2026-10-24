import {database,publicOrder} from "./server";
import {checkedText,OrderError} from "./menu";
import {safeSession,ensureLegacySessions} from "./table-sessions";
import type {TablePaymentQuote,TablePaymentResult} from "./table-payment-types";

type ReceiptRow={
 id:string;request_id:string;request_hash:string;session_id:string;
 order_ids_json:string;amount:number;payment_method:TablePaymentResult["receipt"]["paymentMethod"];paid_at:number;
};
const MAX_ORDERS=600;
const changedMessage="Số tiền hoặc danh sách đơn của bàn vừa thay đổi. Chưa ghi nhận thanh toán. Vui lòng tải lại và kiểm tra số tiền còn lại.";

/** The quote and its unpaid orders come from one consistent D1 read snapshot. */
export async function getTablePaymentQuote(params:URLSearchParams):Promise<TablePaymentQuote>{
 let rawSession=params.get("session")??params.get("sessionId");
 const rawTable=params.get("tableId")??params.get("table");
 const db=database();
 if(!rawSession?.trim()&&rawTable?.trim()){
  const tableId=checkedText(rawTable,64,true);
  const active=await db.prepare("SELECT id FROM table_sessions WHERE table_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").bind(tableId).first<{id:string}>();
  if(active?.id) rawSession=active.id;
  else {
   const withUnpaid=await db.prepare("SELECT s.id FROM table_sessions s WHERE s.table_id = ? AND EXISTS (SELECT 1 FROM orders o WHERE o.dining_session_id = s.id AND o.paid = 0 AND o.status != 'cancelled') ORDER BY s.updated_at DESC LIMIT 1").bind(tableId).first<{id:string}>();
   if(withUnpaid?.id) rawSession=withUnpaid.id;
   else {
    await ensureLegacySessions(tableId);
    const repaired=await db.prepare("SELECT id FROM table_sessions WHERE table_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").bind(tableId).first<{id:string}>();
    if(repaired?.id) rawSession=repaired.id;
   }
  }
 }
 if(!rawSession?.trim())throw new OrderError("Thiếu mã phiên bàn. Đóng bảng thanh toán và mở lại từ bàn đang phục vụ.",400);
 const sessionId=checkedText(rawSession,128,true);
 const result=await db.batch([
  db.prepare("SELECT s.id,s.table_id,COALESCE(t.name,s.table_name) AS table_name,s.customer_name,s.status,s.created_at,s.updated_at FROM table_sessions s LEFT JOIN dining_tables t ON t.id = s.table_id WHERE s.id = ?").bind(sessionId),
  db.prepare(`SELECT
   COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END),0) AS total,
   COALESCE(SUM(CASE WHEN status != 'cancelled' AND paid = 1 THEN total ELSE 0 END),0) AS paidTotal,
   COALESCE(SUM(CASE WHEN status != 'cancelled' AND paid = 0 THEN total ELSE 0 END),0) AS unpaidTotal,
   COUNT(CASE WHEN status != 'cancelled' AND paid = 0 THEN 1 END) AS unpaidCount,
   COUNT(CASE WHEN status NOT IN ('cancelled','served') THEN 1 END) AS unservedCount
   FROM orders WHERE dining_session_id = ?`).bind(sessionId),
  db.prepare("SELECT * FROM orders WHERE dining_session_id = ? AND paid = 0 AND status != 'cancelled' ORDER BY created_at ASC,id ASC").bind(sessionId)
 ]);
 const session=result[0].results[0] as Record<string,unknown>|undefined;
 if(!session)throw new OrderError("Không tìm thấy lượt phục vụ của bàn.",404);
 if(session.status!=="active")throw new OrderError("Bàn chưa mở hoặc lượt phục vụ đã kết thúc. Vui lòng tải lại trang.",409);
 const totals=result[1].results[0] as Pick<TablePaymentQuote,"total"|"paidTotal"|"unpaidTotal"|"unpaidCount"|"unservedCount">|undefined;
 if(!totals)throw new OrderError("Chưa lấy được số tiền của bàn. Vui lòng thử lại.",503);
 return {session:safeSession(session),generatedAt:Date.now(),...totals,orders:(result[2].results as Record<string,unknown>[]).map(publicOrder)};
}

/**
 * Confirm all and only the unpaid orders shown in the cashier's quote.
 * The guarded receipt INSERT and the order UPDATE share a D1 transaction, so
 * another order, cancellation, cashier or close cannot interleave between them.
 * A private per-attempt ID prevents a replay from changing any orders, even
 * after the customer orders again or the original session has been closed.
 */
export async function payTableBalance(body:Record<string,unknown>,actor="Nhân viên"):Promise<TablePaymentResult>{
 const sessionId=checkedText(body.sessionId,128,true),requestId=checkedText(body.requestId,36,true).toLowerCase();
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestId))throw new OrderError("Mã xác nhận thanh toán không hợp lệ. Vui lòng tải lại trang.");
 if(!Array.isArray(body.orderIds)||body.orderIds.length<1||body.orderIds.length>MAX_ORDERS)throw new OrderError("Vui lòng kiểm tra danh sách đơn cần thanh toán. Mỗi lần xác nhận tối đa 600 đơn.");
 const orderIds=body.orderIds.map(id=>checkedText(id,60,true)).sort();
 if(new Set(orderIds).size!==orderIds.length)throw new OrderError("Danh sách đơn thanh toán bị trùng. Vui lòng tải lại trang.");
 const amount=body.expectedTotal;
 if(typeof amount!=="number"||!Number.isSafeInteger(amount)||amount<=0)throw new OrderError("Số tiền thanh toán không hợp lệ.");
 if(body.paymentMethod!=="cash"&&body.paymentMethod!=="bank"&&body.paymentMethod!=="other")throw new OrderError("Vui lòng chọn phương thức thanh toán.");
 const paymentMethod=body.paymentMethod,orderIdsJson=JSON.stringify(orderIds);
 const normalized=JSON.stringify({sessionId,orderIds,expectedTotal:amount,paymentMethod});
 const requestHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(normalized))),byte=>byte.toString(16).padStart(2,"0")).join("");
 const db=database(),attemptId=crypto.randomUUID(),paidAt=Date.now();
 let result;
 try {
  result=await db.batch([
   db.prepare(`
    INSERT OR IGNORE INTO table_payment_receipts
     (id,request_id,request_hash,session_id,table_id,table_name,customer_name,order_ids_json,order_count,amount,payment_method,paid_at,orders_json,audit_json)
    SELECT ?,?,?,s.id,s.table_id,COALESCE(t.name,s.table_name),s.customer_name,?,?,?,?,?,
     (SELECT json_group_array(json_object('id',o.id,'code',o.code,'table_id',o.table_id,'table_name',o.table_name,'dining_session_id',o.dining_session_id,'customer_name',o.customer_name,'items',json(o.items),'total',o.total,'note',o.note,'status',o.status,'paid',o.paid,'paid_at',o.paid_at,'payment_method',o.payment_method,'cancel_reason',o.cancel_reason,'created_at',o.created_at,'updated_at',o.updated_at)) FROM (SELECT * FROM orders WHERE dining_session_id = s.id ORDER BY created_at,id) o),
     (SELECT json_group_array(json_object('id',a.id,'kind',a.kind,'actor',a.actor,'at',a.at,'before',json(a.before_json),'after',json(a.after_json))) FROM order_audit a WHERE a.session_id = s.id)
    FROM table_sessions s LEFT JOIN dining_tables t ON t.id = s.table_id
    WHERE s.id = ? AND s.status = 'active'
     AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.dining_session_id = s.id AND o.status NOT IN ('cancelled','served'))
     AND (SELECT COUNT(*) FROM orders o WHERE o.dining_session_id = s.id AND o.paid = 0 AND o.status != 'cancelled') = ?
     AND (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.dining_session_id = s.id AND o.paid = 0 AND o.status != 'cancelled') = ?
     AND NOT EXISTS (
      SELECT 1 FROM orders o WHERE o.dining_session_id = s.id AND o.paid = 0 AND o.status != 'cancelled'
       AND o.id NOT IN (SELECT value FROM json_each(?))
     )
   `).bind(attemptId,requestId,requestHash,orderIdsJson,orderIds.length,amount,paymentMethod,paidAt,sessionId,orderIds.length,amount,orderIdsJson),
   db.prepare(`
    UPDATE orders SET paid = 1,paid_at = ?,payment_method = ?,updated_at = ?,last_actor = ?
    WHERE dining_session_id = ? AND paid = 0 AND status != 'cancelled'
     AND EXISTS (
      SELECT 1 FROM table_payment_receipts r
      WHERE r.id = ? AND r.session_id = orders.dining_session_id
       AND orders.id IN (SELECT value FROM json_each(r.order_ids_json))
     )
   `).bind(paidAt,paymentMethod,paidAt,actor,sessionId,attemptId),
   db.prepare("SELECT id,request_id,request_hash,session_id,order_ids_json,amount,payment_method,paid_at FROM table_payment_receipts WHERE request_id = ?").bind(requestId)
  ]);
 } catch {
  result=await db.batch([
   db.prepare(`
    INSERT OR IGNORE INTO table_payment_receipts
     (id,request_id,request_hash,session_id,table_id,table_name,customer_name,order_ids_json,order_count,amount,payment_method,paid_at)
    SELECT ?,?,?,s.id,s.table_id,COALESCE(t.name,s.table_name),s.customer_name,?,?,?,?,?
    FROM table_sessions s LEFT JOIN dining_tables t ON t.id = s.table_id
    WHERE s.id = ? AND s.status = 'active'
     AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.dining_session_id = s.id AND o.status NOT IN ('cancelled','served'))
     AND (SELECT COUNT(*) FROM orders o WHERE o.dining_session_id = s.id AND o.paid = 0 AND o.status != 'cancelled') = ?
     AND (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.dining_session_id = s.id AND o.paid = 0 AND o.status != 'cancelled') = ?
     AND NOT EXISTS (
      SELECT 1 FROM orders o WHERE o.dining_session_id = s.id AND o.paid = 0 AND o.status != 'cancelled'
       AND o.id NOT IN (SELECT value FROM json_each(?))
     )
   `).bind(attemptId,requestId,requestHash,orderIdsJson,orderIds.length,amount,paymentMethod,paidAt,sessionId,orderIds.length,amount,orderIdsJson),
   db.prepare(`
    UPDATE orders SET paid = 1,paid_at = ?,payment_method = ?,updated_at = ?
    WHERE dining_session_id = ? AND paid = 0 AND status != 'cancelled'
     AND EXISTS (
      SELECT 1 FROM table_payment_receipts r
      WHERE r.id = ? AND r.session_id = orders.dining_session_id
       AND orders.id IN (SELECT value FROM json_each(r.order_ids_json))
     )
   `).bind(paidAt,paymentMethod,paidAt,sessionId,attemptId),
   db.prepare("SELECT id,request_id,request_hash,session_id,order_ids_json,amount,payment_method,paid_at FROM table_payment_receipts WHERE request_id = ?").bind(requestId)
  ]);
 }
 const receipt=result[2].results[0] as ReceiptRow|undefined;
 if(!receipt){
  const pending=await db.prepare("SELECT COUNT(*) AS count FROM orders WHERE dining_session_id = ? AND status NOT IN ('cancelled','served')").bind(sessionId).first<{count:number}>();
  if(pending?.count)throw new OrderError("Bàn còn món chưa phục vụ. Hãy phục vụ hoặc hủy món đặt nhầm trước khi thanh toán.",409);
  throw new OrderError(changedMessage,409);
 }
 if(receipt.request_hash!==requestHash)throw new OrderError("Mã xác nhận đã dùng cho nội dung thanh toán khác. Vui lòng tải lại và xác nhận lại số tiền.",409);
 return {ok:true,replayed:receipt.id!==attemptId,receipt:{requestId:receipt.request_id,sessionId:receipt.session_id,orderIds:JSON.parse(receipt.order_ids_json) as string[],amount:receipt.amount,paymentMethod:receipt.payment_method,paidAt:receipt.paid_at}};
}
