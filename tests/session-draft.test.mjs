import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import ts from "typescript";

const module = {exports: {}};
const output = ts.transpileModule(readFileSync(new URL("../lib/session-draft.ts", import.meta.url), "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
new Function("require", "module", "exports", output)(specifier => {throw new Error("Unexpected import: " + specifier);}, module, module.exports);
const {sessionDraftKey, readSessionDraft} = module.exports;
const visit = "f625b311-dd5c-4843-9020-2db56f722111";
const requestId = "a852b311-dd5c-4843-9020-2db56f722111";
const draft = {cart: [{key: "line-1", itemId: "chicken", quantity: 2, extras: ["egg"], taste: "", note: "Không hành"}], note: "Phục vụ cùng nhau", requestId};
const storage = entries => {
  const data = new Map(entries);
  return {getItem: key => data.get(key) ?? null, key: index => [...data.keys()][index] ?? null, get length() {return data.size;}};
};

test("a visit keeps its cart, notes and pending request ID after changing QR tables", () => {
  const saved = storage([[sessionDraftKey(visit), JSON.stringify(draft)]]);
  assert.deepEqual(readSessionDraft(saved, visit, "original-table"), draft);
  assert.deepEqual(readSessionDraft(saved, visit, "new-table"), draft);
});

test("a transferred visit restores the earlier token-scoped cart after a page reload", () => {
  const saved = storage([["moc:draft:old-token:" + visit, JSON.stringify(draft)]]);
  assert.deepEqual(readSessionDraft(saved, visit, "new-token"), draft);
});

test("the current visit draft takes precedence over older token-scoped copies", () => {
  const saved = storage([["moc:draft:old-token:" + visit, JSON.stringify(draft)], [sessionDraftKey(visit), JSON.stringify({...draft, cart: [], note: "", requestId})]]);
  assert.deepEqual(readSessionDraft(saved, visit, "new-token")?.cart, []);
});

test("a new visit cannot receive the previous guest's cart from the same table", () => {
  const saved = storage([["moc:draft:table-token:" + visit, JSON.stringify(draft)]]);
  assert.equal(readSessionDraft(saved, "different-visit", "table-token"), null);
});

test("broken storage or malformed saved data cannot interrupt a live visit", () => {
  assert.equal(readSessionDraft({getItem() {throw new Error("Storage blocked");}, key() {return null;}, length: 0}, visit, "table"), null);
  assert.equal(readSessionDraft(storage([[sessionDraftKey(visit), "not JSON"]]), visit, "table"), null);
  const saved = storage([[sessionDraftKey(visit), JSON.stringify({...draft, cart: [null, 12, {...draft.cart[0], quantity: -1}, ...draft.cart]})]]);
  assert.deepEqual(readSessionDraft(saved, visit, "table")?.cart, draft.cart);
});
