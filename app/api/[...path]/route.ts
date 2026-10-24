import {env} from "cloudflare:workers";
import {conditionalJson, conditionalJsonWithEtag} from "@/lib/conditional-json";
import {inStore, currentStoreId} from "@/lib/store-database";
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
import {validateExtras,validateShopLogo,shopIconSvg,calculateOrder,validatePromotion,canTransition,checkedText,OrderError,categories,brandingRevision,publicShop,normalizeOrderItem,projectOrderStatus,canCancelOrder} from "@/lib/menu";
import type {OrderStatus,OrderItem} from "@/lib/menu";
import {getStaffAccess,updateOwnProfile,listStaffAccounts,createStaffAccount,updateStaffAccount} from "@/lib/staff-access";
import {hasPermission,type Permission} from "@/lib/staff-permissions";
import {adminDashboard, getBoardRevision} from "@/lib/admin-dashboard";
import {handleRealtimeUpgrade, notifyRealtimeInvalidation} from "@/lib/realtime-do";
import {getVapidConfig, subscribeStaffDevice, unsubscribeStaffDevice, getStaffSubscriptionStatus, dispatchStaffPush, sendTestPush} from "@/lib/staff-push";
import {listPaidInvoices,paidInvoiceDetail} from "@/lib/paid-invoices-server";
import {saveTableZones} from "@/lib/table-zones-server";
import {getCategories, saveCategories} from "@/lib/categories-server";
import {getBannerConfig, saveBannerConfig} from "@/lib/banner-server";
import {recordServiceReminder} from "@/lib/service-reminders";
import {cancelUnservedLine,transitionFromStage} from "@/lib/order-line-transition";
import {
  ensurePlatformSchema,
  isSelfAuthMode,
  verifyCsrf,
  resolveIdentity,
  loginWithPassword,
  logoutSession,
  setPasswordWithToken,
  changePassword,
  bootstrapOwner,
  canBootstrap,
  createActivationToken,
  createResetToken,
  revokeUserSessions,
} from "@/lib/auth";
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
  const actor=(access?.account?.name||access?.profile?.fullName||"Nhân viên")+" · "+(access?.userId||access?.account?.id||"staff");
  const allow=(permission:Permission)=>{if(!access||!hasPermission(access,permission))throw new OrderError("Bạn chưa được cấp quyền thực hiện chức năng này.",403);};
  await seed();const db=database();
  if(request.method==="GET"){
   if(path==="shop-info"){const [shop,themeSettings]=await Promise.all([getShop(),getThemeSettings()]);return json({shop:{...shop,logo:shop.logo?"/api/branding-icon?store="+encodeURIComponent(currentStoreId())+"&v="+brandingRevision(shop):""},themeSettings});}
   if(path==="branding-icon"){const shop=await getShop();if(url.searchParams.has("v")&&url.searchParams.get("v")!==brandingRevision(shop))return json({error:"Ảnh thương hiệu đã thay đổi. Vui lòng tải lại trang."},404);const headers={"Cache-Control":url.searchParams.get("v")===brandingRevision(shop)?"public, max-age=31536000, immutable":"no-store","X-Content-Type-Options":"nosniff"};if(shop.logo){const binary=atob(shop.logo.split(",")[1]);return new Response(Uint8Array.from(binary,c=>c.charCodeAt(0)),{headers:{"Content-Type":"image/png",...headers}});}return new Response(shopIconSvg(shop.name),{headers:{"Content-Type":"image/svg+xml",...headers}});}
   if(path==="account")return json({access});
   if(path==="realtime/ws")return handleRealtimeUpgrade(request,currentStoreId(),access);
   if(path==="stores")return json(await listStores(request));
   if(path==="admin/push/config")return json({enabled: getVapidConfig().enabled, vapidPublicKey: getVapidConfig().publicKey || null});
   if(path==="admin/push/status"){
    const deviceId = url.searchParams.get("deviceId") || "";
    const userId = access?.userId || access?.email || "";
    const config=getVapidConfig();
    return json({...await getStaffSubscriptionStatus({userId, deviceId}),enabled:config.enabled,vapidPublicKey:config.publicKey||null});
   }
   if(path==="admin/accounts"){allow("staff.manage");return json(await listStaffAccounts(access!));}
   if(path==="admin/categories"){allow("settings.manage");return json(await getCategories());}
   if(path==="admin/banner"){allow("settings.manage");return json(await getBannerConfig());}
   if(path==="menu"){const {preview,tableToken,sessionHint}=readQrEntry(url.searchParams),[items,shop,requestedTable,device,displaySettings,themeSettings,categories,banner]=await Promise.all([getMenu(),getShop(),getTable(tableToken,preview),deviceIdentity(request,true),getDisplaySettings(),getThemeSettings(),getCategories(),getBannerConfig()]);const {table,connection}=await getMenuConnection(requestedTable,device.hash,preview,sessionHint);const callSummary=connection.state==="active"&&connection.session?(await db.prepare("SELECT kind,request_count AS requestCount,created_at + 30000 AS nextAllowedAt FROM service_requests WHERE session_id = ?").bind(connection.session.id).all()).results:[];return conditionalJson(request,{callSummary,items,shop:publicShop(shop,currentStoreId()),table,isStaff:!!access?.isStaff,access,preview,connection,displaySettings,themeSettings,categories,banner},device.setCookie?{"Set-Cookie":device.setCookie}:undefined);}
   if(path==="orders"){const {tableToken,sessionHint}=readQrEntry(url.searchParams),table=await getTable(tableToken),session=await requireActiveSession(request,table,sessionHint);const r=await db.prepare("SELECT * FROM orders WHERE client_token = ? AND table_id = ? AND dining_session_id = ? ORDER BY created_at DESC,id DESC").bind(session.browser_hash,table.id,session.id).all<Record<string,unknown>>();return json({orders:r.results.map(publicOrder)});}
   if(path==="admin/bill-history"){
    if(!access||(!hasPermission(access,"orders.view")&&!hasPermission(access,"revenue.view")))throw new OrderError("Bạn chưa có quyền xem hóa đơn.",403);
    const sessionId=checkedText(url.searchParams.get("session"),128,true);
    try {
     const result=await db.prepare("SELECT id,order_id AS orderId,kind,actor,at,before_json AS beforeJson,after_json AS afterJson FROM order_audit WHERE session_id = ? ORDER BY id").bind(sessionId).all<Record<string,unknown>>();
     return json({history:result.results.map(row=>({id:row.id,orderId:row.orderId,kind:row.kind,actor:row.actor,at:row.at,before:row.beforeJson?JSON.parse(String(row.beforeJson)):null,after:JSON.parse(String(row.afterJson))}))});
    } catch {
     return json({history:[]});
    }
   }
   if(path==="admin/invoices"){allow("revenue.view");return json(await listPaidInvoices(url.searchParams));}
   if(path.startsWith("admin/invoices/")){allow("revenue.view");return json(await paidInvoiceDetail(decodeURIComponent(path.slice("admin/invoices/".length))));}
   if(path==="admin/revenue"){allow("revenue.view");return json(await revenueReport(url.searchParams));}
   if(path==="admin/revenue/orders"){allow("revenue.view");return json(await revenueOrders(url.searchParams));}
   if(path==="admin/table-payment"){allow("payments.collect");return json(await getTablePaymentQuote(url.searchParams));}
   if(path==="admin/revenue/settlements"){allow("revenue.view");return json(await listSettlements(url.searchParams));}
   if(path.startsWith("admin/revenue/settlements/")&&!path.slice("admin/revenue/settlements/".length).includes("/")){allow("revenue.view");return json(await getSettlement(path.slice("admin/revenue/settlements/".length)));}
   if(path==="admin"){
    const compact=url.searchParams.get("section")==="board";
    if(compact&&request.headers.has("If-None-Match")){
     const revision=await getBoardRevision(access!,currentStoreId());
     if(request.headers.get("If-None-Match")===revision){
      return new Response(null,{status:304,headers:{"ETag":revision,"Cache-Control":"no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff"}});
     }
    }
    const data=await adminDashboard(access!,!compact);
    const payload={...data,compact,shop:data.shop.logo?{...data.shop,logo:"/api/branding-icon?store="+encodeURIComponent(currentStoreId())+"&v="+brandingRevision(data.shop)}:data.shop};
    if(compact){
     const revision=await getBoardRevision(access!,currentStoreId());
     return conditionalJsonWithEtag(request,payload,revision);
    }
    return conditionalJson(request,payload);
   }
   return json({error:"Không tìm thấy nội dung."},404);
  }
  const b=await readBody(request);
  if(path==="account/profile"&&request.method==="PATCH")return json(await updateOwnProfile(request,b));
  if(path==="platform/stores"&&request.method==="POST")return json(await createStore(request,b),201);
  if(path==="store-registration"&&request.method==="POST")return json(await createStore(request,b,true),201);
  if(path==="platform/stores"&&request.method==="PATCH")return json(await updateStoreStatus(request,b));
  if(path==="admin/accounts"&&request.method==="POST"){allow("staff.manage");return json(await createStaffAccount(access!,b),201);}
  if(path==="admin/accounts"&&request.method==="PATCH"){allow("staff.manage");return json(await updateStaffAccount(access!,b));}
  if(path==="admin/accounts/activation-link"&&request.method==="POST"){
   allow("staff.manage");
   const origin=new URL(request.url).origin;
   const actorEmail = access!.email || access!.userId || "system";
   const activationUrl=await createActivationToken(actorEmail,String(b.email),origin);
   return json({activationUrl});
  }
  if(path==="admin/accounts/reset-link"&&request.method==="POST"){
   allow("staff.manage");
   const origin=new URL(request.url).origin;
   const actorEmail = access!.email || access!.userId || "system";
   const resetUrl=await createResetToken(actorEmail,String(b.email),origin);
   return json({resetUrl});
  }
  if(path==="admin/accounts/revoke-sessions"&&request.method==="POST"){
   allow("staff.manage");
   const actorEmail = access!.email || access!.userId || "system";
   await revokeUserSessions(actorEmail,String(b.email));
   return json({ok:true});
  }
  if(path==="admin/push/subscribe"&&request.method==="POST"){
   const userId = access!.userId || access!.email;
   if(!userId)throw new OrderError("Không xác định được danh tính nhân viên.",401);
   const sub = b.subscription as {endpoint: string; keys: {p256dh: string; auth: string}} | undefined;
   await subscribeStaffDevice({
     userId,
     staffAccountId: access!.account?.id ?? null,
     deviceId: b.deviceId as string,
     endpoint: sub?.endpoint as string,
     p256dh: sub?.keys?.p256dh as string,
     auth: sub?.keys?.auth as string,
   });
   return json({ok:true});
  }
  if(path==="admin/push/unsubscribe"&&request.method==="POST"){
   const userId = access!.userId || access!.email;
   if(!userId)throw new OrderError("Không xác định được danh tính nhân viên.",401);
   await unsubscribeStaffDevice({
     userId,
     deviceId: b.deviceId as string,
     endpoint: b.endpoint as string,
   });
   return json({ok:true});
  }
  if(path==="admin/push/test"&&request.method==="POST"){
   const userId = access!.userId || access!.email;
   if(!userId)throw new OrderError("Không xác định được danh tính nhân viên.",401);
   const deviceId = (b.deviceId as string) || "";
   const storeId = currentStoreId();
   return json(await sendTestPush({userId, deviceId, storeId}));
  }
  if(request.method==="POST"&&path==="table-session"){
   const table=await getTable(checkedText(b.tableToken,80,true)),result=await requestTableSession(request,table,b.customerName);
   if(result.created){
    notifyRealtimeInvalidation(currentStoreId(),"board");
    dispatchStaffPush({
      storeId: currentStoreId(),
      requiredPermission: "tables.manage",
      eventType: "table_opening",
      eventTag: `${currentStoreId()}:table_opening:${result.connection.session?.id ?? Date.now()}`,
      title: "Yêu cầu mở bàn mới",
      body: `${table.name} — Yêu cầu mở bàn cần duyệt`,
      url: "/?view=admin&tab=tables",
    });
   }
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
   if(changed.meta.changes>0)notifyRealtimeInvalidation(currentStoreId(),"orders");
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
   const orderInsert=await db.prepare("INSERT OR IGNORE INTO orders (id,code,table_id,table_name,dining_session_id,customer_name,client_token,request_key,request_hash,items,total,note,status,paid,cancel_reason,created_at,updated_at) SELECT ?,?,?,?,s.id,s.customer_name,s.browser_hash,?,?,?,?,?,'new',0,'',?,? FROM table_sessions s WHERE s.id = ? AND s.table_id = ? AND s.browser_hash = ? AND s.status = 'active'").bind(id,code,table.id,table.name,key,hash,JSON.stringify(result.items),result.total,note,now,now,session.id,table.id,session.browser_hash).run();
   const saved=await db.prepare("SELECT * FROM orders WHERE request_key = ?").bind(key).first<Record<string,unknown>>();
   if(!saved)throw new OrderError("Lượt phục vụ đã kết thúc hoặc kết nối bàn vừa thay đổi. Vui lòng tải lại trang.",403);
   if(!await matchesOrderHash(saved.request_hash,hash,session.id,b))throw new OrderError("Nội dung đơn đã thay đổi. Vui lòng thử lại.",409);
   if(orderInsert.meta.changes===1){
    notifyRealtimeInvalidation(currentStoreId(),"orders");
    dispatchStaffPush({
      storeId: currentStoreId(),
      requiredPermission: "orders.view",
      eventType: "order_new",
      eventTag: `${currentStoreId()}:order_new:${id}`,
      title: "Đơn gọi món mới",
      body: `${table.name} — Đơn ${code}`,
      url: "/?view=admin&tab=orders",
    });
   }
   return json({order:publicOrder(saved)},201);
  }
  if(request.method==="POST"&&path==="calls"){
   const table=await getTable(checkedText(b.tableToken,80,true)),session=await requireActiveSession(request,table,b.sessionId);if(b.kind!=="service"&&b.kind!=="bill")throw new OrderError("Yêu cầu không hợp lệ.");
   const result=await recordServiceReminder(table,session,b);
   if(result.accepted){
    notifyRealtimeInvalidation(currentStoreId(),"board");
    dispatchStaffPush({storeId:currentStoreId(),requiredPermission:"tables.manage",eventType:"service_request",eventTag:`${currentStoreId()}:service_request:${session.id}:${b.kind}:${result.requestCount}`,title:b.kind==="bill"?"Nhắc thanh toán":"Khách gọi nhân viên",body:`${table.name} · lần ${result.requestCount}${b.note?" — "+String(b.note):""}`,url:"/?view=admin&tab=support"});
   }
   return json(result);
  }
  if(request.method==="PATCH"&&path==="admin/session"){allow("tables.manage");const result=await updateTableSession(b.id,b.action);notifyRealtimeInvalidation(currentStoreId(),"board");return json({ok:true,...result});}
  if(request.method==="PATCH"&&path==="admin/table-payment"){allow("payments.collect");const res=await payTableBalance(b,actor);notifyRealtimeInvalidation(currentStoreId(),"board");return json(res);}
  if(request.method==="PATCH"&&path==="admin/table-transfer"){allow("tables.transfer");const res=await transferTable(b);notifyRealtimeInvalidation(currentStoreId(),"board");return json(res);}
  if(request.method==="PATCH"&&path==="admin/zones"){allow("tables.manage");const result=await saveTableZones(b);notifyRealtimeInvalidation(currentStoreId(),"board");return json(result);}
  if(request.method==="PATCH"&&path==="admin/display-settings"){allow("settings.manage");return json(await saveDisplaySettings(b));}
  if(request.method==="PATCH"&&path==="admin/theme-settings"){allow("settings.manage");return json(await saveThemeSettings(b));}
  if((request.method==="PATCH"||request.method==="POST")&&path==="admin/categories"){allow("settings.manage");const res=await saveCategories(b.categories??b);notifyRealtimeInvalidation(currentStoreId(),"menu");return json(res);}
  if((request.method==="PATCH"||request.method==="POST")&&path==="admin/banner"){allow("settings.manage");const res=await saveBannerConfig(b.banner??b);notifyRealtimeInvalidation(currentStoreId(),"menu");return json(res);}
  if(request.method==="PATCH"&&path==="admin/order"){
   allow(b.action==="paid"?"payments.collect":b.action==="line_cancel"||b.status==="cancelled"?"orders.cancel":"orders.manage");
   const id=checkedText(b.id,60,true),old=await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<Record<string,unknown>>();if(!old)throw new OrderError("Không tìm thấy đơn.",404);
   if(b.action==="paid"){
    if(b.paymentMethod!==undefined&&!["cash","bank","other"].includes(b.paymentMethod))throw new OrderError("Phương thức thanh toán không hợp lệ.");
    if(old.status==="cancelled")throw new OrderError("Đơn đã hủy không thể xác nhận thanh toán.",409);
    // Only the first successful confirmation records collection time/method.
    // A retried request, including a competing cashier request, is idempotent.
    if(old.paid!==1){
     const now=Date.now(),paidUpdate=await db.prepare("UPDATE orders SET paid = 1, paid_at = ?, payment_method = ?, updated_at = ?, last_actor = ? WHERE id = ? AND status != ? AND paid = 0").bind(now,b.paymentMethod??"unknown",now,actor,id,"cancelled").run();
     if(paidUpdate.meta.changes!==1){
      const latest=await db.prepare("SELECT paid,status FROM orders WHERE id = ?").bind(id).first<{paid:number;status:string}>();
      if(latest?.paid!==1||latest.status==="cancelled")throw new OrderError("Đơn vừa bị hủy. Chưa ghi nhận thanh toán.",409);
     }
    }
   }else if(b.action==="line_cancel"){
    const lineId=checkedText(b.orderLineId,60,true),reason=checkedText(b.reason,180,true),requestId=checkedText(b.requestId,36,true);
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId))throw new OrderError("Mã yêu cầu hủy món không hợp lệ.");
    const rawItems=JSON.parse(old.items as string) as OrderItem[];
    const replay=rawItems.flatMap(item=>(item.cancellations??[]).map(value=>({...value,lineId:item.orderLineId}))).find(value=>value.requestId===requestId);
    if(replay){if(replay.lineId!==lineId||replay.reason!==reason||replay.quantity!==b.count)throw new OrderError("Mã yêu cầu hủy món đã dùng cho nội dung khác.",409);return json({ok:true,replayed:true});}
    if(old.paid||old.status==="cancelled")throw new OrderError("Món đã thanh toán hoặc đã hủy. Không thể hủy thêm.",409);
    const index=rawItems.findIndex((item,index)=>normalizeOrderItem(item,old.status as OrderStatus,index).orderLineId===lineId);
    if(index<0)throw new OrderError("Không tìm thấy món cần hủy.",404);
    if(b.expectedUpdatedAt!==old.updated_at)throw new OrderError("Đơn vừa thay đổi. Kiểm tra lại món trước khi hủy.",409);
    const updatedItems=rawItems.map((item,i)=>normalizeOrderItem(item,old.status as OrderStatus,i));
    updatedItems[index]=cancelUnservedLine(updatedItems[index],b.count,reason,requestId,Date.now());
    const nextStatus=projectOrderStatus(updatedItems,old.status as OrderStatus);
    const activeTotal=updatedItems.reduce((sum,item)=>sum+item.total,0);
    const total=nextStatus==="cancelled"?updatedItems.reduce((sum,item)=>sum+item.unitPrice*(item.cancellations??[]).reduce((n,value)=>n+value.quantity,0),0):activeTotal;
    const changed=await db.prepare("UPDATE orders SET items = ?, total = ?, status = ?, cancel_reason = ?, updated_at = ?, last_actor = ? WHERE id = ? AND paid = 0 AND status != 'cancelled' AND updated_at = ? AND items = ? AND (dining_session_id IS NULL OR EXISTS (SELECT 1 FROM table_sessions s WHERE s.id = orders.dining_session_id AND s.status = 'active'))").bind(JSON.stringify(updatedItems),total,nextStatus,nextStatus==="cancelled"?reason:old.cancel_reason,Math.max(Date.now(),Number(old.updated_at)+1),actor,id,old.updated_at,old.items).run();
    if(changed.meta.changes!==1)throw new OrderError("Món vừa được phục vụ, thanh toán hoặc cập nhật. Chưa hủy món; hãy tải lại.",409);
   }else if(b.action==="line_transition"||b.orderLineId){
    if(old.status==="cancelled")throw new OrderError("Đơn đã hủy không thể cập nhật món.",409);
    if(b.expectedUpdatedAt!==undefined&&b.expectedUpdatedAt!==old.updated_at)throw new OrderError("Đơn vừa thay đổi. Vui lòng kiểm tra lại món.",409);
    const lineId=checkedText(b.orderLineId,60,true);
    const toStatus=b.toStatus as OrderStatus;
    if(!["preparing","ready","served"].includes(toStatus))throw new OrderError("Trạng thái món không hợp lệ.");
    const rawItems=JSON.parse(old.items as string) as OrderItem[];
    let found=false;
    const updatedItems=rawItems.map((item,idx)=>{
     const norm=normalizeOrderItem(item,old.status as OrderStatus,idx);
     if(norm.orderLineId!==lineId&&norm.itemId!==b.itemId)return norm;
     found=true;
     if(b.fromStatus!==undefined)return transitionFromStage(norm,b.fromStatus,toStatus,b.count);
     let avail=0;
     if(toStatus==="preparing")avail=norm.newCount;
     else if(toStatus==="ready")avail=norm.preparingCount>0?norm.preparingCount:norm.newCount;
     else if(toStatus==="served")avail=norm.readyCount>0?norm.readyCount:norm.preparingCount>0?norm.preparingCount:norm.newCount;
     const count=typeof b.count==="number"&&b.count>0?Math.min(b.count,avail):avail;
     if(count<=0)throw new OrderError("Món đã được cập nhật trạng thái khác. Vui lòng tải lại trang.",409);
     if(toStatus==="preparing"){
      return {...norm,newCount:norm.newCount-count,preparingCount:norm.preparingCount+count};
     }
     if(toStatus==="ready"){
      const fromPrep=Math.min(count,norm.preparingCount);
      const fromNew=count-fromPrep;
      return {...norm,newCount:norm.newCount-fromNew,preparingCount:norm.preparingCount-fromPrep,readyCount:norm.readyCount+count};
     }
     if(toStatus==="served"){
      const fromReady=Math.min(count,norm.readyCount);
      const rem=count-fromReady;
      const fromPrep=Math.min(rem,norm.preparingCount);
      const fromNew=rem-fromPrep;
      return {...norm,newCount:norm.newCount-fromNew,preparingCount:norm.preparingCount-fromPrep,readyCount:norm.readyCount-fromReady,servedCount:norm.servedCount+count};
     }
     return norm;
    });
    if(!found)throw new OrderError("Không tìm thấy món cần cập nhật.",404);
    const nextStatus=projectOrderStatus(updatedItems,old.status as OrderStatus);
    const changed=await db.prepare("UPDATE orders SET items = ?, status = ?, updated_at = ?, last_actor = ? WHERE id = ? AND updated_at = ? AND items = ?").bind(JSON.stringify(updatedItems),nextStatus,Math.max(Date.now(),Number(old.updated_at)+1),actor,id,old.updated_at,old.items).run();
    if(changed.meta.changes!==1)throw new OrderError("Đơn vừa được nhân viên khác cập nhật.",409);
   }else{
    if(old.paid&&b.status==="cancelled")throw new OrderError("Đơn đã thanh toán. Vui lòng xử lý hoàn tiền trực tiếp tại quầy.",409);
    if(b.status==="cancelled"&&!canCancelOrder(publicOrder(old)))throw new OrderError("Đơn đã có món được phục vụ hoặc đã thanh toán. Không thể hủy.",409);
    if(!canTransition(old.status as OrderStatus,b.status))throw new OrderError("Trạng thái đơn đã thay đổi. Vui lòng tải lại.",409);
    const rawItems=JSON.parse(old.items as string) as OrderItem[];
    const updatedItems=rawItems.map((item,idx)=>{
     const norm=normalizeOrderItem(item,old.status as OrderStatus,idx);
     if(b.status==="preparing"){
      return {...norm,newCount:0,preparingCount:norm.quantity-norm.readyCount-norm.servedCount};
     }
     if(b.status==="ready"){
      return {...norm,newCount:0,preparingCount:0,readyCount:norm.quantity-norm.servedCount};
     }
     if(b.status==="served"){
      return {...norm,newCount:0,preparingCount:0,readyCount:0,servedCount:norm.quantity};
     }
     return norm;
    });
    const reason=b.status==="cancelled"?checkedText(b.reason,180,true):"";
    const changed=await db.prepare("UPDATE orders SET items = ?, status = ?, cancel_reason = ?, updated_at = ?, last_actor = ? WHERE id = ? AND status = ? AND updated_at = ? AND items = ?"+(b.status==="cancelled"?" AND paid = 0":"")).bind(JSON.stringify(updatedItems),b.status,reason,Math.max(Date.now(),Number(old.updated_at)+1),actor,id,old.status,old.updated_at,old.items).run();
    if(changed.meta.changes!==1)throw new OrderError("Đơn vừa được nhân viên khác cập nhật.",409);
   }notifyRealtimeInvalidation(currentStoreId(),"orders");return json({ok:true});
  }
  if(request.method==="PATCH"&&path==="admin/call"){allow("tables.manage");if(!Number.isInteger(b.createdAt))throw new OrderError("Yêu cầu hỗ trợ không hợp lệ.");const resolved=await db.prepare("UPDATE service_requests SET status = ?, pending_count = 0 WHERE id = ? AND status = ? AND created_at = ?").bind("done",checkedText(b.id,60,true),"open",b.createdAt).run();if(resolved.meta.changes!==1)throw new OrderError("Yêu cầu đã thay đổi. Vui lòng tải lại.",409);notifyRealtimeInvalidation(currentStoreId(),"board");return json({ok:true});}
  if(request.method==="PATCH"&&path==="admin/promotion"){
   allow("menu.manage");const id=checkedText(b.id,60,true);
   const item=await db.prepare("SELECT price FROM menu_items WHERE id = ?").bind(id).first<{price:number}>();
   if(!item)throw new OrderError("Không tìm thấy món.",404);
   const promotion=validatePromotion(b.promotion,item.price);
   await db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind("promotion:"+id,JSON.stringify(promotion)).run();notifyRealtimeInvalidation(currentStoreId(),"menu");return json({ok:true});
  }
  if(request.method==="PATCH"&&path==="admin/item"){
   allow("menu.manage");
   const id=checkedText(b.id??crypto.randomUUID(),60,true);
   if(b.toggle!==undefined){if(b.toggle!==0&&b.toggle!==1)throw new OrderError("Trạng thái món không hợp lệ.");await db.prepare("UPDATE menu_items SET available = ? WHERE id = ?").bind(b.toggle,id).run();notifyRealtimeInvalidation(currentStoreId(),"menu");return json({ok:true});}
   if(b.available!==0&&b.available!==1)throw new OrderError("Vui lòng chọn trạng thái phục vụ của món.");
   const name=checkedText(b.name,80,true),description=checkedText(b.description??"",240),badge=checkedText(b.badge??"",32);
   if(!categories.some(c=>c.id===b.category&&c.id!=="all"))throw new OrderError("Nhóm món không hợp lệ.");if(!Number.isInteger(b.price)||b.price<1000||b.price>2000000)throw new OrderError("Giá món phải từ 1.000 đến 2.000.000 ₫.");
   let image:string;
   if(typeof b.image==="string"&&b.image.startsWith("data:")){try{image=validateShopLogo(b.image);}catch{throw new OrderError("Ảnh món không hợp lệ. Vui lòng tải ảnh PNG, JPG hoặc WebP từ thiết bị.");}}
   else{image=checkedText(b.image??"/images/hero.webp",1000,true);if(!image.startsWith("/images/")&&!/^https:\/\/[^\s]+$/.test(image))throw new OrderError("Vui lòng tải ảnh hoặc nhập liên kết ảnh HTTPS.");}
   const extras=b.extras===undefined?undefined:validateExtras(b.extras);
   const saved=await db.prepare("SELECT value FROM settings WHERE key = ?").bind("promotion:"+id).first<{value:string}>();
   const promotion=validatePromotion(b.promotion===undefined?(saved?JSON.parse(saved.value):null):b.promotion,b.price);
   const itemWrite=db.prepare("INSERT INTO menu_items (id,name,description,category,price,image,badge,available,sort) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, category = excluded.category, price = excluded.price, image = excluded.image, badge = excluded.badge, available = excluded.available").bind(id,name,description,b.category,b.price,image,badge,b.available===0?0:1,Date.now());await db.batch([itemWrite,...(extras===undefined?[]:[db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind("extras:"+id,JSON.stringify(extras))]),db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind("promotion:"+id,JSON.stringify(promotion))]);notifyRealtimeInvalidation(currentStoreId(),"menu");return json({ok:true});
  }
  if(request.method==="PATCH"&&path==="admin/shop"){
   allow("settings.manage");
   if(typeof b.open!=="boolean")throw new OrderError("Trạng thái nhận món không hợp lệ.");
   const previous=await getShop();const shop={logo:b.logo===undefined?previous.logo:validateShopLogo(b.logo,45000),name:checkedText(b.name,40,true),tagline:checkedText(b.tagline,60),hours:checkedText(b.hours,50),address:checkedText(b.address,140),open:!!b.open};await saveStoreBranding(shop);notifyRealtimeInvalidation(currentStoreId(),"board");return json({ok:true,shop});
  }
  if(request.method==="PATCH"&&path==="admin/table"){
   allow("tables.manage");
   if(b.action==="delete"){
    const id=checkedText(b.id,10,true);
    const existing=await db.prepare("SELECT id FROM dining_tables WHERE id = ?").bind(id).first();
    if(!existing)throw new OrderError("Không tìm thấy bàn cần xóa.",404);
    // One guarded write: a concurrently opened session or historical reference blocks deletion.
    const removed=await db.prepare("DELETE FROM dining_tables WHERE id = ? AND NOT EXISTS (SELECT 1 FROM table_sessions WHERE table_id = ?) AND NOT EXISTS (SELECT 1 FROM orders WHERE table_id = ?) AND NOT EXISTS (SELECT 1 FROM service_requests WHERE table_id = ?) AND NOT EXISTS (SELECT 1 FROM table_settlements WHERE table_id = ?) AND NOT EXISTS (SELECT 1 FROM table_payment_receipts WHERE table_id = ?) AND NOT EXISTS (SELECT 1 FROM table_transfers WHERE from_table_id = ? OR to_table_id = ?)").bind(id,id,id,id,id,id,id,id).run();
    if(removed.meta.changes!==1)throw new OrderError("Bàn đang có lượt phục vụ hoặc lịch sử liên quan nên không thể xóa. Lịch sử được giữ nguyên; bạn vẫn có thể sửa tên bàn.",409);
    notifyRealtimeInvalidation(currentStoreId(),"board");
    return json({ok:true});
   }
   const name=checkedText(b.name,30,true),zone=checkedText(b.zone,40,true);
   if(b.create!==undefined&&typeof b.create!=="boolean")throw new OrderError("Thao tác bàn không hợp lệ.");
   if(b.create===true){
    const requestId=checkedText(b.requestId,36,true);
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId))throw new OrderError("Yêu cầu thêm bàn không hợp lệ. Vui lòng mở lại biểu mẫu.");
    const key="table-create:"+requestId;
    const previous=await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{value:string}>();
    const token=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
    if(!previous)await db.batch([
     db.prepare("INSERT INTO dining_tables (id,name,zone,token) SELECT CAST(COALESCE((SELECT MAX(n) FROM (SELECT CAST(id AS INTEGER) AS n FROM dining_tables UNION ALL SELECT CAST(json_extract(value,'$.id') AS INTEGER) AS n FROM settings WHERE key LIKE 'table-create:%')),0)+1 AS TEXT),?,?,? WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = ?) AND NOT EXISTS (SELECT 1 FROM dining_tables WHERE lower(trim(name)) = lower(?) AND lower(trim(zone)) = lower(?))").bind(name,zone,token,key,name,zone),
     db.prepare("INSERT OR IGNORE INTO settings (key,value) SELECT ?,json_object('id',id,'name',name,'zone',zone) FROM dining_tables WHERE token = ?").bind(key,token)
    ]);
    const saved=await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{value:string}>();
    if(!saved)throw new OrderError("Tên bàn đã có trong khu vực này. Vui lòng chọn tên khác.",409);
    const created=JSON.parse(saved.value) as {id:string;name:string;zone:string};
    if(created.name!==name||created.zone!==zone)throw new OrderError("Yêu cầu này đã tạo bàn trước đó. Vui lòng tải lại danh sách bàn.",409);
    const table=await db.prepare("SELECT * FROM dining_tables WHERE id = ?").bind(created.id).first<{id:string;name:string;zone:string;token:string}>();
    if(!table)throw new OrderError("Không tìm thấy bàn đã tạo. Vui lòng tải lại.",404);
    const replayed=table.token!==token;
    if(!replayed)notifyRealtimeInvalidation(currentStoreId(),"board");
    return json({ok:true,table,replayed},replayed?200:201);
   }
   const updated=await db.prepare("UPDATE dining_tables SET name = ?, zone = ? WHERE id = ?").bind(name,zone,checkedText(b.id,10,true)).run();
   if(updated.meta.changes!==1)throw new OrderError("Không tìm thấy bàn cần cập nhật.",404);
   notifyRealtimeInvalidation(currentStoreId(),"board");
   return json({ok:true});
  }
  return json({error:"Thao tác không được hỗ trợ."},405);
 }catch(e){if(e instanceof OrderError)return json({error:e.message},e.status);console.error("QR ordering API error",e instanceof Error?e.message:"Unknown error");return json({error:"Chưa kết nối được với quán. Vui lòng thử lại."},500);}
}
async function handle(request:Request){
 const t0 = performance.now();
 try{
  verifyCsrf(request);
  await ensurePlatformSchema();
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\//,"");

  if(path.startsWith("auth/")){
   const resolveAccessSafe=async(cookieHeader:string,fallback:{userId?:string;email?:string})=>{
    try{
     const store=await resolveStore(request).catch(()=>({id:"main"}));
     const storeId=store?.id||"main";
     const accessReq=new Request(request.url,{headers:{"cookie":cookieHeader.split(";")[0]}});
     return await inStore(storeId,()=>getStaffAccess(accessReq));
    }catch{
     return {
      authenticated:true,
      userId:fallback.userId??null,
      email:fallback.email??null,
      isStaff:true,
      isOwner:true,
      permissions:[],
      account:null,
     };
    }
   };

   if(path==="auth/login"&&request.method==="POST"){
    const b=await readBody(request) as {email?:unknown;password?:unknown};
    const result=await loginWithPassword(request,b);
    const access=await resolveAccessSafe(result.cookie,result.identity);
    return json({access,mustChangePassword:result.identity.mustChangePassword??false},200,{"Set-Cookie":result.cookie});
   }
   if(path==="auth/logout"&&request.method==="POST"){
    const result=await logoutSession(request);
    return json({ok:true},200,{"Set-Cookie":result.cookie});
   }
   if(path==="auth/set-password"&&request.method==="POST"){
    const b=await readBody(request) as {token?:unknown;password?:unknown;displayName?:unknown};
    const result=await setPasswordWithToken(request,b);
    const access=await resolveAccessSafe(result.cookie,result.identity);
    return json({ok:true,access},200,{"Set-Cookie":result.cookie});
   }
   if(path==="auth/change-password"&&request.method==="POST"){
    const b=await readBody(request) as {currentPassword?:unknown;newPassword?:unknown};
    await changePassword(request,b);
    return json({ok:true});
   }
   if(path==="auth/bootstrap"&&request.method==="POST"){
    const b=await readBody(request) as {setupToken?:unknown;email?:unknown;displayName?:unknown;password?:unknown};
    const result=await bootstrapOwner(request,b);
    const access=await resolveAccessSafe(result.cookie,result.identity);
    return json({ok:true,access},200,{"Set-Cookie":result.cookie});
   }
   if(path==="auth/bootstrap-status"&&request.method==="GET"){
    return json(await canBootstrap());
   }
   return json({error:"Thao tác không được hỗ trợ."},405);
  }

  if(isSelfAuthMode()){
   const identity=await resolveIdentity(request);
   if(identity?.mustChangePassword&&path!=="account"&&path!=="auth/change-password"&&path!=="auth/logout"){
    return json({error:"Vui lòng đổi mật khẩu trước khi tiếp tục.",code:"PASSWORD_CHANGE_REQUIRED"},403);
   }
  }

  let tStore = t0;
  const store = await resolveStore(request);
  tStore = performance.now();
  const resp = await inStore(store.id,async()=>{
   if(store.status!=="active"&&!(await getStaffAccess(request)).isOwner){
    throw new OrderError("Cửa hàng đang tạm khóa. Vui lòng liên hệ GAERU Soffware hoặc truy cập /gaeru để chọn cửa hàng khác.",403);
   }
   return handleScoped(request);
  });
  const tTotal = performance.now();
  if((env as Record<string,unknown>).ENABLE_SERVER_TIMING==="true")resp.headers.set("Server-Timing", `store;dur=${(tStore - t0).toFixed(1)}, total;dur=${(tTotal - t0).toFixed(1)}`);
  return resp;
 }
 catch(error){
  const tTotal = performance.now();
  let resp: Response;
  if(error instanceof OrderError) resp = json({error:error.message},error.status);
  else {
   const correlationId = crypto.randomUUID().slice(0, 8);
   console.error(`[API Error ${correlationId}]`, error instanceof Error ? error.message : "Unknown", error instanceof Error ? error.stack : "");
   resp = json({error:"Chưa kết nối được với hệ thống. Vui lòng thử lại.", correlationId},500);
  }
  if((env as Record<string,unknown>).ENABLE_SERVER_TIMING==="true")resp.headers.set("Server-Timing", `total;dur=${(tTotal - t0).toFixed(1)}`);
  return resp;
 }
}
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
