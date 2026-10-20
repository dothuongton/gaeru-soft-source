import type {Order} from "./menu";
import type {TableTransfer} from "./table-transfer-types";

export type TableSettlement = {
  sessionId: string;
  tableId: string;
  tableName: string;
  customerName: string;
  openedAt: number;
  closedAt: number;
  orderCount: number;
  validOrderCount: number;
  cancelledCount: number;
  total: number;
  paidTotal: number;
  cancelledTotal: number;
  source: "snapshot" | "reconstructed";
};

export type SettlementPage = {
  settlements: TableSettlement[];
  page: number;
  pageSize: 20;
  total: number;
  pages: number;
  range: {from: string; to: string; days: number; timezone: "Asia/Ho_Chi_Minh"; tableId: string | null};
  summary: {count: number; total: number; paidTotal: number; cancelledTotal: number};
};

export type SettlementDetail = {settlement: TableSettlement; orders: Order[]; transfers: TableTransfer[]};
