import type {Order} from "./menu";
import type {TableSession} from "./table-sessions";

export type TablePaymentMethod = "cash" | "bank" | "other";
export type TablePaymentQuote = {
  session: TableSession;
  generatedAt: number;
  total: number;
  paidTotal: number;
  unpaidTotal: number;
  unpaidCount: number;
  unservedCount: number;
  orders: Order[];
};
export type TablePaymentRequest = {
  sessionId: string;
  requestId: string;
  orderIds: string[];
  expectedTotal: number;
  paymentMethod: TablePaymentMethod;
};
export type TablePaymentResult = {
  ok: true;
  replayed: boolean;
  receipt: {
    requestId: string;
    sessionId: string;
    orderIds: string[];
    amount: number;
    paymentMethod: TablePaymentMethod;
    paidAt: number;
  };
};
