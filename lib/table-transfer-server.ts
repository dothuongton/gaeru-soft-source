import {database} from "./server";
import {checkedText,OrderError} from "./menu";
import {safeSession} from "./table-sessions";
import type {TableTransfer,TableTransferResult} from "./table-transfer-types";

type TransferRow={id:string;request_id:string;request_hash:string;session_id:string;from_table_id:string;from_table_name:string;to_table_id:string;to_table_name:string;transferred_at:number};

export function publicTransfer(row:Record<string,unknown>):TableTransfer{
 return {id:row.id as string,requestId:row.request_id as string,sessionId:row.session_id as string,fromTableId:row.from_table_id as string,fromTableName:row.from_table_name as string,toTableId:row.to_table_id as string,toTableName:row.to_table_name as string,transferredAt:row.transferred_at as number};
}

/**
 * Keep the visit identity and all business facts; only its current table changes.
 * The guarded audit INSERT and every move execute in one D1 transaction. Its
 * private attempt id is deliberately different from the caller's request id:
 * a replay can return its first receipt, but can never move a visit again.
 */
export async function transferTable(body:Record<string,unknown>):Promise<TableTransferResult>{
 const sessionId=checkedText(body.sessionId,60,true),fromTableId=checkedText(body.fromTableId,60,true),toTableId=checkedText(body.toTableId,60,true);
 const requestId=checkedText(body.requestId,36,true).toLowerCase(),expectedUpdatedAt=body.expectedUpdatedAt;
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestId))throw new OrderError("Mã xác nhận đổi bàn không hợp lệ. Vui lòng tải lại trang.");
 if(typeof expectedUpdatedAt!=="number"||!Number.isSafeInteger(expectedUpdatedAt)||expectedUpdatedAt<0)throw new OrderError("Trạng thái bàn không hợp lệ. Vui lòng tải lại trang.");
 if(fromTableId===toTableId)throw new OrderError("Vui lòng chọn một bàn khác để chuyển.");
 const normalized=JSON.stringify({sessionId,fromTableId,expectedUpdatedAt,toTableId});
 const requestHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(normalized))),byte=>byte.toString(16).padStart(2,"0")).join("");
 const db=database(),attemptId=crypto.randomUUID(),now=Date.now();
 const result=await db.batch([
  db.prepare(`
   INSERT OR IGNORE INTO table_transfers
    (id,request_id,request_hash,session_id,from_table_id,from_table_name,to_table_id,to_table_name,transferred_at)
   SELECT ?,?,?,s.id,s.table_id,COALESCE(previous.name,s.table_name),target.id,target.name,MAX(?,s.updated_at + 1)
   FROM table_sessions s
   LEFT JOIN dining_tables previous ON previous.id = s.table_id
   JOIN dining_tables target ON target.id = ?
   WHERE s.id = ? AND s.status = 'active' AND s.table_id = ? AND s.updated_at = ?
    AND target.id != s.table_id
    AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.table_id = s.table_id AND COALESCE(o.dining_session_id,'') != s.id AND o.status != 'cancelled' AND (o.paid = 0 OR o.status != 'served'))
    AND NOT EXISTS (SELECT 1 FROM service_requests r WHERE r.table_id = s.table_id AND COALESCE(r.session_id,'') != s.id AND r.status = 'open')
    AND NOT EXISTS (SELECT 1 FROM table_sessions occupied WHERE occupied.table_id = target.id AND occupied.status IN ('pending','active'))
    AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.table_id = target.id AND o.status != 'cancelled' AND (o.paid = 0 OR o.status != 'served'))
    AND NOT EXISTS (SELECT 1 FROM service_requests r WHERE r.table_id = target.id AND r.status = 'open')
  `).bind(attemptId,requestId,requestHash,now,toTableId,sessionId,fromTableId,expectedUpdatedAt),
  db.prepare(`
   UPDATE table_sessions
   SET table_id = (SELECT to_table_id FROM table_transfers WHERE id = ?),
    table_name = (SELECT to_table_name FROM table_transfers WHERE id = ?),
    updated_at = (SELECT transferred_at FROM table_transfers WHERE id = ?)
   WHERE id = ? AND EXISTS (SELECT 1 FROM table_transfers r WHERE r.id = ? AND r.session_id = table_sessions.id)
  `).bind(attemptId,attemptId,attemptId,sessionId,attemptId),
  db.prepare(`
   UPDATE orders
   SET table_id = (SELECT to_table_id FROM table_transfers WHERE id = ?),
    table_name = (SELECT to_table_name FROM table_transfers WHERE id = ?)
   WHERE dining_session_id = ? AND EXISTS (SELECT 1 FROM table_transfers r WHERE r.id = ? AND r.session_id = orders.dining_session_id)
  `).bind(attemptId,attemptId,sessionId,attemptId),
  db.prepare(`
   UPDATE service_requests
   SET table_id = (SELECT to_table_id FROM table_transfers WHERE id = ?),
    table_name = (SELECT to_table_name FROM table_transfers WHERE id = ?)
   WHERE session_id = ? AND EXISTS (SELECT 1 FROM table_transfers r WHERE r.id = ? AND r.session_id = service_requests.session_id)
  `).bind(attemptId,attemptId,sessionId,attemptId),
  db.prepare(`
   UPDATE table_payment_receipts
   SET table_id = (SELECT to_table_id FROM table_transfers WHERE id = ?),
    table_name = (SELECT to_table_name FROM table_transfers WHERE id = ?)
   WHERE session_id = ? AND EXISTS (SELECT 1 FROM table_transfers r WHERE r.id = ? AND r.session_id = table_payment_receipts.session_id)
  `).bind(attemptId,attemptId,sessionId,attemptId),
  db.prepare("SELECT * FROM table_transfers WHERE request_id = ?").bind(requestId),
  db.prepare("SELECT s.id,s.table_id,COALESCE(t.name,s.table_name) AS table_name,s.customer_name,s.status,s.created_at,s.updated_at FROM table_sessions s LEFT JOIN dining_tables t ON t.id = s.table_id WHERE s.id = ?").bind(sessionId)
 ]);
 const receipt=result[5].results[0] as TransferRow|undefined;
 if(!receipt)throw new OrderError("Chưa đổi bàn: bàn cũ vừa thay đổi, hoặc bàn mới đang có khách hay còn yêu cầu chưa xử lý. Vui lòng tải lại và chọn bàn trống.",409);
 if(receipt.request_hash!==requestHash)throw new OrderError("Mã xác nhận đã dùng cho lần đổi bàn khác. Vui lòng tải lại và xác nhận lại.",409);
 const session=result[6].results[0] as Record<string,unknown>|undefined;
 if(!session)throw new OrderError("Không tìm thấy lượt phục vụ của lần đổi bàn này.",409);
 return {ok:true,replayed:receipt.id!==attemptId,transfer:publicTransfer(receipt),session:safeSession(session)};
}
