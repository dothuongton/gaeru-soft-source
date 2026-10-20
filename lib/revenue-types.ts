import type {Order} from "./menu";

export type PaymentMethod="cash"|"bank"|"other"|"unknown";
export const paymentLabels:Record<PaymentMethod,string>={cash:"Tiền mặt",bank:"Chuyển khoản",other:"Khác",unknown:"Chưa ghi nhận"};
export type RevenueSummary={
 orderRevenue:number;
 validOrders:number;
 paidForOrders:number;
 unpaidForOrders:number;
 unpaidOrders:number;
 cancelledAmount:number;
 cancelledOrders:number;
 collected:number;
 collectedOrders:number;
 averageOrder:number;
 unitsSold:number;
};
export type RevenueDaily={date:string;orderRevenue:number;validOrders:number;paidForOrders:number;unpaidForOrders:number;cancelledAmount:number;cancelledOrders:number;collected:number;collectedOrders:number};
export type RevenueReport={
 range:{from:string;to:string;days:number;timezone:"Asia/Ho_Chi_Minh";tableId:string|null;previousFrom:string;previousTo:string};
 generatedAt:number;
 summary:RevenueSummary;
 previous:RevenueSummary;
 daily:RevenueDaily[];
 topItems:{itemId:string;name:string;quantity:number;orderRevenue:number;orderCount:number}[];
 byTable:{tableId:string;tableName:string;orderRevenue:number;validOrders:number;unpaidForOrders:number;collected:number;collectedOrders:number}[];
 payments:{method:PaymentMethod;total:number;count:number}[];
 undatedPaid:{count:number;total:number};
};
export type RevenueOrderBasis="created"|"paid";
export type RevenueOrderStatus="all"|"paid"|"unpaid"|"cancelled";
export type RevenueOrderPage={orders:Order[];page:number;pageSize:number;total:number;pages:number};
