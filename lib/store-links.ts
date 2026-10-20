export function activeStoreId(){return typeof window==="undefined"?"main":new URLSearchParams(window.location.search).get("store")||"main";}
export function withStore(path:string,storeId=activeStoreId()){const [pathname,query=""]=path.split("?");const params=new URLSearchParams(query);if(storeId!=="main")params.set("store",storeId);else params.delete("store");return pathname+(params.size?"?"+params.toString():"");}
export function storeAdminPath(storeId:string,tab="orders"){return withStore("/?view=admin&tab="+encodeURIComponent(tab),storeId);}
