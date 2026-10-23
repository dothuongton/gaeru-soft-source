import {database} from './server';
import {checkedText,OrderError,type DiningTable} from './menu';
import {DEFAULT_TABLE_ZONES,type TableZones} from './table-zones';
const key='table-zones';
const fold=(name:string)=>name.trim().normalize('NFKC').toLocaleLowerCase('vi-VN');
function parseZones(tables:Pick<DiningTable,'zone'>[],raw:string|null):TableZones{
 let saved:Partial<TableZones>={};
 try{saved=JSON.parse(raw||'{}');}catch{/* old malformed settings have safe defaults */}
 const names=[...new Map([...(Array.isArray(saved?.names)?saved.names.filter((value):value is string=>typeof value==='string'&&value.length<=40):[]),...tables.map(table=>table.zone).filter(Boolean)].map(name=>[fold(name),name])).values()];
 return {enabled:saved?.enabled!==false,names,version:typeof saved?.version==='string'?saved.version:DEFAULT_TABLE_ZONES.version};
}
export async function getTableZones(tables:Pick<DiningTable,'zone'>[]):Promise<TableZones>{
 const row=await database().prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{value:string}>();
 return parseZones(tables,row?.value??null);
}
export async function saveTableZones(body:Record<string,unknown>){
 const db=database();
 const tables=await db.prepare('SELECT id,name,zone FROM dining_tables').all<{id:string;name:string;zone:string}>();
 const previous=await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{value:string}>();
 const current=parseZones(tables.results,previous?.value??null);
 if(body.version!==current.version)throw new OrderError('Khu vực vừa thay đổi. Hãy tải lại rồi thử lại.',409);
 const action=body.action;
 const next={...current,names:[...current.names],version:crypto.randomUUID()};
 let oldName='',newName='';
 if(action==='toggle'){
  if(typeof body.enabled!=='boolean')throw new OrderError('Trạng thái hiển thị khu vực không hợp lệ.');
  next.enabled=body.enabled;
 }else if(action==='create'){
  newName=checkedText(body.name,40,true);
  if(current.names.some(name=>fold(name)===fold(newName)))throw new OrderError('Tên khu vực đã tồn tại.',409);
  if(next.names.length>=100)throw new OrderError('Mỗi quán có tối đa 100 khu vực.');
  next.names.push(newName);
 }else if(action==='rename'||action==='delete'){
  oldName=checkedText(body.name,40,true);
  if(!current.names.includes(oldName))throw new OrderError('Không tìm thấy khu vực.',404);
  if(action==='delete'){
   if(tables.results.some(table=>table.zone===oldName))throw new OrderError('Chuyển các bàn sang khu vực khác trước khi xóa khu vực này.',409);
   next.names=next.names.filter(name=>name!==oldName);
  }else{
   newName=checkedText(body.newName,40,true);
   if(current.names.some(name=>name!==oldName&&fold(name)===fold(newName)))throw new OrderError('Tên khu vực đã tồn tại.',409);
   next.names=next.names.map(name=>name===oldName?newName:name);
  }
 }else throw new OrderError('Thao tác khu vực không hợp lệ.');
 // A unique version makes the optional table rename dependent on this exact CAS.
 const value=JSON.stringify(next);
 const guard=action==='delete'?' AND NOT EXISTS (SELECT 1 FROM dining_tables WHERE zone = ?)':action==='rename'?' AND NOT EXISTS (SELECT 1 FROM dining_tables WHERE zone != ? AND lower(trim(zone)) = lower(trim(?)))':'';
 const guardArgs=action==='delete'?[oldName]:action==='rename'?[oldName,newName]:[];
 const compare=previous?
  db.prepare('UPDATE settings SET value = ? WHERE key = ? AND value = ?'+guard).bind(value,key,previous.value,...guardArgs):
  db.prepare('INSERT INTO settings (key,value) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = ?)'+guard).bind(key,value,key,...guardArgs);
 const operations=[compare];
 if(action==='rename')operations.push(db.prepare('UPDATE dining_tables SET zone = ? WHERE zone = ? AND EXISTS (SELECT 1 FROM settings WHERE key = ? AND value = ?)').bind(newName,oldName,key,value));
 const changed=await db.batch(operations);
 if(changed[0].meta.changes!==1)throw new OrderError('Khu vực hoặc danh sách bàn vừa thay đổi. Hãy tải lại rồi thử lại.',409);
 return {ok:true,zoneSettings:next};
}
