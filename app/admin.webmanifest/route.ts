import {staffManifest} from "@/lib/pwa-manifest";
export function GET(request:Request){
 try{return Response.json(staffManifest(new URL(request.url).searchParams.get("store")||"main"),{headers:{"Content-Type":"application/manifest+json; charset=utf-8","Cache-Control":"no-cache"}});}
 catch{return new Response("Invalid store",{status:400});}
}
