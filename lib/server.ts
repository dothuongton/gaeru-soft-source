import {storeDatabase,currentStoreId,rootDatabase} from "./store-database";
import { defaultShop, sampleMenu, OrderError } from "./menu";
import { olaMenuItems } from "./ola-menu-data";
import { defaultOlaCategories } from "./categories-server";
import { defaultOlaBanner } from "./banner-server";

export const defaultOlaShop = {
  logo: "",
  name: "Ola Quán",
  tagline: "Ngon ngọt",
  hours: "08:00 - 22:30",
  address: "Hà Nội",
  open: true,
  bankAccount: "1062680102",
  bankName: "Vietcombank",
  accountHolder: "BÙI THỊ THU HUYỀN"
};
import type { MenuItem, DiningTable, Shop, Order } from "./menu";
export const database=storeDatabase;
export function requireSameOrigin(request:Request){const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)throw new OrderError("Yêu cầu không hợp lệ.",403);if(request.headers.get("sec-fetch-site")==="cross-site")throw new OrderError("Yêu cầu không hợp lệ.",403);if(!request.headers.get("content-type")?.includes("application/json"))throw new OrderError("Nội dung yêu cầu không hợp lệ.",415);}
/** The bearer value is available only to the browser cookie jar; database rows keep its digest. */
export async function deviceIdentity(request:Request,issue=false):Promise<{hash:string;setCookie?:string}>{
 const values=(request.headers.get("cookie")??"").split(";").map(v=>v.trim()).filter(v=>v.startsWith("__Host-moc-device=")).map(v=>v.slice("__Host-moc-device=".length));
 let value=values.length===1&&/^[a-f0-9]{64}$/.test(values[0])?values[0]:"",setCookie:string|undefined;
 if(!value){
  if(!issue)throw new OrderError("Chưa xác nhận được trình duyệt. Vui lòng tải lại trang QR và cho phép cookie.",403);
  value=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
  setCookie=`__Host-moc-device=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
 }
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,"0")).join("");
 return {hash,setCookie};
}
const seededStoresByDb = new WeakMap<object, Set<string>>();
const seedInFlightByDb = new WeakMap<object, Map<string, Promise<void>>>();
const appSchemaEnsuredByDb = new WeakSet<object>();

export async function ensureAppSchema(): Promise<void> {
 let dbObj: object;
 let db: ReturnType<typeof rootDatabase>;
 try {
  db = rootDatabase();
  dbObj = db as object;
 } catch {
  return;
 }
 if (appSchemaEnsuredByDb.has(dbObj)) return;

 const statements = [
  "ALTER TABLE orders ADD COLUMN last_actor text DEFAULT 'Nhân viên'",
  "ALTER TABLE table_payment_receipts ADD COLUMN orders_json text",
  "ALTER TABLE table_payment_receipts ADD COLUMN audit_json text",
  "ALTER TABLE service_requests ADD COLUMN request_count integer DEFAULT 1",
  "ALTER TABLE service_requests ADD COLUMN pending_count integer DEFAULT 1",
  `CREATE TABLE IF NOT EXISTS order_audit (
    id integer PRIMARY KEY AUTOINCREMENT,
    store_id text NOT NULL,
    order_id text NOT NULL,
    session_id text,
    kind text NOT NULL,
    actor text NOT NULL,
    at integer NOT NULL,
    before_json text,
    after_json text NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS order_audit_visit ON order_audit(store_id,session_id,id)",
  `CREATE TABLE IF NOT EXISTS service_request_events (
    store_id text NOT NULL DEFAULT 'main',
    request_id text NOT NULL,
    attempt_id text NOT NULL,
    session_id text NOT NULL,
    kind text NOT NULL,
    note text NOT NULL,
    created_at integer NOT NULL,
    PRIMARY KEY (store_id, request_id)
  )`,
  "CREATE INDEX IF NOT EXISTS service_request_events_visit ON service_request_events(store_id,session_id,kind,created_at)",
  `CREATE TABLE IF NOT EXISTS staff_push_subscriptions (
    store_id text DEFAULT 'main' NOT NULL,
    id text NOT NULL,
    user_id text NOT NULL,
    staff_account_id text,
    device_id text NOT NULL,
    endpoint text NOT NULL,
    endpoint_hash text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL,
    last_seen_at integer NOT NULL,
    PRIMARY KEY(store_id, id)
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS staff_push_user_device_store_unique ON staff_push_subscriptions (store_id, user_id, device_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS staff_push_endpoint_hash_store_unique ON staff_push_subscriptions (store_id, endpoint_hash)",
  "CREATE INDEX IF NOT EXISTS staff_push_user_store ON staff_push_subscriptions (store_id, user_id)",
  "CREATE INDEX IF NOT EXISTS staff_push_updated ON staff_push_subscriptions (store_id, updated_at)"
 ];

 for (const sql of statements) {
  try {
   await db.prepare(sql).run();
  } catch {}
 }
 appSchemaEnsuredByDb.add(dbObj);
}

export function invalidateSeed(storeId?: string) {
 try {
  const db = rootDatabase() as object;
  if (storeId) {
   seededStoresByDb.get(db)?.delete(storeId);
   seedInFlightByDb.get(db)?.delete(storeId);
  } else {
   seededStoresByDb.get(db)?.clear();
   seedInFlightByDb.get(db)?.clear();
  }
 } catch {}
}

export async function seed(){
 const storeId = currentStoreId();
 let dbObj: object;
 try {
  dbObj = rootDatabase() as object;
 } catch {
  return;
 }
 await ensureAppSchema();
 let seeded = seededStoresByDb.get(dbObj);
 if (!seeded) {
  seeded = new Set();
  seededStoresByDb.set(dbObj, seeded);
 }
 if (seeded.has(storeId)) return;

 let inFlightMap = seedInFlightByDb.get(dbObj);
 if (!inFlightMap) {
  inFlightMap = new Map();
  seedInFlightByDb.set(dbObj, inFlightMap);
 }
 let inFlight = inFlightMap.get(storeId);
 if (!inFlight) {
  inFlight = (async () => {
   const db = database();
   const existing = await db.prepare("SELECT value FROM settings WHERE key = ?").bind("seeded-v1").first();
   if (!existing) {
    const shopData = storeId === "ola" ? defaultOlaShop : defaultShop;
    const stmts = [db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").bind("shop", JSON.stringify(shopData))];
    if (storeId === "ola") {
     stmts.push(db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").bind("categories", JSON.stringify(defaultOlaCategories)));
     stmts.push(db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").bind("banner", JSON.stringify(defaultOlaBanner)));
    }
    const menuToSeed = storeId === "ola" ? olaMenuItems : storeId === "main" ? sampleMenu : [];
    for (const m of menuToSeed) {
     stmts.push(db.prepare("INSERT OR IGNORE INTO menu_items (id,name,description,category,price,image,badge,available,sort) VALUES (?,?,?,?,?,?,?,?,?)").bind(m.id, m.name, m.description, m.category, m.price, m.image, m.badge, m.available, m.sort));
    }
    for (let i = 1; i <= 12; i++) {
     stmts.push(db.prepare("INSERT OR IGNORE INTO dining_tables (id,name,zone,token) VALUES (?,?,?,?)").bind(String(i), "Bàn " + String(i).padStart(2, "0"), i <= 8 ? "Sảnh chính" : "Sân vườn", crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().slice(0, 8)));
    }
    stmts.push(db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").bind("seeded-v1", "1"));
    await db.batch(stmts);
   }
   if (storeId === "ola") {
    const existingOla = await db.prepare("SELECT value FROM settings WHERE key = ?").bind("seeded-ola-v5").first();
    if (!existingOla) {
     try {
      await db.prepare("DELETE FROM menu_items WHERE id IN ('1','2','3','4','5','6','7')").run();
     } catch {}
     const olaStmts: any[] = [];
     for (const m of olaMenuItems) {
      olaStmts.push(db.prepare("INSERT OR REPLACE INTO menu_items (id,name,description,category,price,image,badge,available,sort) VALUES (?,?,?,?,?,?,?,?,?)").bind(m.id, m.name, m.description, m.category, m.price, m.image, m.badge, m.available, m.sort));
     }
     olaStmts.push(db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").bind("shop", JSON.stringify(defaultOlaShop)));
     olaStmts.push(db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").bind("categories", JSON.stringify(defaultOlaCategories)));
     olaStmts.push(db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").bind("banner", JSON.stringify(defaultOlaBanner)));
     olaStmts.push(db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").bind("seeded-ola-v5", "1"));
     for (let i = 0; i < olaStmts.length; i += 30) {
      await db.batch(olaStmts.slice(i, i + 30));
     }
    }
   }
   seeded.add(storeId);
  })().finally(() => {
   inFlightMap.delete(storeId);
  });
  inFlightMap.set(storeId, inFlight);
 }
 await inFlight;
}
export async function getMenu(){
 const db=database();const [menu,promos,extraRows]=await Promise.all([db.prepare("SELECT * FROM menu_items ORDER BY sort,name").all<MenuItem>(),db.prepare("SELECT key,value FROM settings WHERE key LIKE 'promotion:%'").all<{key:string;value:string}>(),db.prepare("SELECT key,value FROM settings WHERE key LIKE 'extras:%'").all<{key:string;value:string}>()]);
 const promotions=new Map(promos.results.map(p=>[p.key.slice(10),JSON.parse(p.value)]));
 const extras=new Map(extraRows.results.map(row=>[row.key.slice(7),JSON.parse(row.value)]));
 return menu.results.map(item=>({...item,...(extras.has(item.id)?{extras:extras.get(item.id)}:{}),promotion:promotions.get(item.id)??null}));
}
export async function getShop(){const r=await database().prepare("SELECT value FROM settings WHERE key = ?").bind("shop").first<{value:string}>();return r?{logo:"",...JSON.parse(r.value)} as Shop:defaultShop;}
export async function getTable(token:string|null,allowDefault=false){const q=token?database().prepare("SELECT * FROM dining_tables WHERE token = ?").bind(token):allowDefault?database().prepare("SELECT * FROM dining_tables ORDER BY CASE WHEN id = '5' THEN 0 ELSE 1 END,CAST(id AS INTEGER) LIMIT 1"):null;const t=q?await q.first<DiningTable>():null;if(!t&&!token&&allowDefault)return {id:"",name:"Thực đơn",zone:"",token:""} satisfies DiningTable;if(!t)throw new OrderError("Mã bàn không hợp lệ. Vui lòng quét lại QR tại bàn hoặc gọi nhân viên.",404);return t;}
export function publicOrder(r:Record<string,unknown>):Order{return {id:r.id as string,code:r.code as string,table_id:r.table_id as string,table_name:r.table_name as string,dining_session_id:r.dining_session_id as string|null,customer_name:(r.customer_name??"") as string,items:JSON.parse(r.items as string),total:r.total as number,note:r.note as string,status:r.status as Order["status"],paid:r.paid as number,paid_at:(r.paid_at??null) as number|null,payment_method:(r.payment_method??"unknown") as Order["payment_method"],cancel_reason:r.cancel_reason as string,created_at:r.created_at as number,updated_at:r.updated_at as number};}
export function json(data:unknown,status=200,extraHeaders?:HeadersInit){const headers=new Headers(extraHeaders);headers.set("Cache-Control","no-store");headers.set("X-Content-Type-Options","nosniff");return Response.json(data,{status,headers});}
export async function readBody(request:Request){requireSameOrigin(request);const limit=["/api/admin/shop","/api/account/profile","/api/admin/item"].includes(new URL(request.url).pathname)?240000:32000;if(Number(request.headers.get("content-length")||0)>limit)throw new OrderError("Yêu cầu quá lớn.",413);const s=await request.text();if(s.length>limit)throw new OrderError("Yêu cầu quá lớn.",413);try{const b=JSON.parse(s);if(!b||typeof b!=="object"||Array.isArray(b))throw new Error();return b;}catch{throw new OrderError("Dữ liệu gửi lên không hợp lệ.");}}
