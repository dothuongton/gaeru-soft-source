import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const nodeRequire = createRequire(import.meta.url);
const cache = new Map();

function load(relativePath) {
  const candidate = resolve(projectRoot, relativePath);
  const path = existsSync(candidate) ? candidate : candidate.replace(/\.ts$/, ".tsx");
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const require = (specifier) => {
    if (specifier.endsWith(".css")) return {};
    if (specifier.startsWith("@/")) return load(specifier.slice(2) + ".ts");
    if (specifier.startsWith(".")) return load(resolve(dirname(path), specifier) + ".ts");
    return nodeRequire(specifier);
  };
  new Function("require", "module", "exports", source)(require, module, module.exports);
  return module.exports;
}

const { normalizeOrderItem, projectOrderStatus, canCancelOrder, calculateOrder, sampleMenu } = load("lib/menu.ts");
const { groupOrderItems, OpenTableBoard } = load("app/open-table-board.tsx");

const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const text = (html) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

test("normalizeOrderItem assigns stable lineId and stage counts from order status or preserves valid counts", () => {
  const legacyItem = {
    itemId: "chicken",
    name: "Cơm gà sốt Mộc",
    quantity: 2,
    unitPrice: 65000,
    total: 130000,
    extras: [],
    taste: "",
    note: "",
    image: "",
  };

  const normNew = normalizeOrderItem(legacyItem, "new", 0);
  assert.equal(normNew.orderLineId, "line_1");
  assert.equal(normNew.newCount, 2);
  assert.equal(normNew.preparingCount, 0);
  assert.equal(normNew.readyCount, 0);
  assert.equal(normNew.servedCount, 0);

  const normPrep = normalizeOrderItem(legacyItem, "preparing", 1);
  assert.equal(normPrep.orderLineId, "line_2");
  assert.equal(normPrep.newCount, 0);
  assert.equal(normPrep.preparingCount, 2);
  assert.equal(normPrep.readyCount, 0);
  assert.equal(normPrep.servedCount, 0);

  const partialItem = {
    ...legacyItem,
    orderLineId: "custom_line_1",
    newCount: 0,
    preparingCount: 1,
    readyCount: 0,
    servedCount: 1,
  };
  const normPartial = normalizeOrderItem(partialItem, "preparing", 0);
  assert.equal(normPartial.orderLineId, "custom_line_1");
  assert.equal(normPartial.preparingCount, 1);
  assert.equal(normPartial.servedCount, 1);
  assert.equal(normPartial.newCount + normPartial.preparingCount + normPartial.readyCount + normPartial.servedCount, 2);
});

test("projectOrderStatus calculates status accurately from item line counts", () => {
  const item1 = {
    itemId: "chicken",
    name: "Cơm gà",
    quantity: 2,
    unitPrice: 65000,
    total: 130000,
    extras: [],
    taste: "",
    note: "",
    image: "",
    newCount: 0,
    preparingCount: 1,
    readyCount: 0,
    servedCount: 1,
  };
  const item2 = {
    itemId: "tea",
    name: "Trà đào",
    quantity: 1,
    unitPrice: 39000,
    total: 39000,
    extras: [],
    taste: "",
    note: "",
    image: "",
    newCount: 0,
    preparingCount: 0,
    readyCount: 1,
    servedCount: 0,
  };

  // Mixed preparing + served + ready => "preparing"
  assert.equal(projectOrderStatus([item1, item2], "preparing"), "preparing");

  // If item1 is fully served and item2 is ready => "ready"
  const item1Served = { ...item1, preparingCount: 0, servedCount: 2 };
  assert.equal(projectOrderStatus([item1Served, item2], "preparing"), "ready");

  // If both items are fully served => "served"
  const item2Served = { ...item2, readyCount: 0, servedCount: 1 };
  assert.equal(projectOrderStatus([item1Served, item2Served], "preparing"), "served");

  // Cancelled order remains cancelled regardless of counts
  assert.equal(projectOrderStatus([item1Served, item2Served], "cancelled"), "cancelled");
});

