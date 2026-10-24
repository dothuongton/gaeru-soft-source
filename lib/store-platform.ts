import {currentStoreId,rootDatabase} from "./store-database";
import {getStaffAccess} from "./staff-access";
import {ALL_PERMISSIONS,normalizeStaffEmail} from "./staff-permissions";
import {checkedText,defaultShop,OrderError} from "./menu";

export type StoreInfo={id:string;name:string;status:"active"|"suspended";source:"self"|"platform";adminEmail?:string;ownerName?:string;phone?:string;createdAt?:number;updatedAt?:number};
type StoreRow={status:"active"|"suspended";source:"self"|"platform";owner_name:string;phone:string;updated_at:number;updated_by:string;id:string;name:string;admin_email:string;request_id:string;created_by:string;created_at:number};
const publicStore=(s:StoreRow,owner=false):StoreInfo=>({id:s.id,name:s.name,status:s.status,source:s.source,...(owner?{adminEmail:s.admin_email,ownerName:s.owner_name,phone:s.phone,createdAt:s.created_at,updatedAt:s.updated_at}:{})});
export async function ensureMainStore(){
 const db=rootDatabase();
 if(await db.prepare("SELECT id FROM stores WHERE id = 'main'").first())return;
 await db.prepare("INSERT OR IGNORE INTO stores (id,name,admin_email,request_id,created_by,created_at) SELECT 'main',COALESCE(json_extract(value,'$.name'),'Mộc'),'','legacy-main','legacy',0 FROM settings WHERE store_id = 'main' AND key = 'shop'").run();
 await db.prepare("INSERT OR IGNORE INTO stores (id,name,admin_email,request_id,created_by,created_at) VALUES ('main','Mộc','','legacy-main','legacy',0)").run();
}
export async function resolveStore(request:Request){
 const params=new URL(request.url).searchParams;
 if(params.getAll("store").length>1)throw new OrderError("Liên kết chứa nhiều cửa hàng.");
 const id=params.get("store")??"main";
 if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))throw new OrderError("Mã cửa hàng không hợp lệ.",404);
 let store=await rootDatabase().prepare("SELECT * FROM stores WHERE id = ?").bind(id).first<StoreRow>();
 if(!store&&id==="main"){await ensureMainStore();store=await rootDatabase().prepare("SELECT * FROM stores WHERE id = ?").bind(id).first<StoreRow>();}
 if(!store&&id==="ola"){
  await rootDatabase().prepare("INSERT OR IGNORE INTO stores (id,name,admin_email,request_id,created_by,created_at) VALUES ('ola','Ola Quán','','store-ola','platform',?)").bind(Date.now()).run();
  store=await rootDatabase().prepare("SELECT * FROM stores WHERE id = ?").bind(id).first<StoreRow>();
 }
 if(!store)throw new OrderError("Không tìm thấy cửa hàng. Vui lòng kiểm tra lại liên kết.",404);return store;
}
export async function listStores(request:Request){
 const access=await getStaffAccess(request),db=rootDatabase(),current=await db.prepare("SELECT * FROM stores WHERE id = ?").bind(currentStoreId()).first<StoreRow>();
 let rows:StoreRow[]=[];
 if(access.isOwner)rows=(await db.prepare("SELECT * FROM stores ORDER BY created_at,id").all<StoreRow>()).results;
 else if(access.authenticated)rows=(await db.prepare("SELECT DISTINCT s.* FROM stores s JOIN staff_accounts a ON a.store_id = s.id WHERE a.status = 'active' AND (a.user_id = ? OR (a.user_id IS NULL AND a.email = ?)) ORDER BY s.created_at,s.id").bind(access.userId,access.email).all<StoreRow>()).results;
 return {stores:rows.map(s=>publicStore(s,access.isOwner)),isPlatformOwner:access.isOwner,authenticated:access.authenticated,email:access.email,currentStore:current?publicStore(current):null};
}
export async function createStore(request:Request,body:Record<string,unknown>,selfRegistration=false){
 // Platform ownership is global, never inferred from a per-store manager role.
 const access=await getStaffAccess(request);
 if(!access.authenticated||!access.userId||!access.email)throw new OrderError("Vui lòng đăng nhập để đăng ký cửa hàng.",selfRegistration?401:403);
 if(!selfRegistration&&!access.isOwner)throw new OrderError("Chỉ quản trị tổng được tạo cửa hàng.",403);
 const name=checkedText(body.name,40,true),id=checkedText(body.id,48,true),requestId=checkedText(body.requestId,36,true),adminEmail=selfRegistration?access.email:normalizeStaffEmail(body.adminEmail);
 const ownerName=checkedText(body.ownerName??"",80,selfRegistration),phone=checkedText(body.phone??"",24,selfRegistration);
 if(phone&&!/^[+0-9(). -]{6,24}$/.test(phone))throw new OrderError("Số điện thoại không hợp lệ.");
 const source=selfRegistration?"self":"platform",boundUser=selfRegistration?access.userId:null;
 if(!/^[a-z0-9][a-z0-9-]{2,47}$/.test(id)||["main","api","admin"].includes(id))throw new OrderError("Mã cửa hàng gồm 3–48 chữ thường, số hoặc dấu gạch ngang; không dùng mã dành riêng.");
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)||!adminEmail)throw new OrderError("Vui lòng nhập email quản trị hợp lệ và gửi lại biểu mẫu.");
 const db=rootDatabase(),now=Date.now(),accountId=crypto.randomUUID(),auditId=crypto.randomUUID();
 const existing=await db.prepare("SELECT * FROM stores WHERE request_id = ?").bind(requestId).first<StoreRow>();
 if(existing){if(existing.created_by!==access.userId)throw new OrderError("Yêu cầu không thuộc tài khoản của bạn.",403);if(existing.id!==id||existing.name!==name||existing.admin_email!==adminEmail||existing.owner_name!==ownerName||existing.phone!==phone||existing.source!==source)throw new OrderError("Yêu cầu này đã tạo cửa hàng khác. Vui lòng tải lại danh sách.",409);return {store:publicStore(existing,true),replayed:true};}
 const account={id:accountId,email:adminEmail,name:ownerName||"Quản trị "+name,role:"manager",permissions:[...ALL_PERMISSIONS],status:"active",protected:false,userBound:!!boundUser,version:1,createdAt:now,updatedAt:now,lastLoginAt:null};
 await db.batch([
  db.prepare("INSERT OR IGNORE INTO stores (id,name,admin_email,request_id,created_by,created_at,status,source,owner_name,phone,updated_at,updated_by) VALUES (?,?,?,?,?,?,'active',?,?,?,?,?)").bind(id,name,adminEmail,requestId,access.userId,now,source,ownerName,phone,now,access.userId),
  db.prepare("INSERT OR IGNORE INTO settings (store_id,key,value) SELECT id,'shop',? FROM stores WHERE id = ? AND request_id = ?").bind(JSON.stringify({...defaultShop,name}),id,requestId),
  db.prepare("INSERT OR IGNORE INTO staff_accounts (store_id,id,email,name,user_id,role,permissions_json,status,version,created_at,updated_at,last_login_at) SELECT id,?,?,?,?,'manager',?,'active',1,?,?,NULL FROM stores WHERE id = ? AND request_id = ? AND NOT EXISTS (SELECT 1 FROM staff_accounts WHERE store_id = ?)").bind(accountId,adminEmail,account.name,boundUser,JSON.stringify(ALL_PERMISSIONS),now,now,id,requestId,id),
  db.prepare("INSERT OR IGNORE INTO staff_account_audit (store_id,id,actor_id,actor_email,account_id,account_email,action,before_json,after_json,created_at) SELECT store_id,?,?,?,id,email,'created',NULL,?,? FROM staff_accounts WHERE store_id = ? AND id = ?").bind(auditId,access.userId,access.email,JSON.stringify(account),now,id,accountId)
 ]);
 const saved=await db.prepare("SELECT * FROM stores WHERE request_id = ?").bind(requestId).first<StoreRow>();
 if(!saved)throw new OrderError("Mã cửa hàng đã được dùng. Vui lòng chọn mã khác.",409);
 if(saved.created_by!==access.userId)throw new OrderError("Yêu cầu không thuộc tài khoản của bạn.",403);
 if(saved.id!==id||saved.name!==name||saved.admin_email!==adminEmail||saved.owner_name!==ownerName||saved.phone!==phone||saved.source!==source)throw new OrderError("Yêu cầu này đã tạo cửa hàng khác. Vui lòng tải lại.",409);
 return {store:publicStore(saved,true),replayed:saved.created_at!==now};
}


