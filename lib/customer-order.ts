import {calculateOrder, extrasFor, tastes, OrderError} from "./menu";
import type {CartLine, MenuItem, OrderItem} from "./menu";

export type OrderAction = "cart" | "direct";
export type PendingOrder = {
  version: 1;
  source: OrderAction;
  sessionId: string;
  tableToken: string;
  requestId: string;
  items: CartLine[];
  previewItems: OrderItem[];
  note: string;
  expectedTotal: number;
};
type PendingReadStorage = Pick<Storage, "getItem"> & Partial<Pick<Storage, "key" | "length">>;
type PendingStorage = PendingReadStorage & Pick<Storage, "setItem" | "removeItem">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const pendingOrderKey = (sessionId: string, requestId?: string) => "moc:pending-order:" + sessionId + (requestId ? ":" + requestId : "");

/** Retain the guest's quantity/note while removing options no longer on this item. */
export function normalizeItemChoice(choice: Pick<CartLine, "quantity" | "extras" | "taste" | "note">, item: MenuItem) {
  const allowed = extrasFor(item).map(extra => extra.id);
  return {
    quantity: Math.max(1, Math.min(20, choice.quantity)), note: choice.note,
    extras: choice.extras.filter(extra => allowed.includes(extra)),
    taste: item.category === "drink" ? (tastes.includes(choice.taste) ? choice.taste : tastes[0]) : "",
  };
}

export function mergeCartLine(cart: CartLine[], line: CartLine): CartLine[] {
  const same = cart.find(item => item.itemId === line.itemId && item.note === line.note && item.taste === line.taste && [...item.extras].sort().join() === [...line.extras].sort().join());
  if (line.quantity < 1 || !Number.isInteger(line.quantity) || (same?.quantity ?? 0) + line.quantity > 20) throw new OrderError("Mỗi món tối đa 20 phần trong một lần gọi.");
  if (!same && cart.length >= 30) throw new OrderError("Giỏ đã có 30 lựa chọn món. Vui lòng gửi đơn trước khi thêm món mới.");
  if (cart.reduce((total, item) => total + item.quantity, 0) + line.quantity > 60) throw new OrderError("Mỗi lần gọi tối đa 60 phần. Vui lòng gửi đơn hoặc gọi nhân viên hỗ trợ.");
  return same ? cart.map(item => item.key === same.key ? {...item, quantity: item.quantity + line.quantity} : item) : [...cart, {...line, extras: [...line.extras]}];
}

/** Capture prices and the entire payload once, before the first network attempt. */
export function prepareOrderSubmission(input: {
  source: OrderAction; sessionId: string; tableToken: string; requestId: string;
  cart: CartLine[]; directLine?: CartLine; note: string; menu: MenuItem[];
}): PendingOrder {
  const selected = input.source === "direct" ? (input.directLine ? [input.directLine] : []) : input.cart;
  const lines = selected.map(line => ({...line, extras: [...line.extras]}));
  const priced = calculateOrder(lines, input.menu);
  return {
    version: 1, source: input.source, sessionId: input.sessionId,
    tableToken: input.tableToken, requestId: input.requestId, items: lines,
    // Older live drafts retain their request ID. Preserve their original note
    // bytes as well, since the server hashes the submitted payload before trim.
    previewItems: priced.items, note: input.source === "direct" ? "" : input.note,
    expectedTotal: priced.total,
  };
}

export function orderRequestBody(pending: PendingOrder) {
  return {
    tableToken: pending.tableToken, sessionId: pending.sessionId, requestId: pending.requestId,
    items: pending.items.map(({key: _key, ...line}) => ({...line, extras: [...line.extras]})),
    note: pending.note, expectedTotal: pending.expectedTotal,
  };
}

function validLine(value: unknown): value is CartLine {
  if (!value || typeof value !== "object") return false;
  const line = value as CartLine;
  return typeof line.key === "string" && typeof line.itemId === "string" && line.itemId.length <= 60 &&
    Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 20 &&
    Array.isArray(line.extras) && line.extras.length <= 10 && line.extras.every(extra => typeof extra === "string") &&
    typeof line.taste === "string" && line.taste.length <= 40 && typeof line.note === "string" && line.note.length <= 240;
}

