import {database,deviceIdentity} from "./server";
import {checkedText,OrderError} from "./menu";
import {settlementInsertStatement} from "./settlement-server";
import type {DiningTable} from "./menu";

export type TableSessionStatus="pending"|"active"|"closed"|"rejected";
export type TableSession={id:string;table_id:string;table_name:string;customer_name:string;status:TableSessionStatus;created_at:number;updated_at:number};
export type Connection={state:"preview"|"available"|"pending"|"active"|"blocked"|"closed"|"rejected";session?:TableSession;message?:string};
type SessionRow=TableSession&{browser_hash:string;closed_at:number|null};
const occupiedMessage="Bàn đang chờ mở hoặc chưa kết thúc lượt khách trước. Thiết bị khác không thể kết nối. Vui lòng liên hệ nhân viên.";
const inactiveMessage="Bàn chưa được mở trên trình duyệt này hoặc lượt phục vụ đã kết thúc. Vui lòng kiểm tra lại kết nối bàn.";

export function safeSession(row:SessionRow|Record<string,unknown>):TableSession{
 return {id:row.id as string,table_id:row.table_id as string,table_name:row.table_name as string,customer_name:row.customer_name as string,status:row.status as TableSessionStatus,created_at:row.created_at as number,updated_at:row.updated_at as number};
}

/** Repair only unfinished data written by an older worker after the migration ran. */
export async function ensureLegacySessions(tableId?:string){
 const db=database(),scope=tableId?"t.id = ? AND ":"",scopeValues=tableId?[tableId]:[];
 const orphans="EXISTS (SELECT 1 FROM orders o WHERE o.table_id = t.id AND o.dining_session_id IS NULL AND o.status != 'cancelled' AND (o.paid = 0 OR o.status != 'served')) OR EXISTS (SELECT 1 FROM service_requests r WHERE r.table_id = t.id AND r.session_id IS NULL AND r.status = 'open')";
 // Normal polling remains a read. The repair transaction runs only while orphan work exists.
 const orphan=await db.prepare(`SELECT t.id FROM dining_tables t WHERE ${scope}(${orphans}) LIMIT 1`).bind(...scopeValues).first();
 if(!orphan)return;
 const now=Date.now(),rowScope=tableId?" AND table_id = ?":"";
 await db.batch([
  // A pending reservation has no authority over a previous customer's unfinished work.
  // Replace it with a legacy lock so rejecting that reservation cannot free the table.
  db.prepare(`UPDATE table_sessions SET status = 'rejected', updated_at = ?, closed_at = ? WHERE status = 'pending' AND table_id IN (SELECT t.id FROM dining_tables t WHERE ${scope}(${orphans}))`).bind(now,now,...scopeValues),
  // Each later orphan gets a fresh legacy session if its earlier session was already closed.
  db.prepare(`INSERT OR IGNORE INTO table_sessions (id,table_id,table_name,browser_hash,customer_name,status,created_at,updated_at,closed_at) SELECT 'legacy-' || lower(hex(randomblob(16))),t.id,t.name,'','Khách trước khi cập nhật','active',?,?,NULL FROM dining_tables t WHERE ${scope}NOT EXISTS (SELECT 1 FROM table_sessions s WHERE s.table_id = t.id AND s.status IN ('pending','active')) AND (${orphans})`).bind(now,now,...scopeValues),
  // Retain the old browser identity, so its history cannot become visible to a current guest.
  db.prepare(`UPDATE orders SET dining_session_id = (SELECT s.id FROM table_sessions s WHERE s.table_id = orders.table_id AND s.status = 'active'), customer_name = CASE WHEN customer_name = '' THEN 'Khách trước khi cập nhật' ELSE customer_name END WHERE dining_session_id IS NULL AND status != 'cancelled' AND (paid = 0 OR status != 'served')${rowScope} AND EXISTS (SELECT 1 FROM table_sessions s WHERE s.table_id = orders.table_id AND s.status = 'active')`).bind(...scopeValues),
  db.prepare(`UPDATE service_requests SET session_id = (SELECT s.id FROM table_sessions s WHERE s.table_id = service_requests.table_id AND s.status = 'active') WHERE session_id IS NULL AND status = 'open'${rowScope} AND EXISTS (SELECT 1 FROM table_sessions s WHERE s.table_id = service_requests.table_id AND s.status = 'active')`).bind(...scopeValues)
 ]);
}

