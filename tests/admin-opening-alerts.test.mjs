/**
 * Table-opening notifications and the shared announcement lifecycle, using the
 * production event helpers, popup timing policy and audio queue. These tests do
 * not simulate a browser or claim that autoplay succeeds on a physical device.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const cache = new Map();
function load(relativePath) {
  const path = resolve(projectRoot, relativePath);
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", output)((specifier) => {
    if (specifier.startsWith("@/")) return load(specifier.slice(2) + ".ts");
    if (specifier.startsWith(".")) return load(resolve(dirname(path), specifier) + ".ts");
    throw new Error("Unexpected import: " + specifier);
  }, module, module.exports);
  return module.exports;
}

const {
  collectOpeningAlerts, pendingOpeningAlerts, pendingAdminAlerts,
  sortAdminAlertArrivals, restrictAdminAlerts, adminAlertSpeech, isOpeningAlert,
} = load("lib/admin-opening-alerts.ts");
const { collectOrderAlerts } = load("lib/admin-notifications.ts");
const { AudioAnnouncementLedger, AudioAnnouncementQueue } = load("lib/admin-audio-policy.ts");
const { resolvePopupTiming } = load("lib/admin-popup-timing.ts");

function session(id, changes = {}) {
  return {
    id, table_id: "1", table_name: "Bàn 1", customer_name: "Khách Minh",
    status: "pending", created_at: 1_000, updated_at: 1_000, ...changes,
  };
}
function order(id, changes = {}) {
  return {
    id, code: "M" + id, table_id: "2", table_name: "Bàn 2", dining_session_id: "visit-two",
    customer_name: "Khách An", items: [], total: 75_000, note: "", status: "new", paid: 0,
    created_at: 2_000, updated_at: 2_000, ...changes,
  };
}
const opening = (row) => collectOpeningAlerts([row], new Set()).alerts[0];
const orderAlert = (row) => collectOrderAlerts([row], new Set()).alerts[0];

test("the first successful snapshot is silent and establishes a baseline for every existing table session", () => {
  const rows = [session("waiting"), session("active", { status: "active" }), session("closed", { status: "closed" })];
  const baseline = collectOpeningAlerts(rows, null);
  assert.deepEqual(baseline.alerts, []);
  assert.deepEqual(baseline.seenIds, new Set(["waiting", "active", "closed"]));
  const next = collectOpeningAlerts([...rows, session("fresh", { table_id: "3", table_name: "Bàn 3" })], baseline.seenIds);
  assert.equal(next.alerts.length, 1);
  assert.equal(next.alerts[0].kind, "opening");
  assert.equal(next.alerts[0].sessionId, "fresh");
  assert.equal(adminAlertSpeech(next.alerts[0]), "Bàn 3 có khách yêu cầu mở bàn");
});

test("new pending requests are ordered oldest-first, deduplicated, and do not mutate the dashboard snapshot", () => {
  const first = session("first", { created_at: 1_000 });
  const tiedA = session("a-tied", { table_id: "2", created_at: 2_000 });
  const tiedB = session("b-tied", { table_id: "3", created_at: 2_000 });
  const last = session("last", { table_id: "4", created_at: 3_000 });
  const rows = [last, tiedB, first, tiedA, { ...first }];
  const inputOrder = rows.map((row) => row.id);
  const previous = new Set(["historic"]);
  const next = collectOpeningAlerts(rows, previous);
  assert.deepEqual(next.alerts.map((alert) => alert.sessionId), ["first", "a-tied", "b-tied", "last"]);
  assert.deepEqual(rows.map((row) => row.id), inputOrder);
  assert.deepEqual(previous, new Set(["historic"]));
  assert.equal(new Set(next.alerts.map((alert) => alert.id)).size, 4);
});

test("repeated polling, temporarily absent rows and handled requests cannot replay a table-opening announcement", () => {
  const first = collectOpeningAlerts([session("pending"), session("already-approved", { status: "active" })], new Set());
  assert.deepEqual(first.alerts.map((alert) => alert.sessionId), ["pending"]);
  const emptyPoll = collectOpeningAlerts([], first.seenIds);
  assert.deepEqual(emptyPoll.alerts, []);
  assert.deepEqual(emptyPoll.seenIds, first.seenIds);
  const reappeared = collectOpeningAlerts([session("pending"), session("already-approved")], emptyPoll.seenIds);
  assert.deepEqual(reappeared.alerts, []);
  for (const status of ["active", "rejected", "closed"]) {
    assert.deepEqual(collectOpeningAlerts([session("handled-" + status, { status })], new Set()).alerts, []);
  }
});

test("the next guest at the same table receives a distinct event keyed to the new session", () => {
  const oldGuest = session("old-guest");
  const first = collectOpeningAlerts([oldGuest], new Set());
  const second = collectOpeningAlerts([session("new-guest", { customer_name: "Khách Lan" })], first.seenIds);
  assert.equal(second.alerts.length, 1);
  assert.notEqual(second.alerts[0].id, first.alerts[0].id);
  assert.equal(second.alerts[0].tableId, first.alerts[0].tableId);
  assert.equal(second.alerts[0].sessionId, "new-guest");
  assert.equal(second.alerts[0].customerName, "Khách Lan");
  assert.deepEqual(pendingOpeningAlerts(first.alerts, [session("new-guest")]), [], "The old request must never attach itself to a later guest at the same table.");
});

test("approval, rejection, closure or disappearance removes an unhandled notification from the pending queue", () => {
  const row = session("request");
  const alerts = [opening(row)];
  for (const status of ["active", "rejected", "closed"]) {
    assert.deepEqual(pendingOpeningAlerts(alerts, [{ ...row, status }]), []);
  }
  assert.deepEqual(pendingOpeningAlerts(alerts, []), []);
  assert.equal(pendingOpeningAlerts(alerts, [row]).length, 1);
  assert.equal(alerts[0].sessionId, "request");
});

test("pending request metadata refreshes its table and customer without restarting the notification identity", () => {
  const row = session("request");
  const original = opening(row);
  const moved = pendingOpeningAlerts([original], [{ ...row, table_id: "7", table_name: "Sân vườn 7", customer_name: "Khách Mai" }]);
  assert.equal(moved.length, 1);
  assert.equal(moved[0].id, original.id);
  assert.equal(moved[0].tableId, "7");
  assert.equal(moved[0].customerName, "Khách Mai");
  assert.equal(adminAlertSpeech(moved[0]), "Sân vườn 7 có khách yêu cầu mở bàn");
  assert.equal(original.tableId, "1");
  assert.equal(original.customerName, "Khách Minh");
});

test("spoken Vietnamese uses the current table label, with a useful fallback when its label is absent", () => {
  for (const [tableName, expected] of [
    ["Bàn 01", "Bàn 01 có khách yêu cầu mở bàn"],
    ["  Bàn 2  ", "Bàn 2 có khách yêu cầu mở bàn"],
    ["Sân vườn 12", "Sân vườn 12 có khách yêu cầu mở bàn"],
    [undefined, "Bàn 9 có khách yêu cầu mở bàn"],
    ["   ", "Bàn 9 có khách yêu cầu mở bàn"],
  ]) {
    const alert = opening(session("request", { table_id: "9", table_name: tableName }));
    assert.equal(adminAlertSpeech(alert), expected);
  }
  assert.equal(adminAlertSpeech(orderAlert(order("placed"))), "Bàn 2 có đơn", "Existing order announcements retain their original wording.");
});

test("order and opening identifiers have independent baselines and never collide in the shared audio queue", () => {
  const openingResult = collectOpeningAlerts([session("shared-id")], new Set());
  const orderResult = collectOrderAlerts([order("shared-id", { dining_session_id: "shared-id" })], new Set());
  const request = openingResult.alerts[0], placed = orderResult.alerts[0];
  assert.ok(isOpeningAlert(request));
  assert.equal(isOpeningAlert(placed), false);
  assert.notEqual(request.id, placed.id);
  const speech = new AudioAnnouncementQueue();
  speech.reconcile([request, placed]);
  assert.equal(speech.snapshot().length, 2);
  assert.deepEqual(collectOpeningAlerts([session("shared-id")], openingResult.seenIds).alerts, []);
  assert.deepEqual(collectOrderAlerts([order("shared-id")], orderResult.seenIds).alerts, []);
});

test("mixed pending reconciliation preserves FIFO while dropping only the handled request or handled order", () => {
  const a = session("opening-a");
  const b = order("order-b");
  const c = session("opening-c", { table_id: "3", table_name: "Bàn 3" });
  const d = order("order-d", { table_id: "4", table_name: "Bàn 4", dining_session_id: "visit-four" });
  const queue = [opening(a), orderAlert(b), opening(c), orderAlert(d)];
  const pending = pendingAdminAlerts(queue, [{ ...b, status: "preparing" }, d], [{ ...a, status: "active" }, c]);
  assert.deepEqual(pending.map((alert) => alert.id), [queue[2].id, queue[3].id]);
  assert.deepEqual(pending.map(adminAlertSpeech), ["Bàn 3 có khách yêu cầu mở bàn", "Bàn 4 có đơn"]);
  assert.equal(queue.length, 4);
});

test("same-poll mixed arrivals follow event time and use the first order in a grouped announcement", () => {
  const rows = [
    order("later-same-table", { created_at: 9_000 }),
    order("other-table", { table_id: "4", table_name: "Bàn 4", dining_session_id: "visit-four", created_at: 3_000 }),
    order("first-same-table", { created_at: 1_000 }),
  ];
  const requests = [session("middle", { created_at: 2_000 }), session("last", { table_id: "5", created_at: 4_000 })];
  const orderAlerts = collectOrderAlerts(rows, new Set()).alerts;
  const requestAlerts = collectOpeningAlerts(requests, new Set()).alerts;
  const input = [requestAlerts[1], orderAlerts[1], requestAlerts[0], orderAlerts[0]];
  const inputIds = input.map((alert) => alert.id);
  const sorted = sortAdminAlertArrivals(input, rows, requests);
  assert.deepEqual(sorted.map((alert) => alert.id), [orderAlerts[0].id, requestAlerts[0].id, orderAlerts[1].id, requestAlerts[1].id]);
  assert.deepEqual(input.map((alert) => alert.id), inputIds);
  const equalTime = [opening(session("b", { created_at: 7_000 })), opening(session("a", { created_at: 7_000 }))];
  const tieRows = [session("b", { created_at: 7_000 }), session("a", { created_at: 7_000 })];
  assert.deepEqual(sortAdminAlertArrivals(equalTime, [], tieRows).map((alert) => alert.sessionId), ["a", "b"]);
});

test("permission revocation removes only the event types the employee can no longer receive", () => {
  const alerts = [opening(session("first")), orderAlert(order("placed")), opening(session("last"))];
  assert.deepEqual(restrictAdminAlerts(alerts, { orders: true, openings: false }), [alerts[1]]);
  assert.deepEqual(restrictAdminAlerts(alerts, { orders: false, openings: true }), [alerts[0], alerts[2]]);
  assert.deepEqual(restrictAdminAlerts(alerts, { orders: false, openings: false }), []);
  assert.deepEqual(restrictAdminAlerts(alerts, { orders: true, openings: true }), alerts);
  assert.equal(alerts.length, 3);
});

test("short-lived mixed popups do not consume speech; every request and order finishes in FIFO sequence", () => {
  const requests = [session("first"), session("third", { table_id: "3", table_name: "Bàn 3" })];
  const placed = order("second");
  const arrivals = [opening(requests[0]), orderAlert(placed), opening(requests[1])];
  const speech = new AudioAnnouncementQueue(), ledger = new AudioAnnouncementLedger();
  speech.reconcile(arrivals);
  let timing = null;
  for (const popup of arrivals) timing = resolvePopupTiming(timing, popup.id, 1);
  assert.equal(timing.durationMs, 1_000);
  speech.reconcile(pendingAdminAlerts(speech.snapshot(), [placed], requests));
  assert.deepEqual(speech.snapshot().map((alert) => alert.id), arrivals.map((alert) => alert.id));
  const spoken = [];
  while (speech.first()) {
    const alert = speech.first(), attempt = ledger.begin(alert);
    assert.ok(attempt);
    assert.equal(ledger.begin(speech.first()), null, "Polling or an unlock event cannot start the same queue head twice.");
    assert.equal(ledger.markStarted(attempt), true);
    spoken.push(adminAlertSpeech(alert));
    assert.equal(ledger.finish(attempt), true);
    speech.complete(attempt.alertId);
    assert.equal(ledger.begin(alert), null, "A completed announcement cannot be replayed by another poll.");
  }
  assert.deepEqual(spoken, ["Bàn 1 có khách yêu cầu mở bàn", "Bàn 2 có đơn", "Bàn 3 có khách yêu cầu mở bàn"]);
});

test("a blocked opening remains ahead of a new order until its real retry succeeds", () => {
  const request = opening(session("blocked")), placed = orderAlert(order("arrived-later"));
  const speech = new AudioAnnouncementQueue(), ledger = new AudioAnnouncementLedger();
  speech.reconcile([request]);
  const blocked = ledger.begin(speech.first());
  assert.equal(ledger.finish(blocked), true);
  assert.equal(ledger.hasStarted(request.id), false);
  speech.reconcile([...speech.snapshot(), placed, { ...placed }]);
  assert.equal(speech.first().id, request.id);
  const retry = ledger.begin(speech.first());
  assert.ok(retry);
  assert.notEqual(retry.token, blocked.token);
  assert.equal(ledger.markStarted(blocked), false);
  assert.equal(ledger.finish(blocked), false);
  assert.equal(ledger.markStarted(retry), true);
  assert.equal(ledger.finish(retry), true);
  speech.complete(retry.alertId);
  assert.deepEqual(speech.snapshot().map((alert) => alert.id), [placed.id]);
});

test("approval or permission removal invalidates an unspoken opening without swallowing the next order", () => {
  const row = session("awaiting"), placed = order("next");
  for (const prune of [
    (queue) => pendingAdminAlerts(queue, [placed], [{ ...row, status: "active" }]),
    (queue) => restrictAdminAlerts(queue, { orders: true, openings: false }),
  ]) {
    const requestAlert = opening(row), placedAlert = orderAlert(placed);
    const speech = new AudioAnnouncementQueue(), ledger = new AudioAnnouncementLedger();
    speech.reconcile([requestAlert, placedAlert]);
    const stale = ledger.begin(speech.first());
    speech.reconcile(prune(speech.snapshot()));
    ledger.cancel();
    assert.equal(ledger.markStarted(stale), false);
    assert.equal(ledger.finish(stale), false);
    speech.complete(stale.alertId);
    assert.equal(speech.first().id, placedAlert.id);
    const next = ledger.begin(speech.first());
    assert.ok(next);
    assert.equal(ledger.markStarted(next), true);
  }
});

test("returning to a visible admin page can retry an unstarted opening but cannot replay one already spoken", () => {
  const request = opening(session("hidden")), placed = orderAlert(order("next"));
  const speech = new AudioAnnouncementQueue(), ledger = new AudioAnnouncementLedger();
  speech.reconcile([request, placed]);
  const beforeHidden = ledger.begin(speech.first());
  ledger.cancel();
  const resumed = ledger.begin(speech.first());
  assert.ok(resumed);
  assert.equal(ledger.markStarted(beforeHidden), false);
  assert.equal(ledger.markStarted(resumed), true);
  ledger.cancel();
  speech.complete(request.id);
  assert.equal(ledger.begin(request), null);
  assert.equal(speech.first().id, placed.id);
  assert.ok(ledger.begin(speech.first()));
});
