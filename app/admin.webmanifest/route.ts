import {staffManifest} from "@/lib/pwa-manifest";
import {resolveStore} from "@/lib/store-platform";
import {inStore} from "@/lib/store-database";
import {getShop} from "@/lib/server";
export async function GET(request:Request){
 try{const id=new URL(request.url).searchParams.get("store")||"main";const manifest=staffManifest(id);const store=await resolveStore(new Request("https://site.local/?store="+encodeURIComponent(id)));const shop=await inStore(store.id,()=>getShop());return Response.json({...manifest,name:shop.name+" — Quản trị",short_name:shop.name},{headers:{"Content-Type":"application/manifest+json; charset=utf-8","Cache-Control":"no-cache"}});}
 catch{return new Response("Invalid store",{status:400});}
}
