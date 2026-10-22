import {database,getMenu,getShop,publicOrder} from "./server";
import {ensureLegacySessions} from "./table-sessions";
import {getDisplaySettings} from "./display-settings-server";
import {getThemeSettings} from "./theme-settings-server";
import {publicTransfer} from "./table-transfer-server";
import {hasPermission,type StaffAccess} from "./staff-permissions";

export async function getBoardRevision(access:StaffAccess,storeId:string):Promise<string>{
 const db=database();
 const operational=hasPermission(access,"orders.view");
 const accountVer=access.account?`${access.account.id}:${access.account.version}:${access.account.status}`:(access.userId||"anon");
 const perms=(access.permissions||[]).slice().sort().join(",");
 if(!operational){
  return `"rev:${storeId}:noop:${accountVer}:${perms}"`;
 }
 const result=await db.batch([
  db.prepare("SELECT COALESCE(MAX(updated_at), 0) AS max_s, COUNT(*) AS cnt_s FROM table_sessions WHERE status IN ('pending','active')"),
  db.prepare("SELECT COALESCE(MAX(updated_at), 0) AS max_o, COUNT(*) AS cnt_o FROM orders WHERE status IN ('new','preparing','ready') OR (paid = 0 AND status != 'cancelled')"),
  db.prepare("SELECT COALESCE(MAX(created_at), 0) AS max_r, COUNT(*) AS cnt_r FROM service_requests WHERE status = 'open'"),
  db.prepare("SELECT COUNT(*) AS cnt_t FROM dining_tables")
 ]);
 const s=result[0].results[0] as {max_s:number;cnt_s:number};
 const o=result[1].results[0] as {max_o:number;cnt_o:number};
 const r=result[2].results[0] as {max_r:number;cnt_r:number};
 const t=result[3].results[0] as {cnt_t:number};
 const raw=`${storeId}|${accountVer}|${perms}|${s.max_s}|${s.cnt_s}|${o.max_o}|${o.cnt_o}|${r.max_r}|${r.cnt_r}|${t.cnt_t}`;
 return `"${raw}"`;
}

/** Read the board in one transaction, limiting each dataset to granted duties. */
export async function adminDashboard(access:StaffAccess,includeMenu=true){
 const operational=hasPermission(access,"orders.view"),revenue=hasPermission(access,"revenue.view"),tables=hasPermission(access,"tables.manage");
 if(operational)await ensureLegacySessions();
 const db=database(),dayStart=Math.floor((Date.now()+25200000)/86400000)*86400000-25200000;
 const liveOrders="status IN ('new','preparing','ready') OR (paid = 0 AND status != 'cancelled') OR dining_session_id IN (SELECT id FROM table_sessions WHERE status IN ('pending','active'))";
 const withHistory=(!includeMenu||!revenue)?"":" OR id IN (SELECT id FROM orders WHERE status = 'cancelled' OR (status = 'served' AND paid = 1) ORDER BY created_at DESC LIMIT 200)";
 const [items,shop,displaySettings,themeSettings,board]=await Promise.all([
  includeMenu&&hasPermission(access,"menu.manage")?getMenu():Promise.resolve([]),getShop(),getDisplaySettings(),getThemeSettings(),db.batch([
   db.prepare(operational||revenue?"SELECT id,name,zone"+(tables?",token":"")+" FROM dining_tables ORDER BY CAST(id AS INTEGER)":"SELECT id,name,zone FROM dining_tables WHERE 0"),
   db.prepare(operational?"SELECT * FROM orders WHERE "+liveOrders+withHistory+" ORDER BY created_at DESC":"SELECT * FROM orders WHERE 0"),
   db.prepare(operational?"SELECT * FROM service_requests WHERE status = 'open' ORDER BY created_at DESC":"SELECT * FROM service_requests WHERE 0"),
   revenue?db.prepare("SELECT (SELECT COUNT(*) FROM orders WHERE created_at >= ? AND created_at < ? AND status != 'cancelled') AS todayCount, (SELECT COALESCE(SUM(total),0) FROM orders WHERE paid_at >= ? AND paid_at < ? AND paid = 1 AND status != 'cancelled') AS todayCollected").bind(dayStart,dayStart+86400000,dayStart,dayStart+86400000):db.prepare("SELECT NULL AS todayCount, NULL AS todayCollected"),
   db.prepare(operational?"SELECT s.id,s.table_id,t.name AS table_name,s.customer_name,s.status,s.created_at,s.updated_at FROM table_sessions s JOIN dining_tables t ON t.id = s.table_id WHERE s.status IN ('pending','active') ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END,s.created_at":"SELECT id,table_id,table_name,customer_name,status,created_at,updated_at FROM table_sessions WHERE 0"),
   db.prepare(operational?"SELECT id,request_id,session_id,from_table_id,from_table_name,to_table_id,to_table_name,transferred_at FROM table_transfers WHERE session_id IN (SELECT id FROM table_sessions WHERE status IN ('pending','active')) ORDER BY transferred_at ASC,id ASC":"SELECT * FROM table_transfers WHERE 0")
  ])
 ]);
 return {access,items,shop,displaySettings,themeSettings,tables:board[0].results,orders:(board[1].results as Record<string,unknown>[]).map(publicOrder),calls:board[2].results,stats:board[3].results[0],sessions:board[4].results,transfers:(board[5].results as Record<string,unknown>[]).map(publicTransfer)};
}
