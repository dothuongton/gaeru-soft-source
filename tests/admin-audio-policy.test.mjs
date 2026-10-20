/** Pure announcement lifecycle checks. Actual autoplay/audio output needs device QA. */
import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../lib/admin-audio-policy.ts", import.meta.url), "utf8"), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const module = {exports: {}};
new Function("module", "exports", compiled)(module, module.exports);
const {AudioAnnouncementLedger, AudioAnnouncementQueue} = module.exports;
const alert = (id = "order-alert", tableId = "1", tableName = "Bàn 1") => ({id, tableId, tableName});

test("polling and repeated unlock events cannot overlap the current announcement", () => {
  const ledger = new AudioAnnouncementLedger();
  const attempt = ledger.begin(alert());
  assert.ok(attempt);
  assert.equal(ledger.canBegin({...alert()}), false);
  assert.equal(ledger.begin({...alert()}), null);
});

test("an autoplay failure can retry the same pending alert after a real interaction", () => {
  const ledger = new AudioAnnouncementLedger();
  const blocked = ledger.begin(alert());
  assert.equal(ledger.finish(blocked), true);
  const retried = ledger.begin(alert());
  assert.ok(retried);
  assert.notEqual(retried.token, blocked.token);
  assert.equal(ledger.markStarted(blocked), false, "Late callbacks from a blocked attempt must not mark the new attempt as spoken.");
  assert.equal(ledger.markStarted(retried), true);
});

test("only an actual speech start prevents duplicate announcements across polling or table moves", () => {
  const ledger = new AudioAnnouncementLedger();
  const attempt = ledger.begin(alert());
  assert.equal(ledger.hasStarted(attempt.alertId), false);
  assert.equal(ledger.markStarted(attempt), true);
  assert.equal(ledger.hasStarted(attempt.alertId), true);
  ledger.finish(attempt);
  assert.equal(ledger.begin(alert()), null);
  assert.equal(ledger.begin(alert("order-alert", "4", "Bàn 4")), null);
  assert.ok(ledger.begin(alert("new-order-at-same-table")));
});

test("cancelling a blocked or hidden attempt keeps it eligible; stale callbacks cannot complete it", () => {
  const ledger = new AudioAnnouncementLedger();
  const hidden = ledger.begin(alert());
  ledger.cancel();
  assert.equal(ledger.markStarted(hidden), false);
  assert.equal(ledger.finish(hidden), false);
  const visible = ledger.begin(alert());
  assert.ok(visible);
  assert.equal(ledger.markStarted(visible), true);
  ledger.cancel();
  assert.equal(ledger.begin(alert()), null, "Hiding after speech has started must not replay that order on return.");
});

test("a move before speech starts allows current table wording and rejects old-location callbacks", () => {
  const ledger = new AudioAnnouncementLedger();
  const oldTable = ledger.begin(alert());
  const moved = ledger.begin(alert("order-alert", "7", "Bàn 7"));
  assert.ok(moved);
  assert.equal(ledger.markStarted(oldTable), false);
  assert.equal(ledger.finish(oldTable), false);
  assert.equal(ledger.begin(alert("order-alert", "7", "Bàn 7")), null);
  assert.equal(ledger.markStarted(moved), true);
});

test("table names with punctuation cannot collide with a different alert location", () => {
  const ledger = new AudioAnnouncementLedger();
  assert.ok(ledger.begin(alert("a|b", "c", "d")));
  assert.ok(ledger.begin(alert("a", "b|c", "d")));
});


test("three short popups can expire while their speech queue still completes every table in order", () => {
  const speech = new AudioAnnouncementQueue();
  const ledger = new AudioAnnouncementLedger();
  const arrivals = [alert("first", "1", "Bàn 1"), alert("second", "2", "Bàn 2"), alert("third", "3", "Bàn 3")];
  speech.reconcile(arrivals);
  const firstAttempt = ledger.begin(speech.first());
  ledger.markStarted(firstAttempt);
  // Visual popup timers own another collection; none acknowledges speech completion.
  const visiblePopups = [...arrivals];
  visiblePopups.shift();
  visiblePopups.shift();
  visiblePopups.shift();
  speech.reconcile(speech.snapshot()); // A poll while all orders remain pending.
  assert.equal(speech.first().id, "first");
  assert.deepEqual(speech.snapshot().map(item => item.id), ["first", "second", "third"]);
  ledger.finish(firstAttempt);
  speech.complete(firstAttempt.alertId);
  const secondAttempt = ledger.begin(speech.first());
  assert.equal(secondAttempt.alertId, "second");
  ledger.markStarted(secondAttempt);
  ledger.finish(secondAttempt);
  speech.complete(secondAttempt.alertId);
  assert.equal(speech.first().id, "third");
  speech.complete("third");
  assert.equal(speech.first(), null);
});

test("handling or moving a queued table preserves other table audio and late callbacks cannot skip it", () => {
  const speech = new AudioAnnouncementQueue();
  const ledger = new AudioAnnouncementLedger();
  speech.reconcile([alert("first"), alert("second", "2", "Bàn 2")]);
  const firstAttempt = ledger.begin(speech.first());
  ledger.markStarted(firstAttempt);
  speech.reconcile([alert("second", "7", "Bàn 7")]);
  ledger.cancel();
  speech.complete("first");
  assert.equal(ledger.markStarted(firstAttempt), false);
  assert.equal(speech.first().id, "second");
  assert.equal(speech.first().tableName, "Bàn 7");
  speech.complete("unrelated");
  assert.equal(speech.first().id, "second");
});

test("a blocked first speech stays queued until retry succeeds and later orders are retained", () => {
  const speech = new AudioAnnouncementQueue();
  const ledger = new AudioAnnouncementLedger();
  speech.reconcile([alert("first")]);
  const blocked = ledger.begin(speech.first());
  ledger.finish(blocked);
  speech.reconcile([...speech.snapshot(), alert("second", "2", "Bàn 2"), alert("second", "2", "Bàn 2")]);
  const retry = ledger.begin(speech.first());
  assert.equal(retry.alertId, "first");
  ledger.markStarted(retry);
  ledger.finish(retry);
  speech.complete(retry.alertId);
  assert.deepEqual(speech.snapshot().map(item => item.id), ["second"]);
});