test("canCancelOrder protects orders that have already had items served", () => {
  const orderBase = {
    id: "ord_1",
    code: "101",
    table_id: "1",
    table_name: "Bàn 01",
    dining_session_id: "ses_1",
    status: "preparing",
    paid: 0,
    cancel_reason: "",
    total: 100000,
    note: "",
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  // All 2 units preparing => can cancel
  const orderUnserved = {
    ...orderBase,
    items: [
      { itemId: "fries", name: "Khoai tây chiên", quantity: 2, unitPrice: 35000, total: 70000, extras: [], taste: "", note: "", image: "", newCount: 0, preparingCount: 2, readyCount: 0, servedCount: 0 },
    ],
  };
  assert.equal(canCancelOrder(orderUnserved), true);

  // 1 unit already served => CANNOT cancel whole order
  const orderPartiallyServed = {
    ...orderBase,
    items: [
      { itemId: "fries", name: "Khoai tây chiên", quantity: 2, unitPrice: 35000, total: 70000, extras: [], taste: "", note: "", image: "", newCount: 0, preparingCount: 1, readyCount: 0, servedCount: 1 },
    ],
  };
  assert.equal(canCancelOrder(orderPartiallyServed), false);

  // Paid order cannot be cancelled via standard action
  const orderPaid = { ...orderUnserved, paid: 1 };
  assert.equal(canCancelOrder(orderPaid), false);
});

test("groupOrderItems groups identical items while strictly separating variants by notes or extras", () => {
  const order1 = {
    id: "ord_1",
    code: "101",
    status: "served",
    created_at: 1000,
    items: [
      { itemId: "chicken", name: "Cơm gà", quantity: 1, unitPrice: 65000, total: 65000, extras: ["Thêm trứng"], taste: "", note: "Không hành", image: "", servedCount: 1, preparingCount: 0, readyCount: 0, newCount: 0 },
      { itemId: "tea", name: "Trà đào", quantity: 2, unitPrice: 39000, total: 78000, extras: [], taste: "Ít ngọt", note: "", image: "", servedCount: 1, readyCount: 1, preparingCount: 0, newCount: 0 },
    ],
  };
  const order2 = {
    id: "ord_2",
    code: "102",
    status: "preparing",
    created_at: 2000,
    items: [
      // Same chicken, but DIFFERENT note ("Nhiều ớt") -> must NOT group with "Không hành"
      { itemId: "chicken", name: "Cơm gà", quantity: 1, unitPrice: 65000, total: 65000, extras: ["Thêm trứng"], taste: "", note: "Nhiều ớt", image: "", preparingCount: 1, servedCount: 0, readyCount: 0, newCount: 0 },
      // Same tea with same taste and note -> MUST group with order1's tea
      { itemId: "tea", name: "Trà đào", quantity: 1, unitPrice: 39000, total: 39000, extras: [], taste: "Ít ngọt", note: "", image: "", preparingCount: 1, servedCount: 0, readyCount: 0, newCount: 0 },
    ],
  };

  const groups = groupOrderItems([order1, order2]);

  // We should have 3 distinct groups:
  // 1. Cơm gà (Không hành) - 1 portion
  // 2. Cơm gà (Nhiều ớt) - 1 portion
  // 3. Trà đào (Ít ngọt) - 3 portions across 2 rounds
  assert.equal(groups.length, 3);

  const teaGroup = groups.find((g) => g.itemId === "tea");
  assert.ok(teaGroup);
  assert.equal(teaGroup.totalQuantity, 3);
  assert.equal(teaGroup.servedCount, 1);
  assert.equal(teaGroup.readyCount, 1);
  assert.equal(teaGroup.preparingCount, 1);
  assert.equal(teaGroup.rounds.length, 2);
  assert.equal(teaGroup.rounds[0].roundNumber, 1);
  assert.equal(teaGroup.rounds[1].roundNumber, 2);

  const chickenNoOnion = groups.find((g) => g.itemId === "chicken" && g.note === "Không hành");
  assert.ok(chickenNoOnion);
  assert.equal(chickenNoOnion.totalQuantity, 1);
  assert.equal(chickenNoOnion.servedCount, 1);

  const chickenSpicy = groups.find((g) => g.itemId === "chicken" && g.note === "Nhiều ớt");
  assert.ok(chickenSpicy);
  assert.equal(chickenSpicy.totalQuantity, 1);
  assert.equal(chickenSpicy.preparingCount, 1);
});

test("OpenTableBoard table detail sheet renders both tabs, portion counts, and guarded settlement footer", () => {
  const table = { id: "1", name: "Bàn 01", zone: "Tầng 1", token: "t1" };
  const session = {
    id: "ses_1",
    table_id: "1",
    table_name: "Bàn 01",
    customer_name: "Anh Tuấn",
    status: "active",
    created_at: Date.now() - 30 * 60000,
    updated_at: Date.now(),
  };
  const order1 = {
    id: "ord_1",
    code: "101",
    table_id: "1",
    table_name: "Bàn 01",
    dining_session_id: "ses_1",
    status: "served",
    paid: 1,
    total: 104000,
    note: "",
    cancel_reason: "",
    created_at: Date.now() - 25 * 60000,
    updated_at: Date.now(),
    items: [
      { itemId: "chicken", name: "Cơm gà sốt Mộc", quantity: 1, unitPrice: 65000, total: 65000, extras: [], taste: "", note: "", image: "", servedCount: 1 },
      { itemId: "tea", name: "Trà đào sả", quantity: 1, unitPrice: 39000, total: 39000, extras: [], taste: "Vừa vị", note: "", image: "", servedCount: 1 },
    ],
  };
  const order2 = {
    id: "ord_2",
    code: "102",
    table_id: "1",
    table_name: "Bàn 01",
    dining_session_id: "ses_1",
    status: "preparing",
    paid: 0,
    total: 35000,
    note: "Cho ít muối",
    cancel_reason: "",
    created_at: Date.now() - 10 * 60000,
    updated_at: Date.now(),
    items: [
      { itemId: "fries", name: "Khoai tây chiên", quantity: 1, unitPrice: 35000, total: 35000, extras: [], taste: "", note: "Cho ít muối", image: "", preparingCount: 1 },
    ],
  };

  const props = {
    initialView: "matrix",
    permissions: ["tables.manage", "orders.manage", "payments.collect", "tables.transfer", "orders.view"],
    tables: [table],
    sessions: [session],
    orders: [order1, order2],
    calls: [],
    transfers: [],
    working: false,
    focusTableId: "1",
    focusRevision: 1,
    onSessionAction: async () => true,
    onOrderStatus: async () => true,
    onCollect: () => {},
    onCollectTable: () => {},
    onCancel: () => {},
    onViewOrder: () => {},
    onResolveCall: async () => true,
    onTransfer: () => {},
  };

  const html = render(OpenTableBoard, props);
  const plain = text(html);

  // Verifies header details
  assert.ok(plain.includes("Hóa đơn · Bàn 01"), "Renders detail modal title");
  assert.ok(plain.includes("Anh Tuấn"), "Renders customer name");
  assert.match(html, /Món \/ ghi chú/);
  assert.ok(plain.includes("3 suất"), "Counts total portions");
  assert.ok(plain.includes("2 lượt gọi"), "Counts valid rounds");

  // Verifies tabs
  assert.ok(plain.includes("Theo món"), "Contains Theo món tab");
  assert.ok(plain.includes("Theo lượt gọi"), "Contains Theo lượt gọi tab");

  // Verifies quick CTA when preparing items exist
  assert.ok(plain.includes("Cập nhật món"), "Keeps preparation actions behind a compact disclosure");

  // Verifies footer settlement details
  assert.ok(plain.includes("Cần thu") && plain.includes("35.000 ₫"), "Highlights remaining unpaid balance");
  assert.ok(plain.includes("Thanh toán cả bàn"), "Provides settle entire table CTA");
  assert.equal((html.match(/class="primary otb-bill-pay"/g)||[]).length,1);
  assert.doesNotMatch(plain,/Thanh toán lần này/);
  assert.ok(plain.includes("Đổi bàn"), "Provides transfer table CTA");
  assert.ok(plain.includes("Đóng bàn"), "Provides close table CTA");
  assert.ok(plain.includes("Chỉ đóng bàn khi phục vụ xong và đã thu đủ tiền"), "Guards table closure");
  assert.ok(plain.includes("1 suất chưa phục vụ xong"));
  assert.ok(plain.includes("Ghi chú lượt 2: Cho ít muối"));
  assert.ok(plain.includes("Đơn giá 35.000 ₫"));
});
