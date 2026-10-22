/** Call only after fresh authorization and reads; validators never bypass access checks. */
export async function conditionalJson(request:Request,data:unknown,extraHeaders?:HeadersInit){
 const body=JSON.stringify(data),digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body));
 const etag='"'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("")+'"';
 const headers=new Headers(extraHeaders);headers.set("ETag",etag);headers.set("Cache-Control","no-store");headers.set("Vary","Cookie");headers.set("X-Content-Type-Options","nosniff");
 // The first device response must deliver its identity cookie and full snapshot.
 if(!headers.has("Set-Cookie")&&request.headers.get("If-None-Match")===etag)return new Response(null,{status:304,headers});
 headers.set("Content-Type","application/json; charset=utf-8");return new Response(body,{headers});
}

export function conditionalJsonWithEtag(request:Request,data:unknown,etag:string,extraHeaders?:HeadersInit){
 const headers=new Headers(extraHeaders);headers.set("ETag",etag);headers.set("Cache-Control","no-store");headers.set("Vary","Cookie");headers.set("X-Content-Type-Options","nosniff");
 if(!headers.has("Set-Cookie")&&request.headers.get("If-None-Match")===etag)return new Response(null,{status:304,headers});
 const body=JSON.stringify(data);
 headers.set("Content-Type","application/json; charset=utf-8");return new Response(body,{headers});
}
