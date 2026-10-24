import {database,publicOrder} from './server';
import {OrderError} from './menu';
import {getRevenueRange} from './revenue-server';
import type {PaidInvoice,PaidInvoicePage,PaidInvoiceDetail} from './paid-invoices';
import type {PaymentMethod} from './revenue-types';

// Every table-payment receipt represents one actual collection, not one order.
// Legacy individually paid orders remain visible without duplicating receipts.
const source=`
 SELECT 'payment:'||r.id AS id,COALESCE(CASE WHEN json_valid(r.orders_json) THEN json_extract(r.orders_json,'$[0].table_id') ELSE NULL END,r.table_id) AS tableId,COALESCE(CASE WHEN json_valid(r.orders_json) THEN json_extract(r.orders_json,'$[0].table_name') ELSE NULL END,r.table_name) AS tableName,COALESCE(CASE WHEN json_valid(r.orders_json) THEN json_extract(r.orders_json,'$[0].customer_name') ELSE NULL END,r.customer_name) AS customerName,r.paid_at AS paidAt,r.amount AS amount,r.payment_method AS method,r.order_count AS orderCount,'table' AS source
 FROM table_payment_receipts r
 UNION ALL
 SELECT 'order:'||o.id AS id,o.table_id AS tableId,o.table_name AS tableName,o.customer_name AS customerName,o.paid_at AS paidAt,o.total AS amount,COALESCE(o.payment_method,'unknown') AS method,1 AS orderCount,'legacy' AS source
 FROM orders o WHERE o.paid = 1 AND o.status != 'cancelled' AND o.paid_at IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM table_payment_receipts r WHERE json_valid(r.order_ids_json) AND EXISTS(SELECT 1 FROM json_each(r.order_ids_json) ids WHERE ids.value = o.id))
`;
function invoice(row:Record<string,unknown>):PaidInvoice{
 const method=['cash','bank','other','unknown'].includes(row.method as string)?row.method as PaymentMethod:'unknown';
 return {id:String(row.id),tableName:String(row.tableName||''),customerName:String(row.customerName||''),paidAt:Number(row.paidAt),amount:Number(row.amount),method,orderCount:Number(row.orderCount),source:row.source==='table'?'table':'legacy'};
}
export async function listPaidInvoices(params:URLSearchParams):Promise<PaidInvoicePage>{
 const range=await getRevenueRange(params),sizeText=params.get('pageSize')??'20',pageText=params.get('page')??'1';
 if(!['20','50','100'].includes(sizeText)||!/^\d{1,6}$/.test(pageText)||Number(pageText)<1)throw new OrderError('Chọn số trang hợp lệ và 20, 50 hoặc 100 hóa đơn mỗi trang.');
 const fromTime=params.get('fromTime')||'',toTime=params.get('toTime')||'';
 for(const time of [fromTime,toTime])if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new OrderError('Giờ tìm kiếm không hợp lệ.');
 if(fromTime)range.start=Date.parse(range.from+'T'+fromTime+':00+07:00');
 if(toTime)range.end=Date.parse(range.to+'T'+toTime+':00+07:00')+60000;
 if(range.end<=range.start)throw new OrderError('Thời gian kết thúc phải sau thời gian bắt đầu.');
 const size=Number(sizeText),requestedPage=Number(pageText);
 const search=(params.get('search')??'').trim();
 if(search.length>100)throw new OrderError('Từ khóa tìm kiếm tối đa 100 ký tự.');
 const clauses=['paidAt >= ?','paidAt < ?'],values:(string|number)[]=[range.start,range.end];
 if(range.tableId){clauses.push('tableId = ?');values.push(range.tableId);}
 if(search){clauses.push('(instr(lower(tableName),lower(?)) > 0 OR instr(lower(customerName),lower(?)) > 0 OR instr(lower(id),lower(?)) > 0)');values.push(search,search,search);}
 const db=database(),where=clauses.join(' AND ');
 try {
  const summary=await db.prepare(`WITH invoices AS (${source}) SELECT COUNT(*) AS total,COALESCE(SUM(amount),0) AS totalAmount FROM invoices WHERE ${where}`).bind(...values).first<{total:number;totalAmount:number}>();
  const total=summary?.total??0,pages=Math.ceil(total/size),page=Math.min(requestedPage,Math.max(1,pages));
  const rows=await db.prepare(`WITH invoices AS (${source}) SELECT * FROM invoices WHERE ${where} ORDER BY paidAt DESC,id DESC LIMIT ? OFFSET ?`).bind(...values,size,(page-1)*size).all<Record<string,unknown>>();
  return {invoices:rows.results.map(invoice),page,pageSize:size,pages,total,totalAmount:summary?.totalAmount??0,range:{from:range.from,to:range.to,timezone:'Asia/Ho_Chi_Minh'}};
 } catch (err) {
  console.error("listPaidInvoices database error:", err);
  return {invoices:[],page:1,pageSize:size,pages:1,total:0,totalAmount:0,range:{from:range.from,to:range.to,timezone:'Asia/Ho_Chi_Minh'}};
 }
}
export async function paidInvoiceDetail(id:string):Promise<PaidInvoiceDetail>{
 if(!/^(payment|order):[A-Za-z0-9_-]{1,80}$/.test(id))throw new OrderError('Mã hóa đơn không hợp lệ.');
 const db=database();
 const row=await db.prepare(`WITH invoices AS (${source}) SELECT * FROM invoices WHERE id = ?`).bind(id).first<Record<string,unknown>>();
 if(!row)throw new OrderError('Không tìm thấy hóa đơn đã thanh toán.',404);
 let receipt: {orders_json?:string|null;order_ids_json?:string;audit_json?:string|null}|null = null;
 if(id.startsWith('payment:')){
  try {
   receipt = await db.prepare('SELECT orders_json,order_ids_json,audit_json FROM table_payment_receipts WHERE id = ?').bind(id.slice(8)).first<{orders_json:string|null;order_ids_json:string;audit_json:string|null}>();
  } catch {
   receipt = null;
  }
 }
 if(receipt?.orders_json){
  try {
   const ids=JSON.parse(receipt.order_ids_json||'[]') as string[];
   return {invoice:invoice(row),orders:(JSON.parse(receipt.orders_json) as import("./menu").Order[]).map(order=>ids.includes(order.id)?{...order,paid:1,paid_at:Number(row.paidAt),payment_method:invoice(row).method}:order),snapshot:true,history:receipt.audit_json?JSON.parse(receipt.audit_json):[]};
  } catch {}
 }
 const orders=id.startsWith('payment:')?
  await db.prepare('SELECT * FROM orders WHERE id IN (SELECT value FROM table_payment_receipts r,json_each(CASE WHEN json_valid(r.order_ids_json) THEN r.order_ids_json ELSE \'[]\' END) WHERE r.id = ?) ORDER BY created_at,id').bind(id.slice(8)).all<Record<string,unknown>>():
  await db.prepare('SELECT * FROM orders WHERE id = ? AND paid = 1 AND status != ?').bind(id.slice(6),'cancelled').all<Record<string,unknown>>();
 return {invoice:invoice(row),orders:orders.results.map(publicOrder),snapshot:false};
}
