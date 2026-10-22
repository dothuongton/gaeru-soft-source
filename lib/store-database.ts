import {AsyncLocalStorage} from "node:async_hooks";
import {env} from "cloudflare:workers";
import {OrderError} from "./menu";

export const STORE_TABLES=["settings","dining_tables","menu_items","table_sessions","table_settlements","table_payment_receipts","table_transfers","orders","service_requests","staff_accounts","staff_account_audit","staff_push_subscriptions"] as const;
const context=new AsyncLocalStorage<string>();
export function currentStoreId(){const id=context.getStore();if(!id)throw new Error("Store context is required");return id;}
export function inStore<T>(id:string,operation:()=>T):T{if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id))throw new OrderError("Mã cửa hàng không hợp lệ.",400);return context.run(id,operation);}
export function rootDatabase(){if(!env.DB)throw new OrderError("Dữ liệu chưa sẵn sàng. Vui lòng thử lại sau.",503);return env.DB;}

type Token={text:string;start:number;end:number;depth:number};
/** Tokenize SQL syntax, never the contents of quoted strings or comments. */
function tokens(sql:string):Token[]{
 const result:Token[]=[];let depth=0;
 const re=/\s+|--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|\[[^\]]*\]|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|[^\s]/g;
 for(const match of sql.matchAll(re)){
  const text=match[0],start=match.index!;
  if(/^\s|^--|^\/\*/.test(text))continue;
  if(text===")")depth--;
  if(depth<0)throw new Error("Unbalanced SQL");
  result.push({text:text.toLowerCase(),start,end:start+text.length,depth});
  if(text==="(")depth++;
 }
 if(depth!==0)throw new Error("Unbalanced SQL");return result;
}
/**
 * All operational SQL uses one request-local store. Read CTEs shadow the physical
 * tables (including correlated subqueries). Writes explicitly target main and
 * carry a store predicate/column; compound unique keys include store_id.
 * Only this closed SQL grammar is accepted. No request data is used as SQL.
 */
export function scopeSql(sql:string,storeId:string):string{
 if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(storeId))throw new Error("Invalid store scope");
 const t=tokens(sql);if(!t.length)throw new Error("Empty SQL");
 if(t.some(x=>x.text===";"))throw new Error("Multiple SQL statements are forbidden");
 if(t.some((x,i)=>x.text==="main"&&t[i+1]?.text==="."))throw new Error("Physical tables require the root connection");
 const names=new Set<string>(STORE_TABLES),used=STORE_TABLES.filter(name=>t.some(x=>x.text===name));
 if(t.some(x=>["stores","platform_store_requests"].includes(x.text)))throw new Error("Platform data requires the root connection");
 const top=t.filter(x=>x.depth===0),verb=top[0].text,edits:{at:number;text:string;end?:number}[]=[];
 const literal="'"+storeId+"'";
 if(verb==="insert"){
  const into=top.findIndex(x=>x.text==="into"),target=top[into+1];
  if(!target||(!names.has(target.text)&&target.text!=="staff_owner_bindings"))throw new Error("Unsupported INSERT target");
  if(names.has(target.text)){
   const opening=top[into+2];if(opening?.text!=="(")throw new Error("INSERT requires explicit columns");
   if(t.some(x=>x.text==="store_id"))throw new Error("Store scope cannot be supplied by callers");
   edits.push({at:target.start,end:target.end,text:"main."+target.text},{at:opening.end,text:"store_id,"});
   const closing=top.findIndex((x,i)=>i>into+2&&x.text===")");
   const source=top[closing+1];
   if(source?.text==="values"){
    const open=top[closing+2];if(open?.text!=="(")throw new Error("Unsupported VALUES");
    edits.push({at:open.end,text:literal+","});
    // Existing application inserts one row per statement; fail closed on tuples.
    const after=top[closing+4];if(after?.text===",")throw new Error("Multi-row VALUES not supported");
   }else if(source?.text==="select")edits.push({at:source.end,text:" "+literal+","});
   else throw new Error("Unsupported INSERT source");
   const conflict=top.findIndex(x=>x.text==="conflict");
   if(conflict>=0){const open=top[conflict+1];if(open?.text!=="(")throw new Error("Explicit conflict key required");edits.push({at:open.end,text:"store_id,"});}
  }
 }else if(verb==="update"||verb==="delete"){
  const target=verb==="delete"?top[2]:top[top[1]?.text==="or"?3:1];
  if(!target||(!names.has(target.text)&&target.text!=="staff_owner_bindings"))throw new Error("Unsupported mutation target");
  if(names.has(target.text)){
   if(t.some(x=>x.text==="store_id"))throw new Error("Store scope cannot be changed");
   if(top.some(x=>["returning","limit","order"].includes(x.text)))throw new Error("Unsupported write suffix");
   edits.push({at:target.start,end:target.end,text:"main."+target.text});
   const where=top.find(x=>x.text==="where");
   if(where){edits.push({at:where.end,text:" store_id = "+literal+" AND ("},{at:sql.length,text:")"});}
   else edits.push({at:sql.length,text:" WHERE store_id = "+literal});
  }
 }else if(verb!=="select"&&verb!=="with")throw new Error("Unsupported store statement");
 if(verb==="with"&&top.some(x=>["insert","update","delete"].includes(x.text)))throw new Error("Write CTE not supported");
 let scoped=sql;for(const edit of edits.sort((a,b)=>b.at-a.at))scoped=scoped.slice(0,edit.at)+edit.text+scoped.slice(edit.end??edit.at);
 if(!used.length)return scoped;
 const ctes=used.map(name=>`${name} AS (SELECT * FROM main.${name} WHERE store_id = ${literal})`).join(",");
 return verb==="with"?scoped.slice(0,top[0].end)+" "+ctes+","+scoped.slice(top[0].end):"WITH "+ctes+" "+scoped;
}
export function storeDatabase(){
 const db=rootDatabase(),storeId=currentStoreId();
 return {prepare:(sql:string)=>db.prepare(scopeSql(sql,storeId)),batch:db.batch.bind(db)};
}
