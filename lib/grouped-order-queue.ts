import {normalizeOrderItem, type Order, type OrderStatus} from "./menu";

export type QueueStage = "new" | "waiting" | "served";
export type QueueLine = {
  key:string; order:Order; lineId:string; round:number; name:string; quantity:number;
  note:string; from:"new"|"preparing"|"ready"|"served";
};
export type QueueGroup = {
  key:string; tableId:string; sessionId:string|null; name:string; orders:Order[];
  stages:Record<QueueStage,QueueLine[]>;
};
export const queueQuantity = (lines:readonly QueueLine[]) => lines.reduce((sum,line)=>sum+line.quantity,0);


/** Never combine a reused table's different visits (or anonymous legacy orders). */
export function groupQueueOrders(orders:readonly Order[]):QueueGroup[] {
  const groups=new Map<string,QueueGroup>();
  for(const order of [...orders].sort((a,b)=>a.created_at-b.created_at||a.id.localeCompare(b.id))){
    const key=JSON.stringify([order.table_id,order.dining_session_id||"legacy:"+order.id]);
    let group=groups.get(key);
    if(!group){group={key,tableId:order.table_id,sessionId:order.dining_session_id??null,name:order.table_name,orders:[],stages:{new:[],waiting:[],served:[]}};groups.set(key,group);}
    group.orders.push(order);
    if(order.status==="cancelled")continue;
    order.items.forEach((item,index)=>{
      const normalized=normalizeOrderItem(item,order.status,index);
      const note=[...normalized.extras,normalized.taste,normalized.note].filter(Boolean).join(" · ");
      for(const from of ["new","preparing","ready","served"] as const){
        const quantity=normalized[(from+"Count") as "newCount"|"preparingCount"|"readyCount"|"servedCount"];
        if(!quantity)continue;
        const stage=from==="new"?"new":from==="served"?"served":"waiting";
        group.stages[stage].push({key:JSON.stringify([order.id,normalized.orderLineId,from]),order,lineId:normalized.orderLineId,round:group.orders.length,name:normalized.name,quantity,note,from});
      }
    });
  }
  return [...groups.values()];
}

export type QueueAction={line:QueueLine; to:OrderStatus};
export function queueActions(group:QueueGroup,stage:QueueStage):QueueAction[]{
  if(stage==="served")return [];
  return group.stages[stage].map(line=>({line,to:stage==="new"?"preparing":"served"}));
}
