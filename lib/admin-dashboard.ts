import {database,getMenu,getShop,publicOrder} from "./server";
import {ensureLegacySessions} from "./table-sessions";
import {getDisplaySettings} from "./display-settings-server";
import {getThemeSettings} from "./theme-settings-server";
import {publicTransfer} from "./table-transfer-server";
import {hasPermission,type StaffAccess} from "./staff-permissions";

/** Read the board in one transaction, limiting each dataset to granted duties. */
export async function adminDashboard(access:StaffAccess){
 const operational=hasPermission(access,"orders.view"),revenue=hasPermission(access,"revenue.view"),tables=hasPermission(access,"tables.manage");
 if(operational)await ensureLegacySessions();
 const db=database(),dayStart=Math.floor((Date.now()+25200000)/86400000)*86400000-25200000;
 const liveOrders="status IN ('new','preparing','ready') OR (paid = 0 AND status != 'cancelled') OR dining_session_id IN (SELECT id FROM table_sessions WHERE status IN ('pending','active'))";
 const withHistory=revenue?" OR id IN (SELECT id FROM orders WHERE status = 'cancelled' OR (status = 'served' AND paid = 1) ORDER BY created_at DESC LIMIT 200)":"";
 const [items,shop,displaySettings,themeSettings,board]=await Promise.all([
  hasPermission(access,"menu.manage")?getMenu():Promise.resolve([]),getShop(),getDisplaySettings(),getThemeSettings(),db.batch([
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
