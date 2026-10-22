"use client";
import {ItemExtrasEditor} from "./item-extras-editor";
import {AdminScreenAwake} from "./admin-screen-awake";
import {DishImageField} from "./dish-image-field";
import {ShopLogoField} from "./shop-logo-field";

import {useCallback,useEffect,useId,useRef,useState} from "react";
import type {ReactNode,FormEvent} from "react";
import {ArrowRight,ArrowUpRight,Bell,BellRing,Check,CheckCheck,ChefHat,ChevronDown,ChevronLeft,Clock,Coffee,Download,Grid2X2,Leaf,LoaderCircle,MapPin,Minus,Plus,Printer,QrCode,ReceiptText,RefreshCw,Search,Settings2,ShoppingBag,SlidersHorizontal,Soup,Sparkles,UtensilsCrossed,X,AlertCircle,Pencil,LogIn,Store,CheckCircle2,Volume2,VolumeX,Flame,CakeSlice,Salad,Banknote,Landmark,WalletCards,ChartNoAxesCombined,Table2,UsersRound,LogOut,ShieldCheck} from "lucide-react";
import {TableConnectionPanel} from "./table-connection";
import {RevenuePanel} from "./revenue-panel";
import {StoreSwitcher,StoreManagement} from "./store-management";
import {withStore} from "@/lib/store-links";
import {StaffAccountsPanel} from "./staff-accounts-panel";
import {hasPermission,type Permission,type StaffAccess} from "@/lib/staff-permissions";
import {OpenTableBoard} from "./open-table-board";
import {TablePaymentDialog} from "./table-payment-dialog";
import {TableTransferDialog} from "./table-transfer-dialog";
import {DisplaySettingsPanel} from "./display-settings-panel";
import {ThemeSettingsPanel} from "./theme-settings-panel";
import {DEFAULT_THEME_SETTINGS,normalizeThemeSettings,readableForeground,accentTextColor,type ThemeSettings} from "@/lib/theme-settings";
import {DEFAULT_DISPLAY_SETTINGS,normalizeDisplaySettings,displayScale,type DisplaySettings} from "@/lib/display-settings";
import {readSessionDraft,sessionDraftKey} from "@/lib/session-draft";
import {api,ApiError} from "@/lib/api-client";
import {mergeCartLine,normalizeItemChoice,prepareOrderSubmission,orderRequestBody,readPendingOrder,storePendingOrder,type PendingOrder,type OrderAction} from "@/lib/customer-order";
import {readQrEntry} from "@/lib/qr-entry";
import type {TableTransfer} from "@/lib/table-transfer-types";
import {NewOrderPopup,useAdminOrderAlerts} from "./admin-order-alerts";
import {AdminPushToggle} from "./admin-push-toggle";
import {paymentLabels} from "@/lib/revenue-types";
import type {PaymentMethod} from "@/lib/revenue-types";
import {OpeningRequests,TableManagement,type AdminTableSession} from "./table-session-admin";
import type {Connection,TableSession} from "@/lib/table-sessions";
import {shopInitials,brandingRevision,categories,statuses,money,cleanSearch,defaultShop,sampleMenu,extrasFor,linePrice,salePrice,tastes} from "@/lib/menu";
import type {Category,MenuItem,Promotion,DiningTable,Shop,CartLine,Order,OrderStatus,ServiceRequest} from "@/lib/menu";
import "./interface-theme.css";
import "./responsive-enhancements.css";
import "./customer-order-flow.css";
import {AdminWorkspace,AdminSettingsHome,AdminBack,operationalTabs} from "./admin-workspace";
import "./admin-workspace.css";

type View="menu"|"orders"|"about"|"admin";
type MenuResponse={items:MenuItem[];shop:Shop;table:DiningTable;isStaff:boolean;access:StaffAccess;preview:boolean;connection:Connection;displaySettings:DisplaySettings;themeSettings:ThemeSettings};
type AdminData={access:StaffAccess;items:MenuItem[];shop:Shop;tables:DiningTable[];orders:Order[];calls:ServiceRequest[];sessions:TableSession[];transfers:TableTransfer[];displaySettings:DisplaySettings;themeSettings:ThemeSettings;stats:{todayCount:number|null;todayCollected:number|null}};
const catIcons={all:Grid2X2,main:Soup,light:Salad,drink:Coffee,dessert:CakeSlice};

const safeSet=(key:string,value:string)=>{try{localStorage.setItem(key,value);}catch{/* The active session can still order when storage is restricted. */}};
const browserStorage=()=>{try{return window.localStorage;}catch{return null;}};
function time(n:number){return new Date(n).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Ho_Chi_Minh"});}
function date(n:number){return new Date(n).toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit",timeZone:"Asia/Ho_Chi_Minh"});}
function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),id=useId();
 useEffect(()=>{const dialog=ref.current,previous=document.activeElement as HTMLElement|null;dialog?.showModal();const overflow=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=overflow;previous?.focus({preventScroll:true});};},[]);
 return <dialog ref={ref} className={"modal "+(wide?"wide":"")} aria-labelledby={id} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current){const r=ref.current!.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}><div className="modal-header"><h2 id={id}>{title}</h2><button className="icon-btn" aria-label="Đóng" onClick={onClose}><X size={21}/></button></div>{children}</dialog>;
}
function Brand({shop=defaultShop}:{shop?:Shop}){return <span className="brand"><span className="brand-mark">{shop.logo?<img src={shop.logo} alt={"Logo "+shop.name}/>:<span className="brand-initials">{shopInitials(shop.name)}</span>}</span><span><strong>{shop.name}</strong><small>{shop.tagline}</small></span></span>;}
function Empty({icon:Icon=ShoppingBag,title,children}:{icon?:typeof ShoppingBag;title:string;children:ReactNode}){return <div className="empty-state"><div className="empty-icon"><Icon size={36} strokeWidth={1.25}/><Sparkles size={16}/></div><h3>{title}</h3><p>{children}</p></div>;}
function FoodImage({src,alt,className=""}:{src:string;alt:string;className?:string}){return <img src={src} alt={alt} className={className} loading="lazy" onError={e=>{if(!e.currentTarget.src.endsWith("/images/hero.webp"))e.currentTarget.src="/images/hero.webp";}}/>;}