export async function getConnection(table:DiningTable,browserHash:string,preview=false):Promise<Connection>{
 if(preview)return {state:"preview"};
 await ensureLegacySessions(table.id);
 const db=database(),live=await db.prepare("SELECT * FROM table_sessions WHERE table_id = ? AND status IN ('pending','active')").bind(table.id).first<SessionRow>();
 if(live)return live.browser_hash===browserHash?{state:live.status,session:safeSession(live)}:{state:"blocked",message:occupiedMessage};
 // This also blocks any outstanding order inserted by an older deployment during rollout.
 const legacy=await db.prepare("SELECT id FROM orders WHERE table_id = ? AND dining_session_id IS NULL AND status != 'cancelled' AND (paid = 0 OR status != 'served') LIMIT 1").bind(table.id).first();
 if(legacy)return {state:"blocked",message:"Bàn còn đơn của lượt khách trước. Vui lòng liên hệ nhân viên để xử lý và đóng bàn."};
 const previous=await db.prepare("SELECT * FROM table_sessions WHERE table_id = ? AND browser_hash = ? ORDER BY created_at DESC, id DESC LIMIT 1").bind(table.id,browserHash).first<SessionRow>();
 if(previous&&(previous.status==="closed"||previous.status==="rejected"))return {state:previous.status,session:safeSession(previous),message:previous.status==="closed"?"Lượt phục vụ trước đã kết thúc. Nhập tên để gửi yêu cầu mở bàn mới.":"Yêu cầu mở bàn đã được từ chối. Vui lòng liên hệ nhân viên hoặc gửi lại yêu cầu với tên khách đúng."};
 return {state:"available"};
}

/**
 * A transfer follows the authenticated visit, never whoever now occupies its old
 * QR table. A session hint only disambiguates this cookie's own live visits; it
 * grants no access by itself. Without a hint, prefer the visit at the scanned
 * table, then follow a single unambiguous transferred visit owned by this cookie.
 */
export async function getMenuConnection(table:DiningTable,browserHash:string,preview=false,rawSessionHint:string|null=null):Promise<{table:DiningTable;connection:Connection}>{
 if(preview)return {table,connection:{state:"preview"}};
 const sessionHint=rawSessionHint===null?null:checkedText(rawSessionHint,60,true);
 await ensureLegacySessions(table.id);
 const rows=await database().prepare(`
  SELECT s.*,t.id AS current_table_id,t.name AS current_table_name,t.zone AS current_table_zone,t.token AS current_table_token
  FROM table_sessions s JOIN dining_tables t ON t.id = s.table_id
  WHERE s.browser_hash = ? AND s.status IN ('pending','active')
   AND (s.table_id = ? OR (s.status = 'active' AND EXISTS (
    SELECT 1 FROM table_transfers r WHERE r.session_id = s.id AND (r.from_table_id = ? OR r.to_table_id = ?)
   )))${sessionHint?" AND s.id = ?":""}
  ORDER BY CASE WHEN s.table_id = ? THEN 0 ELSE 1 END,s.created_at DESC,s.id DESC LIMIT 2
 `).bind(browserHash,table.id,table.id,table.id,...(sessionHint?[sessionHint]:[]),table.id).all<SessionRow&{current_table_id:string;current_table_name:string;current_table_zone:string;current_table_token:string}>();
 const owned=rows.results[0];
 if(owned&&(sessionHint||rows.results.length===1||owned.table_id===table.id)){
  const currentTable:DiningTable={id:owned.current_table_id,name:owned.current_table_name,zone:owned.current_table_zone,token:owned.current_table_token};
  return {table:currentTable,connection:{state:owned.status as "pending"|"active",session:safeSession({...owned,table_name:currentTable.name})}};
 }
 return {table,connection:await getConnection(table,browserHash)};
}

