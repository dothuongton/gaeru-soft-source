"use client";
import {useRef,useState} from 'react';
import {Check,Pencil,Plus,Trash2,X} from 'lucide-react';
import type {TableZones} from '@/lib/table-zones';
import type {DiningTable} from '@/lib/menu';
export function ZoneManagement({value,tables,onSave}:{value:TableZones;tables:DiningTable[];onSave:(body:Record<string,unknown>)=>Promise<boolean>}){
 const [name,setName]=useState(''),[editing,setEditing]=useState<string|null>(null),[draft,setDraft]=useState('');
 const [deleting,setDeleting]=useState<string|null>(null),[saving,setSaving]=useState(false);
 const lock=useRef(false);
 const save=async(body:Record<string,unknown>)=>{
  if(lock.current)return false;lock.current=true;setSaving(true);
  try{return await onSave({...body,version:value.version});}finally{lock.current=false;setSaving(false);}
 };
 return <section className="zone-management"><p>Quản lý khu vực và cách hiển thị trên màn hình nhân viên.</p>
  <label className="zone-display-toggle"><span><strong>Hiển thị khu vực</strong><small>Bật bộ lọc và tên khu vực ở Bàn, Đơn món, Hỗ trợ và hóa đơn.</small></span><input type="checkbox" role="switch" checked={value.enabled} disabled={saving} onChange={event=>void save({action:'toggle',enabled:event.target.checked})}/></label>
  <form className="zone-create" onSubmit={async event=>{event.preventDefault();if(await save({action:'create',name}))setName('');}}><label><span>Tên khu vực mới</span><input value={name} onChange={event=>setName(event.target.value)} maxLength={40} required placeholder="Ví dụ: Tầng 2"/></label><button type="submit" className="primary" disabled={saving||!name.trim()}><Plus size={16}/>Thêm khu vực</button></form>
  <div className="zone-list">{value.names.map(zone=>{const count=tables.filter(table=>table.zone===zone).length;return <div className="zone-row" key={zone}>{editing===zone?<form onSubmit={async event=>{event.preventDefault();if(await save({action:'rename',name:zone,newName:draft}))setEditing(null);}}><input aria-label={'Tên mới của '+zone} value={draft} maxLength={40} required onChange={event=>setDraft(event.target.value)}/><button type="submit" className="aw-icon" disabled={saving} aria-label="Lưu tên khu vực"><Check size={17}/></button><button type="button" className="aw-icon" onClick={()=>setEditing(null)} disabled={saving} aria-label="Hủy sửa"><X size={17}/></button></form>:<><span><strong>{zone}</strong><small>{count} bàn</small></span><button type="button" className="aw-icon" disabled={saving} aria-label={'Sửa khu vực '+zone} onClick={()=>{setEditing(zone);setDraft(zone);}}><Pencil size={17}/></button><button type="button" className="aw-icon" disabled={saving||count>0} title={count?'Chuyển các bàn sang khu vực khác trước khi xóa':'Xóa khu vực trống'} aria-label={'Xóa khu vực '+zone} onClick={()=>setDeleting(zone)}><Trash2 size={17}/></button></>}
   {deleting===zone&&<div className="zone-delete-confirm"><span>Xóa khu vực trống “{zone}”?</span><button type="button" disabled={saving} onClick={async()=>{if(await save({action:'delete',name:zone}))setDeleting(null);}}>Xóa</button><button type="button" disabled={saving} onClick={()=>setDeleting(null)}>Giữ lại</button></div>}
  </div>;})}</div><p>Khu vực có bàn chỉ được xóa sau khi chuyển hết bàn sang khu vực khác. Tắt hiển thị không làm thay đổi dữ liệu.</p>
 </section>;
}
