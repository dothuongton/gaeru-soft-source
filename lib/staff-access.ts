import {env} from "cloudflare:workers";
import {database} from "./server";
import {OrderError,checkedText,validateShopLogo} from "./menu";
import {ALL_PERMISSIONS,ROLE_PRESETS,canGrantPermissions,hasPermission,normalizePermissions,normalizeStaffEmail} from "./staff-permissions";
import type {Permission,StaffAccess,StaffProfile,StaffAccount,StaffAccountResult,StaffAccountsResponse,StaffAudit,StaffRole,StaffStatus} from "./staff-permissions";
import {resolveIdentity,getOwnerEmails} from "./auth";

type StaffRow={id:string;email:string;name:string;user_id:string|null;role:StaffRole;permissions_json:string;status:StaffStatus;version:number;created_at:number;updated_at:number;last_login_at:number|null};
type OwnerBinding={email:string;user_id:string;created_at:number;last_login_at:number};
type AuditRow={id:string;actor_id:string;actor_email:string;account_id:string;account_email:string;action:StaffAudit["action"];before_json:string|null;after_json:string;created_at:number};
type Identity={userId:string;email:string};
type AccountInput={name:string;role:StaffRole;permissions:Permission[];status:StaffStatus};
type SqlGuard={sql:string;values:(string|number)[]};

const emptyAccess=(identity?:Identity):StaffAccess=>({authenticated:!!identity,userId:identity?.userId??null,email:identity?.email??null,isStaff:false,isOwner:false,account:null,permissions:[]});
export const ownerEmails = getOwnerEmails;

function storedPermissions(raw:string):Permission[]{
 try{return normalizePermissions(JSON.parse(raw));}catch{return [];}
}
function publicAccount(row:StaffRow,isProtected=false):StaffAccount{
 return {id:row.id,email:row.email,name:row.name,role:ROLE_PRESETS.some(role=>role.id===row.role)?row.role:"custom",permissions:storedPermissions(row.permissions_json),status:row.status==="active"?"active":"suspended",protected:isProtected,userBound:!!row.user_id,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,lastLoginAt:row.last_login_at};
}
function publicOwner(email:string,binding?:OwnerBinding):StaffAccount{
 return {id:"owner:"+email,email,name:"Quản lý / Chủ cửa hàng",role:"manager",permissions:[...ALL_PERMISSIONS],status:"active",protected:true,userBound:!!binding,version:0,createdAt:binding?.created_at??null,updatedAt:binding?.created_at??null,lastLoginAt:binding?.last_login_at??null};
}
function ownerAccess(identity:Identity,binding:OwnerBinding):StaffAccess{
 return {...emptyAccess(identity),isStaff:true,isOwner:true,account:publicOwner(binding.email,binding),permissions:[...ALL_PERMISSIONS]};
}

/** Resolve fresh grants for every protected request; never trust cached client roles. */
async function resolveStaffAccess(request:Request):Promise<StaffAccess>{
 const identity=await resolveIdentity(request);
 if(!identity)return emptyAccess();
 const db=database(),protectedEmails=ownerEmails(),now=Date.now();
 const boundOwners=(await db.prepare("SELECT * FROM staff_owner_bindings WHERE user_id = ?").bind(identity.userId).all<OwnerBinding>()).results;
 const currentOwner=boundOwners.find(binding=>protectedEmails.includes(binding.email));
 if(currentOwner){
  if(currentOwner.last_login_at<now-900000){
   await db.prepare("UPDATE staff_owner_bindings SET last_login_at = MAX(last_login_at,?) WHERE email = ? AND user_id = ?").bind(now,currentOwner.email,identity.userId).run();
   currentOwner.last_login_at=now;
  }
  return ownerAccess(identity,currentOwner);
 }
 if(protectedEmails.includes(identity.email)){
  await db.prepare("INSERT OR IGNORE INTO staff_owner_bindings (email,user_id,created_at,last_login_at) VALUES (?,?,?,?)").bind(identity.email,identity.userId,now,now).run();
  const binding=await db.prepare("SELECT * FROM staff_owner_bindings WHERE email = ?").bind(identity.email).first<OwnerBinding>();
  // Reuse of a previously bound email by another platform identity cannot
  // recover a protected owner account or fall through to a staff invitation.
  return binding?.user_id===identity.userId?ownerAccess(identity,binding):emptyAccess(identity);
 }
 let row=await db.prepare("SELECT * FROM staff_accounts WHERE user_id = ?").bind(identity.userId).first<StaffRow>();
 if(!row){
  const invitation=await db.prepare("SELECT * FROM staff_accounts WHERE email = ?").bind(identity.email).first<StaffRow>();
  if(!invitation||invitation.user_id||invitation.status!=="active")return {...emptyAccess(identity),account:invitation&&!invitation.user_id?publicAccount(invitation):null};
  // The conditional write and unique user_id bind one invitation exactly once,
  // even when two browser requests race during the first sign-in.
  await db.prepare("UPDATE OR IGNORE staff_accounts SET user_id = ?,version = version + 1,updated_at = MAX(?,updated_at + 1),last_login_at = ? WHERE id = ? AND user_id IS NULL AND status = 'active'").bind(identity.userId,now,now,invitation.id).run();
  row=await db.prepare("SELECT * FROM staff_accounts WHERE user_id = ?").bind(identity.userId).first<StaffRow>();
 }
 if(!row)return emptyAccess(identity);
 const permissions=storedPermissions(row.permissions_json),isStaff=row.status==="active"&&permissions.length>0;
 if(isStaff&&(row.last_login_at??0)<now-900000){
  await db.prepare("UPDATE staff_accounts SET last_login_at = MAX(COALESCE(last_login_at,0),?) WHERE id = ? AND user_id = ? AND status = 'active'").bind(now,row.id,identity.userId).run();
  row.last_login_at=now;
 }
 return {...emptyAccess(identity),isStaff,account:publicAccount(row),permissions:isStaff?permissions:[]};
}

