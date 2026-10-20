/**
 * Notification event checks without a browser or React renderer.
 * Run: node tests/admin-notifications.test.mjs
 * Device audio playback and actual rendered popup timing need browser QA.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = ts.transpileModule(readFileSync(root + "lib/admin-notifications.ts", "utf8"), {
  fileName: "lib/admin-notifications.ts",
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("module", "exports", compiled)(module, module.exports);
const { collectOrderAlerts, pendingOrderAlerts, tableAlertSpeech, ADMIN_ALERT_DURATION_MS } = module.exports;

function order(id, overrides = {}) {
  return {
    id, code: "MO" + id, table_id: "1", table_name: "Bàn 1", dining_session_id: "visit-1", customer_name: "Khách A",
    items: [], total: 75000, note: "", status: "new", paid: 0, created_at: 1000, updated_at: 1000,
    ...overrides,
  };
}

test("the first successful admin snapshot establishes a baseline; only a later new order produces a popup", () => {
  const existing = [order("waiting"), order("accepted", { status: "preparing" }), order("finished", { status: "served", paid: 1 })];
  const baseline = collectOrderAlerts(existing, null);
  assert.deepEqual(baseline.alerts, []);
  assert.deepEqual(baseline.seenIds, new Set(["waiting", "accepted", "finished"]));
  const added = order("arrived", { created_at: 2000 });
  const refreshed = collectOrderAlerts([...existing, added], baseline.seenIds);
  assert.equal(refreshed.alerts.length, 1);
  assert.deepEqual(refreshed.alerts[0].orderIds, ["arrived"]);
  assert.equal(refreshed.alerts[0].tableName, "Bàn 1");
  assert.equal(refreshed.alerts[0].customerName, "Khách A");
  assert.equal(refreshed.alerts[0].total, 75000);
  assert.equal(ADMIN_ALERT_DURATION_MS, 3000, "Each new-order popup is configured to stay for the requested three seconds.");
});

test("arrivals are grouped by table and visit, ordered by first arrival, and duplicate rows never inflate an alert", () => {
  const first = order("first", { table_id: "2", table_name: "Bàn 2", dining_session_id: "visit-2", created_at: 1000, total: 20000 });
  const second = order("second", { created_at: 2000, total: 30000 });
  const third = order("third", { table_id: "2", table_name: "Bàn 2", dining_session_id: "visit-2", created_at: 3000, total: 40000 });
  const nextVisit = order("fourth", { dining_session_id: "visit-next", customer_name: "Khách lượt sau", created_at: 4000, total: 50000 });
  const rows = [third, nextVisit, second, first, { ...first }];
  const originalIds = rows.map((row) => row.id);
  const result = collectOrderAlerts(rows, new Set());
  assert.deepEqual(rows.map((row) => row.id), originalIds, "Reading notifications must not reorder shared dashboard data.");
  assert.equal(result.alerts.length, 3);
  assert.deepEqual(result.alerts.map((alert) => [alert.tableId, alert.sessionId, alert.orderIds, alert.orderCount, alert.total]), [
    ["2", "visit-2", ["first", "third"], 2, 60000],
    ["1", "visit-1", ["second"], 1, 30000],
    ["1", "visit-next", ["fourth"], 1, 50000],
  ]);
  assert.equal(new Set(result.alerts.map((alert) => alert.id)).size, 3);
});

test("repeated polling, temporarily missing rows and status changes do not replay an already-seen order", () => {
  const seen = new Set(["old"]);
  const first = collectOrderAlerts([order("old"), order("new"), order("handled-elsewhere", { status: "preparing" })], seen);
  assert.deepEqual(seen, new Set(["old"]), "A polling result must not mutate the previous snapshot's bookkeeping.");
  assert.deepEqual(first.alerts.flatMap((alert) => alert.orderIds), ["new"]);
  const temporarilyEmpty = collectOrderAlerts([], first.seenIds);
  assert.deepEqual(temporarilyEmpty.alerts, []);
  assert.deepEqual(temporarilyEmpty.seenIds, new Set(["old", "new", "handled-elsewhere"]));
  const reappeared = collectOrderAlerts([order("old"), order("new"), order("handled-elsewhere")], temporarilyEmpty.seenIds);
  assert.deepEqual(reappeared.alerts, [], "A row that drops out of an archive page and returns is not a new order.");
  assert.deepEqual(collectOrderAlerts([order("cancelled", { status: "cancelled" }), order("ready", { status: "ready" })], new Set()).alerts, []);
});

test("queued alerts disappear when handled and partial handling preserves the popup identity while updating its totals", () => {
  const a = order("a", { total: 25000 });
  const b = order("b", { total: 35000, created_at: 2000 });
  const c = order("c", { table_id: "2", table_name: "Bàn 2", dining_session_id: "visit-2", created_at: 3000 });
  const original = collectOrderAlerts([a, b, c], new Set()).alerts;
  const partial = pendingOrderAlerts(original, [{ ...a, status: "preparing" }, b, { ...c, status: "cancelled" }]);
  assert.equal(partial.length, 1);
  assert.equal(partial[0].id, original[0].id, "Handling one item must not restart the same popup's three-second timer.");
  assert.deepEqual(partial[0].orderIds, ["b"]);
  assert.equal(partial[0].orderCount, 1);
  assert.equal(partial[0].total, 35000);
  assert.deepEqual(original[0].orderIds, ["a", "b"], "Pruning the queue must not mutate the original notification.");
  assert.deepEqual(pendingOrderAlerts(partial, [{ ...b, status: "preparing" }]), []);
});

test("stale alerts cannot attach themselves to a different visit and legacy alerts cannot follow a different table", () => {
  const original = order("original");
  const alerts = collectOrderAlerts([original], new Set()).alerts;
  assert.deepEqual(pendingOrderAlerts(alerts, []), []);
  assert.deepEqual(pendingOrderAlerts(alerts, [{ ...original, dining_session_id: "new-visit" }]), []);
  const legacy = order("legacy", { dining_session_id: undefined });
  const legacyAlert = collectOrderAlerts([legacy], new Set()).alerts;
  assert.equal(legacyAlert[0].sessionId, null);
  assert.equal(pendingOrderAlerts(legacyAlert, [{ ...legacy, dining_session_id: null }]).length, 1);
  assert.deepEqual(pendingOrderAlerts(legacyAlert, [{ ...legacy, table_id: "2", table_name: "Bàn 2" }]), []);
});

test("a queued alert follows the same visit after a table move without restarting its popup identity", () => {
  const first = order("first", { total: 25000 });
  const second = order("second", { total: 35000, created_at: 2000 });
  const alerts = collectOrderAlerts([first, second], new Set()).alerts;
  const moved = pendingOrderAlerts(alerts, [
    { ...first, table_id: "3", table_name: "Bàn 3", status: "preparing" },
    { ...second, table_id: "3", table_name: "Bàn 3" },
    order("new-guest", { dining_session_id: "next-visit", customer_name: "Khách lượt mới" }),
  ]);
  assert.equal(moved.length, 1);
  assert.equal(moved[0].id, alerts[0].id, "A table move must not replay the same order alert or reset its three-second timer.");
  assert.equal(moved[0].sessionId, "visit-1");
  assert.equal(moved[0].tableId, "3");
  assert.equal(moved[0].tableName, "Bàn 3");
  assert.equal(moved[0].customerName, "Khách A");
  assert.deepEqual(moved[0].orderIds, ["second"]);
  assert.equal(moved[0].orderCount, 1);
  assert.equal(moved[0].total, 35000);
  assert.equal(tableAlertSpeech(moved[0]), "Bàn 3 có đơn");
  assert.equal(alerts[0].tableId, "1", "Updating destination metadata must not mutate the previous notification.");
  assert.deepEqual(pendingOrderAlerts(moved, [{ ...second, table_id: "3", table_name: "Bàn 3", dining_session_id: "unrelated-visit" }]), []);
});

test("speech announces the actual table name using the requested Vietnamese wording", () => {
  assert.equal(tableAlertSpeech({ tableName: "Bàn 1" }), "Bàn 1 có đơn");
  assert.equal(tableAlertSpeech({ tableName: " Bàn 2 " }), "Bàn 2 có đơn");
  assert.equal(tableAlertSpeech({ tableName: "Sân vườn 12" }), "Sân vườn 12 có đơn");
  assert.equal(tableAlertSpeech({ tableName: "   " }), "Bàn có đơn");
});
