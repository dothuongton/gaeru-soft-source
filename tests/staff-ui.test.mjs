/**
 * Permission-aware React output, rendered in memory without a browser, server,
 * network, fake hooks or source-string assertions. These checks complement the
 * real API authorization tests; they do not claim visual/browser verification.
 */
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
  const path = existsSync(candidate)?candidate:candidate.replace(/\.ts$/, ".tsx");
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

const { StaffAccountsPanel } = load("app/staff-accounts-panel.tsx");
const { OpenTableBoard } = load("app/open-table-board.tsx");
const { ALL_PERMISSIONS, ROLE_PRESETS, normalizePermissions } = load("lib/staff-permissions.ts");

const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const text = (html) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const buttons = (html) => Array.from(html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g), (match) => text(match[1]));

function staffAccess(role, changes = {}) {
  const permissions = [...ROLE_PRESETS.find((preset) => preset.id === role).permissions];
  const account = { id: "staff-ui-account", email: "nhanvien@example.test", name: "Nguyễn Minh", role, permissions, status: "active", protected: false, userBound: true, version: 2, createdAt: 1, updatedAt: 2, lastLoginAt: 2 };
  return { authenticated: true, userId: "staff-ui-identity", email: account.email, isStaff: true, isOwner: false, account, permissions, ...changes };
}

const now = Date.parse("2026-10-17T12:00:00Z");
function boardProps(permissions, changes = {}) {
  const tables = [
    { id: "1", name: "Bàn 01", zone: "Sảnh chính", token: "table-one" },
    { id: "2", name: "Bàn 02", zone: "Sảnh chính", token: "table-two" },
  ];
  const sessions = [
    { id: "active-visit", table_id: "1", table_name: "Bàn 01", customer_name: "Khách Mai", status: "active", created_at: now, updated_at: now },
    { id: "pending-visit", table_id: "2", table_name: "Bàn 02", customer_name: "Khách Đạt", status: "pending", created_at: now, updated_at: now },
  ];
  const orders = [{
    id: "new-order", code: "M123", table_id: "1", table_name: "Bàn 01", dining_session_id: "active-visit", customer_name: "Khách Mai",
    items: [{ itemId: "chicken", name: "Cơm gà sốt Mộc", quantity: 1, unitPrice: 65000, total: 65000, extras: [], taste: "", note: "", image: "/images/chicken-rice.webp" }],
    total: 65000, note: "Ít cay", status: "new", paid: 0, paid_at: null, payment_method: "unknown", cancel_reason: "", created_at: now, updated_at: now,
  }];
  const calls = [{ id: "support-call", table_id: "1", table_name: "Bàn 01", session_id: "active-visit", kind: "service", status: "open", created_at: now }];
  const unused = () => { throw new Error("Server rendering must not execute an event handler."); };
  return {
    initialView: "manage", permissions, tables, sessions, orders, calls, transfers: [], working: false, focusTableId: null, focusRevision: 0,
    onSessionAction: unused, onOrderStatus: unused, onCollect: unused, onCollectTable: unused, onCancel: unused, onViewOrder: unused, onResolveCall: unused, onTransfer: unused,
    ...changes,
  };
}

for (const role of ["cashier", "kitchen"]) {
  test(`${role} account page renders the employee's own profile without employee management controls`, () => {
    const html = render(StaffAccountsPanel, { access: staffAccess(role) });
    assert.match(text(html), /TÀI KHOẢN CỦA BẠN/);
    assert.match(text(html), /Nguyễn Minh/);
    assert.match(text(html), /nhanvien@example\.test/);
    assert.match(text(html), new RegExp(role === "cashier" ? "Thu ngân" : "Bếp"));
    assert.equal(buttons(html).includes("Thêm nhân viên"), false);
    assert.equal(buttons(html).includes("Chỉnh quyền"), false);
    assert.doesNotMatch(html, /type="search"/);
    assert.doesNotMatch(html, /aria-label="Liên kết đăng nhập cho nhân viên"/);
    assert.doesNotMatch(html, /<h3[^>]*>Tài khoản nhân viên<\/h3>/);
    assert.match(html, /href="\/signout-with-chatgpt\?return_to=%2F%3Fview%3Dadmin%26tab%3Daccounts"/);
  });
}