export async function requirePermission(request:Request,permission:Permission):Promise<StaffAccess>{
 const access=await getStaffAccess(request);
 if(!hasPermission(access,permission))throw new OrderError(access.authenticated?"Tài khoản chưa được cấp quyền thực hiện thao tác này. Vui lòng liên hệ quản trị.":"Vui lòng đăng nhập bằng tài khoản đã được quản trị cấp quyền.",403);
 return access;
}

function requireAccountManager(access:StaffAccess){
 if(!hasPermission(access,"staff.manage")||!access.userId||!access.email||!access.account)throw new OrderError("Bạn không có quyền quản lý tài khoản nhân viên.",403);
}
function actorGuard(access:StaffAccess):SqlGuard{
 requireAccountManager(access);
 return access.isOwner
  ?{sql:"EXISTS (SELECT 1 FROM staff_owner_bindings actor WHERE actor.email = ? AND actor.user_id = ?)",values:[access.account!.email,access.userId!]}
  :{sql:"EXISTS (SELECT 1 FROM staff_accounts actor WHERE actor.id = ? AND actor.user_id = ? AND actor.version = ? AND actor.status = 'active')",values:[access.account!.id,access.userId!,access.account!.version]};
}
async function ensureActorCurrent(access:StaffAccess){
 const guard=actorGuard(access);
 const result=await database().prepare("SELECT 1 AS allowed WHERE "+guard.sql).bind(...guard.values).first();
 if(!result)throw new OrderError("Quyền hoặc trạng thái tài khoản của bạn vừa thay đổi. Vui lòng tải lại trang.",403);
}
async function protectedUserIds():Promise<Set<string>>{
 const emails=ownerEmails();
 if(!emails.length)return new Set();
 const bindings=(await database().prepare("SELECT * FROM staff_owner_bindings").all<OwnerBinding>()).results;
 return new Set(bindings.filter(binding=>emails.includes(binding.email)).map(binding=>binding.user_id));
}
function parseAccountInput(body:Record<string,unknown>,creating=false):AccountInput{
 const name=typeof body.name==="string"?body.name.trim().replace(/\s+/g," "):"";
 if(!name||name.length>80)throw new OrderError("Tên nhân viên cần từ 1 đến 80 ký tự.");
 const preset=ROLE_PRESETS.find(role=>role.id===body.role);
 if(!preset)throw new OrderError("Vai trò nhân viên không hợp lệ.");
 let permissions:Permission[];
 try{permissions=normalizePermissions(body.permissions===undefined&&preset.id!=="custom"?preset.permissions:body.permissions);}catch{throw new OrderError("Danh sách quyền không hợp lệ. Vui lòng chọn lại quyền cho nhân viên.");}
 if(!permissions.length)throw new OrderError("Vui lòng chọn ít nhất một quyền. Để ngừng truy cập, hãy tạm khóa tài khoản.");
 if(preset.id!=="custom"&&JSON.stringify(permissions)!==JSON.stringify(normalizePermissions(preset.permissions)))throw new OrderError("Quyền đã khác vai trò mẫu. Vui lòng chọn vai trò Tùy chỉnh.");
 const status=creating&&body.status===undefined?"active":body.status;
 if(status!=="active"&&status!=="suspended")throw new OrderError("Trạng thái tài khoản không hợp lệ.");
 return {name,role:preset.id,permissions,status};
}

