import {storeDatabase,currentStoreId} from "./store-database";
import { defaultShop, sampleMenu, OrderError } from "./menu";
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
export async function seed(){
 const db=database();if(await db.prepare("SELECT value FROM settings WHERE key = ?").bind("seeded-v1").first())return;
 const stmts=[db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").bind("shop",JSON.stringify(defaultShop))];
 for(const m of currentStoreId()==="main"?sampleMenu:[])stmts.push(db.prepare("INSERT OR IGNORE INTO menu_items (id,name,description,category,price,image,badge,available,sort) VALUES (?,?,?,?,?,?,?,?,?)").bind(m.id,m.name,m.description,m.category,m.price,m.image,m.badge,m.available,m.sort));
 for(let i=1;i<=12;i++)stmts.push(db.prepare("INSERT OR IGNORE INTO dining_tables (id,name,zone,token) VALUES (?,?,?,?)").bind(String(i),"Bàn "+String(i).padStart(2,"0"),i<=8?"Sảnh chính":"Sân vườn",crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().slice(0,8)));
 stmts.push(db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").bind("seeded-v1","1"));await db.batch(stmts);
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