test("account manager page renders the employee list heading, add action and login-link sharing field", () => {
  const html = render(StaffAccountsPanel, { access: staffAccess("manager") });
  assert.match(html, /<h3[^>]*>Tài khoản nhân viên<\/h3>/);
  assert.equal(buttons(html).includes("Thêm nhân viên"), true);
  assert.match(html, /type="search"/);
  assert.match(html, /aria-label="Liên kết đăng nhập cho nhân viên"/);
  assert.match(text(html), /Hệ thống không tự gửi thư mời/);
});

test("revoked staff cannot see account manager controls even if a previous permission list remains in component input", () => {
  const html = render(StaffAccountsPanel, { access: staffAccess("manager", { isStaff: false }) });
  assert.match(text(html), /Chưa có quyền quản trị/);
  assert.equal(buttons(html).includes("Thêm nhân viên"), false);
  assert.doesNotMatch(html, /<h3[^>]*>Tài khoản nhân viên<\/h3>/);
  assert.doesNotMatch(html, /aria-label="Liên kết đăng nhập cho nhân viên"/);
});

const mutationButtons = {
  "orders.manage": ["Nhận đơn"],
  "orders.cancel": ["Hủy đơn"],
  "payments.collect": ["Thanh toán cả bàn", "Thanh toán lần này"],
  "tables.manage": ["Duyệt mở bàn", "Từ chối", "Đã hỗ trợ", "Đóng bàn"],
  "tables.transfer": ["Đổi bàn"],
};

test("read-only table board keeps customer, order and support information while omitting every mutation control", () => {
  const html = render(OpenTableBoard, boardProps(["orders.view"]));
  for (const detail of ["Bàn 01", "Khách Mai", "Bàn 02", "Khách Đạt", "Cơm gà sốt Mộc", "Bàn cần hỗ trợ", "M123"]) assert.ok(text(html).includes(detail), detail);
  const labels = buttons(html);
  for (const label of Object.values(mutationButtons).flat()) assert.equal(labels.includes(label), false, label);
  assert.ok(labels.some((label) => label.startsWith("Lịch sử gọi món")));
  assert.match(html, /aria-label="Xem chi tiết đơn M123"/);
});

for (const [permission, expected] of Object.entries(mutationButtons)) {
  test(`table board exposes ${permission} controls only to an employee granted that permission`, () => {
    const allowed = buttons(render(OpenTableBoard, boardProps(normalizePermissions([permission]))));
    for (const label of expected) assert.equal(allowed.includes(label), true, `${permission}: ${label}`);
    for (const [otherPermission, labels] of Object.entries(mutationButtons)) {
      if (otherPermission === permission) continue;
      for (const label of labels) assert.equal(allowed.includes(label), false, `${permission} must not expose ${label}`);
    }
    const denied = buttons(render(OpenTableBoard, boardProps(ALL_PERMISSIONS.filter((value) => value !== permission))));
    for (const label of expected) assert.equal(denied.includes(label), false, `Other permissions must not expose ${label}`);
  });
}

test("paid or cancelled orders do not gain collection or cancellation controls when administrative permissions are present", () => {
  const base = boardProps(ALL_PERMISSIONS);
  for (const order of [
    { ...base.orders[0], status: "served", paid: 1, paid_at: now, payment_method: "cash" },
    { ...base.orders[0], status: "cancelled", paid: 0, cancel_reason: "Khách đổi ý" },
  ]) {
    const html = render(OpenTableBoard, { ...base, orders: [order] });
    const labels = buttons(html);
    for (const label of ["Thanh toán cả bàn", "Thanh toán lần này", "Hủy đơn", "Nhận đơn"]) assert.equal(labels.includes(label), false, `${order.status}: ${label}`);
    assert.equal(labels.includes("Đóng bàn"), true);
    assert.match(html, /aria-label="Xem chi tiết đơn M123"/);
  }
});