export async function listStaffAccounts(access:StaffAccess):Promise<StaffAccountsResponse>{
 requireAccountManager(access);
 await ensureActorCurrent(access);
 const db=database();
 const snapshot=await db.batch([
  db.prepare("SELECT * FROM staff_accounts ORDER BY created_at DESC,id"),
  db.prepare("SELECT * FROM staff_owner_bindings ORDER BY email"),
  db.prepare("SELECT * FROM staff_account_audit ORDER BY created_at DESC,id DESC LIMIT 100")
 ]);
 const owners=ownerEmails(),bindings=snapshot[1].results as OwnerBinding[];
 const boundOwnerIds=new Set(bindings.filter(binding=>owners.includes(binding.email)).map(binding=>binding.user_id));
 const accounts=(snapshot[0].results as StaffRow[]).filter(row=>!owners.includes(row.email)&&(!row.user_id||!boundOwnerIds.has(row.user_id))).map(row=>publicAccount(row));
 const protectedAccounts=owners.map(email=>publicOwner(email,bindings.find(binding=>binding.email===email)));
 const audit=(snapshot[2].results as AuditRow[]).map(row=>({id:row.id,actorEmail:row.actor_email,accountId:row.account_id,accountEmail:row.account_email,action:row.action,before:row.before_json?JSON.parse(row.before_json) as StaffAccount:null,after:JSON.parse(row.after_json) as StaffAccount,createdAt:row.created_at}));
 return {accounts:[...protectedAccounts,...accounts],audit};
}

export async function createStaffAccount(access:StaffAccess,body:Record<string,unknown>):Promise<StaffAccountResult>{
 requireAccountManager(access);
 const email=normalizeStaffEmail(body.email),input=parseAccountInput(body,true);
 if(!email)throw new OrderError("Vui lòng nhập địa chỉ email hợp lệ.");
 if(ownerEmails().includes(email))throw new OrderError("Email này thuộc tài khoản chủ quán được bảo vệ.",403);
 if(email===access.email||email===access.account!.email)throw new OrderError("Bạn không thể tự tạo hoặc thay đổi quyền cho tài khoản của mình.",403);
 if(!canGrantPermissions(access,input.permissions))throw new OrderError("Bạn chỉ được cấp những quyền mà tài khoản của mình đang có.",403);
 const db=database(),id=crypto.randomUUID(),auditId=crypto.randomUUID(),now=Date.now(),guard=actorGuard(access);
 const account:StaffAccount={id,email,...input,protected:false,userBound:false,version:1,createdAt:now,updatedAt:now,lastLoginAt:null};
 const results=await db.batch([
  db.prepare(`INSERT OR IGNORE INTO staff_accounts (id,email,name,user_id,role,permissions_json,status,version,created_at,updated_at,last_login_at)
   SELECT ?,?,?,NULL,?,?,?,1,?,?,NULL WHERE ${guard.sql}`).bind(id,email,input.name,input.role,JSON.stringify(input.permissions),input.status,now,now,...guard.values),
  db.prepare(`INSERT INTO staff_account_audit (id,actor_id,actor_email,account_id,account_email,action,before_json,after_json,created_at)
   SELECT ?,?,?,id,email,'created',NULL,?,? FROM staff_accounts WHERE id = ?`).bind(auditId,access.userId!,access.email!,JSON.stringify(account),now,id),
  db.prepare("SELECT * FROM staff_accounts WHERE id = ?").bind(id)
 ]);
 const row=results[2].results[0] as StaffRow|undefined;
 if(!row){await ensureActorCurrent(access);throw new OrderError("Email này đã có trong danh sách nhân viên. Hãy mở tài khoản hiện có để chỉnh sửa.",409);}
 return {ok:true,account:publicAccount(row)};
}

