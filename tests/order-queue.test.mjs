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

const { OrderQueue } = load("app/order-queue.tsx");
const { OpenTableBoard } = load("app/open-table-board.tsx");
const { ROLE_PRESETS } = load("lib/staff-permissions.ts");

const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const text = (html) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const baseNow = Date.now();

const tables = [
  { id: "1", name: "Bàn 01", zone: "Tầng 1", token: "t1" },
  { id: "2", name: "Bàn 02", zone: "Tầng 2", token: "t2" },
];

const sampleOrders = [
  {
    id: "ord-old",
    code: "OD001",
    dining_session_id:"session-1",
    table_id: "1",
    table_name: "Bàn 01",
    customer_name: "Khách An",
    items: [{ name: "Phở Bò", quantity: 2, price: 60000, extras: ["Ít hành"], taste: "", note: "Không tiêu" }],
    total: 120000,
    status: "new",
    paid: 0,
    created_at: baseNow - 16 * 60 * 1000, // 16 min ago -> urgent
    note: "Khách dị ứng ớt",
  },
  {
    id: "ord-mid",
    code: "OD002",
    dining_session_id:"session-2",
    table_id: "2",
    table_name: "Bàn 02",
    customer_name: "Khách Bình",
    items: [{ name: "Bún Chả", quantity: 1, price: 50000, extras: [], taste: "", note: "" }],
    total: 50000,
    status: "new",
    paid: 0,
    created_at: baseNow - 11 * 60 * 1000, // 11 min ago -> warning
  },
  {
    id: "ord-recent",
    code: "OD003",
    dining_session_id:"session-1",
    table_id: "1",
    table_name: "Bàn 01",
    customer_name: "Khách Chi",
    items: [{ name: "Cà Phê Sữa", quantity: 3, price: 30000, extras: [], taste: "Ít đường", note: "" }],
    total: 90000,
    status: "new",
    paid: 0,
    created_at: baseNow - 3 * 60 * 1000, // 3 min ago -> normal
  },
];

