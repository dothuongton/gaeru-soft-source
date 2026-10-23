import {database} from "./server";
import {checkedText,OrderError,type DiningTable} from "./menu";
import type {TableSession} from "./table-sessions";
export const CALL_COOLDOWN_MS=30_000;
export async function recordServiceReminder(table:DiningTable,session:TableSession&{browser_hash:string},body:Record<string,unknown>){
 const kind=body.kind;if(kind!=="service"&&kind!=="bill")throw new OrderError("Yêu cầu không hợp lệ.");
 const note=checkedText(body.note??"",300),db=database(),id=session.id+":"+kind,now=Date.now();
 // Old clients can safely repeat a pending request without creating a second alert.
 const legacy=body.requestId===undefined;
 const requestId=legacy?crypto.randomUUID():checkedText(body.requestId,36,true);
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId))throw new OrderError("Mã yêu cầu hỗ trợ không hợp lệ.");
 const existing=await db.prepare("SELECT request_id,session_id,kind,note FROM service_request_events WHERE request_id = ?").bind(requestId).first<{session_id:string;kind:string;note:string}>();
 if(existing){if(existing.session_id!==session.id||existing.kind!==kind||existing.note!==note)throw new OrderError("Mã yêu cầu đã được sử dụng.",409);return {ok:true,accepted:false,replayed:true,...await callState(id)};}
 const prior=await callState(id);
 if(legacy&&prior.status==="open"&&prior.nextAllowedAt>now)return {ok:true,accepted:false,replayed:true,...prior};
 const attemptId=crypto.randomUUID();
 const results=await db.batch([
  db.prepare(`INSERT OR IGNORE INTO service_request_events (request_id,attempt_id,session_id,kind,note,created_at)
   SELECT ?,?,s.id,?,?,? FROM table_sessions s WHERE s.id = ? AND s.table_id = ? AND s.browser_hash = ? AND s.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM service_requests r WHERE r.session_id = s.id AND r.kind = ? AND r.created_at > ?)
    AND (SELECT COUNT(*) FROM service_request_events e WHERE e.session_id = s.id AND e.kind = ? AND e.created_at > ?) < 12
  `).bind(requestId,attemptId,kind,note,now,session.id,table.id,session.browser_hash,kind,now-CALL_COOLDOWN_MS,kind,now-600_000),
  db.prepare(`INSERT INTO service_requests (id,table_id,table_name,session_id,kind,status,created_at,note,request_count,pending_count)
   SELECT ?,?,?,e.session_id,e.kind,'open',e.created_at,e.note,1,1 FROM service_request_events e WHERE e.request_id = ? AND e.attempt_id = ?
   ON CONFLICT(id) DO UPDATE SET status = 'open',note = excluded.note,table_name = excluded.table_name,created_at = MAX(service_requests.created_at + 1,excluded.created_at),request_count = service_requests.request_count + 1,pending_count = CASE WHEN service_requests.status = 'open' THEN service_requests.pending_count + 1 ELSE 1 END
  `).bind(id,table.id,table.name,requestId,attemptId),
  db.prepare("SELECT attempt_id,session_id,kind,note FROM service_request_events WHERE request_id = ?").bind(requestId)
 ]);
 const saved=results[2].results[0] as {attempt_id:string;session_id:string;kind:string;note:string}|undefined;
 if(!saved){
  const active=await db.prepare("SELECT id FROM table_sessions WHERE id = ? AND table_id = ? AND browser_hash = ? AND status = 'active'").bind(session.id,table.id,session.browser_hash).first();
  if(!active)throw new OrderError("Lượt phục vụ đã kết thúc. Không gửi thêm yêu cầu.",409);
  const latest=await callState(id),wait=Math.max(1,Math.ceil((latest.nextAllowedAt-now)/1000));
  throw new OrderError(latest.nextAllowedAt>now?`Yêu cầu trước đã gửi. Vui lòng chờ ${wait} giây để nhắc lại.`:"Bạn đã nhắc nhiều lần. Vui lòng chờ vài phút hoặc liên hệ nhân viên trực tiếp.",429);
 }
 if(saved.session_id!==session.id||saved.kind!==kind||saved.note!==note)throw new OrderError("Mã yêu cầu đã được sử dụng.",409);
 return {ok:true,accepted:saved.attempt_id===attemptId,replayed:saved.attempt_id!==attemptId,...await callState(id)};
}
async function callState(id:string){const row=await database().prepare("SELECT status,created_at,request_count,pending_count FROM service_requests WHERE id = ?").bind(id).first<{status:string;created_at:number;request_count:number;pending_count:number}>();return {status:row?.status??null,requestCount:row?.request_count??0,pendingCount:row?.pending_count??0,nextAllowedAt:row?row.created_at+CALL_COOLDOWN_MS:0};}
