import type {Shop} from './menu';
type Store=Pick<Storage,'getItem'|'setItem'>;
const key=(store:string)=>'gaeru:staff-branding:v1:'+store;
/** Only public branding is retained. Never persist account authority, bills or customer data here. */
export function saveStartupBranding(storage:Store|null,store:string,shop:Shop){
 if(!storage||!/^[a-z0-9][a-z0-9-]{0,47}$/.test(store))return;
 const logo=shop.logo?.startsWith('/api/branding-icon?')?shop.logo:'';
 try{storage.setItem(key(store),JSON.stringify({name:shop.name.slice(0,40),logo,at:Date.now()}));}catch{}
}
export function readStartupBranding(storage:Store|null,store:string):{name:string;logo:string}|null{
 if(!storage)return null;
 try{const value=JSON.parse(storage.getItem(key(store))??'null');if(!value||typeof value.name!=='string'||!value.name.trim()||value.name.length>40||!Number.isFinite(value.at)||Date.now()-value.at>7*86400000)return null;return {name:value.name,logo:typeof value.logo==='string'&&value.logo.startsWith('/api/branding-icon?')&&value.logo.length<250?value.logo:''};}catch{return null;}
}
export function installedStoreDestination(data:{isPlatformOwner:boolean;authenticated:boolean;stores:{id:string;status:string}[]},standalone:boolean){return standalone&&data.authenticated&&!data.isPlatformOwner&&data.stores.length===1&&data.stores[0].status==='active'?data.stores[0].id:null;}
