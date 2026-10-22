import type {Metadata} from "next";
import OrderingApp from "./ordering-app";
import {inStore} from "@/lib/store-database";
import {resolveStore} from "@/lib/store-platform";
import {getShop} from "@/lib/server";
import {brandingRevision,publicShop} from "@/lib/menu";
export const dynamic="force-dynamic";
export async function generateMetadata({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}):Promise<Metadata>{
 const params=await searchParams;
 if(params.view==="admin")return {title:"GAERU Soft — Quản trị cửa hàng",manifest:"/admin.webmanifest?store="+encodeURIComponent(typeof params.store==="string"?params.store:"main")};
 try{const storeId=typeof params.store==="string"?params.store:"main";const store=await resolveStore(new Request("https://site.local/?store="+encodeURIComponent(storeId)));const shop=await inStore(store.id,()=>getShop());const icon="/api/branding-icon?store="+encodeURIComponent(store.id)+"&v="+brandingRevision(shop);return {manifest:params.view==="admin"?"/admin.webmanifest?store="+encodeURIComponent(store.id):"/manifest.webmanifest",title:shop.name+" — "+(params.view==="admin"?"Quản trị cửa hàng":"Gọi món tại bàn"),description:[shop.name,shop.tagline,shop.address].filter(Boolean).join(" · "),icons:{icon,shortcut:icon,apple:icon}};}catch{return {title:"Cửa hàng — Gọi món tại bàn"};}
}
export default async function Home({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 const initialView=params.view==="admin"?"admin":params.view==="orders"?"orders":params.view==="about"?"about":"menu";
 // The admin bootstrap already returns branding; do not serialize its base64 logo twice.
 if(initialView==="admin")return <OrderingApp initialView="admin"/>;
 try{const storeId=typeof params.store==="string"?params.store:"main";const store=await resolveStore(new Request("https://site.local/?store="+encodeURIComponent(storeId)));const shop=await inStore(store.id,()=>getShop());return <OrderingApp initialShop={publicShop(shop,store.id)} initialView={initialView}/>;}catch{return <OrderingApp initialView={initialView}/>;}
}
