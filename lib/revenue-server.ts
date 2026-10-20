import {database, publicOrder} from "./server";
import {OrderError} from "./menu";
import type {PaymentMethod, RevenueDaily, RevenueOrderBasis, RevenueOrderPage, RevenueOrderStatus, RevenueReport, RevenueSummary} from "./revenue-types";

const DAY=86_400_000;
const VN_OFFSET=25_200_000;
const METHODS:PaymentMethod[]=["cash","bank","other","unknown"];
const PAGE_SIZE=25;
type Period={start:number;end:number};
type RevenueRange=Period&{from:string;to:string;days:number;tableId:string|null;previousFrom:string;previousTo:string};
type Query={sql:string;values:(string|number)[]};
type CreatedTotals=Pick<RevenueSummary,"orderRevenue"|"validOrders"|"paidForOrders"|"unpaidForOrders"|"unpaidOrders"|"cancelledAmount"|"cancelledOrders">;
type SummaryRow=CreatedTotals&{collected:number;collectedOrders:number;unitsSold:number};

function vnDate(time:number){return new Date(time+VN_OFFSET).toISOString().slice(0,10);}

function parseDate(value:string){
 const validShape=/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value);
 const time=validShape?Date.parse(value+"T00:00:00.000Z"):NaN;
 if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)throw new OrderError("Ngày báo cáo không hợp lệ. Vui lòng chọn ngày theo định dạng năm-tháng-ngày.");
 return time;
}

async function getRange(params:URLSearchParams):Promise<RevenueRange>{
 const today=vnDate(Date.now()),from=params.get("from")??today,to=params.get("to")??today;
 const fromTime=parseDate(from),toTime=parseDate(to),days=(toTime-fromTime)/DAY+1;
 if(days<1)throw new OrderError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
 if(days>366)throw new OrderError("Mỗi báo cáo xem tối đa 366 ngày. Vui lòng thu hẹp khoảng thời gian.");
 const requestedTable=params.get("table")??"all";
 if(!requestedTable||requestedTable.length>60)throw new OrderError("Bàn được chọn không hợp lệ.");
 const tableId=requestedTable==="all"?null:requestedTable;
 if(tableId&&!await database().prepare("SELECT id FROM dining_tables WHERE id = ?").bind(tableId).first())throw new OrderError("Không tìm thấy bàn được chọn.",404);
 const start=fromTime-VN_OFFSET,end=toTime+DAY-VN_OFFSET;
 return {from,to,days,tableId,start,end,previousFrom:vnDate(start-days*DAY),previousTo:vnDate(start-DAY)};
}

function where(column:"created_at"|"paid_at",period:Period,tableId:string|null):Query{
 return {sql:`${column} >= ? AND ${column} < ?${tableId?" AND table_id = ?":""}`,values:[period.start,period.end,...(tableId?[tableId]:[])]};
}

const createdTotalsSql=`
 COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END),0) AS orderRevenue,
 COUNT(CASE WHEN status != 'cancelled' THEN 1 END) AS validOrders,
 COALESCE(SUM(CASE WHEN status != 'cancelled' AND paid = 1 THEN total ELSE 0 END),0) AS paidForOrders,
 COALESCE(SUM(CASE WHEN status != 'cancelled' AND paid = 0 THEN total ELSE 0 END),0) AS unpaidForOrders,
 COUNT(CASE WHEN status != 'cancelled' AND paid = 0 THEN 1 END) AS unpaidOrders,
 COALESCE(SUM(CASE WHEN status = 'cancelled' THEN total ELSE 0 END),0) AS cancelledAmount,
 COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelledOrders`;

function summaryStatement(period:Period,tableId:string|null){
 const created=where("created_at",period,tableId),paid=where("paid_at",period,tableId);
 // Both clocks and the item snapshots are aggregated independently, avoiding
 // multiplied order totals when an order contains several item lines.
 return database().prepare(`
  WITH source AS (SELECT status,paid,total,items FROM orders WHERE ${created.sql}),
  created AS (SELECT ${createdTotalsSql} FROM source),
  collected AS (SELECT COALESCE(SUM(total),0) AS collected,COUNT(*) AS collectedOrders FROM orders WHERE ${paid.sql} AND paid = 1 AND status != 'cancelled')
  SELECT created.*,collected.*,
   (SELECT COALESCE(SUM(CAST(json_extract(line.value,'$.quantity') AS INTEGER)),0)
    FROM source,json_each(CASE WHEN json_valid(source.items) THEN source.items ELSE '[]' END) AS line
    WHERE source.status != 'cancelled') AS unitsSold
  FROM created CROSS JOIN collected
 `).bind(...created.values,...paid.values);
}

