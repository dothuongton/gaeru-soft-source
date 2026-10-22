/** A staff install always reopens the same store in its admin workspace. */
export function staffManifest(storeId="main"){
 if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(storeId))throw new Error("Invalid store");
 const query=new URLSearchParams({view:"admin"});
 if(storeId!=="main")query.set("store",storeId);
 return {
  id:storeId==="main"?"/gaeru":"/gaeru?store="+encodeURIComponent(storeId),
  name:"GAERU Soft — Quản trị cửa hàng",short_name:"GAERU Soft",
  start_url:"/?"+query.toString(),scope:"/",display:"standalone",
  background_color:"#f8faf9",theme_color:"#244f3c",lang:"vi",
  icons:[{src:"/icon-192.png",sizes:"192x192",type:"image/png",purpose:"any"},{src:"/icon-512.png",sizes:"512x512",type:"image/png",purpose:"any"},{src:"/icon-maskable-512.png",sizes:"512x512",type:"image/png",purpose:"maskable"}]
 };
}