export default function OrderingApp({initialShop=defaultShop,initialView="menu"}:{initialShop?:Shop;initialView?:View}){
 const configurationEpoch=useRef(0),accessEpoch=useRef(0);
 const [access,setAccess]=useState<StaffAccess|null>(null);
 const staff=!!access?.isStaff;
 const applyAccess=useCallback((next:StaffAccess)=>{
  accessEpoch.current+=1;
  // A slower response may not restore an older account revision after revocation.
  setAccess(current=>current?.userId===next.userId&&current?.account?.id===next.account?.id&&(current?.account?.version??0)>(next.account?.version??0)?current:next);
 },[]);
 const [themeSettings,setThemeSettings]=useState<ThemeSettings>({...DEFAULT_THEME_SETTINGS});
 const applyThemeSettings=useCallback((raw:unknown)=>{configurationEpoch.current+=1;const next=normalizeThemeSettings(raw);setThemeSettings(current=>current.accentColor===next.accentColor&&current.textColor===next.textColor?current:next);},[]);
 useEffect(()=>{
  const root=document.documentElement;
  root.style.setProperty("--moc-accent",themeSettings.accentColor);
  root.style.setProperty("--moc-text",themeSettings.textColor);
  root.style.setProperty("--moc-on-accent",readableForeground(themeSettings.accentColor));
  root.style.setProperty("--moc-accent-text",accentTextColor(themeSettings.accentColor));
  return()=>{root.style.removeProperty("--moc-accent");root.style.removeProperty("--moc-text");root.style.removeProperty("--moc-on-accent");root.style.removeProperty("--moc-accent-text");};
 },[themeSettings.accentColor,themeSettings.textColor]);
 const [displaySettings,setDisplaySettings]=useState<DisplaySettings>({...DEFAULT_DISPLAY_SETTINGS});
 const applyDisplaySettings=useCallback((raw:unknown)=>{configurationEpoch.current+=1;const next=normalizeDisplaySettings(raw);setDisplaySettings(current=>current.popupSeconds===next.popupSeconds&&current.fontPercent===next.fontPercent&&current.foodImagePercent===next.foodImagePercent?current:next);},[]);
 useEffect(()=>{
  const root=document.documentElement;
  root.style.setProperty("--moc-font-scale",String(displayScale(displaySettings.fontPercent)));
  root.style.setProperty("--moc-food-image-scale",String(displayScale(displaySettings.foodImagePercent)));
  return()=>{root.style.removeProperty("--moc-font-scale");root.style.removeProperty("--moc-food-image-scale");};
 },[displaySettings.fontPercent,displaySettings.foodImagePercent]);
 const [shop,setShop]=useState<Shop>(initialShop),[items,setItems]=useState<MenuItem[]>(sampleMenu),[table,setTable]=useState<DiningTable|null>(null),[view,setView]=useState<View>(initialView),[category,setCategory]=useState<Category|"all">("all"),[query,setQuery]=useState(""),[sort,setSort]=useState("recommended"),[cart,setCart]=useState<CartLine[]>([]),[note,setNote]=useState(""),[requestId,setRequestId]=useState(""),[ready,setReady]=useState(false),[loadError,setLoadError]=useState(""),[syncError,setSyncError]=useState(""),[orders,setOrders]=useState<Order[]>([]),[selected,setSelected]=useState<MenuItem|null>(null),[cartOpen,setCartOpen]=useState(false),[helpNote,setHelpNote]=useState(""),[helpOpen,setHelpOpen]=useState(false),[busy,setBusy]=useState(false),[toast,setToast]=useState(""),[success,setSuccess]=useState<Order|null>(null),[callBusy,setCallBusy]=useState(false);
 const [connection,setConnection]=useState<Connection>({state:"preview"}),[draftKey,setDraftKey]=useState("");
 const [itemAction,setItemAction]=useState<OrderAction>("cart"),[submissionError,setSubmissionError]=useState(""),[helpError,setHelpError]=useState("");
 const [itemDraft,setItemDraft]=useState<CartLine|null>(null),[failedSubmission,setFailedSubmission]=useState<PendingOrder|null>(null);
 const [pendingOrder,setPendingOrder]=useState<PendingOrder|null>(null),[pendingOpen,setPendingOpen]=useState(false),[addedNotice,setAddedNotice]=useState<{item:MenuItem;quantity:number}|null>(null);
 const [customerCancel,setCustomerCancel]=useState<Order|null>(null),[cancelReason,setCancelReason]=useState("Đặt nhầm món"),[cancelDetail,setCancelDetail]=useState(""),[cancelError,setCancelError]=useState(""),[cancelBusy,setCancelBusy]=useState(false);
 const cancelLock=useRef(false);
 const pendingOrderRef=useRef<PendingOrder|null>(null);
 const addedNoticeRef=useRef<HTMLDivElement|null>(null);
 const connectionRef=useRef<Connection>({state:"preview"}),initialized=useRef(false),menuEpoch=useRef(0),ordersEpoch=useRef(0),submitLock=useRef(false),toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const notify=useCallback((message:string)=>{setToast(message);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(""),4500);},[]);
 const applyShop=useCallback((value:Shop)=>{configurationEpoch.current+=1;setShop(value);},[]);
 const loadMenu=useCallback(async()=>{
  const settingsAtStart=configurationEpoch.current,accessAtStart=accessEpoch.current;
  const epoch=++menuEpoch.current,params=new URLSearchParams(window.location.search),entry=readQrEntry(params),token=entry.tableToken,query=new URLSearchParams();
  const previous=connectionRef.current;
  if(params.has("table")){
   query.set("table",token||"");
   const hint=(previous.state==="active"||previous.state==="pending")?previous.session?.id:entry.sessionHint;
   if(hint)query.set("session",hint);
  }
  const d=await api<MenuResponse>("menu"+(query.size?"?"+query.toString():""));
  if(epoch===menuEpoch.current){
   const current=connectionRef.current;
   if(current.state==="active"&&d.connection.state==="active"&&current.session?.id===d.connection.session?.id&&current.session?.table_id!==d.table.id){
    notify("Quản trị đã chuyển "+current.session?.table_name+" sang "+d.table.name+". Các món đã chọn và lịch sử gọi món được giữ nguyên.");
    setSuccess(order=>order&&d.connection.session&&order.dining_session_id===d.connection.session.id?{...order,table_id:d.table.id,table_name:d.table.name}:order);
   }
   if(params.has("table")){
    const updated=new URL(window.location.href);
    if((d.connection.state==="active"||d.connection.state==="pending")&&d.connection.session){updated.searchParams.set("table",d.table.token);updated.searchParams.set("session",d.connection.session.id);}
    else updated.searchParams.delete("session");
    if(updated.href!==window.location.href)window.history.replaceState({},"",updated);
   }
   // A menu read issued before an admin save must not revert its confirmed settings.
   if(settingsAtStart===configurationEpoch.current){applyDisplaySettings(d.displaySettings);applyThemeSettings(d.themeSettings);}
   if(accessAtStart===accessEpoch.current)applyAccess(d.access);
   if(settingsAtStart===configurationEpoch.current)setShop(d.shop);setItems(d.items);setTable(d.table);connectionRef.current=d.connection;setConnection(d.connection);
  }
  return d;
 },[notify,applyDisplaySettings,applyThemeSettings,applyAccess]);
 useEffect(()=>{
  if(!ready)return;
  document.title=shop.name+" — "+(view==="admin"?"Quản trị cửa hàng":"Gọi món tại bàn");
  const href=withStore("/api/branding-icon?v="+brandingRevision(shop));
  for(const rel of ["icon","shortcut icon","apple-touch-icon"]){let link=document.head.querySelector<HTMLLinkElement>('link[rel="'+rel+'"]');if(!link){link=document.createElement("link");link.rel=rel;document.head.appendChild(link);}link.href=href;link.removeAttribute("type");}
  const description=document.head.querySelector('meta[name="description"]');if(description)description.setAttribute("content",shop.name+" · "+shop.tagline+" · "+shop.address);
 },[shop,view,ready]);
 useEffect(()=>{
  if(initialized.current)return;initialized.current=true;
  const target=new URLSearchParams(window.location.search).get("view");if(target&&["menu","orders","about","admin"].includes(target))setView(target as View);
  loadMenu().then(()=>{setRequestId(crypto.randomUUID());setReady(true);}).catch(e=>setLoadError(e.message));
  return()=>{if(toastTimer.current)clearTimeout(toastTimer.current);};
 },[loadMenu]);
 useEffect(()=>{
  if(!ready)return;
  const next=connection.state==="active"&&connection.session&&table?sessionDraftKey(connection.session.id):"";
  if(next===draftKey)return;
  let storage:Storage|null=null;try{storage=window.localStorage;}catch{}
  const draft=next&&connection.session&&table?readSessionDraft(storage,connection.session.id,table.token):null;
  const pending=next&&connection.session?readPendingOrder(storage,connection.session.id,draft?.requestId):null;
  const pendingCart=pending?.source==="cart"&&(!draft||pending.requestId===draft.requestId)?pending:null;
  pendingOrderRef.current=pending;setPendingOrder(pending);
  setCart(pendingCart?.items??draft?.cart??[]);setNote(pendingCart?.note??draft?.note??"");setRequestId(pendingCart?.requestId||draft?.requestId||crypto.randomUUID());setDraftKey(next);
  setCustomerCancel(null);setCancelError("");setOrders([]);setSyncError("");setSelected(null);setCartOpen(false);setHelpOpen(false);setSuccess(null);setPendingOpen(false);setAddedNotice(null);setHelpError("");setItemDraft(null);setFailedSubmission(null);
  setSubmissionError(pending?"Lần gửi trước chưa nhận được phản hồi. Kiểm tra lại để biết quán đã nhận đơn hay chưa.":"");
 },[ready,connection.state,connection.session?.id,table?.token,draftKey]);
 useEffect(()=>{if(ready&&draftKey&&connection.state==="active"&&connection.session&&draftKey===sessionDraftKey(connection.session.id))safeSet(draftKey,JSON.stringify({cart,note,requestId}));},[cart,note,requestId,draftKey,ready,connection.state,connection.session?.id]);
 useEffect(()=>{
  if(!addedNotice)return;
  let timer:ReturnType<typeof setTimeout>;
  const dismiss=()=>{const notice=addedNoticeRef.current;if(notice&&(notice.matches(":hover")||notice.contains(document.activeElement))){timer=setTimeout(dismiss,1000);return;}setAddedNotice(null);};
  timer=setTimeout(dismiss,5000);return()=>clearTimeout(timer);
 },[addedNotice]);
 const loadOrders=useCallback(async()=>{
  const current=connectionRef.current;if(!table||current.state!=="active"||!current.session||current.session.table_id!==table.id)return;
  const id=current.session.id,tableId=table.id,epoch=++ordersEpoch.current;
  const stillCurrent=()=>epoch===ordersEpoch.current&&connectionRef.current.state==="active"&&connectionRef.current.session?.id===id&&connectionRef.current.session?.table_id===tableId;
  try{const d=await api<{orders:Order[]}>("orders?table="+encodeURIComponent(table.token)+"&session="+encodeURIComponent(id));if(stillCurrent()){setOrders(d.orders);setSyncError("");}}
  catch(e){if(stillCurrent()){setSyncError((e as Error).message);void loadMenu().catch(()=>{});}}
 },[table?.token,table?.id,connection.state,connection.session?.id,loadMenu]);
 useEffect(()=>{if(!ready)return;void loadOrders();const interval=setInterval(()=>{if(document.visibilityState==="visible")void loadOrders();},7000);return()=>clearInterval(interval);},[ready,loadOrders]);
 useEffect(()=>{if(!ready)return;const refresh=()=>{if(document.visibilityState==="visible")void loadMenu().catch(()=>{});};const interval=setInterval(refresh,connection.state==="preview"?20000:5000);document.addEventListener("visibilitychange",refresh);return()=>{clearInterval(interval);document.removeEventListener("visibilitychange",refresh);};},[ready,loadMenu,connection.state==="preview"]);
 const canOrder=ready&&connection.state==="active"&&!!connection.session;
 async function requestTable(customerName:string){if(!table||!ready)throw new Error("Vui lòng tải lại mã QR tại bàn.");const d=await api<{connection:Connection}>("table-session",{method:"POST",body:JSON.stringify({tableToken:table.token,customerName})});connectionRef.current=d.connection;setConnection(d.connection);await loadMenu().catch(()=>{});notify(d.connection.state==="active"?"Bàn đã được mở. Bạn có thể gọi món.":"Đã gửi yêu cầu mở bàn đến quản trị.");}
 function openCustomerCancel(order:Order){setCustomerCancel(order);setCancelReason("Đặt nhầm món");setCancelDetail("");setCancelError("");}
 async function submitCustomerCancel(){
  const session=connectionRef.current.session,order=customerCancel;
  if(cancelLock.current||!order||!table||connectionRef.current.state!=="active"||!session)return;
  const reason=cancelReason==="Khác"?cancelDetail.trim():cancelReason;
  if(!reason){setCancelError("Vui lòng nhập lý do hủy đơn.");return;}
  cancelLock.current=true;setCancelBusy(true);setCancelError("");ordersEpoch.current+=1;
  try{
   const result=await api<{order:Order}>("orders/cancel",{method:"POST",body:JSON.stringify({id:order.id,tableToken:table.token,sessionId:session.id,reason})});
   if(connectionRef.current.session?.id!==session.id)return;
   ordersEpoch.current+=1;setOrders(previous=>previous.map(current=>current.id===result.order.id?result.order:current));setCustomerCancel(null);notify("Đã hủy đơn #"+result.order.code+". Quán đã nhận trạng thái mới.");
   await loadOrders();
  }catch(error){if(connectionRef.current.session?.id===session.id){setCancelError((error as Error).message);void loadOrders();}}
  finally{cancelLock.current=false;setCancelBusy(false);}
 }
 function navigate(next:View){setView(next);const u=new URL(window.location.href);if(next==="menu")u.searchParams.delete("view");else u.searchParams.set("view",next);window.history.replaceState({},"",u);window.scrollTo({top:0,behavior:"smooth"});}
 function updatePending(pending:PendingOrder|null,sessionId=connectionRef.current.session?.id,expectedRequestId?:string){
  pendingOrderRef.current=pending;setPendingOrder(pending);
  if(sessionId)storePendingOrder(browserStorage(),sessionId,pending,expectedRequestId);
 }
 function openCart(){setAddedNotice(null);if(pendingOrderRef.current){setPendingOpen(true);return;}setSubmissionError("");setCartOpen(true);}
 function openItem(item:MenuItem,action:OrderAction="cart"){
  if(submitLock.current)return;
  if(pendingOrderRef.current){setPendingOpen(true);return;}
  setItemAction(action);setItemDraft(null);setSubmissionError("");setAddedNotice(null);setSelected(item);
 }
 function editCart(next:CartLine[]){
  if(submitLock.current||pendingOrderRef.current)return;
  if(next.reduce((sum,line)=>sum+line.quantity,0)>60){setSubmissionError("Mỗi lần gọi tối đa 60 phần. Vui lòng gửi đơn hoặc gọi nhân viên hỗ trợ.");return;}
  setSubmissionError("");setCart(next);setRequestId(crypto.randomUUID());
 }
 function adjust(key:string,delta:number){editCart(cart.map(l=>l.key===key?{...l,quantity:Math.min(20,l.quantity+delta)}:l).filter(l=>l.quantity>0));}
 function add(line:CartLine){
  if(submitLock.current||pendingOrderRef.current)return;
  if(!canOrder||!shop.open){setSubmissionError(!shop.open?"Quán đang tạm ngừng nhận món.":"Vui lòng chờ nhân viên duyệt mở bàn trước khi gọi món.");return;}
  try{editCart(mergeCartLine(cart,line));setSelected(null);const item=items.find(item=>item.id===line.itemId);if(item)setAddedNotice({item,quantity:line.quantity});}
  catch(error){setSubmissionError((error as Error).message);}
 }
 const total=cart.reduce((sum,l)=>{const m=items.find(i=>i.id===l.itemId);return sum+(m?linePrice(l,m)*l.quantity:0);},0),count=cart.reduce((s,l)=>s+l.quantity,0),invalidCart=cart.some(l=>!items.find(i=>i.id===l.itemId)?.available);
 async function submit(source:OrderAction="cart",directLine?:CartLine){
  if(submitLock.current||!table||!canOrder||!connection.session)return;
  let pending=pendingOrderRef.current;
  if(!pending){
   const previous=readPendingOrder(browserStorage(),connection.session.id,requestId);
   if(previous){
    pendingOrderRef.current=previous;setPendingOrder(previous);setSelected(null);setCartOpen(false);setPendingOpen(true);
    setSubmissionError("Còn một lần gửi món chưa có xác nhận trên trình duyệt này. Vui lòng kiểm tra trước khi đặt thêm.");return;
   }
   try{
    if(!shop.open)throw new Error("Quán đang tạm ngừng nhận món. Vui lòng gọi nhân viên.");
    pending=prepareOrderSubmission({source,sessionId:connection.session.id,tableToken:table.token,requestId:source==="cart"?(requestId||crypto.randomUUID()):crypto.randomUUID(),cart,directLine,note,menu:items});
   }catch(error){setSubmissionError((error as Error).message);return;}
   updatePending(pending);
  }
  if(pending.sessionId!==connection.session.id)return;
  const submitted=pending,submittedSessionId=submitted.sessionId;
  submitLock.current=true;setBusy(true);setSubmissionError("");setAddedNotice(null);
  const sameVisit=()=>connectionRef.current.state==="active"&&connectionRef.current.session?.id===submittedSessionId;
  try{
   const d=await api<{order:Order}>("orders",{method:"POST",body:JSON.stringify(orderRequestBody(submitted))});
   if(!d.order?.id)throw new ApiError("Chưa nhận được thông tin xác nhận đơn. Vui lòng kiểm tra lại.",null,true);
   storePendingOrder(browserStorage(),submittedSessionId,null,submitted.requestId);
   if(!sameVisit())return;
   const live=connectionRef.current.session!;
   const confirmed={...d.order,table_id:live.table_id,table_name:live.table_name};
   updatePending(null,submittedSessionId,submitted.requestId);setSuccess(confirmed);setCartOpen(false);setSelected(null);setPendingOpen(false);setSubmissionError("");
   if(submitted.source==="cart"&&submitted.requestId===requestId){
    const nextRequestId=crypto.randomUUID();
    safeSet(sessionDraftKey(submittedSessionId),JSON.stringify({cart:[],note:"",requestId:nextRequestId}));
    setCart([]);setNote("");setRequestId(nextRequestId);
   }
   ordersEpoch.current+=1;setOrders(current=>[confirmed,...current.filter(order=>order.id!==confirmed.id)]);
   void loadOrders();
  }catch(error){if(sameVisit()){
   const uncertain=!(error instanceof ApiError)||error.uncertain;
   if(!uncertain){
    updatePending(null,submittedSessionId,submitted.requestId);setPendingOpen(false);
    if(submitted.source==="cart"){
     setSelected(null);
     if(submitted.requestId===requestId)setCartOpen(true);
     else setFailedSubmission(submitted);
    }
    else {
     const item=items.find(item=>item.id===submitted.items[0].itemId);
     if(item){setItemAction("direct");setItemDraft(submitted.items[0]);setSelected(item);}
     else {setSelected(null);setFailedSubmission(submitted);}
    }
   }else {setSelected(null);setCartOpen(false);setPendingOpen(true);}
   setSubmissionError((error as Error).message+(uncertain?" Giữ nguyên đơn và bấm kiểm tra lại; quán chỉ nhận một lần.":""));
   void loadMenu().catch(()=>{});
  }}
  finally{submitLock.current=false;setBusy(false);}
 }

 async function call(kind:"service"|"bill"){
  if(!table||callBusy||!canOrder||!connection.session)return;
  const sessionId=connection.session.id;setCallBusy(true);setHelpError("");
  const sameVisit=()=>connectionRef.current.state==="active"&&connectionRef.current.session?.id===sessionId;
  try{await api("calls",{method:"POST",body:JSON.stringify({tableToken:table.token,sessionId,kind,note:helpNote})});if(sameVisit()){setHelpOpen(false);setHelpNote("");notify(kind==="bill"?"Đã báo quầy thu ngân. Nhân viên sẽ đến hỗ trợ thanh toán.":"Đã gọi nhân viên. Bạn vui lòng chờ một chút nhé!");}}
  catch(e){if(sameVisit()){setHelpError((e as Error).message);if(!helpOpen)notify((e as Error).message);void loadMenu().catch(()=>{});}}
  finally{setCallBusy(false);}
 }
 const filtered=items.filter(m=>(category==="all"||category===m.category)&&cleanSearch(m.name+" "+m.description).includes(cleanSearch(query))).sort((a,b)=>sort==="low"?salePrice(a)-salePrice(b):sort==="high"?salePrice(b)-salePrice(a):a.sort-b.sort);
 const activeOrders=orders.filter(o=>o.status!=="served"&&o.status!=="cancelled").length;
 const cartPending=pendingOrder?.source==="cart"&&pendingOrder.requestId===requestId?pendingOrder:null;
 const cartProps={cart,items,total:cartPending?.expectedTotal??total,count,table,adjust,busy,locked:!!pendingOrder,previewItems:cartPending?.previewItems,submit:()=>{if(pendingOrder){setCartOpen(false);setSelected(null);setPendingOpen(true);}else void submit();},note,setNote:(v:string)=>{if(submitLock.current||pendingOrderRef.current)return;setSubmissionError("");setNote(v);setRequestId(crypto.randomUUID());},disabled:!canOrder||(!pendingOrder&&(invalidCart||!shop.open)),connectionRequired:!canOrder,error:submissionError};
 return <div className="app-shell" data-view={view}>
  {view!=="admin"&&<><div className="demo-strip"><span><Leaf size={12}/> Một góc nhỏ, một bữa ngon</span>{staff?<button onClick={()=>navigate("admin")}>Quản lý cửa hàng<ArrowUpRight size={13}/></button>:<button onClick={()=>navigate("admin")}>Quản lý quán<ArrowUpRight size={13}/></button>}</div>
  <header className="site-header"><button className="brand-button" onClick={()=>navigate("menu")} aria-label="Về thực đơn"><Brand shop={shop}/></button><nav className="top-nav" aria-label="Điều hướng chính"><button className={view==="menu"?"active":""} onClick={()=>navigate("menu")}>Thực đơn</button><button className={view==="orders"?"active":""} onClick={()=>navigate("orders")}>Đơn của bạn {activeOrders>0&&<b>{activeOrders}</b>}</button><button className={view==="about"?"active":""} onClick={()=>navigate("about")}>Về {shop.name}</button><button onClick={()=>navigate("admin")}>Quản lý</button></nav><div className="header-actions"><span className="table-pill"><QrCode size={17}/>{connection.state==="preview"?"Thực đơn":table?.name||"Đang kết nối"}</span><button className="call-top" onClick={()=>setHelpOpen(true)} disabled={!canOrder}><Bell size={18}/><span>Gọi nhân viên</span></button></div></header></>}
  {loadError?<main className="connection-error"><AlertCircle size={38}/><h1>Chưa mở được thực đơn</h1><p>{loadError}</p><button className="primary" onClick={()=>window.location.reload()}><RefreshCw size={17}/>Thử lại</button></main>:view==="admin"?<AdminPanel staff={staff} access={access} onAccessChange={applyAccess} ready={ready} notify={notify} onMenuRefresh={loadMenu} shop={shop} onShopChange={applyShop} displaySettings={displaySettings} onDisplaySettings={applyDisplaySettings} themeSettings={themeSettings} onThemeSettings={applyThemeSettings}/>:<>
  <div className="store-ribbon"><span className={"status-dot "+(!shop.open?"off":"")}/><strong>{shop.open?"Đang nhận món":"Tạm ngừng nhận món"}</strong><span className="ribbon-divider"/><Clock size={13}/><span>{shop.hours}</span><span className="ribbon-right"><MapPin size={13}/>{table?.zone||"Mời bạn ghé "+shop.name} · Phục vụ tại bàn</span></div>
  {ready&&table&&<TableConnectionPanel connection={connection} table={table} onRequest={requestTable} onRefresh={loadMenu}/>}
  {pendingOrder&&!busy&&<section className="pending-order-banner" role="status"><div><strong>Cần kiểm tra lần gửi món trước</strong><p>Chưa nhận được xác nhận. Giữ nguyên các món để kiểm tra và tránh gọi lặp.</p></div><button className="secondary" onClick={()=>{setSelected(null);setCartOpen(false);setPendingOpen(true);}}><RefreshCw size={17}/>Kiểm tra đơn</button></section>}
  {view==="menu"?<div className="ordering-layout">
   <aside className="category-sidebar"><p className="eyebrow">THỰC ĐƠN</p><nav aria-label="Nhóm món">{categories.map(c=>{const Icon=catIcons[c.id];return <button key={c.id} onClick={()=>setCategory(c.id)} className={category===c.id?"selected":""}><Icon size={19}/><span>{c.name}</span><small>{items.filter(i=>c.id==="all"||i.category===c.id).length}</small></button>;})}</nav><div className="sidebar-note"><span className="leaf-orbit"><Leaf size={25}/></span><h3>Chậm một chút.<br/>Ngon một chút.</h3><p>Chọn món bạn thích,<br/>{shop.name} lo phần còn lại.</p><span className="tiny-rule"/></div><button className="sidebar-orders" onClick={()=>navigate("orders")}><ReceiptText size={17}/>Đơn của bạn<ArrowUpRight size={15}/></button></aside>
   <main className="menu-main"><section className="hero"><div className="hero-copy"><span className="hero-eyebrow"><span/> TỪ CĂN BẾP {shop.name.toUpperCase()}</span><h1>Một bữa ngon,<br/>một ngày <em>vui.</em></h1><p>Món quen được làm bằng sự chăm chút.<br className="desktop-break"/> Chọn một chút ngon cho hôm nay nhé.</p><button onClick={()=>{setCategory("main");document.getElementById("menu-heading")?.scrollIntoView({behavior:"smooth",block:"start"});}}>Khám phá món chính<ArrowRight size={17}/></button></div><div className="hero-image"><img src="/images/hero.webp" alt={"Bát cơm gà nóng với rau xanh, gợi ý bữa trưa tại "+shop.name}/><span className="hero-image-label"><Sparkles size={15}/> Nấu bằng cả sự tận tâm</span></div><Leaf className="hero-leaf" size={82} strokeWidth={.6}/></section>
   <div className="menu-toolbar"><div><p className="eyebrow">CHỌN MỘT CHÚT NGON</p><h2 id="menu-heading">Hôm nay, ăn gì?</h2></div><label className="search-field"><Search size={18}/><input type="search" placeholder="Tìm món bạn thích…" aria-label="Tìm món ăn" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
   <div className="mobile-categories" role="group" aria-label="Nhóm món">{categories.map(c=><button key={c.id} onClick={()=>setCategory(c.id)} className={category===c.id?"selected":""}>{c.short}</button>)}</div>
   <div className="menu-subheading"><span><strong>{categories.find(c=>c.id===category)?.name}</strong><small>{filtered.length} món</small></span><label><SlidersHorizontal size={14}/><select aria-label="Sắp xếp món" value={sort} onChange={e=>setSort(e.target.value)}><option value="recommended">Bếp gợi ý</option><option value="low">Giá thấp đến cao</option><option value="high">Giá cao đến thấp</option></select></label></div>
   {filtered.length?<div className="food-grid">{filtered.map(m=><article key={m.id} className={"food-card "+(!m.available?"sold-out":"")}><button className="food-photo" onClick={()=>openItem(m)} aria-label={"Xem "+m.name}><FoodImage src={m.image} alt={m.name}/>{m.badge&&<span className="food-badge">{m.badge==="Bếp gợi ý"&&<Flame size={12}/>} {m.badge}</span>}{!m.available&&<span className="unavailable-label">Tạm hết món</span>}</button><div className="food-info"><button className="food-title" onClick={()=>openItem(m)}>{m.name}</button><p>{m.description}</p><div className="food-bottom"><DishPrice item={m}/></div><div className="food-actions"><button type="button" className="button secondary add-to-cart-action" onClick={()=>openItem(m,"cart")} disabled={busy||!m.available||!canOrder||!shop.open} aria-label={"Thêm "+m.name+" vào giỏ"}><Plus size={18}/><span>Thêm vào giỏ</span></button><button type="button" className="button primary order-now-action" onClick={()=>openItem(m,"direct")} disabled={busy||!m.available||!canOrder||!shop.open} aria-label={"Gọi ngay "+m.name}><UtensilsCrossed size={18}/><span>Gọi món ngay</span></button></div></div></article>)}</div>:<Empty icon={Search} title="Chưa tìm thấy món này">Thử một từ khóa khác hoặc chọn nhóm “Tất cả” nhé.</Empty>}
   <div className="menu-end"><Leaf size={16}/><p>Ngon hơn khi cùng nhau thưởng thức.</p><span>{shop.name} · {shop.tagline}</span></div><p className="sample-note">Tên quán, thực đơn và ảnh đang là dữ liệu mẫu. Vui lòng báo nhân viên nếu bạn có dị ứng thực phẩm.</p></main>
   <aside className="cart-sidebar"><CartContents {...cartProps}/><div className="cart-footnote"><CheckCircle2 size={14}/><span>Gọi món tại bàn · Thanh toán với nhân viên</span></div></aside>
  </div>:view==="orders"?<main className="orders-page"><div className="page-heading"><div><p className="eyebrow">CĂN BẾP ĐANG CHĂM CHÚT</p><h1>Đơn của bạn</h1><p>Theo dõi những món đã gọi tại {table?.name.toLowerCase()}.</p></div><button className="secondary" onClick={()=>void loadOrders()}><RefreshCw size={16}/>Làm mới</button></div>{syncError&&<div className="inline-error"><AlertCircle size={17}/>{syncError}</div>}{orders.length?<div className="customer-orders">{orders.map(o=><OrderReceipt key={o.id} order={o} onCancel={openCustomerCancel} onSupport={()=>{setHelpNote("Tôi cần hỗ trợ hủy đơn #"+o.code);setHelpOpen(true);}}/>)}</div>:<Empty icon={ReceiptText} title="Chưa có đơn nào">Món ngon đang chờ bạn. Chọn món từ thực đơn để bắt đầu nhé.</Empty>}<div className="orders-footer"><button className="primary" onClick={()=>navigate("menu")}><Plus size={17}/>Gọi thêm món</button>{orders.some(o=>o.status!=="cancelled"&&!o.paid)&&<button className="secondary" disabled={callBusy} onClick={()=>void call("bill")}><ReceiptText size={17}/>Yêu cầu thanh toán</button>}</div><p className="small muted center">Đơn tự cập nhật khi trang đang mở. Chỉ hiển thị đơn của lượt phục vụ đang mở trên máy này.</p></main>:<main className="about-page"><div className="about-photo"><img src="/images/hero.webp" alt="Bữa ăn ấm cúng"/></div><div><p className="eyebrow">MỜI BẠN GHÉ CHƠI</p><h1>Một chút {shop.name},<br/>một chút an yên.</h1><p className="about-lead">{shop.address}</p><p>Chúng mình tin rằng một bữa ăn ngon bắt đầu từ những điều giản dị: nguyên liệu tươi, món ăn vừa vị và cảm giác được chăm sóc.</p><div className="about-info"><Clock size={20}/><div><strong>Giờ phục vụ</strong><p>{shop.hours}</p></div></div><div className="about-info"><QrCode size={20}/><div><strong>Quét QR · Nhập tên · Mở bàn</strong><p>Gọi món ngay tại bàn. Nhân viên luôn sẵn sàng hỗ trợ bạn.</p></div></div><button className="primary" onClick={()=>navigate("menu")}>Xem thực đơn<ArrowRight size={17}/></button><p className="small muted">Đây là nội dung giới thiệu mẫu; chủ quán có thể cập nhật thông tin trong mục Cài đặt.</p></div></main>}
  <nav className="mobile-nav" aria-label="Điều hướng điện thoại"><button onClick={()=>navigate("menu")} className={view==="menu"?"active":""}><UtensilsCrossed size={20}/><span>Thực đơn</span></button><button onClick={()=>navigate("orders")} className={view==="orders"?"active":""}><ReceiptText size={20}/><span>Đơn của bạn {activeOrders>0&&`(${activeOrders})`}</span></button><button onClick={()=>navigate("admin")}><ShieldCheck size={20}/><span>Quản lý</span></button><button onClick={()=>setHelpOpen(true)} disabled={!canOrder}><Bell size={20}/><span>Hỗ trợ</span></button></nav>
  {count>0&&view==="menu"&&!selected&&!cartOpen&&!success&&!pendingOpen&&!helpOpen&&!failedSubmission&&<div className="mobile-cart-dock">{addedNotice&&<div ref={addedNoticeRef} className="cart-added-notice" role="status"><FoodImage src={addedNotice.item.image} alt=""/><div className="cart-added-copy"><strong>Đã thêm {addedNotice.quantity} × {addedNotice.item.name}</strong><small>Giỏ có {count} phần · {money(total)}</small></div><div className="cart-added-actions"><button className="cart-added-view secondary" onClick={openCart}>Xem giỏ</button><button className="cart-added-dismiss icon-btn" onClick={()=>setAddedNotice(null)} aria-label="Đóng thông báo thêm món"><X size={18}/></button></div></div>}<button className="mobile-cart-bar" onClick={openCart}><span className="cart-count">{count}</span><span>{pendingOrder?"Kiểm tra lần gửi trước":"Xem giỏ & đặt món"}<strong>{money(cartPending?.expectedTotal??total)}</strong></span><ArrowRight size={20}/></button></div>}
  </>}
  {customerCancel&&<Modal title={"Hủy đơn #"+customerCancel.code} onClose={()=>!cancelBusy&&setCustomerCancel(null)}><form className="form-body" onSubmit={event=>{event.preventDefault();void submitCustomerCancel();}}><p>Hủy toàn bộ lần gọi món này, tổng cộng <strong>{money(customerCancel.total)}</strong>. Chỉ hủy được khi quán chưa nhận đơn và chưa thu tiền.</p><label className="field"><span>Lý do hủy</span><select value={cancelReason} disabled={cancelBusy} onChange={event=>{setCancelReason(event.target.value);setCancelError("");}}>{["Đặt nhầm món","Muốn thay đổi món hoặc số lượng","Không muốn dùng nữa","Khác"].map(reason=><option key={reason} value={reason}>{reason}</option>)}</select></label>{cancelReason==="Khác"&&<label className="field"><span>Nội dung lý do</span><textarea required maxLength={180} rows={3} value={cancelDetail} disabled={cancelBusy} onChange={event=>setCancelDetail(event.target.value)}/></label>}{cancelError&&<p className="submission-error" role="alert">{cancelError}</p>}<div className="customer-cancel-actions"><button type="button" className="secondary" disabled={cancelBusy} onClick={()=>setCustomerCancel(null)}>Giữ lại đơn</button><button type="submit" className="danger-button" disabled={cancelBusy||!canOrder}>{cancelBusy?<LoaderCircle className="spin" size={18}/>:<X size={18}/>}<span>{cancelBusy?"Đang hủy…":"Xác nhận hủy đơn"}</span></button></div></form></Modal>}
  {selected&&<ItemModal key={selected.id+":"+(itemDraft?.key||"new")+":"+itemAction} item={items.find(i=>i.id===selected.id)||selected} initialLine={itemDraft} action={itemAction} onClose={()=>!busy&&setSelected(null)} onAdd={line=>itemAction==="direct"?void submit("direct",line):add(line)} onEdit={()=>setSubmissionError("")} enabled={canOrder&&(!!pendingOrder||shop.open)} busy={busy} pending={pendingOrder} error={submissionError} tableName={table?.name||"bàn của bạn"}/>}
  {cartOpen&&<Modal title="Giỏ món của bạn" onClose={()=>!busy&&setCartOpen(false)}><CartContents {...cartProps} compact/></Modal>}
  {helpOpen&&<Modal title="Bạn cần hỗ trợ?" onClose={()=>!callBusy&&setHelpOpen(false)}><div className="help-body"><span className="table-pill"><MapPin size={16}/>{table?.name}</span><p>Nhân viên sẽ nhận được yêu cầu và đến bàn của bạn.</p><label>Nội dung yêu cầu (không bắt buộc)<textarea value={helpNote} onChange={e=>setHelpNote(e.target.value)} maxLength={300} disabled={callBusy} rows={3} placeholder="Ví dụ: Cho tôi thêm hai chiếc bát" style={{width:"100%",padding:12,borderRadius:12,fontSize:"inherit"}}/></label>{helpError&&<p className="submission-error" role="alert"><AlertCircle size={18}/>{helpError}</p>}<button className="help-choice" disabled={callBusy||!canOrder} onClick={()=>void call("service")}><BellRing size={25}/><span><strong>Gọi nhân viên</strong><small>Hỏi về món ăn hoặc cần thêm hỗ trợ</small></span><ArrowRight size={18}/></button><button className="help-choice" disabled={callBusy||!canOrder} onClick={()=>void call("bill")}><ReceiptText size={25}/><span><strong>Yêu cầu thanh toán</strong><small>Nhân viên mang hóa đơn đến bàn</small></span><ArrowRight size={18}/></button><p className="small muted">Thanh toán được thực hiện trực tiếp với quán.</p></div></Modal>}
  {pendingOpen&&pendingOrder&&<Modal title="Kiểm tra lần gửi món" onClose={()=>!busy&&setPendingOpen(false)}><div className="pending-order-summary"><span className="table-pill"><QrCode size={17}/>{table?.name}</span><p>Lần gửi trước chưa nhận đủ phản hồi. Bấm kiểm tra để lấy xác nhận hoặc gửi tiếp đơn này.</p><div className="receipt-items">{pendingOrder.previewItems.map((item,index)=><div key={index}><span className="receipt-qty">{item.quantity}×</span><div><strong>{item.name}</strong><small>{[...item.extras,item.taste,item.note].filter(Boolean).join(" · ")}</small></div><strong>{money(item.total)}</strong></div>)}</div>{pendingOrder.note&&<p className="order-note"><Pencil size={16}/>{pendingOrder.note}</p>}<div className="cart-total"><span>Tổng tiền</span><strong>{money(pendingOrder.expectedTotal)}</strong></div>{submissionError&&<p className="submission-error" role="alert"><AlertCircle size={18}/>{submissionError}</p>}<button className="primary full" disabled={busy||!canOrder} onClick={()=>void submit(pendingOrder.source)}>{busy?<LoaderCircle size={18} className="spin"/>:<RefreshCw size={18}/>}<span>{busy?"Đang kiểm tra…":"Kiểm tra / gửi lại đơn"}</span></button><button className="secondary full" disabled={busy} onClick={()=>{setPendingOpen(false);navigate("orders");}}>Xem các đơn đã nhận</button></div></Modal>}
  {failedSubmission&&<Modal title="Chưa gửi được lần gọi này" onClose={()=>setFailedSubmission(null)}><div className="pending-order-summary"><span className="table-pill"><QrCode size={17}/>{table?.name}</span><div className="receipt-items">{failedSubmission.previewItems.map((item,index)=><div key={index}><span className="receipt-qty">{item.quantity}×</span><div><strong>{item.name}</strong><small>{[...item.extras,item.taste,item.note].filter(Boolean).join(" · ")}</small></div><strong>{money(item.total)}</strong></div>)}</div>{failedSubmission.note&&<p className="order-note">{failedSubmission.note}</p>}<p className="submission-error" role="alert">{submissionError||"Món này không còn trong thực đơn. Vui lòng chọn món khác."}</p>{count>0&&<button className="secondary full" onClick={()=>{setFailedSubmission(null);openCart();}}>Xem giỏ hiện tại<ShoppingBag size={18}/></button>}<button className="primary full" onClick={()=>{setFailedSubmission(null);setSubmissionError("");if(view!=="menu")navigate("menu");}}>Chọn món khác<Plus size={18}/></button></div></Modal>}
  {success&&<Modal title="Đặt món thành công" onClose={()=>setSuccess(null)}><div className="success-body order-success-card"><span className="success-check"><CheckCheck size={34}/></span><h2>Đã gửi món đến quán</h2><p>Nhân viên sẽ xác nhận và chuẩn bị món cho bạn.</p><div className="success-ticket"><span className="success-table">{success.table_name}<strong className="success-order-code">#{success.code}</strong></span><span className="success-order-stats">{success.items.reduce((s,i)=>s+i.quantity,0)} phần<strong>{money(success.total)}</strong></span></div>{count>0&&<p className="retained-cart-hint">Giỏ vẫn còn {count} phần chưa gửi · {money(total)}.</p>}<div className="order-success-actions"><button className="primary full" onClick={()=>{setSuccess(null);navigate("orders");}}>Theo dõi đơn<ArrowRight size={18}/></button>{count>0&&<button className="secondary full" onClick={()=>{setSuccess(null);openCart();}}>Xem giỏ còn lại<ShoppingBag size={18}/></button>}<button className="secondary full" onClick={()=>{setSuccess(null);if(view!=="menu")navigate("menu");}}>Gọi thêm món<Plus size={18}/></button></div></div></Modal>}
  {toast&&<div className="toast" role="status"><CheckCircle2 size={19}/><span>{toast}</span><button onClick={()=>setToast("")} aria-label="Đóng thông báo"><X size={15}/></button></div>}
 </div>;
}

