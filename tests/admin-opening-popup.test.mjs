/** Real React server-rendered popup output; no browser, server or fake hooks. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const nodeRequire = createRequire(import.meta.url), cache = new Map();
function load(relativePath) {
  const path = resolve(projectRoot, relativePath);
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", source)((specifier) => {
    if (specifier.endsWith(".css")) return {};
    if (specifier.startsWith("@/")) return load(specifier.slice(2) + ".ts");
    if (specifier.startsWith(".")) return load(resolve(dirname(path), specifier) + ".ts");
    return nodeRequire(specifier);
  }, module, module.exports);
  return module.exports;
}

const { NewOrderPopup } = load("app/admin-order-alerts.tsx");
const { collectOpeningAlerts } = load("lib/admin-opening-alerts.ts");
const { collectOrderAlerts } = load("lib/admin-notifications.ts");
const request = {
  id: "guest-request", table_id: "1", table_name: "Bàn 01", customer_name: "Nguyễn Minh",
  status: "pending", created_at: 1_000,
};
const openingAlert = collectOpeningAlerts([request], new Set()).alerts[0];
const newOrderAlert = collectOrderAlerts([{
  id: "new-order", code: "M123", table_id: "2", table_name: "Bàn 02", dining_session_id: "visit-two",
  customer_name: "Khách Mai", items: [], total: 75_000, note: "", status: "new", paid: 0,
  created_at: 2_000, updated_at: 2_000,
}], new Set()).alerts[0];

function render(alert, changes = {}) {
  const unused = () => { throw new Error("Server rendering must not run event handlers."); };
  return renderToStaticMarkup(React.createElement(NewOrderPopup, {
    alert, waiting: 0, onDismiss: unused, onOpenTable: unused, ...changes,
  }));
}
const plain = (html) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

test("the opening popup identifies the table and customer and directs staff to the pending request", () => {
  const html = render(openingAlert), content = plain(html);
  for (const phrase of ["YÊU CẦU MỞ BÀN MỚI", "Bàn 01 có khách yêu cầu mở bàn", "Nguyễn Minh", "Xem yêu cầu"]) {
    assert.ok(content.includes(phrase), phrase);
  }
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-atomic="true"/);
  assert.match(html, /aria-label="Ẩn thông báo, giữ yêu cầu mở bàn chờ xử lý"/);
  assert.doesNotMatch(content, /CÓ ĐƠN GỌI MÓN MỚI|\d+ đơn mới|75[.,]000/);
});

test("the existing order popup retains its order total, customer, table action and pending-order dismissal wording", () => {
  const html = render(newOrderAlert), content = plain(html);
  for (const phrase of ["CÓ ĐƠN GỌI MÓN MỚI", "Bàn 02 có đơn", "1 đơn mới", "Khách Mai", "Xử lý đơn"]) {
    assert.ok(content.includes(phrase), phrase);
  }
  assert.match(content, /75[.,]000/);
  assert.match(html, /aria-label="Ẩn thông báo, giữ đơn mới trên bàn"/);
  assert.doesNotMatch(content, /YÊU CẦU MỞ BÀN MỚI|Xem yêu cầu/);
});

test("opening notifications share the configured display duration and show the remaining mixed queue count", () => {
  const html = render(openingAlert, { waiting: 2, durationMs: 7_000 });
  assert.match(plain(html), /Còn 2 thông báo/);
  assert.match(html, /animation-duration:7000ms/);
  assert.match(render(openingAlert), /animation-duration:3000ms/);
  assert.doesNotMatch(plain(render(openingAlert)), /Còn 0 thông báo/);
});

test("customer-entered names remain literal text in the opening notification", () => {
  const customerName = '<img src=x onerror="alert(1)">';
  const alert = collectOpeningAlerts([{ ...request, customer_name: customerName }], new Set()).alerts[0];
  const html = render(alert);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html, /<img\b/);
  assert.match(plain(html), /Bàn 01 có khách yêu cầu mở bàn/);
});

test("an empty notification queue renders no popup or live announcement", () => {
  assert.equal(render(null), "");
});
