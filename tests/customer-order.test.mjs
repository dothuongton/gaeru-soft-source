import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
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
const {mergeCartLine, normalizeItemChoice, prepareOrderSubmission, orderRequestBody, readPendingOrder, storePendingOrder, pendingOrderKey} = load("customer-order");
const visit = "4f4ebf31-d411-4104-b544-b2343bc01f36";
const requestId = "c0be53d0-c221-4462-8b64-655fb13d16de";
const line = (overrides = {}) => ({key: "chicken-1", itemId: "chicken", quantity: 2, extras: ["egg"], taste: "", note: "Ít cay", ...overrides});
const input = (overrides = {}) => ({source: "cart", sessionId: visit, tableToken: "qr-table-one", requestId, cart: [line()], note: "Mang cùng lúc", menu: sampleMenu, ...overrides});
const storage = () => {const values = new Map(); return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null, get length() {return values.size;}};};

test("order now submits only the selected item and preserves the other cart and its note", () => {
  const cart = [line()];
  const selected = line({key: "tea-now", itemId: "tea", quantity: 1, extras: ["large"], taste: "Ít ngọt", note: "Ít đá"});
  const pending = prepareOrderSubmission(input({source: "direct", cart, directLine: selected}));
  assert.deepEqual(pending.items, [selected]);
  assert.equal(pending.note, "");
  assert.equal(pending.expectedTotal, 49000);
  assert.deepEqual(cart, [line()]);
  assert.equal(pending.previewItems[0].taste, "Ít ngọt");
});

test("a retry retains the exact original request and price after edits and menu refresh", () => {
  const initial = input({menu: sampleMenu.map(item => ({...item}))});
  const pending = prepareOrderSubmission(initial);
  const before = JSON.stringify(orderRequestBody(pending));
  initial.cart[0].quantity = 3;
  initial.cart[0].extras.push("rice");
  initial.menu[0].price = 999000;
  const retry = orderRequestBody(pending);
  assert.equal(JSON.stringify(retry), before);
  assert.equal(retry.requestId, requestId);
  assert.equal(retry.expectedTotal, 150000);
  retry.items[0].extras.push("rice");
  assert.equal(JSON.stringify(orderRequestBody(pending)), before);
});

test("pending requests survive reload and the same visit's table transfer", () => {
  const saved = storage(), pending = prepareOrderSubmission(input());
  storePendingOrder(saved, visit, pending);
  assert.deepEqual(readPendingOrder(saved, visit), pending);
  assert.equal(readPendingOrder(saved, visit).tableToken, "qr-table-one");
  assert.equal(readPendingOrder(saved, "a-different-visit"), null);
  storePendingOrder(saved, visit, null, pending.requestId);
  assert.equal(readPendingOrder(saved, visit), null);
});

test("corrupt or incomplete pending data cannot be mistaken for a valid request", () => {
  const pending = prepareOrderSubmission(input());
  for (const corrupt of [null, {}, {...pending, requestId: "-".repeat(36)}, {...pending, expectedTotal: 1}, {...pending, source: "direct", items: [...pending.items, line()]}, {...pending, items: [line({quantity: 61})]}, {...pending, previewItems: [{}]}]) {
    const saved = storage(); saved.setItem(pendingOrderKey(visit), JSON.stringify(corrupt));
    assert.equal(readPendingOrder(saved, visit), null);
  }
});

test("restricted browser storage does not interrupt a live ordering attempt", () => {
  const unavailable = {getItem() {throw new Error("blocked");}, setItem() {throw new Error("blocked");}, removeItem() {throw new Error("blocked");}};
  assert.doesNotThrow(() => storePendingOrder(unavailable, visit, prepareOrderSubmission(input())));
  assert.equal(readPendingOrder(unavailable, visit), null);
});

test("adding identical options merges quantities without mutating the previous cart", () => {
  const cart = [line({quantity: 3, extras: ["egg", "rice"]})];
  const merged = mergeCartLine(cart, line({key: "new-key", quantity: 2, extras: ["rice", "egg"]}));
  assert.equal(merged.length, 1); assert.equal(merged[0].quantity, 5);
  assert.equal(cart[0].quantity, 3); assert.deepEqual(cart[0].extras, ["egg", "rice"]);
  assert.equal(mergeCartLine(cart, line({note: "Không hành"})).length, 2);
});

test("cart limits are reported before checkout for item, portion and variant counts", () => {
  assert.throws(() => mergeCartLine([line({quantity: 20})], line({quantity: 1})), /20 phần/);
  const full = [1, 2, 3].map(index => line({key: String(index), note: String(index), quantity: 20}));
  assert.throws(() => mergeCartLine(full, line({key: "extra", note: "new", quantity: 1})), /60 phần/);
  const many = Array.from({length: 30}, (_, index) => line({key: String(index), note: String(index), quantity: 1}));
  assert.throws(() => mergeCartLine(many, line({note: "different", quantity: 1})), /30 lựa chọn/);
});

test("invalid or unavailable quick selections fail before a request is prepared", () => {
  assert.throws(() => prepareOrderSubmission(input({source: "direct"})), /chọn/);
  assert.throws(() => prepareOrderSubmission(input({source: "direct", directLine: line(), menu: sampleMenu.map(item => ({...item, available: 0}))})), /vừa hết/);
});

test("a retained direct selection recovers when the shop changes the item's category", () => {
  const changed = {...sampleMenu[0], category: "drink"};
  const repaired = normalizeItemChoice(line(), changed);
  assert.deepEqual(repaired, {quantity: 2, extras: [], taste: "Vừa vị", note: "Ít cay"});
  assert.doesNotThrow(() => prepareOrderSubmission(input({source: "direct", directLine: {...line(), ...repaired}, menu: [changed]})));
  assert.equal(normalizeItemChoice({...repaired, taste: "Ít ngọt"}, sampleMenu[0]).taste, "");
});


test("promotions apply only inside the scheduled interval and never discount extras", () => {
 const {salePrice,linePrice,calculateOrder}=load("menu");
 const item={...sampleMenu[0],promotion:{enabled:true,type:"percent",value:20,startsAt:1000,endsAt:2000}};
 assert.equal(salePrice(item,999),65000);
 assert.equal(salePrice(item,1000),52000);
 assert.equal(salePrice(item,1999),52000);
 assert.equal(salePrice(item,2000),65000);
 item.promotion.startsAt=null;item.promotion.endsAt=null;
 assert.equal(linePrice({extras:["egg"]},item),62000);
 const priced=calculateOrder([{itemId:item.id,quantity:2,extras:["egg"],taste:"",note:""}], [item]);
 assert.equal(priced.total,124000);
 item.promotion={...item.promotion,type:"amount",value:5000};
 assert.equal(linePrice({extras:["egg"]},item),70000);
 item.promotion.enabled=false;
 assert.equal(salePrice(item),65000);
});

test("promotion validation rejects invalid discounts, dates and prices below the minimum", () => {
 const {validatePromotion}=load("menu");
 const p={enabled:true,type:"percent",value:10,startsAt:null,endsAt:null};
 for(const change of [{value:100},{value:-1},{value:1.5},{enabled:1},{type:"coupon"},{startsAt:2000,endsAt:1000},{startsAt:"tomorrow"},{type:"amount",value:65000},{type:"amount",value:64500}])assert.throws(()=>validatePromotion({...p,...change},65000));
 assert.deepEqual(validatePromotion(p,65000),p);
 assert.equal(validatePromotion(null,65000),null);
 assert.doesNotThrow(()=>validatePromotion({...p,enabled:false,type:"amount",value:100000},65000));
});
