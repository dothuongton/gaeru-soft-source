/** Login is an entry to staff tools; a bare root must never return to customer ordering. */
export function staffReturnUrl(raw:string|null){
 const fallback="/?view=admin";
 if(!raw||!raw.startsWith("/")||raw.startsWith("//"))return fallback;
 try{
  const url=new URL(raw,"https://return.invalid");
  if(url.origin!=="https://return.invalid"||!["/","/gaeru"].includes(url.pathname))return fallback;
  if(url.pathname==="/")url.searchParams.set("view","admin");
  return url.pathname+url.search+url.hash;
 }catch{return fallback;}
}
