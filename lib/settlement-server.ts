import {database,publicOrder} from "./server";
import {checkedText,OrderError} from "./menu";
import type {Order} from "./menu";
import type {SettlementDetail,SettlementPage,TableSettlement} from "./settlement-types";
import {publicTransfer} from "./table-transfer-server";

const DAY=86_400_000,VN_OFFSET=25_200_000,PAGE_SIZE=20;
type Range={from:string;to:string;days:number;tableId:string|null;start:number;end:number};

/**
 * Run immediately after the conditional session-close UPDATE in the SAME D1
 * batch. changes() prevents a lost/duplicate close from creating an archive.
 * An insertion failure rolls back the preceding close, preserving the session.
 * The archive deliberately contains only the public order projection: identity
 * cookies, browser hashes and idempotency secrets must never enter receipts.
 */
export function settlementInsertStatement(sessionId:string,closedAt:number){
 return database().prepare(`
  INSERT INTO table_settlements
   (session_id,table_id,table_name,customer_name,opened_at,closed_at,order_count,valid_order_count,cancelled_count,total,paid_total,cancelled_total,orders_json)
  SELECT s.id,s.table_id,COALESCE(t.name,s.table_name),s.customer_name,s.created_at,s.closed_at,
   (SELECT COUNT(*) FROM orders WHERE dining_session_id = s.id),
   (SELECT COUNT(*) FROM orders WHERE dining_session_id = s.id AND status != 'cancelled'),
   (SELECT COUNT(*) FROM orders WHERE dining_session_id = s.id AND status = 'cancelled'),
   (SELECT COALESCE(SUM(total),0) FROM orders WHERE dining_session_id = s.id AND status != 'cancelled'),
   (SELECT COALESCE(SUM(total),0) FROM orders WHERE dining_session_id = s.id AND status != 'cancelled' AND paid = 1),
   (SELECT COALESCE(SUM(total),0) FROM orders WHERE dining_session_id = s.id AND status = 'cancelled'),
   (SELECT json_group_array(json_object(
     'id',o.id,'code',o.code,'table_id',o.table_id,'table_name',o.table_name,
     'dining_session_id',o.dining_session_id,'customer_name',o.customer_name,
     'items',json(o.items),'total',o.total,'note',o.note,'status',o.status,'paid',o.paid,
     'paid_at',o.paid_at,'payment_method',o.payment_method,'cancel_reason',o.cancel_reason,
     'created_at',o.created_at,'updated_at',o.updated_at
    )) FROM (SELECT * FROM orders WHERE dining_session_id = s.id ORDER BY created_at ASC,id ASC) AS o)
  FROM table_sessions s LEFT JOIN dining_tables t ON t.id = s.table_id
  WHERE s.id = ? AND s.status = 'closed' AND s.closed_at = ? AND changes() = 1
 `).bind(sessionId,closedAt);
}

function vnDate(time:number){return new Date(time+VN_OFFSET).toISOString().slice(0,10);}

function parseDate(value:string){
 const time=/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)?Date.parse(value+"T00:00:00.000Z"):NaN;
 if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)throw new OrderError("Ngày quyết toán không hợp lệ. Vui lòng chọn ngày theo định dạng năm-tháng-ngày.");
 return time;
}

async function getRange(params:URLSearchParams):Promise<Range>{
 const today=vnDate(Date.now()),from=params.get("from")??today,to=params.get("to")??today;
 const first=parseDate(from),last=parseDate(to),days=(last-first)/DAY+1;
 if(days<1)throw new OrderError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
 if(days>366)throw new OrderError("Mỗi báo cáo xem tối đa 366 ngày. Vui lòng thu hẹp khoảng thời gian.");
 const requested=params.get("table")??"all";
 if(!requested||requested.length>60)throw new OrderError("Bàn được chọn không hợp lệ.");
 const tableId=requested==="all"?null:requested;
 if(tableId&&!await database().prepare("SELECT id FROM dining_tables WHERE id = ?").bind(tableId).first())throw new OrderError("Không tìm thấy bàn được chọn.",404);
 return {from,to,days,tableId,start:first-VN_OFFSET,end:last+DAY-VN_OFFSET};
}

const snapshotColumns=`a.session_id AS sessionId,a.table_id AS tableId,a.table_name AS tableName,
 a.customer_name AS customerName,a.opened_at AS openedAt,a.closed_at AS closedAt,
 a.order_count AS orderCount,a.valid_order_count AS validOrderCount,a.cancelled_count AS cancelledCount,
 a.total,a.paid_total AS paidTotal,a.cancelled_total AS cancelledTotal,'snapshot' AS source`;