test("OrderQueue: renders FIFO order sequence and wait time indicators", () => {
  const html = render(OrderQueue, {
    orders: sampleOrders,
    tables,
    permissions: ["orders.manage"],
    onOrderStatus: async () => true,
    onCancel: () => {},
    onViewOrder: () => {},
  });

  // Check order codes appear in FIFO order (oldest first)
  const posOld = html.indexOf("#OD001");
  const posMid = html.indexOf("#OD002");
  const posRecent = html.indexOf("#OD003");
  assert.ok(posOld !== -1 && posMid !== -1 && posRecent !== -1);
  assert.ok(posOld < posMid, "Oldest order #OD001 should appear before #OD002");
  assert.ok(posRecent < posMid, "Calls from the same visit stay together inside one table card");
  assert.equal((html.match(/class="oq-card /g)||[]).length,2);

  // Check urgency classes for wait times
  assert.ok(html.includes("urgent"), "Order waiting > 15m should have urgent class");
  assert.ok(html.includes("warning"), "Order waiting > 10m should have warning class");

  // Check customer note and allergy are rendered
  assert.ok(html.includes("Khách dị ứng ớt"), "Customer note must be visible");
  assert.ok(html.includes("Không tiêu"), "Item note must be visible");
  assert.ok(html.includes("Ít hành"), "Item extra must be visible");
});

test("OrderQueue: Single CTA transition with no synthetic hoàn tất status", () => {
  const kitchenPermissions = ["orders.manage"];
  
  // Test 'new' status order has 'Nhận & làm' button
  const newOrder = [{ ...sampleOrders[0], status: "new" }];
  const htmlNew = render(OrderQueue, {
    orders: newOrder,
    tables,
    permissions: kitchenPermissions,
    onOrderStatus: async () => true,
    onCancel: () => {},
    onViewOrder: () => {},
  });
  assert.ok(htmlNew.includes("Nhận 2 suất"), "New items have one table-level receive action");

  // Test 'preparing' status order has 'Sẵn sàng' button
  const prepOrder = [{ ...sampleOrders[0], status: "preparing" }];
  const htmlPrep = render(OrderQueue, {
    orders: prepOrder,
    tables,
    permissions: kitchenPermissions,
    onOrderStatus: async () => true,
    onCancel: () => {},
    onViewOrder: () => {},
  });
  assert.ok(htmlPrep.includes("Đã phục vụ 2 suất"), "Preparing items belong to the waiting-to-serve stage");

  // Test 'ready' status order has 'Đã phục vụ' button
  const readyOrder = [{ ...sampleOrders[0], status: "ready" }];
  const htmlReady = render(OrderQueue, {
    orders: readyOrder,
    tables,
    permissions: kitchenPermissions,
    onOrderStatus: async () => true,
    onCancel: () => {},
    onViewOrder: () => {},
  });
  assert.ok(htmlReady.includes("Đã phục vụ"), "Ready order must have Đã phục vụ CTA");

  // No synthetic "hoàn tất" status or buttons
  assert.ok(!htmlNew.includes("hoàn tất"), "Must not synthesize hoàn tất status");
  assert.ok(!htmlPrep.includes("hoàn tất"), "Must not synthesize hoàn tất status");
  assert.ok(!htmlReady.includes("hoàn tất"), "Must not synthesize hoàn tất status");
});

test("OrderQueue: Kitchen staff without money permissions cannot see money totals", () => {
  const kitchenPermissions = ROLE_PRESETS.find(p => p.id === "kitchen").permissions;
  assert.ok(!kitchenPermissions.includes("payments.collect"));
  assert.ok(!kitchenPermissions.includes("revenue.view"));

  const htmlKitchen = render(OrderQueue, {
    orders: sampleOrders,
    tables,
    permissions: kitchenPermissions,
    onOrderStatus: async () => true,
    onCancel: () => {},
    onViewOrder: () => {},
  });

  // Total money should not be in the kitchen view
  assert.ok(!htmlKitchen.includes("120.000"), "Kitchen view should not show order money total");
  assert.ok(!htmlKitchen.includes("50.000"), "Kitchen view should not show order money total");

  // But cashier or manager with payments.collect DOES see money
  const cashierPermissions = ROLE_PRESETS.find(p => p.id === "cashier").permissions;
  const htmlCashier = render(OrderQueue, {
    orders: sampleOrders,
    tables,
    permissions: cashierPermissions,
    onOrderStatus: async () => true,
    onCancel: () => {},
    onViewOrder: () => {},
  });
  assert.ok(htmlCashier.includes("Chi tiết bàn"), "Cashier opens the session bill instead of duplicated queue totals");
});

test("OrderQueue: Granular busy state only disables mutating order, not entire queue", () => {
  const html = render(OrderQueue, {
    orders: sampleOrders,
    tables,
    permissions: ["orders.manage"],
    onOrderStatus: async () => true,
    onCancel: () => {},
    onViewOrder: () => {},
    isBusy: (id) => id === "ord-old", // Only OD001 is busy
  });

  // OD001 should have disabled CTA with Đang lưu…
  assert.ok(html.includes("Đang lưu…"), "Busy order should display Đang lưu…");

  // Count buttons that are disabled vs not disabled
  const disabledButtons = (html.match(/<button[^>]*disabled/g) || []).length;
  // OD001 has disabled CTA and disabled cancel button; OD002 and OD003 have enabled buttons!
  assert.ok(disabledButtons >= 1, "Busy order must have disabled button");
  // There are other active buttons that are NOT disabled
  const totalActionButtons = (html.match(/oq-btn-cta/g) || []).length;
  assert.equal(totalActionButtons, 2, "One action per table/visit, while another table remains usable");
});

test("OpenTableBoard: granular isBusy does not freeze entire table board", () => {
  const sessions = [
    { id: "s1", table_id: "1", table_name: "Bàn 01", customer_name: "Khách 1", status: "active", created_at: baseNow, updated_at: baseNow },
  ];
  const orders = [
    { id: "o1", code: "OD1", dining_session_id: "s1", table_id: "1", table_name: "Bàn 01", customer_name: "Khách 1", items: [{ name: "Trà", quantity: 1, price: 10000, extras: [], taste: "", note: "" }], total: 10000, status: "new", paid: 0, created_at: baseNow },
    { id: "o2", code: "OD2", dining_session_id: "s1", table_id: "1", table_name: "Bàn 01", customer_name: "Khách 1", items: [{ name: "Bánh", quantity: 1, price: 20000, extras: [], taste: "", note: "" }], total: 20000, status: "new", paid: 0, created_at: baseNow },
  ];

  const html = render(OpenTableBoard, {
    mode: "orders",
    initialView: "manage",
    permissions: ["orders.manage", "tables.manage"],
    tables,
    sessions,
    orders,
    calls: [],
    transfers: [],
    working: false,
    isBusy: (id) => id === "o1", // only order o1 is busy
    onSessionAction: async () => true,
    onOrderStatus: async () => true,
    onResolveCall: () => {},
    onTransfer: () => {},
    onCollect: () => {},
    onCollectTable: () => {},
    onCancel: () => {},
    onViewOrder: () => {},
  });

  // Order o1 should be busy (disabled)
  assert.ok(html.includes("disabled"), "Busy order o1 must be disabled");
  // Order o2 button should not be disabled
  // Check that not ALL buttons are disabled
  const enabledButtons = (html.match(/<button(?![^>]*disabled)/g) || []).length;
  assert.ok(enabledButtons > 0, "Non-busy items must remain interactive and clickable");
});

const {groupQueueOrders,queueActions,queueQuantity}=load("lib/grouped-order-queue.ts");
test("one table card groups repeat calls only within the same dining session",()=>{
 const base={...sampleOrders[0],items:[{itemId:"tea",name:"Trà",quantity:1,unitPrice:35000,total:35000,extras:[],taste:"",note:""}]};
 const grouped=groupQueueOrders([{...base,id:"first",dining_session_id:"visit-a"},{...base,id:"later",dining_session_id:"visit-a",created_at:base.created_at+1000},{...base,id:"old-visit",dining_session_id:"visit-b"},{...base,id:"legacy",dining_session_id:null}]);
 assert.equal(grouped.length,3);
 assert.equal(grouped.find(group=>group.sessionId==="visit-a").orders.length,2);
 assert.equal(queueQuantity(grouped.find(group=>group.sessionId==="visit-a").stages.new),2);
});

test("partially served lines use exactly three queue states without losing new calls or cancelled history",()=>{
 const base={...sampleOrders[0],dining_session_id:"visit-a",items:[{itemId:"tea",name:"Trà",orderLineId:"tea-line",quantity:5,unitPrice:35000,total:175000,extras:[],taste:"",note:"Ít đá",newCount:1,preparingCount:1,readyCount:1,servedCount:2}]};
 const [group]=groupQueueOrders([{...base,id:"first"},{...base,id:"cancelled",status:"cancelled",created_at:base.created_at+1000},{...base,id:"last",created_at:base.created_at+2000}]);
 assert.equal(queueQuantity(group.stages.new),2);
 assert.equal(queueQuantity(group.stages.waiting),4);
 assert.equal(queueQuantity(group.stages.served),4);
 assert.equal(group.stages.new.at(-1).round,3,"cancelled calls do not renumber later rounds");
 const actions=queueActions(group,"waiting");
 assert.ok(actions.every(action=>action.to==="served"&&["preparing","ready"].includes(action.line.from)));
 assert.equal(actions.some(action=>action.line.order.id==="cancelled"),false);
 assert.deepEqual(queueActions(group,"served"),[]);
});

test("queue UI has three filters, preserves required notes and can hide all area labels",()=>{
 const html=render(OrderQueue,{orders:sampleOrders,tables,permissions:["orders.view"],showZones:false,onOrderStatus:async()=>true,onCancel:()=>{},onViewOrder:()=>{}});
 assert.equal((html.match(/class="oq-filter-btn /g)||[]).length,3);
 assert.match(html,/Cần nhận/);assert.match(html,/Chờ phục vụ/);assert.match(html,/Đã phục vụ/);
 assert.doesNotMatch(html,/oq-zone-select|oq-zone-badge|Tầng 1|Tầng 2/);
 assert.match(html,/Khách dị ứng ớt/);
 assert.doesNotMatch(html,/class="oq-btn-cta/);
});
