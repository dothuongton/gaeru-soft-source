import type {Metadata} from "next";
import OrderingApp from "./ordering-app";
import {inStore} from "@/lib/store-database";
import {resolveStore} from "@/lib/store-platform";
import {getShop} from "@/lib/server";
import {brandingRevision} from "@/lib/menu";
export const dynamic="force-dynamic";
export async function generateMetadata({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}):Promise<Metadata>{
 try{const params=await searchParams,storeId=typeof params.store==="string"?params.store:"main";const store=await resolveStore(new Request("https://site.local/?store="+encodeURIComponent(storeId)));const shop=await inStore(store.id,()=>getShop());const icon="/api/branding-icon?store="+encodeURIComponent(store.id)+"&v="+brandingRevision(shop);return {title:shop.name+" — "+(params.view==="admin"?"Quản trị cửa hàng":"Gọi món tại bàn"),description:[shop.name,shop.tagline,shop.address].filter(Boolean).join(" · "),icons:{icon,shortcut:icon,apple:icon}};}catch{return {title:"Cửa hàng — Gọi món tại bàn"};}
}
export default async function Home({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 const initialView=params.view==="admin"?"admin":params.view==="orders"?"orders":params.view==="about"?"about":"menu";
 try{const storeId=typeof params.store==="string"?params.store:"main";const store=await resolveStore(new Request("https://site.local/?store="+encodeURIComponent(storeId)));const shop=await inStore(store.id,()=>getShop());return <OrderingApp initialShop={shop} initialView={initialView}/>;}catch{return <OrderingApp initialView={initialView}/>;}
}
