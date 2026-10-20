export type Category = "main" | "light" | "drink" | "dessert";
export type Promotion = {enabled:boolean; type:"percent"|"amount"; value:number; startsAt:number|null; endsAt:number|null};
export type MenuExtra = {id:string;label:string;price:number};
export type MenuItem = { extras?:MenuExtra[]; promotion?:Promotion|null; id:string; name:string; description:string; category:Category; price:number; image:string; badge:string; available:number; sort:number };
export type DiningTable = { id:string; name:string; zone:string; token:string };
export type Shop = { logo?:string; name:string; tagline:string; hours:string; address:string; open:boolean };
export type CartLine = { key:string; itemId:string; quantity:number; extras:string[]; taste:string; note:string };
export type OrderItem = { itemId:string; name:string; quantity:number; unitPrice:number; total:number; extras:string[]; taste:string; note:string; image:string };
export type OrderStatus = "new" | "preparing" | "ready" | "served" | "cancelled";
export type Order = { id:string; code:string; table_id:string; table_name:string; dining_session_id?:string|null; customer_name?:string; items:OrderItem[]; total:number; note:string; status:OrderStatus; paid:number; paid_at?:number|null; payment_method?:"cash"|"bank"|"other"|"unknown"; cancel_reason:string; created_at:number; updated_at:number };
export type ServiceRequest = { id:string; table_id:string; table_name:string; session_id?:string|null; note?:string; kind:"service"|"bill"; status:"open"|"done"; created_at:number };
export const categories: { id:Category|"all"; name:string; short:string }[] = [{id:"all",name:"Tất cả món",short:"Tất cả"},{id:"main",name:"Món chính",short:"Món chính"},{id:"light",name:"Ăn nhẹ",short:"Ăn nhẹ"},{id:"drink",name:"Đồ uống",short:"Đồ uống"},{id:"dessert",name:"Tráng miệng",short:"Tráng miệng"}];
export const statuses: Record<OrderStatus,{label:string;short:string;next?:OrderStatus;action?:string}> = {
 new:{label:"Chờ xác nhận",short:"Đơn mới",next:"preparing",action:"Nhận đơn"},preparing:{label:"Đang chuẩn bị",short:"Đang làm",next:"ready",action:"Món đã sẵn sàng"},ready:{label:"Sẵn sàng phục vụ",short:"Sẵn sàng",next:"served",action:"Đã phục vụ"},served:{label:"Đã phục vụ",short:"Hoàn tất"},cancelled:{label:"Đã hủy",short:"Đã hủy"}
};
export const money = (n:number) => new Intl.NumberFormat("vi-VN").format(n)+" ₫";
export const cleanSearch = (s:string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase();
export const defaultShop:Shop = {logo:"",name:"Mộc",tagline:"Kitchen & Coffee",hours:"07:00 – 22:00",address:"Một góc nhỏ, những bữa ngon.",open:true};
export const sampleMenu:MenuItem[] = [
 {id:"chicken",name:"Cơm gà sốt Mộc",description:"Gà sốt đậm đà, cơm nóng và rau củ tươi.",category:"main",price:65000,image:"/images/chicken-rice.webp",badge:"Bếp gợi ý",available:1,sort:1},
 {id:"pho",name:"Phở bò",description:"Nước dùng thơm, bánh phở mềm và thịt bò.",category:"main",price:69000,image:"/images/pho-beef.webp",badge:"Món Việt",available:1,sort:2},
 {id:"salad",name:"Salad Mộc",description:"Rau xanh, trứng, thịt áp chảo và sốt thanh nhẹ.",category:"light",price:59000,image:"/images/salad.webp",badge:"Tươi mỗi ngày",available:1,sort:3},
 {id:"fries",name:"Khoai tây chiên",description:"Vàng giòn bên ngoài, mềm bên trong. Vui hơn khi sẻ chia.",category:"light",price:35000,image:"/images/fries.webp",badge:"",available:1,sort:4},
 {id:"coffee",name:"Cà phê sữa đá",description:"Cà phê đậm vị, sữa đặc ngọt dịu, thêm một chút đá.",category:"drink",price:35000,image:"/images/iced-coffee.webp",badge:"",available:1,sort:5},
 {id:"tea",name:"Trà đào sả",description:"Trà thanh mát, miếng đào ngọt và hương sả nhẹ.",category:"drink",price:39000,image:"/images/peach-tea.webp",badge:"Thử một chút mới",available:1,sort:6},
 {id:"tiramisu",name:"Bánh tiramisu",description:"Kem mềm, cacao và hương cà phê — kết bữa thật dịu.",category:"dessert",price:45000,image:"/images/tiramisu.webp",badge:"Ngọt vừa đủ",available:1,sort:7}
];
export const tastes = ["Vừa vị","Ít ngọt","Không thêm đường"];
export function extrasFor(item:MenuItem):MenuExtra[] {
 if(item.extras!==undefined)return item.extras;
 if(item.category==="main")return [{id:"egg",label:"Thêm trứng",price:10000},{id:"rice",label:"Thêm phần ăn kèm",price:15000}];
 if(item.category==="drink")return [{id:"large",label:"Ly lớn",price:10000}];
 if(item.id==="fries")return [{id:"cheese",label:"Thêm sốt phô mai",price:10000}];return [];
}
export function validatePromotion(raw:unknown,price:number):Promotion|null {
 if(raw===null)return null;
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new OrderError("Khuyến mại không hợp lệ.");
 const p=raw as Promotion;
 if(typeof p.enabled!=="boolean"||!["percent","amount"].includes(p.type)||!Number.isInteger(p.value)||p.value<=0||(p.type==="percent"?p.value>99:p.value>2000000||(p.enabled&&p.value>=price)))throw new OrderError("Mức giảm phải là số nguyên: 1–99% hoặc số tiền nhỏ hơn giá bán.");
 for(const t of [p.startsAt,p.endsAt])if(t!==null&&(!Number.isSafeInteger(t)||t<0||t>8640000000000000))throw new OrderError("Thời gian khuyến mại không hợp lệ.");
 if(p.startsAt!==null&&p.endsAt!==null&&p.endsAt<=p.startsAt)throw new OrderError("Thời gian kết thúc phải sau thời gian bắt đầu.");
 const result={enabled:p.enabled,type:p.type,value:p.value,startsAt:p.startsAt,endsAt:p.endsAt};
 if(p.enabled&&discountedPrice(price,result)<1000)throw new OrderError("Giá sau giảm phải từ 1.000 ₫.");
 return result;
}
function discountedPrice(price:number,p:Promotion){return p.type==="percent"?Math.round(price*(100-p.value)/100):price-p.value;}
export function salePrice(item:MenuItem,now=Date.now()){
 const p=item.promotion;
 if(!p?.enabled||(p.startsAt!==null&&now<p.startsAt)||(p.endsAt!==null&&now>=p.endsAt))return item.price;
 return discountedPrice(item.price,p);
}
export function linePrice(line:Pick<CartLine,"extras">,item:MenuItem){return salePrice(item)+extrasFor(item).filter(x=>line.extras.includes(x.id)).reduce((sum,x)=>sum+x.price,0);}
export class OrderError extends Error {constructor(message:string,public status=400){super(message);}}
export function checkedText(v:unknown,max:number,required=false){if(typeof v!=="string"||v.length>max||(required&&!v.trim()))throw new OrderError("Vui lòng kiểm tra nội dung đã nhập.");return v.trim();}
export function calculateOrder(raw:unknown,menu:MenuItem[]): {items:OrderItem[];total:number}{
 if(!Array.isArray(raw)||raw.length<1||raw.length>30)throw new OrderError("Vui lòng chọn từ 1 đến 30 món.");let units=0;
 const items=raw.map((r:unknown)=>{
  if(!r||typeof r!=="object")throw new OrderError("Món đã chọn không hợp lệ.");const l=r as CartLine,item=menu.find(m=>m.id===l.itemId);
  if(!item)throw new OrderError("Một món không còn trong thực đơn. Vui lòng chọn lại.",409);
  if(!item.available)throw new OrderError(`${item.name} vừa hết. Vui lòng chọn món khác.`,409);
  if(!Number.isInteger(l.quantity)||l.quantity<1||l.quantity>20)throw new OrderError("Số lượng mỗi món phải từ 1 đến 20.");units+=l.quantity;
  const allowed=extrasFor(item);
  if(!Array.isArray(l.extras)||l.extras.length>allowed.length||new Set(l.extras).size!==l.extras.length||l.extras.some(e=>typeof e!=="string"||!allowed.some(a=>a.id===e)))throw new OrderError("Tùy chọn món không hợp lệ.");
  const taste=checkedText(l.taste??"",40);
  if((item.category==="drink"&&!tastes.includes(taste))||(item.category!=="drink"&&taste!==""))throw new OrderError("Vui lòng chọn lại khẩu vị của món.");
  const note=checkedText(l.note??"",240),unitPrice=linePrice(l,item);
  return {itemId:item.id,name:item.name,quantity:l.quantity,unitPrice,total:unitPrice*l.quantity,extras:allowed.filter(a=>l.extras.includes(a.id)).map(a=>a.label),taste,note,image:item.image};
 });
 if(units>60)throw new OrderError("Mỗi lần gọi tối đa 60 phần. Vui lòng gọi nhân viên cho đơn lớn.");const total=items.reduce((s,i)=>s+i.total,0);
 if(total>10000000)throw new OrderError("Vui lòng liên hệ nhân viên để đặt đơn lớn.");return {items,total};
}
export function canTransition(from:OrderStatus,to:OrderStatus){return statuses[from]?.next===to||(to==="cancelled"&&(from==="new"||from==="preparing"));}

export function shopInitials(name:string){return name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(word=>Array.from(word)[0]).join("").toLocaleUpperCase("vi-VN")||"Q";}
export function validateShopLogo(value:unknown):string{
 if(value===undefined||value===null||value==="")return "";
 if(typeof value!=="string"||value.length>220000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new OrderError("Logo không hợp lệ. Vui lòng tải ảnh PNG, JPG hoặc WebP từ thiết bị.");
 let binary:string;try{binary=atob(value.slice(value.indexOf(",")+1));}catch{throw new OrderError("Dữ liệu logo không hợp lệ.");}
 if(!binary.startsWith("\x89PNG\r\n\x1a\n")||binary.slice(12,16)!=="IHDR"||binary.length<33)throw new OrderError("Dữ liệu ảnh logo không hợp lệ.");
 const size=(offset:number)=>((binary.charCodeAt(offset)*16777216)+(binary.charCodeAt(offset+1)<<16)+(binary.charCodeAt(offset+2)<<8)+binary.charCodeAt(offset+3));
 if(size(16)<1||size(20)<1||size(16)>512||size(20)>512)throw new OrderError("Logo cần được thu gọn trước khi lưu.");
 return value;
}
export function brandingRevision(shop:Shop){let hash=2166136261;for(const character of shop.name+"|"+(shop.logo??""))hash=Math.imul(hash^character.charCodeAt(0),16777619);return (hash>>>0).toString(36);}
export function shopIconSvg(name:string){const initials=shopInitials(name).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#244f3c"/><text x="64" y="70" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="50" fill="#ffffff">${initials}</text></svg>`;}

export function validateExtras(raw:unknown):MenuExtra[]{
 if(!Array.isArray(raw)||raw.length>20)throw new OrderError("Mỗi món có tối đa 20 lựa chọn bổ sung.");
 const ids=new Set<string>();const labels=new Set<string>();
 return raw.map(value=>{if(!value||typeof value!=="object"||Array.isArray(value))throw new OrderError("Lựa chọn bổ sung không hợp lệ.");const id=checkedText(value.id,60,true),label=checkedText(value.label,60,true);if(!/^[a-zA-Z0-9_-]+$/.test(id)||ids.has(id)||labels.has(label.toLocaleLowerCase("vi")))throw new OrderError("Tên và mã lựa chọn bổ sung không được trùng.");if(!Number.isInteger(value.price)||value.price<0||value.price>2000000)throw new OrderError("Giá bổ sung phải từ 0 đến 2.000.000 ₫.");ids.add(id);labels.add(label.toLocaleLowerCase("vi"));return {id,label,price:value.price};});
}