test("table overview shows the six approved states and counts only current-session requests",()=>{
 const base=boardProps(ALL_PERMISSIONS);
 const extra={id:"3",name:"Bàn 03",zone:"Sảnh chính",token:"free-table"};
 const html=render(OpenTableBoard,{...base,initialView:"matrix",tables:[...base.tables,extra],calls:[...base.calls,{...base.calls[0],id:"bill",kind:"bill"},{...base.calls[0],id:"stale",session_id:"old-visit",kind:"bill"}]});
 const labels=buttons(html);
 for(const label of ["Tất cả: 3 bàn","Chờ duyệt: 1 bàn","Yêu cầu thanh toán: 1 bàn","Đang phục vụ: 1 bàn","Cần hỗ trợ: 1 bàn","Trống: 1 bàn"])assert.ok(html.includes(`aria-label="${label}"`),label);
 assert.match(html,/aria-label="Dạng lưới"/);
 assert.match(html,/aria-label="Dạng danh sách"/);
 assert.match(html,/aria-label="Mã QR Bàn 03"/);
 assert.equal(labels.includes("Thêm bàn"),false);
});
test("the staff shell keeps only four main navigation items and permission-gates operational tools",()=>{
 const {AdminWorkspace}=load("app/admin-workspace.tsx");
 const {defaultShop}=load("lib/menu.ts");
 const unused=()=>{};
 const props={shop:defaultShop,access:staffAccess("manager"),tab:"orders",onSwitch:unused,onAudio:unused,onListen:unused,soundReady:false,canOrders:true,canTables:true,pendingCount:0,supportCount:0};
 const html=render(AdminWorkspace,props);
 const nav=html.match(/<nav[\s\S]*?<\/nav>/)[0];
 assert.deepEqual(buttons(nav),["Bàn","Đơn món","Hỗ trợ","Cài đặt"]);
 const restricted=render(AdminWorkspace,{...props,canOrders:false,canTables:false});
 assert.doesNotMatch(restricted,/Nghe thử giọng đọc/);
 assert.deepEqual(buttons(restricted.match(/<nav[\s\S]*?<\/nav>/)[0]),["Cài đặt"]);
});


test("staff header has one audio-mode icon, push control, and support without a persistent audio banner",()=>{
 const {AdminWorkspace}=load("app/admin-workspace.tsx");
 const {defaultShop}=load("lib/menu.ts");
 const unused=()=>{};
 for(const [soundMode,label] of [["voice","Giọng nói"],["chime","Âm báo"],["silent","Im lặng"]]){
  const html=render(AdminWorkspace,{shop:defaultShop,access:staffAccess("manager"),tab:"orders",onSwitch:unused,onAudio:unused,onListen:unused,soundReady:false,soundMode,pushControl:React.createElement("button",null,"Bật thông báo đẩy"),canOrders:true,canTables:true,pendingCount:0,supportCount:0});
  const header=html.match(/<header[\s\S]*?<\/header>/)[0];
  assert.match(header,new RegExp("Âm thanh: "+label));
  assert.equal((header.match(/<button/g)||[]).length,4,"account, audio, push and support only");
  assert.doesNotMatch(html,/Chạm để bật âm thanh|Nghe thử giọng đọc/);
 }
});


test("installed staff entry and sign-in redirects retain admin view and store",()=>{
 const {staffManifest}=load("lib/pwa-manifest.ts");
 const {staffReturnUrl}=load("lib/staff-return-url.ts");
 for(const store of ["main","ola-quan"]){
  const manifest=staffManifest(store),start=new URL(manifest.start_url,"https://example.test");
  assert.equal(start.searchParams.get("view"),"admin");
  assert.equal(start.searchParams.get("store")||"main",store);
  assert.equal(manifest.scope,"/");
  assert.equal(manifest.display,"standalone");
 }
 assert.equal(staffReturnUrl("/"),"/?view=admin");
 assert.equal(staffReturnUrl("/?view=menu&store=ola-quan"),"/?view=admin&store=ola-quan");
 assert.equal(staffReturnUrl("/?view=admin&tab=support&store=ola-quan"),"/?view=admin&tab=support&store=ola-quan");
 assert.equal(staffReturnUrl("/gaeru"),"/gaeru");
 for(const value of [null,"https://outside.test/","//outside.test/","/\\outside.test/","/signin"]){assert.equal(staffReturnUrl(value),"/?view=admin");}
 assert.throws(()=>staffManifest("//outside.test"));
});


test("initial staff HTML has a neutral stable shell and no protected data",()=>{
 const {AdminStartup}=load("app/admin-workspace.tsx");
 const html=render(AdminStartup,{});
 assert.match(html,/aria-busy="true"/);
 assert.deepEqual(buttons(html.match(/<nav[\s\S]*?<\/nav>/)[0]),["Bàn","Đơn món","Hỗ trợ","Cài đặt"]);
 assert.equal((html.match(/disabled/g)||[]).length,4);
 assert.doesNotMatch(html,/Bàn 01|0 ₫|customer_name/);
});