function decodePendingOrder(raw: string | null, sessionId: string, requestId?: string): PendingOrder | null {
  try {
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingOrder;
    if (value?.version !== 1 || !["cart", "direct"].includes(value.source) || value.sessionId !== sessionId ||
      typeof value.requestId !== "string" || !uuid.test(value.requestId) || (requestId !== undefined && value.requestId !== requestId) ||
      typeof value.tableToken !== "string" || !value.tableToken.trim() || value.tableToken.length > 80 ||
      typeof value.note !== "string" || value.note.length > 400 ||
      !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 30 || !value.items.every(validLine) ||
      value.items.reduce((sum, line) => sum + line.quantity, 0) > 60 ||
      (value.source === "direct" && value.items.length !== 1) ||
      !Number.isSafeInteger(value.expectedTotal) || value.expectedTotal < 1 || value.expectedTotal > 10000000 ||
      !Array.isArray(value.previewItems) || value.previewItems.length !== value.items.length) return null;
    if (value.previewItems.some((item, index) => !item || item.itemId !== value.items[index].itemId ||
      item.quantity !== value.items[index].quantity || typeof item.name !== "string" ||
      !Number.isSafeInteger(item.unitPrice) || item.unitPrice < 1 || item.total !== item.unitPrice * item.quantity ||
      !Array.isArray(item.extras) || !item.extras.every(extra => typeof extra === "string") ||
      typeof item.note !== "string" || typeof item.taste !== "string" || typeof item.image !== "string")) return null;
    if (value.previewItems.reduce((sum, item) => sum + item.total, 0) !== value.expectedTotal) return null;
    return value;
  } catch {return null;}
}

/**
 * Each request owns its durable record, so another tab's successful order cannot
 * erase an unresolved request. Old single-record drafts remain readable during
 * rollout. Prefer the current cart's request, then choose a stable remaining one.
 */
export function readPendingOrder(storage: PendingReadStorage | null, sessionId: string, preferredRequestId?: string): PendingOrder | null {
  if (!storage || !sessionId) return null;
  const read = (key: string, requestId?: string) => {
    try {return decodePendingOrder(storage.getItem(key), sessionId, requestId);}
    catch {return null;}
  };
  const legacy = read(pendingOrderKey(sessionId));
  if (preferredRequestId && uuid.test(preferredRequestId)) {
    const preferred = read(pendingOrderKey(sessionId, preferredRequestId), preferredRequestId);
    if (preferred) return preferred;
    if (legacy?.requestId === preferredRequestId) return legacy;
  }
  const records = new Map<string, PendingOrder>();
  if (legacy) records.set(legacy.requestId, legacy);
  try {
    const prefix = pendingOrderKey(sessionId) + ":";
    if (typeof storage.key === "function" && typeof storage.length === "number") {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const requestId = key.slice(prefix.length);
        if (!uuid.test(requestId)) continue;
        const record = read(key, requestId);
        if (record) records.set(requestId, record);
      }
    }
  } catch { /* A readable legacy or preferred record remains usable. */ }
  return [...records.values()].sort((a, b) => a.requestId < b.requestId ? -1 : a.requestId > b.requestId ? 1 : 0)[0] ?? null;
}

/** Storage may be restricted; the in-memory snapshot still protects retries. */
export function storePendingOrder(storage: PendingStorage | null, sessionId: string, pending: PendingOrder | null, expectedRequestId?: string) {
  if (!storage || !sessionId) return;
  try {
    if (pending) {
      if (pending.sessionId !== sessionId || !uuid.test(pending.requestId)) return;
      storage.setItem(pendingOrderKey(sessionId, pending.requestId), JSON.stringify(pending));
      const legacy = decodePendingOrder(storage.getItem(pendingOrderKey(sessionId)), sessionId);
      if (legacy?.requestId === pending.requestId) storage.removeItem(pendingOrderKey(sessionId));
      return;
    }
    // A response can arrive after another tab stored a different request. Clear
    // only the one that was resolved; absence of an ID never means "clear all".
    if (!expectedRequestId || !uuid.test(expectedRequestId)) return;
    storage.removeItem(pendingOrderKey(sessionId, expectedRequestId));
    const legacy = decodePendingOrder(storage.getItem(pendingOrderKey(sessionId)), sessionId);
    if (legacy?.requestId === expectedRequestId) storage.removeItem(pendingOrderKey(sessionId));
  } catch { /* Keep the live submission usable when storage is unavailable. */ }
}
