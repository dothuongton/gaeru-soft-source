import type {Order} from './menu';
import type {PaymentMethod} from './revenue-types';
export type PaidInvoice={id:string;tableName:string;customerName:string;paidAt:number;amount:number;method:PaymentMethod;orderCount:number;source:'table'|'legacy'};
export type PaidInvoicePage={invoices:PaidInvoice[];page:number;pageSize:number;pages:number;total:number;totalAmount:number;range:{from:string;to:string;timezone:'Asia/Ho_Chi_Minh'}};
export type PaidInvoiceDetail={snapshot?:boolean;history?:{id:number;kind:string;actor:string;at:number;before:Order|null;after:Order}[];invoice:PaidInvoice;orders:Order[]};