export async function updateStoreStatus(request:Request,body:Record<string,unknown>){
 const access=await getStaffAccess(request);
 if(!access.isOwner||!access.userId)throw new OrderError("Chỉ quản trị tổng được thay đổi trạng thái cửa hàng.",403);
 const id=checkedText(body.id,48,true),status=body.status;
 if(id==="main")throw new OrderError("Không thể tạm khóa cửa hàng gốc.",400);
 if(status!=="active"&&status!=="suspended")throw new OrderError("Trạng thái cửa hàng không hợp lệ.");
 if(!Number.isSafeInteger(body.expectedUpdatedAt)||Number(body.expectedUpdatedAt)<0)throw new OrderError("Vui lòng tải lại danh sách trước khi đổi trạng thái.");
 const db=rootDatabase(),result=await db.prepare("UPDATE stores SET status = ?,updated_at = MAX(?,updated_at + 1),updated_by = ? WHERE id = ? AND updated_at = ?").bind(status,Date.now(),access.userId,id,body.expectedUpdatedAt).run();
 const saved=await db.prepare("SELECT * FROM stores WHERE id = ?").bind(id).first<StoreRow>();
 if(!saved)throw new OrderError("Không tìm thấy cửa hàng.",404);
 if(result.meta.changes!==1)throw new OrderError("Cửa hàng vừa được cập nhật. Vui lòng tải lại danh sách.",409);
 return {store:publicStore(saved,true)};
}

export async function saveStoreBranding(shop:import("./menu").Shop){
 const db=rootDatabase(),id=currentStoreId();
 await db.batch([db.prepare("UPDATE settings SET value = ? WHERE store_id = ? AND key = 'shop'").bind(JSON.stringify(shop),id),db.prepare("UPDATE stores SET name = ?,updated_at = MAX(?,updated_at + 1) WHERE id = ?").bind(shop.name,Date.now(),id)]);
}