export async function updateStaffAccount(access:StaffAccess,body:Record<string,unknown>):Promise<StaffAccountResult>{
 requireAccountManager(access);
 const id=typeof body.id==="string"?body.id.trim():"",expectedVersion=body.expectedVersion;
 if(id.startsWith("owner:"))throw new OrderError("Tài khoản chủ quán được bảo vệ; không thể chỉnh sửa hoặc tạm khóa tại đây.",403);
 if(!/^[a-f0-9-]{36}$/.test(id)||typeof expectedVersion!=="number"||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw new OrderError("Thông tin phiên bản tài khoản không hợp lệ. Vui lòng tải lại trang.");
 const input=parseAccountInput(body),db=database(),row=await db.prepare("SELECT * FROM staff_accounts WHERE id = ?").bind(id).first<StaffRow>();
 if(!row)throw new OrderError("Không tìm thấy tài khoản nhân viên.",404);
 if(body.email!==undefined&&normalizeStaffEmail(body.email)!==row.email)throw new OrderError("Không thể đổi email của tài khoản. Hãy tạm khóa tài khoản cũ và thêm email mới.");
 if(ownerEmails().includes(row.email)||(row.user_id&&(await protectedUserIds()).has(row.user_id)))throw new OrderError("Tài khoản chủ quán được bảo vệ; không thể chỉnh sửa hoặc tạm khóa tại đây.",403);
 if(row.id===access.account!.id||row.user_id===access.userId)throw new OrderError("Bạn không thể tự thay đổi quyền hoặc tạm khóa tài khoản của mình.",403);
 const before=publicAccount(row);
 if(!canGrantPermissions(access,before.permissions)||!canGrantPermissions(access,input.permissions))throw new OrderError("Tài khoản này có quyền ngoài phạm vi quản lý của bạn.",403);
 if(row.version!==expectedVersion)throw new OrderError("Tài khoản vừa được cập nhật ở nơi khác. Vui lòng tải lại và kiểm tra trước khi lưu.",409);
 const now=Math.max(Date.now(),row.updated_at+1),auditId=crypto.randomUUID(),guard=actorGuard(access);
 const after:StaffAccount={...before,...input,version:expectedVersion+1,updatedAt:now};
 const action:StaffAudit["action"]=before.status===input.status?"updated":input.status==="suspended"?"suspended":"reactivated";
 const result=await db.batch([
  // Claim this exact account revision before writing the row. A replay or a
  // concurrent update cannot insert an audit event for somebody else's write.
  db.prepare(`INSERT INTO staff_account_audit (id,actor_id,actor_email,account_id,account_email,action,before_json,after_json,created_at)
   SELECT ?,?,?,target.id,target.email,?,?,?,? FROM staff_accounts target
   WHERE target.id = ? AND target.version = ? AND ${guard.sql}`).bind(auditId,access.userId!,access.email!,action,JSON.stringify(before),JSON.stringify(after),now,id,expectedVersion,...guard.values),
  db.prepare(`UPDATE staff_accounts SET name = ?,role = ?,permissions_json = ?,status = ?,version = version + 1,updated_at = ?
   WHERE id = ? AND version = ? AND EXISTS (SELECT 1 FROM staff_account_audit WHERE id = ?)`)
   .bind(input.name,input.role,JSON.stringify(input.permissions),input.status,now,id,expectedVersion,auditId),
  db.prepare("SELECT * FROM staff_accounts WHERE id = ?").bind(id),
  db.prepare("SELECT id FROM staff_account_audit WHERE id = ?").bind(auditId)
 ]);
 if(!result[3].results.length){await ensureActorCurrent(access);throw new OrderError("Tài khoản vừa được cập nhật ở nơi khác. Vui lòng tải lại và kiểm tra trước khi lưu.",409);}
 return {ok:true,account:publicAccount(result[2].results[0] as StaffRow)};
}


export async function getStaffAccess(request:Request):Promise<StaffAccess>{
 const access=await resolveStaffAccess(request);
 if(access.isStaff&&access.userId){const row=await database().prepare("SELECT value FROM settings WHERE key = ?").bind("staff-profile:"+access.userId).first<{value:string}>();if(row)access.profile=JSON.parse(row.value) as StaffProfile;}
 return access;
}
export async function updateOwnProfile(request:Request,body:Record<string,unknown>){
 const access=await getStaffAccess(request);
 if(!access.isStaff||!access.userId)throw new OrderError("Vui lòng đăng nhập bằng tài khoản được cấp quyền tại cửa hàng.",403);
 const fullName=checkedText(body.fullName,80,true),contactEmail=normalizeStaffEmail(body.contactEmail),phone=checkedText(body.phone??"",24),avatar=validateShopLogo(body.avatar??"");
 if(!contactEmail)throw new OrderError("Email liên hệ không hợp lệ.");
 if(phone&&!/^[+0-9(). -]{6,24}$/.test(phone))throw new OrderError("Số điện thoại không hợp lệ.");
 const expected=body.expectedUpdatedAt;
 if(!Number.isSafeInteger(expected)||Number(expected)<0)throw new OrderError("Vui lòng mở lại hồ sơ trước khi lưu.");
 const key="staff-profile:"+access.userId,profile:StaffProfile={fullName,contactEmail,phone,avatar,updatedAt:Math.max(Date.now(),Number(expected)+1)};
 const db=database();
 const result=expected===0
  ?await db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").bind(key,JSON.stringify(profile)).run()
  :await db.prepare("UPDATE settings SET value = ? WHERE key = ? AND json_extract(value,'$.updatedAt') = ?").bind(JSON.stringify(profile),key,expected).run();
 if(result.meta.changes!==1)throw new OrderError("Hồ sơ vừa được thay đổi ở nơi khác. Vui lòng tải lại trang trước khi chỉnh sửa.",409);
 return {profile};
}
