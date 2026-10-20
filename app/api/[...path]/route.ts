import {inStore} from "@/lib/store-database";
import {resolveStore,listStores,createStore,updateStoreStatus,saveStoreBranding} from "@/lib/store-platform";
import {database,seed,deviceIdentity,getTable,getMenu,getShop,publicOrder,json,readBody} from "@/lib/server";
import {getMenuConnection,requestTableSession,requireActiveSession,updateTableSession} from "@/lib/table-sessions";
import {revenueReport,revenueOrders} from "@/lib/revenue-server";
import {listSettlements,getSettlement} from "@/lib/settlement-server";
import {getTablePaymentQuote,payTableBalance} from "@/lib/table-payment-server";
import {transferTable} from "@/lib/table-transfer-server";
import {getDisplaySettings,saveDisplaySettings} from "@/lib/display-settings-server";
import {getThemeSettings,saveThemeSettings} from "@/lib/theme-settings-server";
import {readQrEntry} from "@/lib/qr-entry";
import {validateExtras,validateShopLogo,shopIconSvg,calculateOrder,validatePromotion,canTransition,checkedText,OrderError,categories} from "@/lib/menu";
import type {OrderStatus} from "@/lib/menu";
import {getStaffAccess,updateOwnProfile,listStaffAccounts,createStaffAccount,updateStaffAccount} from "@/lib/staff-access";
import {hasPermission,type Permission} from "@/lib/staff-permissions";
import {adminDashboard} from "@/lib/admin-dashboard";
export const dynamic="force-dynamic";
async function orderHash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,"0")).join("");}
async function matchesOrderHash(savedHash:unknown,currentHash:string,sessionId:string,body:Record<string,unknown>){
 if(savedHash===currentHash)return true;
 // Older orders hashed the physical QR token. Accept their original hash after
 // a move only across this authenticated visit's recorded table history.
 const tables=await database().prepare(`SELECT token FROM dining_tables WHERE id = (SELECT table_id FROM table_sessions WHERE id = ?) OR id IN (SELECT from_table_id FROM table_transfers WHERE session_id = ? UNION SELECT to_table_id FROM table_transfers WHERE session_id = ?)`).bind(sessionId,sessionId,sessionId).all<{token:string}>();
 const hashes=await Promise.all(tables.results.map(table=>orderHash(JSON.stringify({tableToken:table.token,sessionId,items:body.items,note:body.note??"",expectedTotal:body.expectedTotal}))));
 return hashes.includes(savedHash as string);
}
async function handleScoped(request:Request){
 try{
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\//,"");
  const access=path.startsWith("admin")||path==="menu"||path==="account"?await getStaffAccess(request):null;
  if(path.startsWith("admin")&&!access?.isStaff)throw new OrderError("Tài khoản chưa được cấp quyền hoặc đã bị khóa. Vui lòng đăng nhập bằng tài khoản nhân viên được quản trị cấp quyền.",403);
  const allow=(permission:Permission)=>{if(!access||!hasPermission(access,permission))throw new OrderError("Bạn chưa được cấp quyền thực hiện chức năng này.",403);};
  await seed();const db=database();
  if(request.method==="GET"){
   if(path==="branding-icon"){const shop=await getShop();if(shop.logo){const binary=atob(shop.logo.split(",")[1]);return new Response(Uint8Array.from(binary,c=>c.charCodeAt(0)),{headers:{"Content-Type":"image/png","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}return new Response(shopIconSvg(shop.name),{headers:{"Content-Type":"image/svg+xml","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
   if(path==="account")return json({access});
   if(path==="stores")return json(await listStores(request));
   if(path==="admin/accounts"){allow("staff.manage");return json(await listStaffAccounts(access!));}
   if(path==="menu"){const {preview,tableToken,sessionHint}=readQrEntry(url.searchParams),[items,shop,requestedTable,device,displaySettings,themeSettings]=await Promise.all([getMenu(),getShop(),getTable(tableToken,preview),deviceIdentity(request,true),getDisplaySettings(),getThemeSettings()]);const {table,connection}=await getMenuConnection(requestedTable,device.hash,preview,sessionHint);return json({items,shop,table,isStaff:!!access?.isStaff,access,preview,connection,displaySettings,themeSettings},200,device.setCookie?{"Set-Cookie":device.setCookie}:undefined);}
   if(path==="orders"){const {tableToken,sessionHint}=readQrEntry(url.searchParams),table=await getTable(tableToken),session=await requireActiveSession(request,table,sessionHint);const r=await db.prepare("SELECT * FROM orders WHERE client_token = ? AND table_id = ? AND dining_session_id = ? ORDER BY created_at DESC,id DESC").bind(session.browser_hash,table.id,session.id).all<Record<string,unknown>>();return json({orders:r.results.map(publicOrder)});}
   if(path==="admin/revenue"){allow("revenue.view");return json(await revenueReport(url.searchParams));}
   if(path==="admin/revenue/orders"){allow("revenue.view");return json(await revenueOrders(url.searchParams));}
   if(path==="admin/table-payment"){allow("payments.collect");return json(await getTablePaymentQuote(url.searchParams));}
   if(path==="admin/revenue/settlements"){allow("revenue.view");return json(await listSettlements(url.searchParams));}
   if(path.startsWith("admin/revenue/settlements/")&&!path.slice("admin/revenue/settlements/".length).includes("/")){allow("revenue.view");return json(await getSettlement(path.slice("admin/revenue/settlements/".length)));}
   if(path==="admin")return json(await adminDashboard(access!));
   return json({error:"Không tìm thấy nội dung."},404);
  }
  const b=await readBody(request);
  if(path==="account/profile"&&request.method==="PATCH")return json(await updateOwnProfile(request,b));
  if(path==="platform/stores"&&request.method==="POST")return json(await createStore(request,b),201);
  if(path==="store-registration"&&request.method==="POST")return json(await createStore(request,b,true),201);
  if(path==="platform/stores"&&request.method==="PATCH")return json(await updateStoreStatus(request,b));
  if(path==="admin/accounts"&&request.method==="POST"){allow("staff.manage");return json(await createStaffAccount(access!,b),201);}
  if(path==="admin/accounts"&&request.method==="PATCH"){allow("staff.manage");return json(await updateStaffAccount(access!,b));}
  if(request.method==="POST"&&path==="table-session"){
   const table=await getTable(checkedText(b.tableToken,80,true)),result=await requestTableSession(request,table,b.customerName);
   return json({connection:result.connection},result.created?201:200);
  }
  if(request.method==="POST"&&path==="orders/cancel"){
   const table=await getTable(checkedText(b.tableToken,80,true)),session=await requireActiveSession(request,table,b.sessionId);
   const id=checkedText(b.id,60,true),reason=checkedText(b.reason,180,true);
   const owned=()=>db.prepare("SELECT * FROM orders WHERE id = ? AND dining_session_id = ? AND client_token = ?").bind(id,session.id,session.browser_hash).first<Record<string,unknown>>();
   const old=await owned();if(!old)throw new OrderError("Không tìm thấy đơn trong lượt bàn của bạn.",404);
   if(old.status==="cancelled")return json({order:publicOrder(old),replayed:true});
   if(old.status!=="new"||old.paid)throw new OrderError("Quán đã nhận đơn hoặc đơn đã thanh toán. Vui lòng liên hệ nhân viên để được hỗ trợ hủy.",409);
   const changed=await db.prepare("UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ? AND dining_session_id = ? AND client_token = ? AND status = 'new' AND paid = 0 AND EXISTS (SELECT 1 FROM table_sessions s WHERE s.id = orders.dining_session_id AND s.table_id = ? AND s.browser_hash = ? AND s.status = 'active')").bind("Khách hủy: "+reason,Date.now(),id,session.id,session.browser_hash,table.id,session.browser_hash).run();
   const latest=await owned();
   if(changed.meta.changes===0&&latest?.status!=="cancelled")throw new OrderError("Đơn hoặc lượt bàn vừa thay đổi. Vui lòng tải lại; nếu quán đã nhận đơn, hãy liên hệ nhân viên.",409);
   if(!latest)throw new OrderError("Không tìm thấy đơn.",404);
   return json({order:publicOrder(latest),replayed:changed.meta.changes===0});
  }
  if(request.method==="POST"&&path==="orders"){
   const table=await getTable(checkedText(b.tableToken,80,true)),session=await requireActiveSession(request,table,b.sessionId,true);
   if(typeof b.requestId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(b.requestId))throw new OrderError("Mã yêu cầu không hợp lệ.");
   const key=session.id+":"+b.requestId,normalized=JSON.stringify({sessionId:session.id,items:b.items,note:b.note??"",expectedTotal:b.expectedTotal});
   const hash=await orderHash(normalized);
   const existing=await db.prepare("SELECT * FROM orders WHERE request_key = ?").bind(key).first<Record<string,unknown>>();
   if(existing){if(!await matchesOrderHash(existing.request_hash,hash,session.id,b))throw new OrderError("Nội dung đơn đã thay đổi. Vui lòng gửi lại.",409);return json({order:publicOrder(existing),replayed:true});}
   if(table.id!==session.table_id)throw new OrderError("Bàn của bạn vừa được chuyển. Vui lòng tải lại để tiếp tục gọi món tại bàn mới.",403);
   const shop=await getShop();if(!shop.open)throw new OrderError("Quán đang tạm ngừng nhận món. Vui lòng gọi nhân viên.",409);
   const note=checkedText(b.note??"",400),result=calculateOrder(b.items,await getMenu());
   if(b.expectedTotal!==result.total)throw new OrderError("Giá món vừa thay đổi. Vui lòng kiểm tra lại thực đơn và tổng tiền.",409);
   const recent=await db.prepare("SELECT COUNT(*) AS count FROM orders WHERE client_token = ? AND created_at > ?").bind(session.browser_hash,Date.now()-3600000).first<{count:number}>();
   if((recent?.count??0)>=20)throw new OrderError("Bạn đã gửi nhiều đơn. Vui lòng gọi nhân viên để được hỗ trợ.",429);
   const id=crypto.randomUUID(),now=Date.now(),code="M"+now.toString(36).slice(-3).toUpperCase()+id.slice(0,3).toUpperCase();
   await db.prepare("INSERT OR IGNORE INTO orders (id,code,table_id,table_name,dining_session_id,customer_name,client_token,request_key,request_hash,items,total,note,status,paid,cancel_reason,created_at,updated_at) SELECT ?,?,?,?,s.id,s.customer_name,s.browser_hash,?,?,?,?,?,'new',0,'',?,? FROM table_sessions s WHERE s.id = ? AND s.table_id = ? AND s.browser_hash = ? AND s.status = 'active'").bind(id,code,table.id,table.name,key,hash,JSON.stringify(result.items),result.total,note,now,now,session.id,table.id,session.browser_hash).run();
   const saved=await db.prepare("SELECT * FROM orders WHERE request_key = ?").bind(key).first<Record<string,unknown>>();
   if(!saved)throw new OrderError("Lượt phục vụ đã kết thúc hoặc kết nối bàn vừa thay đổi. Vui lòng tải lại trang.",403);
   if(!await matchesOrderHash(saved.request_hash,hash,session.id,b))throw new OrderError("Nội dung đơn đã thay đổi. Vui lòng thử lại.",409);
   return json({order:publicOrder(saved)},201);
  }
  if(request.method==="POST"&&path==="calls"){
   const table=await getTable(checkedText(b.tableToken,80,true)),session=await requireActiveSession(request,table,b.sessionId);if(b.kind!=="service"&&b.kind!=="bill")throw new OrderError("Yêu cầu không hợp lệ.");
   const id=session.id+":"+b.kind; const requestNote=checkedText(b.note??"",300);
   const called=await db.prepare("INSERT INTO service_requests (id,table_id,table_name,session_id,kind,status,created_at,note) SELECT ?,?,?,s.id,?,'open',?,? FROM table_sessions s WHERE s.id = ? AND s.table_id = ? AND s.browser_hash = ? AND s.status = 'active' ON CONFLICT(id) DO UPDATE SET status = excluded.status, note = excluded.note, table_name = excluded.table_name, created_at = MAX(service_requests.created_at + 1, excluded.created_at) WHERE service_requests.status = 'done'").bind(id,table.id,table.name,b.kind,Date.now(),requestNote,session.id,table.id,session.browser_hash).run();
   // A duplicate live call is successful, but a close that won the race must reject this action.
   if(called.meta.changes===0)await requireActiveSession(request,table,session.id);
   return json({ok:true});
  }
  if(request.method==="PATCH"&&path==="admin/session"){allow("tables.manage");const result=await updateTableSession(b.id,b.action);return json({ok:true,...result});}
  if(request.method==="PATCH"&&path==="admin/table-payment"){allow("payments.collect");return json(await payTableBalance(b));}
  if(request.method==="PATCH"&&path==="admin/table-transfer"){allow("tables.transfer");return json(await transferTable(b));}
  if(request.method==="PATCH"&&path==="admin/display-settings"){allow("settings.manage");return json(await saveDisplaySettings(b));}
  if(request.method==="PATCH"&&path==="admin/theme-settings"){allow("settings.manage");return json(await saveThemeSettings(b));}
  if(request.method==="PATCH"&&path==="admin/order"){
   allow(b.action==="paid"?"payments.collect":b.status==="cancelled"?"orders.cancel":"orders.manage");
   const id=checkedText(b.id,60,true),old=await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<Record<string,unknown>>();if(!old)throw new OrderError("Không tìm thấy đơn.",404);
   if(b.action==="paid"){
    if(b.paymentMethod!==undefined&&!["cash","bank","other"].includes(b.paymentMethod))throw new OrderError("Phương thức thanh toán không hợp lệ.");
    if(old.status==="cancelled")throw new OrderError("Đơn đã hủy không thể xác nhận thanh toán.",409);
    // Only the first successful confirmation records collection time/method.
    // A retried request, including a competing cashier request, is idempotent.
    if(old.paid!==1){
     const now=Date.now(),paidUpdate=await db.prepare("UPDATE orders SET paid = 1, paid_at = ?, payment_method = ?, updated_at = ? WHERE id = ? AND status != ? AND paid = 0").bind(now,b.paymentMethod??"unknown",now,id,"cancelled").run();
     if(paidUpdate.meta.changes!==1){
      const latest=await db.prepare("SELECT paid,status FROM orders WHERE id = ?").bind(id).first<{paid:number;status:string}>();
      if(latest?.paid!==1||latest.status==="cancelled")throw new OrderError("Đơn vừa bị hủy. Chưa ghi nhận thanh toán.",409);
     }
    }
   }else{
    if(old.paid&&b.status==="cancelled")throw new OrderError("Đơn đã thanh toán. Vui lòng xử lý hoàn tiền trực tiếp tại quầy.",409);
    if(!canTransition(old.status as OrderStatus,b.status))throw new OrderError("Trạng thái đơn đã thay đổi. Vui lòng tải lại.",409);
    const reason=b.status==="cancelled"?checkedText(b.reason,180,true):"";
    const changed=await db.prepare("UPDATE orders SET status = ?, cancel_reason = ?, updated_at = ? WHERE id = ? AND status = ?"+(b.status==="cancelled"?" AND paid = 0":"")).bind(b.status,reason,Date.now(),id,old.status).run();
    if(changed.meta.changes!==1)throw new OrderError("Đơn vừa được nhân viên khác cập nhật.",409);
   }return json({ok:true});
  }
  if(request.method==="PATCH"&&path==="admin/call"){allow("tables.manage");if(!Number.isInteger(b.createdAt))throw new OrderError("Yêu cầu hỗ trợ không hợp lệ.");const resolved=await db.prepare("UPDATE service_requests SET status = ? WHERE id = ? AND status = ? AND created_at = ?").bind("done",checkedText(b.id,60,true),"open",b.createdAt).run();if(resolved.meta.changes!==1)throw new OrderError("Yêu cầu đã thay đổi. Vui lòng tải lại.",409);return json({ok:true});}
  if(request.method==="PATCH"&&path==="admin/promotion"){
   allow("menu.manage");const id=checkedText(b.id,60,true);
   const item=await db.prepare("SELECT price FROM menu_items WHERE id = ?").bind(id).first<{price:number}>();
   if(!item)throw new OrderError("Không tìm thấy món.",404);
   const promotion=validatePromotion(b.promotion,item.price);
   await db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind("promotion:"+id,JSON.stringify(promotion)).run();return json({ok:true});
  }
  if(request.method==="PATCH"&&path==="admin/item"){
   allow("menu.manage");
   const id=checkedText(b.id??crypto.randomUUID(),60,true);
   if(b.toggle!==undefined){if(b.toggle!==0&&b.toggle!==1)throw new OrderError("Trạng thái món không hợp lệ.");await db.prepare("UPDATE menu_items SET available = ? WHERE id = ?").bind(b.toggle,id).run();return json({ok:true});}
   if(b.available!==0&&b.available!==1)throw new OrderError("Vui lòng chọn trạng thái phục vụ của món.");
   const name=checkedText(b.name,80,true),description=checkedText(b.description??"",240),badge=checkedText(b.badge??"",32);
   if(!categories.some(c=>c.id===b.category&&c.id!=="all"))throw new OrderError("Nhóm món không hợp lệ.");if(!Number.isInteger(b.price)||b.price<1000||b.price>2000000)throw new OrderError("Giá món phải từ 1.000 đến 2.000.000 ₫.");
   let image:string;
   if(typeof b.image==="string"&&b.image.startsWith("data:")){try{image=validateShopLogo(b.image);}catch{throw new OrderError("Ảnh món không hợp lệ. Vui lòng tải ảnh PNG, JPG hoặc WebP từ thiết bị.");}}
   else{image=checkedText(b.image??"/images/hero.webp",1000,true);if(!image.startsWith("/images/")&&!/^https:\/\/[^\s]+$/.test(image))throw new OrderError("Vui lòng tải ảnh hoặc nhập liên kết ảnh HTTPS.");}
   const extras=b.extras===undefined?undefined:validateExtras(b.extras);
   const saved=await db.prepare("SELECT value FROM settings WHERE key = ?").bind("promotion:"+id).first<{value:string}>();
   const promotion=validatePromotion(b.promotion===undefined?(saved?JSON.parse(saved.value):null):b.promotion,b.price);
   const itemWrite=db.prepare("INSERT INTO menu_items (id,name,description,category,price,image,badge,available,sort) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, category = excluded.category, price = excluded.price, image = excluded.image, badge = excluded.badge, available = excluded.available").bind(id,name,description,b.category,b.price,image,badge,b.available===0?0:1,Date.now());await db.batch([itemWrite,...(extras===undefined?[]:[db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind("extras:"+id,JSON.stringify(extras))]),db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind("promotion:"+id,JSON.stringify(promotion))]);return json({ok:true});
  }
  if(request.method==="PATCH"&&path==="admin/shop"){
   allow("settings.manage");
   if(typeof b.open!=="boolean")throw new OrderError("Trạng thái nhận món không hợp lệ.");
   const previous=await getShop();const shop={logo:validateShopLogo(b.logo===undefined?previous.logo:b.logo),name:checkedText(b.name,40,true),tagline:checkedText(b.tagline,60),hours:checkedText(b.hours,50),address:checkedText(b.address,140),open:!!b.open};await saveStoreBranding(shop);return json({ok:true,shop});
  }
  if(request.method==="PATCH"&&path==="admin/table"){
   allow("tables.manage");
   const name=checkedText(b.name,30,true),zone=checkedText(b.zone,40,true);
   if(b.create!==undefined&&typeof b.create!=="boolean")throw new OrderError("Thao tác bàn không hợp lệ.");
   if(b.create===true){
    const requestId=checkedText(b.requestId,36,true);
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId))throw new OrderError("Yêu cầu thêm bàn không hợp lệ. Vui lòng mở lại biểu mẫu.");
    const key="table-create:"+requestId;
    const previous=await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{value:string}>();
    const token=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
    if(!previous)await db.batch([
     db.prepare("INSERT INTO dining_tables (id,name,zone,token) SELECT CAST(COALESCE((SELECT MAX(CAST(id AS INTEGER)) FROM dining_tables),0)+1 AS TEXT),?,?,? WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = ?) AND NOT EXISTS (SELECT 1 FROM dining_tables WHERE lower(trim(name)) = lower(?) AND lower(trim(zone)) = lower(?))").bind(name,zone,token,key,name,zone),
     db.prepare("INSERT OR IGNORE INTO settings (key,value) SELECT ?,json_object('id',id,'name',name,'zone',zone) FROM dining_tables WHERE token = ?").bind(key,token)
    ]);
    const saved=await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{value:string}>();
    if(!saved)throw new OrderError("Tên bàn đã có trong khu vực này. Vui lòng chọn tên khác.",409);
    const created=JSON.parse(saved.value) as {id:string;name:string;zone:string};
    if(created.name!==name||created.zone!==zone)throw new OrderError("Yêu cầu này đã tạo bàn trước đó. Vui lòng tải lại danh sách bàn.",409);
    const table=await db.prepare("SELECT * FROM dining_tables WHERE id = ?").bind(created.id).first<{id:string;name:string;zone:string;token:string}>();
    if(!table)throw new OrderError("Không tìm thấy bàn đã tạo. Vui lòng tải lại.",404);
    const replayed=table.token!==token;return json({ok:true,table,replayed},replayed?200:201);
   }
   const updated=await db.prepare("UPDATE dining_tables SET name = ?, zone = ? WHERE id = ?").bind(name,zone,checkedText(b.id,10,true)).run();
   if(updated.meta.changes!==1)throw new OrderError("Không tìm thấy bàn cần cập nhật.",404);
   return json({ok:true});
  }
  return json({error:"Thao tác không được hỗ trợ."},405);
 }catch(e){if(e instanceof OrderError)return json({error:e.message},e.status);console.error("QR ordering API error",e instanceof Error?e.message:"Unknown error");return json({error:"Chưa kết nối được với quán. Vui lòng thử lại."},500);}
}
async function handle(request:Request){
 try{const store=await resolveStore(request);return await inStore(store.id,async()=>{if(store.status!=="active"&&!(await getStaffAccess(request)).isOwner)throw new OrderError("Cửa hàng đang tạm khóa. Vui lòng liên hệ GAERU Soffware hoặc truy cập /gaeru để chọn cửa hàng khác.",403);return handleScoped(request);});}
 catch(error){if(error instanceof OrderError)return json({error:error.message},error.status);console.error("Store request failed",error instanceof Error?error.message:"Unknown");return json({error:"Chưa kết nối được cửa hàng. Vui lòng thử lại."},500);}
}
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