const historicalColumns=`s.id AS sessionId,s.table_id AS tableId,s.table_name AS tableName,
 s.customer_name AS customerName,s.created_at AS openedAt,s.closed_at AS closedAt,
 COUNT(o.id) AS orderCount,COUNT(CASE WHEN o.status != 'cancelled' THEN 1 END) AS validOrderCount,
 COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) AS cancelledCount,
 COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END),0) AS total,
 COALESCE(SUM(CASE WHEN o.status != 'cancelled' AND o.paid = 1 THEN o.total ELSE 0 END),0) AS paidTotal,
 COALESCE(SUM(CASE WHEN o.status = 'cancelled' THEN o.total ELSE 0 END),0) AS cancelledTotal,
 'reconstructed' AS source`;

/**
 * Sessions closed before this feature keep their recorded close timestamp and
 * are reconstructed from linked orders. Reads do not invent payment dates,
 * mutate history or silently turn reconstructed receipts into new snapshots.
 */
export async function listSettlements(params:URLSearchParams):Promise<SettlementPage>{
 const range=await getRange(params),pageText=params.get("page")??"1",page=Number(pageText);
 if(!/^[1-9]\d*$/.test(pageText)||!Number.isSafeInteger(page)||!Number.isSafeInteger((page-1)*PAGE_SIZE))throw new OrderError("Số trang không hợp lệ.");
 const scope=range.tableId?" AND table_id = ?":"",values=[range.start,range.end,...(range.tableId?[range.tableId]:[])];
 const source=`WITH records AS (
  SELECT ${snapshotColumns} FROM table_settlements a WHERE closed_at >= ? AND closed_at < ?${scope}
  UNION ALL
  SELECT ${historicalColumns} FROM table_sessions s LEFT JOIN orders o ON o.dining_session_id = s.id
  WHERE s.status = 'closed' AND s.closed_at >= ? AND s.closed_at < ?${range.tableId?" AND s.table_id = ?":""}
   AND NOT EXISTS (SELECT 1 FROM table_settlements a WHERE a.session_id = s.id)
  GROUP BY s.id
 )`;
 const db=database(),result=await db.batch([
  db.prepare(`${source} SELECT COUNT(*) AS count,COALESCE(SUM(total),0) AS total,COALESCE(SUM(paidTotal),0) AS paidTotal,COALESCE(SUM(cancelledTotal),0) AS cancelledTotal FROM records`).bind(...values,...values),
  db.prepare(`${source} SELECT * FROM records ORDER BY closedAt DESC,sessionId DESC LIMIT ? OFFSET ?`).bind(...values,...values,PAGE_SIZE,(page-1)*PAGE_SIZE)
 ]);
 const summary=result[0].results[0] as SettlementPage["summary"]|undefined;
 if(!summary)throw new OrderError("Chưa tổng hợp được quyết toán bàn. Vui lòng thử lại.",503);
 return {settlements:result[1].results as TableSettlement[],page,pageSize:PAGE_SIZE,total:summary.count,pages:Math.ceil(summary.count/PAGE_SIZE),range:{from:range.from,to:range.to,days:range.days,timezone:"Asia/Ho_Chi_Minh",tableId:range.tableId},summary};
}

export async function getSettlement(rawId:unknown):Promise<SettlementDetail>{
 const id=checkedText(rawId,60,true),db=database();
 // One batch keeps a historical reconstruction consistent with its order list.
 const result=await db.batch([
  db.prepare(`SELECT ${snapshotColumns},a.orders_json AS ordersJson FROM table_settlements a WHERE a.session_id = ?`).bind(id),
  db.prepare(`SELECT ${historicalColumns} FROM table_sessions s LEFT JOIN orders o ON o.dining_session_id = s.id WHERE s.id = ? AND s.status = 'closed' AND s.closed_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM table_settlements a WHERE a.session_id = s.id) GROUP BY s.id`).bind(id),
  db.prepare("SELECT * FROM orders WHERE dining_session_id = ? AND EXISTS (SELECT 1 FROM table_sessions WHERE id = ? AND status = 'closed' AND closed_at IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM table_settlements WHERE session_id = ?) ORDER BY created_at ASC,id ASC").bind(id,id,id),
  db.prepare("SELECT id,request_id,session_id,from_table_id,from_table_name,to_table_id,to_table_name,transferred_at FROM table_transfers WHERE session_id = ? ORDER BY transferred_at ASC,id ASC").bind(id)
 ]);
 const transfers=(result[3].results as Record<string,unknown>[]).map(publicTransfer);
 const snapshot=result[0].results[0] as (TableSettlement&{ordersJson:string})|undefined;
 if(snapshot){
  const {ordersJson,...settlement}=snapshot;
  return {settlement,orders:JSON.parse(ordersJson) as Order[],transfers};
 }
 const settlement=result[1].results[0] as TableSettlement|undefined;
 if(!settlement)throw new OrderError("Không tìm thấy quyết toán của lượt bàn đã đóng.",404);
 return {settlement,orders:(result[2].results as Record<string,unknown>[]).map(publicOrder),transfers};
}
