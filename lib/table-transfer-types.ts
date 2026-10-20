import type {TableSession} from "./table-sessions";

export type TableTransfer = {
  id: string;
  requestId: string;
  sessionId: string;
  fromTableId: string;
  fromTableName: string;
  toTableId: string;
  toTableName: string;
  transferredAt: number;
};

export type TableTransferRequest = {
  sessionId: string;
  requestId: string;
  fromTableId: string;
  expectedUpdatedAt: number;
  toTableId: string;
};

export type TableTransferResult = {
  ok: true;
  replayed: boolean;
  transfer: TableTransfer;
  session: TableSession;
};
