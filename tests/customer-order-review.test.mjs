import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {test} from "node:test";
import ts from "typescript";

const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const module = {exports: {}};
  const code = ts.transpileModule(readFileSync(new URL("../lib/" + name + ".ts", import.meta.url), "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  new Function("require", "module", "exports", code)(specifier => load(specifier.replace("./", "")), module, module.exports);
  modules.set(name, module.exports);
  return module.exports;
}
const {sampleMenu} = load("menu");
const {readSessionDraft, sessionDraftKey} = load("session-draft");
const {prepareOrderSubmission, orderRequestBody, readPendingOrder, storePendingOrder, pendingOrderKey} = load("customer-order");
const hash = body => createHash("sha256").update(JSON.stringify({sessionId: body.sessionId, items: body.items, note: body.note ?? "", expectedTotal: body.expectedTotal})).digest("hex");
const visit = "4f4ebf31-d411-4104-b544-b2343bc01f36";
const firstRequest = "10be53d0-c221-4462-8b64-655fb13d16de";
const secondRequest = "90be53d0-c221-4462-8b64-655fb13d16de";
const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null,
    get length() {return values.size;},
  };
};
const makePending = (requestId, source = "cart") => {
  const selected = {key: requestId, itemId: "chicken", quantity: 1, extras: ["egg"], taste: "", note: "Ít cay"};
  return prepareOrderSubmission({source, sessionId: visit, tableToken: "qr-table", requestId, cart: [selected], directLine: selected, note: "Mang cùng lúc", menu: sampleMenu});
};

test("upgrading an unconfirmed old cart preserves its original request hash including note whitespace", () => {
  const sessionId = "4f4ebf31-d411-4104-b544-b2343bc01f36";
  const tableToken = "qr-table-before-update";
  const savedDraft = {
    cart: [{key: "old-line", itemId: "chicken", quantity: 1, extras: ["egg"], taste: "", note: "Ít cay"}],
    note: "  Mang các món cùng lúc.\n",
    requestId: "c0be53d0-c221-4462-8b64-655fb13d16de",
  };
  // The previous release stored the draft before sending this exact payload.
  const originalBody = {tableToken, sessionId, requestId: savedDraft.requestId, items: savedDraft.cart.map(({key, ...line}) => line), note: savedDraft.note, expectedTotal: 75000};
  const key = sessionDraftKey(sessionId);
  const storage = {getItem: value => value === key ? JSON.stringify(savedDraft) : null, key: index => index === 0 ? key : null, length: 1};
  const restored = readSessionDraft(storage, sessionId, tableToken);
  const pending = prepareOrderSubmission({source: "cart", sessionId, tableToken, requestId: restored.requestId, cart: restored.cart, note: restored.note, menu: sampleMenu});
  const retry = orderRequestBody(pending);
  assert.equal(retry.requestId, originalBody.requestId);
  assert.equal(hash(retry), hash(originalBody), "Reusing a request ID after an update must replay the prior order rather than conflict because the client changed whitespace.");
});

test("two tabs' unresolved requests survive independently when either tab completes first", () => {
  for (const [completedId, outstandingId] of [[firstRequest, secondRequest], [secondRequest, firstRequest]]) {
    const storage = memoryStorage();
    const first = makePending(firstRequest), second = makePending(secondRequest, "direct");
    storePendingOrder(storage, visit, first);
    storePendingOrder(storage, visit, second);
    assert.deepEqual(readPendingOrder(storage, visit, firstRequest), first);
    assert.deepEqual(readPendingOrder(storage, visit, secondRequest), second);
    storePendingOrder(storage, visit, null, completedId);
    assert.equal(storage.getItem(pendingOrderKey(visit, completedId)), null);
    assert.equal(readPendingOrder(storage, visit).requestId, outstandingId);
    assert.equal(readPendingOrder(storage, visit, outstandingId).requestId, outstandingId);
  }
});

test("reload selects a stable remaining request and can prefer the current cart without storage enumeration", () => {
  const storage = memoryStorage(), first = makePending(firstRequest), second = makePending(secondRequest, "direct");
  storePendingOrder(storage, visit, second);
  storePendingOrder(storage, visit, first);
  assert.deepEqual(readPendingOrder(storage, visit), first, "Storage insertion order must not decide which request is recovered.");
  assert.deepEqual(readPendingOrder({getItem: storage.getItem}, visit, secondRequest), second);
  assert.equal(readPendingOrder(storage, "a-new-visit"), null);
  storePendingOrder(storage, visit, null);
  assert.deepEqual(readPendingOrder(storage, visit, firstRequest), first);
  assert.deepEqual(readPendingOrder(storage, visit, secondRequest), second);
});

test("legacy pending records migrate without overwriting or clearing another tab's request", () => {
  const storage = memoryStorage(), first = makePending(firstRequest), second = makePending(secondRequest, "direct");
  storage.setItem(pendingOrderKey(visit), JSON.stringify(first));
  assert.deepEqual(readPendingOrder({getItem: storage.getItem}, visit), first);
  storePendingOrder(storage, visit, second);
  assert.notEqual(storage.getItem(pendingOrderKey(visit)), null);
  storePendingOrder(storage, visit, null, secondRequest);
  assert.deepEqual(readPendingOrder(storage, visit), first, "Completing another request must leave the legacy draft intact.");
  storePendingOrder(storage, visit, first);
  assert.equal(storage.getItem(pendingOrderKey(visit)), null);
  assert.deepEqual(readPendingOrder(storage, visit), first);
  storage.setItem(pendingOrderKey(visit), JSON.stringify(second));
  storePendingOrder(storage, visit, null, firstRequest);
  assert.deepEqual(readPendingOrder(storage, visit), second);
  storePendingOrder(storage, visit, null, secondRequest);
  assert.equal(readPendingOrder(storage, visit), null);
});

test("a mismatched record key or another visit's pending payload is never restored", () => {
  const storage = memoryStorage(), pending = makePending(firstRequest);
  storage.setItem(pendingOrderKey(visit, secondRequest), JSON.stringify(pending));
  storage.setItem(pendingOrderKey(visit, firstRequest), JSON.stringify({...pending, sessionId: "another-visit"}));
  assert.equal(readPendingOrder(storage, visit), null);
  storePendingOrder(storage, "another-visit", pending);
  assert.equal(storage.getItem(pendingOrderKey("another-visit", firstRequest)), null);
});