function summaryFrom(row:SummaryRow|undefined):RevenueSummary{
 if(!row)throw new OrderError("Chưa tổng hợp được doanh thu. Vui lòng thử lại.",503);
 return {...row,averageOrder:row.validOrders?Math.round(row.orderRevenue/row.validOrders):0};
}

export async function revenueReport(params:URLSearchParams):Promise<RevenueReport>{
 const range=await getRange(params),db=database(),created=where("created_at",range,range.tableId),paid=where("paid_at",range,range.tableId);
 const tableClause=range.tableId?" AND table_id = ?":"",tableValues=range.tableId?[range.tableId]:[];
 // D1 executes a batch in one transaction. Totals, daily series and payment
 // splits therefore describe the same snapshot while the restaurant is busy.
 const result=await db.batch([
  summaryStatement(range,range.tableId),
  summaryStatement({start:range.start-range.days*DAY,end:range.start},range.tableId),
  db.prepare(`SELECT strftime('%Y-%m-%d',created_at / 1000.0,'unixepoch','+7 hours') AS date,${createdTotalsSql} FROM orders WHERE ${created.sql} GROUP BY date ORDER BY date`).bind(...created.values),
  db.prepare(`SELECT strftime('%Y-%m-%d',paid_at / 1000.0,'unixepoch','+7 hours') AS date,COALESCE(SUM(total),0) AS collected,COUNT(*) AS collectedOrders FROM orders WHERE ${paid.sql} AND paid = 1 AND status != 'cancelled' GROUP BY date ORDER BY date`).bind(...paid.values),
  db.prepare(`
   WITH lines AS (
    SELECT o.id AS order_id,o.created_at,CAST(line.key AS INTEGER) AS line_index,
     CAST(json_extract(line.value,'$.itemId') AS TEXT) AS itemId,
     CAST(json_extract(line.value,'$.name') AS TEXT) AS name,
     CAST(json_extract(line.value,'$.quantity') AS INTEGER) AS quantity,
     CAST(json_extract(line.value,'$.total') AS INTEGER) AS line_total
    FROM (SELECT id,created_at,items FROM orders WHERE ${created.sql} AND status != 'cancelled') AS o,
     json_each(CASE WHEN json_valid(o.items) THEN o.items ELSE '[]' END) AS line
   ),ranked AS (
    SELECT *,ROW_NUMBER() OVER (PARTITION BY itemId ORDER BY created_at DESC,order_id DESC,line_index DESC) AS recency FROM lines
   )
   SELECT itemId,MAX(CASE WHEN recency = 1 THEN name END) AS name,SUM(quantity) AS quantity,SUM(line_total) AS orderRevenue,COUNT(DISTINCT order_id) AS orderCount
   FROM ranked GROUP BY itemId ORDER BY quantity DESC,orderRevenue DESC,itemId ASC LIMIT 20
  `).bind(...created.values),
  db.prepare(`
   WITH created AS (
    SELECT table_id,COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END),0) AS orderRevenue,
     COUNT(CASE WHEN status != 'cancelled' THEN 1 END) AS validOrders,
     COALESCE(SUM(CASE WHEN status != 'cancelled' AND paid = 0 THEN total ELSE 0 END),0) AS unpaidForOrders
    FROM orders WHERE ${created.sql} GROUP BY table_id
   ),collected AS (
    SELECT table_id,COALESCE(SUM(total),0) AS collected,COUNT(*) AS collectedOrders
    FROM orders WHERE ${paid.sql} AND paid = 1 AND status != 'cancelled' GROUP BY table_id
   )
   SELECT t.id AS tableId,t.name AS tableName,COALESCE(c.orderRevenue,0) AS orderRevenue,COALESCE(c.validOrders,0) AS validOrders,
    COALESCE(c.unpaidForOrders,0) AS unpaidForOrders,COALESCE(p.collected,0) AS collected,COALESCE(p.collectedOrders,0) AS collectedOrders
   FROM dining_tables t LEFT JOIN created c ON c.table_id = t.id LEFT JOIN collected p ON p.table_id = t.id
   ${range.tableId?"WHERE t.id = ?":""} ORDER BY orderRevenue DESC,collected DESC,CAST(t.id AS INTEGER),t.id
  `).bind(...created.values,...paid.values,...tableValues),
  db.prepare(`SELECT payment_method AS method,COALESCE(SUM(total),0) AS total,COUNT(*) AS count FROM orders WHERE ${paid.sql} AND paid = 1 AND status != 'cancelled' GROUP BY payment_method`).bind(...paid.values),
  db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(total),0) AS total FROM orders WHERE paid = 1 AND paid_at IS NULL AND status != 'cancelled'${tableClause}`).bind(...tableValues)
 ]);
 const summary=summaryFrom(result[0].results[0] as SummaryRow|undefined),previous=summaryFrom(result[1].results[0] as SummaryRow|undefined);
 const createdDaily=result[2].results as (CreatedTotals&{date:string})[],paidDaily=result[3].results as {date:string;collected:number;collectedOrders:number}[];
 const topItems=result[4].results as RevenueReport["topItems"],byTable=result[5].results as RevenueReport["byTable"],paymentRows=result[6].results as RevenueReport["payments"],undatedPaid=result[7].results[0] as {count:number;total:number}|undefined;
 const createdByDay=new Map(createdDaily.map(row=>[row.date,row])),paidByDay=new Map(paidDaily.map(row=>[row.date,row]));
 const daily:RevenueDaily[]=Array.from({length:range.days},(_,index)=>{
  const date=vnDate(range.start+index*DAY),c=createdByDay.get(date),p=paidByDay.get(date);
  return {date,orderRevenue:c?.orderRevenue??0,validOrders:c?.validOrders??0,paidForOrders:c?.paidForOrders??0,unpaidForOrders:c?.unpaidForOrders??0,cancelledAmount:c?.cancelledAmount??0,cancelledOrders:c?.cancelledOrders??0,collected:p?.collected??0,collectedOrders:p?.collectedOrders??0};
 });
 const payments=METHODS.map(method=>paymentRows.find(row=>row.method===method)??{method,total:0,count:0});
 return {
  range:{from:range.from,to:range.to,days:range.days,timezone:"Asia/Ho_Chi_Minh",tableId:range.tableId,previousFrom:range.previousFrom,previousTo:range.previousTo},
  generatedAt:Date.now(),summary,previous,daily,topItems,byTable,payments,undatedPaid:undatedPaid??{count:0,total:0}
 };
}

export async function revenueOrders(params:URLSearchParams):Promise<RevenueOrderPage>{
 const range=await getRange(params),basis=params.get("basis")??"created",status=params.get("status")??"all",payment=params.get("payment")??"all",pageText=params.get("page")??"1";
 if(!(["created","paid"] as RevenueOrderBasis[]).includes(basis as RevenueOrderBasis))throw new OrderError("Cách lọc thời gian không hợp lệ.");
 if(!(["all","paid","unpaid","cancelled"] as RevenueOrderStatus[]).includes(status as RevenueOrderStatus))throw new OrderError("Trạng thái thanh toán không hợp lệ.");
 if(payment!=="all"&&!METHODS.includes(payment as PaymentMethod))throw new OrderError("Phương thức thanh toán không hợp lệ.");
 const page=Number(pageText);
 if(!/^[1-9]\d*$/.test(pageText)||!Number.isSafeInteger(page)||!Number.isSafeInteger((page-1)*PAGE_SIZE))throw new OrderError("Số trang không hợp lệ.");
 const filter=where(basis==="paid"?"paid_at":"created_at",range,range.tableId),clauses=[filter.sql],values=filter.values;
 if(basis==="paid")clauses.push("paid = 1","status != 'cancelled'");
 if(status==="paid")clauses.push("paid = 1","status != 'cancelled'");
 if(status==="unpaid")clauses.push("paid = 0","status != 'cancelled'");
 if(status==="cancelled")clauses.push("status = 'cancelled'");
 if(payment!=="all"){clauses.push("paid = 1","status != 'cancelled'","payment_method = ?");values.push(payment);}
 const sqlWhere=clauses.join(" AND "),db=database();
 const result=await db.batch([
  db.prepare(`SELECT COUNT(*) AS total FROM orders WHERE ${sqlWhere}`).bind(...values),
  db.prepare(`SELECT * FROM orders WHERE ${sqlWhere} ORDER BY ${basis==="paid"?"paid_at":"created_at"} DESC,id DESC LIMIT ? OFFSET ?`).bind(...values,PAGE_SIZE,(page-1)*PAGE_SIZE)
 ]);
 const total=(result[0].results[0] as {total:number}|undefined)?.total??0;
 return {orders:(result[1].results as Record<string,unknown>[]).map(publicOrder),page,pageSize:PAGE_SIZE,total,pages:Math.ceil(total/PAGE_SIZE)};
}
