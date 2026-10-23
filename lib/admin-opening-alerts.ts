import type {Order, ServiceRequest} from "./menu";
import {pendingOrderAlerts, tableAlertSpeech, type NewTableAlert} from "./admin-notifications";

export type OpeningSession = {
  id: string;
  table_id: string;
  table_name?: string;
  customer_name: string;
  status: string;
  created_at: number;
};

export type OpeningTableAlert = {
  kind: "opening";
  id: string;
  tableId: string;
  sessionId: string;
  tableName: string;
  customerName: string;
};

// Existing order alerts keep their shape and identity so pending speech is stable.
export type AdminAlert = NewTableAlert | OpeningTableAlert | SupportAlert;
export type AdminAlertScope = {orders: boolean; openings: boolean};

export function isOpeningAlert(alert: AdminAlert): alert is OpeningTableAlert {
  return "kind" in alert && alert.kind === "opening";
}

function openingAlert(session: OpeningSession): OpeningTableAlert {
  return {
    kind: "opening",
    id: "opening:" + session.id,
    tableId: session.table_id,
    sessionId: session.id,
    tableName: session.table_name?.trim() || "Bàn " + session.table_id,
    customerName: session.customer_name,
  };
}

/** Only a newly submitted, pending server request is announced; initial history is silent. */
export function collectOpeningAlerts(sessions: OpeningSession[], previousSeen: ReadonlySet<string> | null): {seenIds: Set<string>; alerts: OpeningTableAlert[]} {
  const seenIds = new Set(previousSeen ?? []);
  const alerts: OpeningTableAlert[] = [];
  const sorted = [...sessions].sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
  for (const session of sorted) {
    if (previousSeen !== null && !seenIds.has(session.id) && session.status === "pending") alerts.push(openingAlert(session));
    seenIds.add(session.id);
  }
  return {seenIds, alerts};
}

/** Approval, rejection, closure or disappearance removes an outstanding request immediately. */
export function pendingOpeningAlerts(alerts: OpeningTableAlert[], sessions: OpeningSession[]): OpeningTableAlert[] {
  const current = new Map(sessions.map(session => [session.id, session]));
  return alerts.flatMap(alert => {
    const session = current.get(alert.sessionId);
    return session?.status === "pending" ? [openingAlert(session)] : [];
  });
}

/** Reconcile both kinds together to retain the shared FIFO while refreshing table names. */
export function pendingAdminAlerts(alerts: AdminAlert[], orders: Order[], sessions: OpeningSession[], calls: ServiceRequest[] = []): AdminAlert[] {
  const updated = new Map<string, AdminAlert>();
  for (const alert of pendingOrderAlerts(alerts.filter((alert): alert is NewTableAlert => !isOpeningAlert(alert) && !isSupportAlert(alert)), orders)) updated.set(alert.id, alert);
  for (const alert of pendingOpeningAlerts(alerts.filter(isOpeningAlert), sessions)) updated.set(alert.id, alert);
  for (const alert of alerts.filter(isSupportAlert)) { const call = calls.find(c => supportKey(c) === alert.id && c.status === "open"); if(call) updated.set(alert.id, supportAlert(call)); }
  const result: AdminAlert[] = [];
  for (const previous of alerts) {
    const alert = updated.get(previous.id);
    if (alert) {result.push(alert); updated.delete(previous.id);}
  }
  return result;
}

/** Sort only new arrivals; entries already queued keep their place and current speech. */
export function sortAdminAlertArrivals(alerts: AdminAlert[], orders: Order[], sessions: OpeningSession[], calls: ServiceRequest[] = []): AdminAlert[] {
  const orderTimes = new Map(orders.map(order => [order.id, order.created_at]));
  const sessionTimes = new Map(sessions.map(session => [session.id, session.created_at]));
  const time = (alert: AdminAlert) => isSupportAlert(alert) ? calls.find(c=>supportKey(c)===alert.id)?.created_at ?? Infinity : isOpeningAlert(alert)
    ? sessionTimes.get(alert.sessionId) ?? Number.POSITIVE_INFINITY
    : Math.min(...alert.orderIds.map(id => orderTimes.get(id) ?? Number.POSITIVE_INFINITY));
  return [...alerts].sort((a, b) => time(a) - time(b) || a.id.localeCompare(b.id));
}

/** Revoking one duty cannot discard an unrelated order or opening notification. */
export function restrictAdminAlerts(alerts: readonly AdminAlert[], scope: AdminAlertScope): AdminAlert[] {
  return alerts.filter(alert => (isOpeningAlert(alert) || isSupportAlert(alert)) ? scope.openings : scope.orders);
}

export function adminAlertSpeech(alert: AdminAlert): string {
  if(isSupportAlert(alert)) return supportSpeech(alert);
  return isOpeningAlert(alert)
    ? (alert.tableName.trim() || "Bàn") + " có khách yêu cầu mở bàn"
    : tableAlertSpeech(alert);
}

export type SupportAlert = {kind:"support"; id:string; tableId:string; sessionId:string|null; tableName:string; customerName:string; requestKind:"service"|"bill"; requestCount?:number; pendingCount?:number; note:string};
export function isSupportAlert(alert:AdminAlert):alert is SupportAlert {return "kind" in alert && alert.kind === "support";}
function supportKey(call:ServiceRequest) {return "support:"+call.id+":"+call.created_at;}
function supportAlert(call:ServiceRequest):SupportAlert {return {kind:"support",id:supportKey(call),tableId:call.table_id,sessionId:call.session_id??null,tableName:call.table_name,customerName:"",requestKind:call.kind,requestCount:call.request_count??1,pendingCount:call.pending_count??1,note:call.note??""};}
export function collectSupportAlerts(calls:ServiceRequest[], previous:ReadonlySet<string>|null) {const seenIds=new Set(previous??[]);const alerts:SupportAlert[]=[];for(const call of calls){const key=supportKey(call);if(previous!==null&&!seenIds.has(key)&&call.status==="open")alerts.push(supportAlert(call));seenIds.add(key);}return {seenIds,alerts};}
export function supportSpeech(alert:SupportAlert) {const raw=alert.tableName.trim();const match=/^(?:bàn\s*(?:số\s*)?)?0*(\d+)$/i.exec(raw);const name=match?"Bàn số "+Number(match[1]):raw||"Bàn";const note=alert.note.replace(/\s+/g," ").trim().slice(0,300);return name+(alert.requestKind==="bill"?" yêu cầu thanh toán.":" cần hỗ trợ nhân viên.")+(note?" Nội dung yêu cầu: "+note:"");}