export async function requestTableSession(request:Request,table:DiningTable,rawName:unknown):Promise<{connection:Connection;created:boolean}>{
 const customerName=checkedText(rawName,80,true),{hash}=await deviceIdentity(request),db=database();
 const current=await getConnection(table,hash);
 if(current.state==="pending"||current.state==="active")return {connection:current,created:false};
 if(current.state==="blocked")throw new OrderError(current.message??occupiedMessage,409);
 const id=crypto.randomUUID(),now=Date.now();
 // A partial unique index is the final authority if two different browsers race this insert.
 const inserted=await db.prepare("INSERT OR IGNORE INTO table_sessions (id,table_id,table_name,browser_hash,customer_name,status,created_at,updated_at,closed_at) SELECT ?,?,?,?,?, 'pending',?,?,NULL WHERE NOT EXISTS (SELECT 1 FROM table_sessions WHERE table_id = ? AND status IN ('pending','active')) AND NOT EXISTS (SELECT 1 FROM orders WHERE table_id = ? AND dining_session_id IS NULL AND status != 'cancelled' AND (paid = 0 OR status != 'served')) AND (SELECT COUNT(*) FROM table_sessions WHERE browser_hash = ? AND created_at > ?) < 6").bind(id,table.id,table.name,hash,customerName,now,now,table.id,table.id,hash,now-600000).run();
 const connection=await getConnection(table,hash);
 if(connection.state==="pending"||connection.state==="active")return {connection,created:inserted.meta.changes===1};
 if(connection.state==="blocked")throw new OrderError(connection.message??occupiedMessage,409);
 const recent=await db.prepare("SELECT COUNT(*) AS count FROM table_sessions WHERE browser_hash = ? AND created_at > ?").bind(hash,now-600000).first<{count:number}>();
 if((recent?.count??0)>=6)throw new OrderError("Bạn đã gửi nhiều yêu cầu mở bàn. Vui lòng liên hệ nhân viên hoặc thử lại sau ít phút.",429);
 throw new OrderError("Trạng thái bàn vừa thay đổi. Vui lòng tải lại trước khi gửi yêu cầu.",409);
}

export async function requireActiveSession(request:Request,table:DiningTable,sessionId:unknown,allowTransferredTable=false):Promise<SessionRow>{
 const {hash}=await deviceIdentity(request);
 if(typeof sessionId!=="string"||sessionId.length>60||!sessionId)throw new OrderError(inactiveMessage,403);
 const session=await database().prepare(`SELECT * FROM table_sessions WHERE id = ? AND (table_id = ?${allowTransferredTable?" OR EXISTS (SELECT 1 FROM table_transfers r WHERE r.session_id = table_sessions.id AND (r.from_table_id = ? OR r.to_table_id = ?))":""}) AND browser_hash = ? AND status = 'active'`).bind(sessionId,table.id,...(allowTransferredTable?[table.id,table.id]:[]),hash).first<SessionRow>();
 if(!session)throw new OrderError(inactiveMessage,403);
 return session;
}

export async function getAdminSessions():Promise<TableSession[]>{
 const sessions=await database().prepare("SELECT s.id,s.table_id,t.name AS table_name,s.customer_name,s.status,s.created_at,s.updated_at FROM table_sessions s JOIN dining_tables t ON t.id = s.table_id WHERE s.status IN ('pending','active') ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END,s.created_at").all<TableSession>();
 return sessions.results;
}

export async function updateTableSession(rawId:unknown,action:unknown){
 const id=checkedText(rawId,60,true),db=database(),now=Date.now();
 if(action==="approve"||action==="reject"){
  const changed=await db.prepare("UPDATE table_sessions SET status = ?, updated_at = ?, closed_at = ? WHERE id = ? AND status = 'pending'").bind(action==="approve"?"active":"rejected",now,action==="reject"?now:null,id).run();
  if(changed.meta.changes!==1)throw new OrderError("Yêu cầu mở bàn đã thay đổi. Vui lòng tải lại trước khi thao tác.",409);
  return {};
 }
 if(action!=="close")throw new OrderError("Thao tác với bàn không hợp lệ.");
 // Insertion of an order checks the same active session in its own write statement.
 // Closing and ordering are thus mutually exclusive even when their prechecks raced.
 const results=await db.batch([
  db.prepare("UPDATE table_sessions SET status = 'closed', updated_at = ?, closed_at = ? WHERE id = ? AND status = 'active' AND NOT EXISTS (SELECT 1 FROM orders WHERE table_id = table_sessions.table_id AND status != 'cancelled' AND (paid = 0 OR status != 'served'))").bind(now,now,id),
  settlementInsertStatement(id,now),
  db.prepare("UPDATE service_requests SET status = 'done' WHERE session_id = ? AND changes() = 1 AND EXISTS (SELECT 1 FROM table_sessions WHERE id = ? AND status = 'closed' AND closed_at = ?)").bind(id,id,now)
 ]);
 if(results[0].meta.changes!==1)throw new OrderError("Chưa thể đóng bàn: cần phục vụ xong và thanh toán các đơn, hoặc trạng thái bàn vừa thay đổi.",409);
 return {settlementSessionId:id};
}