function CartContents({cart,items,total,count,table,adjust,busy,locked=false,previewItems,submit,note,setNote,disabled,error="",connectionRequired=false,compact=false}:{cart:CartLine[];items:MenuItem[];total:number;count:number;table:DiningTable|null;adjust:(k:string,n:number)=>void;busy:boolean;locked?:boolean;previewItems?:Order["items"];submit:()=>void;note:string;setNote:(s:string)=>void;disabled:boolean;error?:string;connectionRequired?:boolean;compact?:boolean}){
 return <div className={"cart-panel "+(compact?"compact":"")} aria-busy={busy}>
  <div className="cart-heading"><div><ShoppingBag size={20}/><h2>Giỏ món của bạn</h2></div><span>{count}</span></div>
  <div className="cart-table"><span><QrCode size={17}/>{table?.name||"Đang kết nối…"}</span><small>Ăn tại quán</small></div>
  {connectionRequired&&<p className="cart-connection-note">Nhập tên và chờ nhân viên duyệt mở bàn để chọn món trên máy này.</p>}
  {cart.length?<>
   <div className="cart-lines">{cart.map((line,index)=>{
    const item=items.find(menuItem=>menuItem.id===line.itemId),snapshot=previewItems?.[index];
    return <div key={line.key} className="cart-line"><FoodImage src={snapshot?.image||item?.image||"/images/hero.webp"} alt={snapshot?.name||item?.name||"Món đã chọn"}/><div className="cart-line-content"><strong>{snapshot?.name||item?.name||"Món không còn phục vụ"}</strong><small>{[...(snapshot?.extras??(item?extrasFor(item).filter(extra=>line.extras.includes(extra.id)).map(extra=>extra.label):[])),line.taste,line.note].filter(Boolean).join(" · ")}</small>{!item?.available&&!locked&&<span className="text-danger small">Món tạm hết, vui lòng bỏ khỏi giỏ</span>}<div className="cart-line-bottom"><b>{money(snapshot?.total??(item?linePrice(line,item)*line.quantity:0))}</b><div className="stepper mini"><button onClick={()=>adjust(line.key,-1)} disabled={busy||locked} aria-label={"Giảm "+(item?.name||"món")}><Minus size={12}/></button><span>{line.quantity}</span><button onClick={()=>adjust(line.key,1)} disabled={busy||locked||line.quantity>=20||count>=60} aria-label={"Tăng "+(item?.name||"món")}><Plus size={12}/></button></div></div></div></div>;
   })}</div>
   <label className="cart-note"><Pencil size={14}/><textarea placeholder="Ghi chú cho quán (nếu có)…" aria-label="Ghi chú cho toàn bộ đơn" rows={2} maxLength={400} value={note} disabled={busy||locked} onChange={event=>setNote(event.target.value)}/></label>
   <div className="cart-checkout-footer">{error&&<p className="cart-submit-error" role="alert"><AlertCircle size={18}/><span>{error}</span></p>}<div className="cart-total"><span>Tổng cộng <small>({count} phần)</small></span><strong>{money(total)}</strong></div><button className="primary full submit-order" disabled={busy||disabled} onClick={submit}>{busy?<LoaderCircle size={18} className="spin"/>:<ShoppingBag size={17}/>}<span>{busy?"Đang gửi đơn…":locked?"Kiểm tra lần gửi trước":"Đặt món · "+money(total)}</span>{!busy&&<ArrowRight size={17}/>}</button><p className="cart-explanation">{locked?"Giữ nguyên giỏ đến khi nhận được xác nhận của quán.":"Kiểm tra món và số lượng. Quán chuẩn bị sau khi xác nhận đơn."}</p></div>
  </>:<><Empty title="Giỏ đang chờ món ngon">Thêm món bạn thích.<br/>Một bữa ngon bắt đầu từ đây.</Empty><div className="empty-cart-total"><span>Tổng cộng</span><strong>0 ₫</strong></div><button className="primary full" disabled><ShoppingBag size={17}/>{connectionRequired?"Chờ mở bàn để gọi món":"Chọn món để bắt đầu"}</button></>}
 </div>;
}
function ItemModal({item,initialLine,action,onClose,onAdd,onEdit,enabled,busy,pending,error,tableName}:{item:MenuItem;initialLine:CartLine|null;action:OrderAction;onClose:()=>void;onAdd:(line:CartLine)=>void;onEdit:()=>void;enabled:boolean;busy:boolean;pending:PendingOrder|null;error:string;tableName:string}){
 const initial=normalizeItemChoice(initialLine??{quantity:1,extras:[],taste:"",note:""},item);
 const [quantity,setQuantity]=useState(initial.quantity),[extras,setExtras]=useState<string[]>(initial.extras),[taste,setTaste]=useState(initial.taste),[note,setNote]=useState(initial.note),[optionsChanged,setOptionsChanged]=useState(!!initialLine&&(initial.extras.length!==initialLine.extras.length||initial.taste!==initialLine.taste));
 const unit=linePrice({extras},item),locked=busy||!!pending,errorRef=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{
  if(locked)return;
  const next=normalizeItemChoice({quantity,extras,taste,note},item);
  if(next.extras.length!==extras.length||next.taste!==taste){setExtras(next.extras);setTaste(next.taste);setOptionsChanged(true);}
 },[item.id,item.category,item.extras,extras,taste,quantity,note,locked]);
 useEffect(()=>{if(error)errorRef.current?.scrollIntoView({block:"nearest",behavior:"smooth"});},[error]);
 const edit=(change:()=>void)=>{if(locked)return;change();onEdit();};
 return <Modal title={action==="direct"?"Gọi món ngay":"Thêm món vào giỏ"} onClose={onClose}>
  <div className="item-detail" aria-busy={busy}>
   <FoodImage src={item.image} alt={item.name} className="detail-photo"/>
   <div className="detail-intro"><span className="eyebrow">{categories.find(category=>category.id===item.category)?.name}</span><div><h2>{item.name}</h2><DishPrice item={item}/></div><p>{item.description}</p></div>
   {optionsChanged&&<p className="direct-order-note">Tùy chọn món vừa thay đổi. Vui lòng kiểm tra lại trước khi xác nhận.</p>}
   {action==="direct"&&<p className="direct-order-note"><UtensilsCrossed size={18}/><span>Chọn số lượng, tùy chọn rồi xác nhận gửi món này đến <strong>{tableName}</strong>.</span></p>}
   {extrasFor(item).length>0&&<fieldset disabled={locked}><legend>Thêm một chút ngon <small>Tùy chọn</small></legend>{extrasFor(item).map(extra=><label className="option-row" key={extra.id}><input type="checkbox" checked={extras.includes(extra.id)} onChange={()=>edit(()=>setExtras(extras.includes(extra.id)?extras.filter(value=>value!==extra.id):[...extras,extra.id]))}/><span>{extra.label}</span><strong>+{money(extra.price)}</strong></label>)}</fieldset>}
   {item.category==="drink"&&<fieldset disabled={locked}><legend>Khẩu vị của bạn</legend><div className="taste-options">{tastes.map(value=><label key={value} className={taste===value?"checked":""}><input type="radio" name="taste" value={value} checked={taste===value} onChange={()=>edit(()=>setTaste(value))}/>{value}</label>)}</div></fieldset>}
   <label className="field"><span>Ghi chú cho món <small>Không bắt buộc</small></span><textarea rows={2} placeholder="Ví dụ: không hành, ít cay…" maxLength={240} value={note} disabled={locked} onChange={event=>edit(()=>setNote(event.target.value))}/></label>
   <p className="small muted">Nếu có dị ứng thực phẩm, vui lòng trao đổi trực tiếp với nhân viên.</p>
   {error&&<p ref={errorRef} className="submission-error" role="alert"><AlertCircle size={18}/><span>{error}</span></p>}
  </div>
  <div className="detail-bottom"><div className="stepper"><button aria-label="Giảm số lượng" disabled={locked||quantity<=1} onClick={()=>edit(()=>setQuantity(quantity-1))}><Minus size={16}/></button><strong>{quantity}</strong><button aria-label="Tăng số lượng" disabled={locked||quantity>=20} onClick={()=>edit(()=>setQuantity(quantity+1))}><Plus size={16}/></button></div><button className="primary detail-action" disabled={busy||!enabled||(!pending&&!item.available)} onClick={()=>onAdd({key:crypto.randomUUID(),itemId:item.id,quantity,extras,taste,note:note.trim()})}>{busy&&<LoaderCircle size={18} className="spin"/>}<span>{busy?"Đang gửi món…":pending?"Kiểm tra lại đơn":!item.available?"Tạm hết món":action==="direct"?"Xác nhận gọi món":"Thêm vào giỏ"}</span><strong>{money(pending?.expectedTotal??unit*quantity)}</strong></button></div>
 </Modal>;
}
function OrderReceipt({order:o,onCancel,onSupport}:{order:Order;onCancel?:(order:Order)=>void;onSupport?:()=>void}){const progress=["new","preparing","ready","served"].indexOf(o.status);return <article className="receipt"><div className="receipt-header"><div><span className="eyebrow">{o.table_name}</span><h2>Đơn #{o.code}</h2><p>{time(o.created_at)} · {date(o.created_at)}{o.customer_name&&<> · {o.customer_name}</>}</p></div><span className={"status-badge "+o.status}>{statuses[o.status].label}</span></div>{o.status!=="cancelled"?<div className="order-progress">{["Đã gửi","Đang làm","Sẵn sàng","Đã phục vụ"].map((s,i)=><div key={s} className={i<=progress?"done":""}><span>{i<progress?<Check size={13}/>:i+1}</span><small>{s}</small></div>)}</div>:<p className="inline-error">Lý do hủy: {o.cancel_reason}</p>}<div className="receipt-items">{o.items.map((i,k)=><div key={k}><span className="receipt-qty">{i.quantity}×</span><div><strong>{i.name}</strong><small>{[...i.extras,i.taste,i.note].filter(Boolean).join(" · ")}</small></div><strong>{money(i.total)}</strong></div>)}</div>{o.note&&<p className="order-note"><Pencil size={14}/>{o.note}</p>}{!!o.paid&&<p className="receipt-payment-info"><CheckCircle2 size={14}/>{paymentLabels[o.payment_method||"unknown"]}{o.paid_at?<> · Thu lúc {time(o.paid_at)} ngày {date(o.paid_at)}</>:<> · Chưa ghi nhận thời điểm thu</>}</p>}<div className="receipt-total"><span className={o.paid?"paid":"muted"}>{o.status==="cancelled"?"Đơn đã hủy":o.paid?"Đã thanh toán tại quán":"Thanh toán với nhân viên"}</span><strong>{money(o.total)}</strong></div>{onCancel&&o.status!=="cancelled"&&<div className="customer-cancel-row">{o.status==="new"&&!o.paid?<><p>Bạn có thể hủy khi quán chưa nhận đơn.</p><button type="button" className="secondary" onClick={()=>onCancel(o)}><X size={18}/>Hủy đơn</button></>:<><p>Đơn đã được quán tiếp nhận hoặc thanh toán. Nếu cần hủy, vui lòng liên hệ nhân viên.</p>{onSupport&&<button type="button" className="secondary" onClick={onSupport}><BellRing size={18}/>Nhờ nhân viên hỗ trợ</button>}</>}</div>}</article>;}

function AdminPanel({staff,access,onAccessChange,ready,notify,onMenuRefresh,shop,onShopChange,displaySettings,onDisplaySettings,themeSettings,onThemeSettings}:{staff:boolean;access:StaffAccess|null;onAccessChange:(access:StaffAccess)=>void;ready:boolean;notify:(s:string)=>void;onMenuRefresh:()=>Promise<unknown>;shop:Shop;onShopChange:(shop:Shop)=>void;displaySettings:DisplaySettings;onDisplaySettings:(value:DisplaySettings)=>void;themeSettings:ThemeSettings;onThemeSettings:(value:ThemeSettings)=>void}){
 const liveAccess=useRef(access);liveAccess.current=access;
 const can=(permission:Permission)=>hasPermission(access,permission);
 const canOrders=can("orders.view"),canRevenue=can("revenue.view"),canTables=can("tables.manage"),canMenu=can("menu.manage"),canSettings=can("settings.manage"),canPay=can("payments.collect"),canTransfer=can("tables.transfer"),canCancel=can("orders.cancel");
 const permissionKey=JSON.stringify([access?.userId,staff,access?.permissions]);
 const adminTabs=[{id:"stores",label:"Quản trị tổng",icon:Store,allowed:!!access?.isOwner},{id:"orders",label:"Bàn",icon:Table2,allowed:canOrders},{id:"order-list",label:"Đơn món",icon:UtensilsCrossed,allowed:canOrders},{id:"support",label:"Hỗ trợ",icon:Bell,allowed:canOrders},{id:"home",label:"Cài đặt",icon:Settings2,allowed:staff},{id:"revenue",label:"Doanh thu",icon:ChartNoAxesCombined,allowed:canRevenue},{id:"menu",label:"Thực đơn",icon:UtensilsCrossed,allowed:canMenu},{id:"promotions",label:"Khuyến mãi",icon:Settings2,allowed:canMenu},{id:"tables",label:"Quản lý bàn",icon:QrCode,allowed:canTables},{id:"settings",label:"Cài đặt quán",icon:Settings2,allowed:canSettings},{id:"accounts",label:"Tài khoản",icon:UsersRound,allowed:staff}].filter(item=>item.allowed);
 const [reportOrderScope,setReportOrderScope]=useState<"orders.view"|"revenue.view">("orders.view");
 const [tablePaymentSessionId,setTablePaymentSessionId]=useState<string|null>(null);
 const [transferSession,setTransferSession]=useState<AdminTableSession|null>(null);
 const [mutationError,setMutationError]=useState("");
 const workingRef=useRef(false);
 const [paymentMethod,setPaymentMethod]=useState<PaymentMethod|"">(""),[revenueRevision,setRevenueRevision]=useState(0),[reportOrder,setReportOrder]=useState<Order|null>(null);
 const [editPromotion,setEditPromotion]=useState<MenuItem|null>(null);
 const [keepAwake,setKeepAwake]=useState(false);
 const [audioSettings,setAudioSettings]=useState(false);
 const [deleteTable,setDeleteTable]=useState<DiningTable|null>(null);
 const [tabReady,setTabReady]=useState(false);
 const [tab,setTab]=useState("orders"),[data,setData]=useState<AdminData|null>(null),[error,setError]=useState(""),[working,setWorking]=useState(false),[editItem,setEditItem]=useState<Partial<MenuItem>|null>(null),[editTable,setEditTable]=useState<(DiningTable & {creationRequestId?:string})|null>(null),[cancelOrder,setCancelOrder]=useState<Order|null>(null),[reason,setReason]=useState(""),[confirmPaid,setConfirmPaid]=useState<Order|null>(null),[lastSync,setLastSync]=useState(0),[origin,setOrigin]=useState("");
 useEffect(()=>{setMutationError("");},[editItem,editTable,cancelOrder,confirmPaid]);
 useEffect(()=>{const target=new URLSearchParams(window.location.search).get("tab");if(target&&["stores","orders","order-list","support","home","revenue","menu","promotions","tables","settings","accounts"].includes(target))setTab(target);setTabReady(true);},[]);
 function switchAdminTab(next:string){if(!adminTabs.some(item=>item.id===next))return;setTab(next);const url=new URL(window.location.href);url.searchParams.set("tab",next);window.history.replaceState({},"",url);}
 function openPayment(order:Order){if(!canPay)return;setPaymentMethod("");setConfirmPaid(order);}
 const [focusTableId,setFocusTableId]=useState<string|null>(null),[focusRevision,setFocusRevision]=useState(0);
 const notifications=useAdminOrderAlerts(displaySettings.popupSeconds);
 const alertUserId=useRef(access?.userId??null);
 function openTable(tableId:string){if(!canOrders)return;setFocusTableId(tableId);setFocusRevision(n=>n+1);switchAdminTab("orders");}
 const polling=useRef(false),reloadEpoch=useRef(0);
 const reload=useCallback(async(force=false)=>{
  if(!staff||(polling.current&&!force))return;
  const epoch=++reloadEpoch.current;polling.current=true;
  try{
   const d=await api<AdminData>("admin");
   if(epoch!==reloadEpoch.current)return;
   const current=liveAccess.current;
   // A response started before a permission change must not restore old speech grants.
   if(!current?.isStaff||d.access.userId!==current.userId||(d.access.account?.id===current.account?.id&&(d.access.account?.version??0)<(current.account?.version??0)))return;
   const allowOrders=hasPermission(d.access,"orders.view"),allowOpenings=hasPermission(d.access,"tables.manage");
   notifications.restrictAlerts(allowOrders,allowOpenings);
   notifications.observeDashboard(allowOrders?d.orders:[],allowOpenings?d.sessions:[],allowOpenings?d.calls:[]);
   onDisplaySettings(normalizeDisplaySettings(d.displaySettings));onThemeSettings(normalizeThemeSettings(d.themeSettings));setData(d);onAccessChange(d.access);setLastSync(Date.now());setError("");
  }catch(e){
   if(epoch===reloadEpoch.current){
    setError((e as Error).message);
    if(e instanceof ApiError&&e.status===403){
     setData(null);notifications.resetAlerts();
     setReportOrder(null);setTransferSession(null);setTablePaymentSessionId(null);setConfirmPaid(null);setEditItem(null);setEditTable(null);setCancelOrder(null);
     try{const current=await api<{access:StaffAccess}>("account");if(epoch===reloadEpoch.current)onAccessChange(current.access);}catch{/* Keep protected data cleared until access can be checked. */}
    }
   }
  }
  finally{if(epoch===reloadEpoch.current)polling.current=false;}
 },[staff,onDisplaySettings,onThemeSettings,onAccessChange,notifications.observeDashboard,notifications.restrictAlerts,notifications.resetAlerts]);
 useEffect(()=>{
  setOrigin(window.location.origin);void reload();
  const refresh=()=>{if(document.visibilityState==="visible")void reload();};
  const interval=setInterval(refresh,3000);document.addEventListener("visibilitychange",refresh);
  return()=>{clearInterval(interval);document.removeEventListener("visibilitychange",refresh);reloadEpoch.current+=1;polling.current=false;};
 },[reload]);
 useEffect(()=>{
  if(alertUserId.current!==(access?.userId??null)){notifications.resetAlerts();setData(null);alertUserId.current=access?.userId??null;}
  notifications.restrictAlerts(canOrders,canTables);
  if(!staff){setData(null);notifications.resetAlerts();}
  if(!canOrders)setFocusTableId(null);
  if(!canPay){setConfirmPaid(null);setTablePaymentSessionId(null);}
  if(!canTransfer)setTransferSession(null);
  if(!canMenu){setEditItem(null);setEditPromotion(null);}
  if(!canTables){setEditTable(null);setDeleteTable(null);}
  if(!canCancel)setCancelOrder(null);
  if(!hasPermission(access,reportOrderScope))setReportOrder(null);
  if(tabReady&&staff&&!adminTabs.some(item=>item.id===tab)&&adminTabs[0])switchAdminTab(adminTabs[0].id);
 },[permissionKey,reportOrderScope,tab,tabReady,notifications.restrictAlerts,notifications.resetAlerts]);
 async function mutate(path:string,body:unknown,message:string){
  const payload=body as Record<string,unknown>;
  const permission:Permission|undefined=path==="order"?(payload.action==="paid"?"payments.collect":payload.status==="cancelled"?"orders.cancel":"orders.manage"):({session:"tables.manage",table:"tables.manage",call:"tables.manage",item:"menu.manage",promotion:"menu.manage",shop:"settings.manage","display-settings":"settings.manage","theme-settings":"settings.manage"} as Record<string,Permission>)[path];
  if(!permission||!can(permission)){const message="Bạn chưa được cấp quyền thực hiện chức năng này.";setMutationError(message);notify(message);return false;}
  if(workingRef.current)return false;workingRef.current=true;setWorking(true);setMutationError("");
  try{
   const result=await api<{shop?:Shop;displaySettings?:DisplaySettings;themeSettings?:ThemeSettings}>("admin/"+path,{method:"PATCH",body:JSON.stringify(body)});
   if(path==="display-settings"&&result.displaySettings){
    const confirmed=normalizeDisplaySettings(result.displaySettings);
    onDisplaySettings(confirmed);setData(current=>current?{...current,displaySettings:confirmed}:current);
   }
   if(path==="theme-settings"&&result.themeSettings){
    const confirmed=normalizeThemeSettings(result.themeSettings);
    onThemeSettings(confirmed);setData(current=>current?{...current,themeSettings:confirmed}:current);
   }
   if(path==="shop"&&result.shop){onShopChange(result.shop);setData(current=>current?{...current,shop:result.shop!}:current);window.dispatchEvent(new Event("store-branding-updated"));}setRevenueRevision(n=>n+1);await reload(true);void onMenuRefresh().catch(()=>{});notify(message);return true;
  }catch(e){setMutationError((e as Error).message);notify((e as Error).message);if(e instanceof ApiError&&e.status===403)void reload(true);return false;}finally{workingRef.current=false;setWorking(false);}
 }
 async function sessionAction(id:string,action:"approve"|"reject"|"close"){return mutate("session",{id,action},action==="approve"?"Đã mở bàn. Máy của khách có thể gọi món.":action==="reject"?"Đã từ chối yêu cầu. Bàn sẵn sàng nhận khách mới.":"Đã đóng bàn. Quyết toán và lịch sử lượt khách đã được lưu trong mục Doanh thu.");}
 if(!ready)return <div className="admin-loading"><LoaderCircle className="spin"/>Đang mở cửa hàng…</div>;
 if(!staff)return <main className="connection-error"><StoreSwitcher access={access}/><Store size={38}/><h1>{access?.authenticated?access.account?.status==="suspended"?"Tài khoản đã tạm khóa":"Tài khoản chưa được cấp quyền":"Khu vực dành cho nhân viên"}</h1><p>{access?.authenticated?<>{access.email}<br/>Liên hệ quản trị để được cấp hoặc mở lại quyền truy cập bằng đúng email này.</>:"Đăng nhập bằng tài khoản được quản trị cấp quyền để sử dụng các chức năng phục vụ quán."}</p>{access?.authenticated?<><button className="primary" onClick={()=>void onMenuRefresh().catch(error=>notify((error as Error).message))}><RefreshCw size={17}/>Kiểm tra lại quyền</button><button type="button" className="secondary" onClick={async()=>{try{await api("auth/logout",{method:"POST"});}catch{}window.location.href=withStore("/?view=admin&tab=accounts");}}><LogOut size={17}/>Đăng xuất để đổi tài khoản</button></>:<a className="primary" href={"/signin?returnTo="+encodeURIComponent(withStore("/?view=admin"))}><LogIn size={18}/>Đăng nhập quản trị</a>}</main>;


 return <AdminWorkspace shop={shop} access={access} tab={tab} onSwitch={switchAdminTab} onAudio={()=>setAudioSettings(true)} onListen={()=>{notifications.testSound();setKeepAwake(true);}} soundReady={notifications.soundReady} canOrders={canOrders} canTables={canTables} pendingCount={data?.sessions.filter(s=>s.status==="pending").length??0} supportCount={data?.calls.length??0}>
 {!operationalTabs.includes(tab)&&tab!=="home"&&<AdminBack title={adminTabs.find(t=>t.id===tab)?.label??"Cài đặt"} onBack={()=>switchAdminTab("home")}/>}
 {error&&<div className="inline-error"><AlertCircle size={18}/>{error}<button onClick={()=>void reload()}>Thử lại</button></div>}{!data?<div className="admin-loading"><LoaderCircle className="spin"/>Đang tải dữ liệu…</div>:<>
 {canTables&&tab==="tables"&&<OpeningRequests sessions={data.sessions} tables={data.tables} working={working} onAction={sessionAction}/>}
 {tab==="stores"&&access?.isOwner&&<StoreManagement/>}
 {tab==="home"&&<AdminSettingsHome tabs={[...adminTabs].sort((a,b)=>["tables","menu","settings","promotions","revenue","accounts","stores"].indexOf(a.id)-["tables","menu","settings","promotions","revenue","accounts","stores"].indexOf(b.id))} onSwitch={switchAdminTab} collected={data.stats.todayCollected} orderCount={data.stats.todayCount} activeTables={data.sessions.filter(s=>s.status==="active").length} updated={lastSync?time(lastSync):"…"}/>}
 {operationalTabs.includes(tab)&&canOrders&&<>
  <OpenTableBoard key={tab} mode={tab==="support"?"support":tab==="order-list"?"orders":"tables"} initialView={tab==="orders"?"matrix":"manage"} permissions={access?.permissions??[]} tables={data.tables} sessions={data.sessions} orders={data.orders} calls={data.calls} transfers={data.transfers??[]} working={working} focusTableId={focusTableId} focusRevision={focusRevision} onSessionAction={sessionAction} onOrderStatus={(order,next)=>mutate("order",{id:order.id,status:next},"Đã cập nhật trạng thái đơn.")} onResolveCall={call=>mutate("call",{id:call.id,createdAt:call.created_at},"Đã xác nhận hỗ trợ bàn.")} onTransfer={setTransferSession} onCollect={openPayment} onCollectTable={setTablePaymentSessionId} onCancel={order=>{setCancelOrder(order);setReason("");}} onViewOrder={order=>{setReportOrderScope("orders.view");setReportOrder(order);}}/>
 </>}

 {tab==="revenue"&&canRevenue&&<RevenuePanel canCollect={canPay} tables={data.tables} refreshKey={revenueRevision} onCollect={openPayment} onViewOrder={order=>{setReportOrderScope("revenue.view");setReportOrder(order);}} notify={notify}/>}
 {tab==="menu"&&canMenu&&<><div className="section-heading menu-management-heading"><div><h2>Thực đơn của quán</h2><p>{data.items.length} món · Thay đổi được áp dụng cho lần gọi món tiếp theo.</p></div><button className="primary" onClick={()=>setEditItem({name:"",description:"",category:"main",price:50000,image:"/images/hero.webp",badge:"",available:1})}><Plus size={17}/>Thêm món</button></div><div className="manage-menu-list">{data.items.map(m=><div key={m.id} className="manage-menu-row"><FoodImage src={m.image} alt={m.name}/><div className="manage-menu-name"><strong>{m.name}</strong><span>{categories.find(c=>c.id===m.category)?.name}</span></div><div className="manage-price"><DishPrice item={m}/>{m.promotion&&<small className="promotion-state">{!m.promotion.enabled?"Khuyến mại đã tắt":m.promotion.endsAt!==null&&Date.now()>=m.promotion.endsAt?"Khuyến mại đã kết thúc":m.promotion.startsAt!==null&&Date.now()<m.promotion.startsAt?"Khuyến mại đã hẹn giờ":"Khuyến mại đang áp dụng"}</small>}</div><button className={"availability "+(m.available?"available":"")} disabled={working} onClick={()=>void mutate("item",{id:m.id,toggle:m.available?0:1},m.available?"Đã đánh dấu tạm hết món.":"Món đã sẵn sàng phục vụ.")}><span/>{m.available?"Đang bán":"Tạm hết"}</button><button className="icon-btn bordered" aria-label={"Chỉnh sửa "+m.name} onClick={()=>setEditItem(m)}><Pencil size={16}/></button></div>)}</div></>}
 {tab==="promotions"&&canMenu&&<section><div className="section-heading"><div><h2>Cài đặt khuyến mại</h2><p>Chọn món để cài mức giảm và thời gian áp dụng. Đơn đã đặt giữ nguyên giá.</p></div></div><div className="manage-menu-list">{data.items.map(m=><div className="manage-menu-row" key={m.id}><FoodImage src={m.image} alt={m.name}/><div className="manage-menu-name"><strong>{m.name}</strong><span>{!m.promotion?.enabled?"Chưa bật khuyến mại":m.promotion.endsAt!==null&&Date.now()>=m.promotion.endsAt?"Đã kết thúc":m.promotion.startsAt!==null&&Date.now()<m.promotion.startsAt?"Đã hẹn giờ":"Đang áp dụng"}</span></div><div className="manage-price"><DishPrice item={m}/></div><button className="secondary" onClick={()=>{setMutationError("");setEditPromotion(m);}}>Cài khuyến mại</button></div>)}</div>{!data.items.length&&<p>Thêm món trong Thực đơn trước khi cài khuyến mại.</p>}</section>}
 {tab==="tables"&&canTables&&<TableManagement tables={data.tables} sessions={data.sessions} orders={data.orders} shopName={shop.name} origin={origin} working={working} onAction={sessionAction} onEditTable={setEditTable} onAddTable={()=>setEditTable({id:"",token:"",name:"Bàn "+String(Math.max(0,...data.tables.map(t=>Number(t.id)||0))+1).padStart(2,"0"),zone:"Sảnh chính",creationRequestId:crypto.randomUUID()})} onViewOrders={openTable} onDeleteTable={table=>{setMutationError("");setDeleteTable(table);}}/>}
 {tab==="settings"&&canSettings&&<><ThemeSettingsPanel shopName={shop.name} value={normalizeThemeSettings(data.themeSettings??themeSettings)} working={working} onSave={value=>mutate("theme-settings",value,"Đã lưu màu giao diện và màu chữ cho quán.")}/><DisplaySettingsPanel value={normalizeDisplaySettings(data.displaySettings)} working={working} previewItem={data.items.find(item=>!!item.available)||data.items[0]} onSave={value=>mutate("display-settings",value,"Đã lưu thời gian thông báo, cỡ chữ và kích thước ảnh món.")}/><ShopForm key={brandingRevision(data.shop)+data.shop.open} shop={data.shop} working={working} onSave={s=>mutate("shop",s,"Đã cập nhật thông tin quán.")}/></>}
 {tab==="accounts"&&access&&<StaffAccountsPanel access={access} onAccessRefresh={async()=>{await reload(true);await onMenuRefresh();}}/>}
 </>}
 {audioSettings&&<Modal title="Thông báo & màn hình" onClose={()=>setAudioSettings(false)}><div className="form-body"><h3>Thông báo tiếng Việt</h3><p role="status">{notifications.audioNotice||"Giọng đọc đã sẵn sàng."}</p><button type="button" className="primary" onClick={()=>{notifications.testSound();setKeepAwake(true);}}><Volume2 size={18}/>Nghe thử giọng đọc</button><AdminScreenAwake enabled={keepAwake} onChange={setKeepAwake}/><AdminPushToggle notify={notify}/><button type="button" className="secondary" onClick={()=>void reload()}><RefreshCw size={18}/>Tải lại dữ liệu</button><StoreSwitcher access={access}/><a className="secondary" href={withStore("/")}>Xem thực đơn khách</a></div></Modal>}
 {canOrders&&<NewOrderPopup alert={notifications.active} waiting={notifications.waiting} durationMs={notifications.durationMs} onDismiss={notifications.dismiss} onOpenTable={openTable}/>}
 {reportOrder&&can(reportOrderScope)&&<Modal title={"Chi tiết đơn #"+reportOrder.code} onClose={()=>setReportOrder(null)}><div className="report-order-detail"><OrderReceipt order={reportOrder}/></div></Modal>}
 {canTransfer&&transferSession&&data&&<TableTransferDialog session={transferSession} tables={data.tables} sessions={data.sessions} orders={data.orders} calls={data.calls} onClose={()=>setTransferSession(null)} onRefresh={async()=>{await reload(true);}} onTransferred={result=>{setTransferSession(null);setRevenueRevision(n=>n+1);setFocusTableId(result.session.table_id);setFocusRevision(n=>n+1);void reload(true);void onMenuRefresh().catch(()=>{});notify(result.replayed?"Đã đồng bộ vị trí hiện tại của lượt khách: "+result.session.table_name+".":"Đã chuyển "+result.transfer.fromTableName+" sang "+result.transfer.toTableName+". Toàn bộ thông tin lượt khách đã chuyển cùng bàn.");}}/>}
 {canPay&&tablePaymentSessionId&&<TablePaymentDialog sessionId={tablePaymentSessionId} onClose={()=>setTablePaymentSessionId(null)} onPaid={result=>{setTablePaymentSessionId(null);setRevenueRevision(n=>n+1);void reload(true);void onMenuRefresh().catch(()=>{});notify("Đã ghi nhận "+money(result.receipt.amount)+" cho "+result.receipt.orderIds.length+" lần gọi món của bàn.");}}/>}
 {canMenu&&editPromotion&&<Modal title={"Khuyến mại · "+editPromotion.name} onClose={()=>!working&&setEditPromotion(null)}><form className="form-body" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const promotion=readPromotionForm(f,editPromotion.promotion);void mutate("promotion",{id:editPromotion.id,promotion},"Đã lưu khuyến mại.").then(ok=>{if(ok)setEditPromotion(null);});}}><p>Giá gốc: {money(editPromotion.price)}</p><PromotionFields initial={editPromotion.promotion}/>{mutationError&&<p className="submission-error" role="alert">{mutationError}</p>}<button className="primary full" disabled={working}>Lưu khuyến mại</button></form></Modal>}
 {canMenu&&editItem&&<Modal title={editItem.id?"Chỉnh sửa món":"Thêm món mới"} onClose={()=>!working&&setEditItem(null)}><ItemForm initial={editItem} working={working} error={mutationError} onSave={async m=>{if(await mutate("item",m,"Đã lưu món vào thực đơn."))setEditItem(null);}}/></Modal>}
 {canTables&&deleteTable&&<Modal title={"Xóa "+deleteTable.name+"?"} onClose={()=>!working&&setDeleteTable(null)}><div className="form-body"><p>Chỉ xóa bàn chưa có lượt phục vụ hoặc lịch sử liên quan. Mã QR của bàn sẽ ngừng sử dụng sau khi xóa.</p>{mutationError&&<p className="submission-error" role="alert">{mutationError}</p>}<button type="button" className="danger-button" disabled={working} onClick={async()=>{if(await mutate("table",{id:deleteTable.id,action:"delete"},"Đã xóa bàn."))setDeleteTable(null);}}>{working?"Đang xóa…":"Xác nhận xóa bàn"}</button><button type="button" className="secondary" disabled={working} onClick={()=>setDeleteTable(null)}>Giữ lại bàn</button></div></Modal>}
 {canTables&&editTable&&<Modal title={editTable.creationRequestId?"Thêm bàn mới":"Thông tin bàn"} onClose={()=>!working&&setEditTable(null)}><form className="form-body" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(await mutate("table",{id:editTable.id,name:f.get("name"),zone:f.get("zone"),...(editTable.creationRequestId?{create:true,requestId:editTable.creationRequestId}:{})},editTable.creationRequestId?"Đã thêm bàn mới và tạo mã QR riêng.":"Đã cập nhật bàn."))setEditTable(null);}}><label className="field"><span>Tên bàn</span><input name="name" defaultValue={editTable.name} required maxLength={30}/></label><label className="field"><span>Khu vực</span><input name="zone" defaultValue={editTable.zone} required maxLength={40}/></label>{mutationError&&<p className="submission-error" role="alert">{mutationError}</p>}<p className="table-form-note">{editTable.creationRequestId?"Bàn mới sẽ ở trạng thái trống và có mã QR riêng để tải hoặc in.":"Mã QR hiện tại tiếp tục sử dụng sau khi đổi tên bàn."}</p><button className="primary full" disabled={working}>{working?"Đang lưu…":editTable.creationRequestId?"Thêm bàn & tạo mã QR":"Lưu thông tin"}</button></form></Modal>}
 {canCancel&&cancelOrder&&<Modal title={"Hủy đơn #"+cancelOrder.code} onClose={()=>!working&&setCancelOrder(null)}><form className="form-body" onSubmit={async e=>{e.preventDefault();if(await mutate("order",{id:cancelOrder.id,status:"cancelled",reason},"Đã hủy đơn và thông báo trạng thái cho khách."))setCancelOrder(null);}}><p>{cancelOrder.table_name} · {money(cancelOrder.total)}</p><label className="field"><span>Lý do hủy (khách sẽ nhìn thấy)</span><textarea required rows={3} maxLength={180} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ví dụ: Khách yêu cầu hủy món…"/></label>{mutationError&&<p className="submission-error" role="alert">{mutationError}</p>}<button className="danger-button full" disabled={working||!reason.trim()}>Xác nhận hủy đơn</button></form></Modal>}
 {canPay&&confirmPaid&&<Modal title="Thanh toán lần gọi món" onClose={()=>!working&&setConfirmPaid(null)}><div className="form-body"><p>Đơn <strong>#{confirmPaid.code}</strong> · {confirmPaid.table_name}{confirmPaid.customer_name&&<> · {confirmPaid.customer_name}</>}</p><h2>{money(confirmPaid.total)}</h2><p>Chọn phương thức khách đã thanh toán. Chỉ xác nhận khi quán đã nhận đủ tiền.</p><fieldset className="payment-method-picker"><legend>Phương thức thanh toán</legend>{([{id:"cash",label:"Tiền mặt",icon:Banknote},{id:"bank",label:"Chuyển khoản",icon:Landmark},{id:"other",label:"Khác",icon:WalletCards}] as const).map(method=><label key={method.id} className={"payment-method-option "+(paymentMethod===method.id?"selected":"")}><input type="radio" name="paymentMethod" value={method.id} checked={paymentMethod===method.id} disabled={working} onChange={()=>setPaymentMethod(method.id)}/><method.icon size={20}/><span>{method.label}</span></label>)}</fieldset><p className="payment-timestamp-note"><Clock size={14}/>Thời điểm thu tiền được ghi nhận khi xác nhận.</p>{mutationError&&<p className="submission-error" role="alert">{mutationError}</p>}<button className="primary full" disabled={working||!paymentMethod} onClick={async()=>{if(await mutate("order",{id:confirmPaid.id,action:"paid",paymentMethod},"Đã ghi nhận tiền thu và phương thức thanh toán."))setConfirmPaid(null);}}>{working?<LoaderCircle className="spin" size={18}/>:<Check size={18}/>}Quán đã nhận đủ tiền</button></div></Modal>}
 </AdminWorkspace>;
}
function ItemForm({initial,working,error="",onSave}:{initial:Partial<MenuItem>;working:boolean;error?:string;onSave:(m:Partial<MenuItem>)=>Promise<void>}){const [image,setImage]=useState(initial.image||"/images/hero.webp"),[imageBusy,setImageBusy]=useState(false),[itemExtras,setItemExtras]=useState(()=>initial.id?extrasFor(initial as MenuItem):[]);return <form className="form-body" onSubmit={e=>{e.preventDefault();if(imageBusy||working)return;const f=new FormData(e.currentTarget);void onSave({...initial,name:String(f.get("name")),description:String(f.get("description")),category:f.get("category") as Category,price:Number(f.get("price")),promotion:undefined,extras:itemExtras,image,badge:String(f.get("badge")),available:f.get("available")==="on"?1:0});}}><label className="field"><span>Tên món</span><input name="name" defaultValue={initial.name} required maxLength={80}/></label><div className="form-two"><label className="field"><span>Nhóm món</span><select name="category" defaultValue={initial.category}>{categories.filter(c=>c.id!=="all").map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field"><span>Giá bán (VNĐ)</span><input name="price" type="number" step={1000} min={1000} max={2000000} required defaultValue={initial.price}/></label></div><label className="field"><span>Mô tả ngắn</span><textarea name="description" rows={3} maxLength={240} defaultValue={initial.description}/></label><ItemExtrasEditor value={itemExtras} onChange={setItemExtras} disabled={working}/><DishImageField value={image} disabled={working||imageBusy} onChange={setImage} onBusy={setImageBusy}/><label className="field"><span>Nhãn gợi ý</span><input name="badge" maxLength={32} defaultValue={initial.badge} placeholder="Ví dụ: Món mới"/></label><label className="option-row"><input name="available" type="checkbox" defaultChecked={!!initial.available}/><span>Sẵn sàng phục vụ</span></label>{error&&<p className="submission-error" role="alert">{error}</p>}<button className="primary full" disabled={working||imageBusy}>{working?<LoaderCircle className="spin" size={16}/>:<Check size={17}/>}Lưu món</button></form>;}
function ShopForm({shop,working,onSave}:{shop:Shop;working:boolean;onSave:(s:Shop)=>Promise<boolean>}){const [logo,setLogo]=useState(shop.logo??""),[logoBusy,setLogoBusy]=useState(false);return <div className="settings-layout"><form className="settings-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(logoBusy||working)return;void onSave({logo,name:String(f.get("name")),tagline:String(f.get("tagline")),hours:String(f.get("hours")),address:String(f.get("address")),open:f.get("open")==="on"});}}><h2>Thông tin cửa hàng</h2><ShopLogoField value={logo} name={shop.name} disabled={working} onChange={setLogo} onBusy={setLogoBusy}/><p>Cá nhân hóa thực đơn bằng tên và thông tin của quán.</p><label className="field"><span>Tên cửa hàng</span><input name="name" required maxLength={40} defaultValue={shop.name}/></label><label className="field"><span>Dòng giới thiệu dưới tên</span><input name="tagline" maxLength={60} defaultValue={shop.tagline}/></label><label className="field"><span>Giờ phục vụ</span><input name="hours" maxLength={50} defaultValue={shop.hours}/></label><label className="field"><span>Địa chỉ hoặc lời giới thiệu ngắn</span><textarea name="address" maxLength={140} rows={3} defaultValue={shop.address}/></label><label className="shop-open"><input type="checkbox" name="open" defaultChecked={shop.open}/><span><strong>Đang nhận món</strong><small>Tắt khi quán nghỉ hoặc bếp cần tạm dừng.</small></span></label><button className="primary" disabled={working||logoBusy}><Check size={17}/>Lưu thay đổi</button></form><aside className="settings-guide"><Leaf size={32}/><h2>Sẵn sàng đón khách<br/>trong vài bước.</h2><ol><li>Cập nhật tên cửa hàng.</li><li>Thêm món, giá và ảnh thật.</li><li>Đặt tên bàn và tải mã QR.</li><li>Quét QR, nhập tên và duyệt mở bàn.</li><li>Thử gọi món, thanh toán và đóng bàn.</li></ol><p>Quản lý đơn bằng tài khoản đã được cấp quyền. Thanh toán hiện được xác nhận thủ công tại quán.</p></aside></div>;}

function DishPrice({item}:{item:MenuItem}){
 const price=salePrice(item),discount=price<item.price;
 return <span className="dish-price">{discount&&<del aria-label="Giá gốc">{money(item.price)}</del>}<strong>{money(price)}</strong>{discount&&<span className="promotion-label">Giảm {item.promotion?.type==="percent"?item.promotion.value+"%":money(item.price-price)}</span>}</span>;
}
function promotionDate(value:number|null|undefined){return value?new Date(value+7*3600000).toISOString().slice(0,16):"";}
function PromotionFields({initial}:{initial?:Promotion|null}){
 const [enabled,setEnabled]=useState(!!initial?.enabled),[type,setType]=useState<Promotion["type"]>(initial?.type??"percent");
 return <fieldset className="promotion-fields"><legend>Khuyến mại món</legend><label className="option-row"><input name="promotionEnabled" type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/><span>Bật giảm giá cho món này</span></label><p>Giảm trên giá món, không giảm phụ thu. Đơn đã đặt giữ nguyên giá.</p>{enabled&&<><div className="form-two"><label className="field"><span>Hình thức giảm</span><select name="promotionType" value={type} onChange={e=>setType(e.target.value as Promotion["type"])}><option value="percent">Theo phần trăm (%)</option><option value="amount">Theo số tiền (₫)</option></select></label><label className="field"><span>{type==="percent"?"Mức giảm (%)":"Số tiền giảm (₫)"}</span><input key={type} name="promotionValue" type="number" min={1} max={type==="percent"?99:1999000} step={1} required defaultValue={initial?.type===type?initial.value:type==="percent"?10:5000}/></label></div><div className="form-two"><label className="field"><span>Bắt đầu (giờ Việt Nam)</span><input name="promotionStart" type="datetime-local" defaultValue={promotionDate(initial?.startsAt)}/></label><label className="field"><span>Kết thúc (giờ Việt Nam)</span><input name="promotionEnd" type="datetime-local" defaultValue={promotionDate(initial?.endsAt)}/></label></div><small>Để trống ngày bắt đầu để áp dụng ngay; để trống ngày kết thúc để chạy đến khi tắt. Giá sau giảm tối thiểu 1.000 ₫.</small></>}</fieldset>;
}

function readPromotionForm(f:FormData,initial:Promotion|null|undefined):Promotion|null{return f.get("promotionEnabled")==="on"?{enabled:true,type:f.get("promotionType") as Promotion["type"],value:Number(f.get("promotionValue")),startsAt:f.get("promotionStart")?Date.parse(String(f.get("promotionStart"))+":00+07:00"):null,endsAt:f.get("promotionEnd")?Date.parse(String(f.get("promotionEnd"))+":00+07:00"):null}:initial?{...initial,enabled:false}:null;}
