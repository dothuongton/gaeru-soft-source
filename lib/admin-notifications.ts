import type {Order} from "./menu";

export const ADMIN_ALERT_DURATION_MS = 3_000;

export type NewTableAlert = {
  id: string;
  tableId: string;
  sessionId: string | null;
  tableName: string;
  customerName: string;
  orderIds: string[];
  orderCount: number;
  total: number;
};

/** The first successful snapshot establishes a baseline; existing new orders stay on their table cards. */
export function collectOrderAlerts(orders: Order[], previousSeen: ReadonlySet<string> | null): {seenIds: Set<string>; alerts: NewTableAlert[]} {
  const seenIds = new Set(previousSeen ?? []);
  const groups = new Map<string, Order[]>();
  const sorted = [...orders].sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
  for (const order of sorted) {
    if (previousSeen !== null && !seenIds.has(order.id) && order.status === "new") {
      const key = JSON.stringify([order.table_id, order.dining_session_id ?? null]);
      const group = groups.get(key) ?? [];
      group.push(order);
      groups.set(key, group);
    }
    seenIds.add(order.id);
  }
  const alerts = [...groups.entries()].map(([key, group]) => ({
    id: key + ":" + group.map(order => order.id).join(","),
    tableId: group[0].table_id,
    sessionId: group[0].dining_session_id ?? null,
    tableName: group[0].table_name,
    customerName: group[0].customer_name ?? "",
    orderIds: group.map(order => order.id),
    orderCount: group.length,
    total: group.reduce((sum, order) => sum + order.total, 0),
  }));
  return {seenIds, alerts};
}

/** Drop queued alerts once another administrator has handled all of their orders. */
export function pendingOrderAlerts(alerts: NewTableAlert[], orders: Order[]): NewTableAlert[] {
  const current = new Map(orders.map(order => [order.id, order]));
  const result: NewTableAlert[] = [];
  for (const alert of alerts) {
    const pending = alert.orderIds.map(id => current.get(id)).filter((order): order is Order => !!order && order.status === "new" && (order.dining_session_id ?? null) === alert.sessionId && (alert.sessionId !== null || order.table_id === alert.tableId));
    if (pending.length) result.push({...alert, tableId: pending[0].table_id, tableName: pending[0].table_name, customerName: pending[0].customer_name ?? alert.customerName, orderIds: pending.map(order => order.id), orderCount: pending.length, total: pending.reduce((sum, order) => sum + order.total, 0)});
  }
  return result;
}

export function tableAlertSpeech(alert: Pick<NewTableAlert, "tableName">): string {
  return (alert.tableName.trim() || "Bàn") + " có đơn";
}
