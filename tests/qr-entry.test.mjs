/** Offline QR URL and server-rendered SVG checks; no browser, server or network. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {test} from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const realQr = require("qrcode.react");
const capturedQr = [];
const paths = {
 menu: "../lib/menu.ts",
 storeLinks:"../lib/store-links.ts",
 qrEntry: "../lib/qr-entry.ts",
 tableAdmin: "../app/table-session-admin.tsx",
};
const cache = new Map();
function load(name) {
 if (cache.has(name)) return cache.get(name).exports;
 const module = {exports: {}};
 cache.set(name, module);
 const output = ts.transpileModule(readFileSync(new URL(paths[name], import.meta.url), "utf8"), {
  fileName: paths[name],
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
 }).outputText;
 const resolve = specifier => {
  if (specifier === "./menu" || specifier === "@/lib/menu") return load("menu");
  if (specifier === "@/lib/store-links") return load("storeLinks");
  if (specifier === "@/lib/qr-entry") return load("qrEntry");
  if (specifier.endsWith(".css")) return {};
  if (specifier === "qrcode.react") return {
   ...realQr,
   QRCodeSVG: props => {
    capturedQr.push(props);
    return React.createElement(realQr.QRCodeSVG, props);
   },
  };
  if (["react", "react/jsx-runtime", "lucide-react"].includes(specifier)) return require(specifier);
  throw new Error("Unexpected QR component import: " + specifier);
 };
 new Function("require", "module", "exports", output)(resolve, module, module.exports);
 return module.exports;
}

const {readQrEntry, tableQrPath} = load("qrEntry");
const {OrderError} = load("menu");
const {TableManagement} = load("tableAdmin");
const origin = "https://moc-qr-order.kh-ng-gian-l-9339.chatgpt.site";
const tables = Array.from({length: 12}, (_, index) => ({
 id: String(index + 1),
 name: "Bàn " + String(index + 1).padStart(2, "0"),
 zone: index < 8 ? "Sảnh chính" : "Sân vườn",
 token: createHash("sha256").update("offline-qr-fixture-" + index).digest("hex").slice(0, 40),
}));
const errorWithStatus = status => error => error instanceof OrderError && error.status === status;

test("a bare page is preview-only and parsing does not consume or change view parameters", () => {
 for (const query of ["", "view=menu", "view=admin&tab=tables", "view=orders&campaign=qr-review"]) {
  const params = new URLSearchParams(query), before = params.toString();
  assert.deepEqual(readQrEntry(params), {preview: true, tableToken: null, sessionHint: null});
  assert.equal(params.toString(), before);
 }
 const params = new URLSearchParams({table: tables[0].token, view: "orders", tab: "tables"});
 const before = params.toString();
 assert.deepEqual(readQrEntry(params), {preview: false, tableToken: tables[0].token, sessionHint: null});
 assert.equal(params.toString(), before, "Navigation parameters belong to the caller and must not be rewritten by QR parsing.");
});

test("all twelve table tokens roundtrip through a canonical root link containing only the table", () => {
 const links = tables.map(table => tableQrPath(table.token));
 assert.equal(new Set(links).size, tables.length);
 for (let index = 0; index < tables.length; index++) {
  const url = new URL(links[index], origin + "/?view=admin&tab=tables&session=old-session");
  assert.equal(url.origin, origin);
  assert.equal(url.pathname, "/");
  assert.equal(url.hash, "");
  assert.deepEqual([...url.searchParams], [["table", tables[index].token]]);
  assert.deepEqual(readQrEntry(url.searchParams), {preview: false, tableToken: tables[index].token, sessionHint: null});
 }
});

test("QR URL encoding keeps reserved characters inside one opaque token", () => {
 for (const token of ["legacy:table/A+B?x=1&part=#end", "x".repeat(80)]) {
  const url = new URL(tableQrPath(token), origin);
  assert.equal(url.pathname, "/");
  assert.equal(url.hash, "");
  assert.deepEqual([...url.searchParams], [["table", token]]);
  assert.equal(readQrEntry(url.searchParams).tableToken, token);
 }
});

test("duplicate table or session keys are rejected even if values agree or a key is percent-encoded", () => {
 const token = tables[0].token;
 for (const query of [
  "table=" + token + "&table=" + tables[1].token,
  "table=" + token + "&table=" + token,
  "table=&table=" + token,
  "table=" + token + "&%74able=" + tables[1].token,
  "table=" + token + "&session=visit-a&session=visit-a",
  "table=" + token + "&session=visit-a&%73ession=visit-b",
 ]) assert.throws(() => readQrEntry(new URLSearchParams(query)), errorWithStatus(400), query);
});

test("invalid table tokens cannot be normalized into a different or preview table", () => {
 for (const token of ["", " ", "x".repeat(81), " " + tables[0].token, tables[0].token + "\n", "a\0b", "a\u007fb"]) {
  assert.throws(() => tableQrPath(token), errorWithStatus(404), JSON.stringify(token));
  assert.throws(() => readQrEntry(new URLSearchParams({table: token})), errorWithStatus(404), JSON.stringify(token));
 }
});

test("session hints require a table and a valid identifier while remaining separate from generated QR links", () => {
 for (const hint of ["", " ", "a b", "visit?table=another", "x".repeat(61), "a\0b"]) {
  assert.throws(() => readQrEntry(new URLSearchParams({table: tables[0].token, session: hint})), errorWithStatus(400));
 }
 assert.throws(() => readQrEntry(new URLSearchParams({session: "visit-a"})), errorWithStatus(400));
 for (const hint of ["f346969e-31eb-4cd0-a943-a46f68703c01", "legacy-" + "a".repeat(32), "visit_abc-123"]) {
  const params = new URLSearchParams({table: tables[0].token, session: hint, view: "orders"});
  assert.deepEqual(readQrEntry(params), {preview: false, tableToken: tables[0].token, sessionHint: hint});
  assert.deepEqual([...new URL(tableQrPath(tables[0].token), origin).searchParams], [["table", tables[0].token]]);
 }
});

test("the actual administration component encodes twelve correct table URLs and renders unobstructed square QR codes", () => {
 capturedQr.length = 0;
 const markup = renderToStaticMarkup(React.createElement(TableManagement, {
  tables, sessions: [], orders: [], shopName: "Mộc", origin, working: false,
  onAction: async () => false, onEditTable: () => {}, onViewOrders: () => {},
 }));
 assert.equal(capturedQr.length, tables.length);
 capturedQr.forEach((props, index) => {
  const url = new URL(props.value);
  assert.equal(url.origin, origin);
  assert.equal(url.pathname, "/");
  assert.deepEqual([...url.searchParams], [["table", tables[index].token]]);
  assert.equal(props.marginSize, 4);
  assert.equal(props.level, "M");
  assert.equal(props.imageSettings, undefined, "No logo may cover the table's QR modules.");
  assert.equal(props.title, "QR gọi món " + tables[index].name);
 });
 const svgs = [...markup.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/g)].map(match => match[0]).filter(svg => svg.includes('fill="#163d2e"'));
 assert.equal(svgs.length, tables.length);
 for (const svg of svgs) {
  const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  assert.ok(viewBox);
  const dimension = Number(viewBox[1]);
  assert.equal(dimension, Number(viewBox[2]));
  assert.match(svg, /width="170"/);
  assert.match(svg, /height="170"/);
  assert.match(svg, /<path fill="#FFFFFF"/);
  assert.doesNotMatch(svg, /<image\b/);
  const foreground = /<path fill="#163d2e" d="([^"]+)"/.exec(svg)?.[1];
  assert.ok(foreground);
  const commands = foreground.match(/M[^z]+z/g);
  assert.ok(commands.length > 100, "The QR must contain a real data matrix, not a blank placeholder.");
  for (const command of commands) {
   const rectangle = /^M(\d+)[ ,]+(\d+)\s*h(\d+)v1H(\d+)z$/.exec(command);
   assert.ok(rectangle, "Unexpected SVG cell rectangle: " + command);
   const [, leftText, topText, widthText, closeText] = rectangle;
   const left = Number(leftText), top = Number(topText), width = Number(widthText);
   assert.equal(left, Number(closeText));
   assert.ok(left >= 4 && top >= 4 && left + width <= dimension - 4 && top + 1 <= dimension - 4,
    "Every dark cell must leave a complete four-module white border.");
  }
 }
});

test("new store QR links keep the store while old QR links remain unchanged",()=>{assert.equal(tableQrPath("token-alpha","alpha"),"/?table=token-alpha&store=alpha");assert.equal(tableQrPath("legacy-token"),"/?table=legacy-token");});
