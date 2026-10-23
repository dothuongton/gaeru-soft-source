/**
 * Direct API integration checks. Run with Node >= 22.13:
 *   node tests/api.integration.test.mjs
 *
 * The real route, server helpers and order rules are transpiled in memory.
 * The generated Drizzle migration runs against an in-memory SQLite database
 * exposed through the D1 methods used by the app. No server or network is used.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import {AsyncLocalStorage} from "node:async_hooks";

const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "https://order.example.test";
const guestA = "a".repeat(48);
const guestB = "b".repeat(48);
const environment = { STAFF_EMAILS: "test@example.test", DB: null };

function loadApp(entry = "route") {
  const cache = new Map();
  const paths = {
    route: "app/api/[...path]/route.ts",
    paidInvoicesServer:"lib/paid-invoices-server.ts",
    serviceReminders:"lib/service-reminders.ts",
    lineTransition:"lib/order-line-transition.ts",
    tableZones:"lib/table-zones.ts",
    tableZonesServer:"lib/table-zones-server.ts",
    storeDatabase:"lib/store-database.ts",storePlatform:"lib/store-platform.ts",
    server: "lib/server.ts",
    menu: "lib/menu.ts",
    auth: "lib/auth.ts",
    authCrypto: "lib/auth-crypto.ts",
    qrEntry: "lib/qr-entry.ts",
    sessions: "lib/table-sessions.ts",
    revenue: "lib/revenue-server.ts",
    revenueTypes: "lib/revenue-types.ts",
    revenueCsv: "lib/revenue-csv.ts",
    settlements: "lib/settlement-server.ts",
    settlementTypes: "lib/settlement-types.ts",
    tablePayments: "lib/table-payment-server.ts",
    tablePaymentTypes: "lib/table-payment-types.ts",
    tableTransfers: "lib/table-transfer-server.ts",
    tableTransferTypes: "lib/table-transfer-types.ts",
    displaySettings: "lib/display-settings.ts",
    displaySettingsServer: "lib/display-settings-server.ts",
    themeSettings: "lib/theme-settings.ts",
    themeSettingsServer: "lib/theme-settings-server.ts",
    conditionalJson: "lib/conditional-json.ts",
    staffPermissions: "lib/staff-permissions.ts",
    staffAccess: "lib/staff-access.ts",
    adminDashboard: "lib/admin-dashboard.ts",
    staffPush: "lib/staff-push.ts",
    workerContext: "lib/worker-context.ts",
    realtimeDo: "lib/realtime-do.ts",
  };
  function load(name) {
    if (cache.has(name)) return cache.get(name).exports;
    const compiledModule = { exports: {} };
    cache.set(name, compiledModule);
    const output = ts.transpileModule(readFileSync(root + paths[name], "utf8"), {
      fileName: paths[name],
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const require = (specifier) => {
      if(specifier.endsWith("/service-reminders"))return load("serviceReminders");
      if(specifier.endsWith("/paid-invoices-server"))return load("paidInvoicesServer");
      if(specifier.endsWith("/order-line-transition"))return load("lineTransition");
      if(specifier.endsWith("/table-zones-server"))return load("tableZonesServer");
      if(specifier.endsWith("/table-zones"))return load("tableZones");
      if(specifier.endsWith("/conditional-json"))return load("conditionalJson");
      if(specifier==="node:async_hooks")return {AsyncLocalStorage};
      if(specifier.endsWith("/store-database"))return load("storeDatabase");
      if(specifier.endsWith("/store-platform"))return load("storePlatform");
      if (specifier === "cloudflare:workers") return { env: environment };
      if (specifier === "@/lib/server" || specifier === "./server") return load("server");
      if (specifier === "@/lib/menu" || specifier === "./menu") return load("menu");
      if (specifier === "@/lib/auth" || specifier === "./auth") return load("auth");
      if (specifier === "./auth-crypto") return load("authCrypto");
      if (specifier === "@/lib/qr-entry" || specifier === "./qr-entry") return load("qrEntry");
      if (specifier === "@/lib/table-sessions" || specifier === "./table-sessions") return load("sessions");
      if (specifier === "@/lib/revenue-server" || specifier === "./revenue-server") return load("revenue");
      if (specifier === "@/lib/revenue-types" || specifier === "./revenue-types") return load("revenueTypes");
      if (specifier === "@/lib/settlement-server" || specifier === "./settlement-server") return load("settlements");
      if (specifier === "@/lib/settlement-types" || specifier === "./settlement-types") return load("settlementTypes");
      if (specifier === "@/lib/table-payment-server" || specifier === "./table-payment-server") return load("tablePayments");
      if (specifier === "@/lib/table-payment-types" || specifier === "./table-payment-types") return load("tablePaymentTypes");
      if (specifier === "@/lib/table-transfer-server" || specifier === "./table-transfer-server") return load("tableTransfers");
      if (specifier === "@/lib/table-transfer-types" || specifier === "./table-transfer-types") return load("tableTransferTypes");
      if (specifier === "@/lib/display-settings" || specifier === "./display-settings") return load("displaySettings");
      if (specifier === "@/lib/display-settings-server" || specifier === "./display-settings-server") return load("displaySettingsServer");
      if (specifier === "@/lib/theme-settings" || specifier === "./theme-settings") return load("themeSettings");
      if (specifier === "@/lib/theme-settings-server" || specifier === "./theme-settings-server") return load("themeSettingsServer");
      if (specifier === "@/lib/staff-permissions" || specifier === "./staff-permissions") return load("staffPermissions");
      if (specifier === "@/lib/staff-access" || specifier === "./staff-access") return load("staffAccess");
      if (specifier === "@/lib/admin-dashboard" || specifier === "./admin-dashboard") return load("adminDashboard");
      if (specifier === "@/lib/staff-push" || specifier === "./staff-push") return load("staffPush");
      if (specifier === "@/lib/worker-context" || specifier === "./worker-context") return load("workerContext");
      if (specifier === "@/lib/realtime-do" || specifier === "./realtime-do") return load("realtimeDo");
      if (specifier === "@block65/webcrypto-web-push") return {
        buildPushPayload: async () => ({
          headers: { authorization: "vapid t=test", ttl: "60", "content-encoding": "aes128gcm" },
          method: "POST",
          body: new Uint8Array([1, 2, 3]),
        }),
      };
      throw new Error(`Unexpected application import: ${specifier}`);
    };
    new Function("require", "module", "exports", output)(require, compiledModule, compiledModule.exports);
    return compiledModule.exports;
  }
  return load(entry);
}

const api = loadApp();
let sqlite;
let initialMenu;
let initialMenuHeaders;
let table;
let currentSession;
let cookieJars;
let beforeWrite;

function hookSql(sql){return sql.replace(/^WITH (?:[a-z_]+ AS \(SELECT \* FROM main\.[a-z_]+ WHERE store_id = '[a-z0-9-]+'\),?)+ /, "").replace(/\bmain\./g, "");}

function d1(sqliteDatabase) {
  const adapter = {
    prepare(sql) {
      let values = [];
      const run = () => {
        const result = sqliteDatabase.prepare(sql).run(...values);
        return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      };
      const statement = {
        sql,
        bind(...args) { values = args; return statement; },
        async first(column) {
          const row = sqliteDatabase.prepare(sql).get(...values);
          return row === undefined ? null : column ? row[column] : row;
        },
        async all() {
          return { success: true, results: sqliteDatabase.prepare(sql).all(...values) };
        },
        async run() {
          if (beforeWrite) await beforeWrite([hookSql(sql)]);
          return run();
        },
        executeInBatch() {
          const compiled = sqliteDatabase.prepare(sql);
          return compiled.columns().length
            ? { success: true, results: compiled.all(...values), meta: {} }
            : run();
        },
      };
      return statement;
    },
    async batch(statements) {
      if (beforeWrite) await beforeWrite(statements.map((statement) => hookSql(statement.sql)));
      sqliteDatabase.exec("BEGIN");
      try {
        const result = [];
        // D1 executes a batch as one transaction; do not yield between its
        // statements and accidentally allow another request inside it.
        for (const statement of statements) result.push(statement.executeInBatch());
        sqliteDatabase.exec("COMMIT");
        return result;
      } catch (error) {
        sqliteDatabase.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return adapter;
}

async function call(method, path, body, options = {}) {
  const headers = new Headers({ origin, ...(method === "GET" ? {} : { "content-type": "application/json" }) });
  const guest = options.guest === undefined ? guestA : options.guest;
  if (guest !== null && cookieJars.has(guest)) headers.set("cookie", cookieJars.get(guest));
  if (options.staff) {
    headers.set("oai-authenticated-user-id", "test-owner-id");
    headers.set("oai-authenticated-user-email", "test@example.test");
  }
  if (options.identity) {
    headers.set("oai-authenticated-user-id", options.identity.id);
    headers.set("oai-authenticated-user-email", options.identity.email);
  }
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (value === null) headers.delete(key);
    else headers.set(key, value);
  }
  const request = new Request(origin + "/api/" + path, {
    method,
    headers,
    ...(method === "GET" ? {} : { body: options.rawBody ?? JSON.stringify(body) }),
  });
  const response = await api[method](request);
  const setCookie = response.headers.get("set-cookie");
  if (setCookie && guest !== null) cookieJars.set(guest, setCookie.split(";")[0]);
  return { status: response.status, headers: response.headers, data: await response.json() };
}

const staffPermissions = [
  "orders.view", "orders.manage", "orders.cancel", "tables.manage", "tables.transfer",
  "payments.collect", "revenue.view", "menu.manage", "settings.manage", "staff.manage",
];

async function grantStaff(permissions, overrides = {}, inviter = { staff: true }) {
  const suffix = crypto.randomUUID();
  const body = { email: `staff-${suffix}@example.test`, name: "Nhân viên kiểm thử", role: "custom", permissions, status: "active", ...overrides };
  const created = await call("POST", "admin/accounts", body, inviter);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const identity = { id: `user-${suffix}`, email: body.email.trim().toLowerCase() };
  const claimed = await call("GET", "account", undefined, { identity });
  assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
  return { account: claimed.data.access.account ?? created.data.account, identity, access: claimed.data.access };
}

function accountUpdate(account, overrides = {}) {
  return { id: account.id, expectedVersion: account.version, name: account.name, role: account.role, permissions: account.permissions, status: account.status, ...overrides };
}

async function accountsList(options = { staff: true }) {
  const response = await call("GET", "admin/accounts", undefined, options);
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
}

function staffStorage() {
  return Object.fromEntries(["staff_accounts", "staff_account_audit"].map((name) => [name, sqlite.prepare(`SELECT * FROM ${name} ORDER BY id`).all().map((row) => ({ ...row }))]));
}

function line(overrides = {}) {
  return { itemId: "chicken", quantity: 1, extras: ["egg"], taste: "", note: "", ...overrides };
}

function checkout(overrides = {}) {
  return { tableToken: table.token, sessionId: currentSession.id, requestId: crypto.randomUUID(), items: [line()], note: "", expectedTotal: 75000, ...overrides };
}

function historyPath(tableToken = table.token, sessionId = currentSession.id) {
  return "orders?table=" + encodeURIComponent(tableToken) + "&session=" + encodeURIComponent(sessionId);
}

function serviceCall(overrides = {}) {
  return { tableToken: table.token, sessionId: currentSession.id, kind: "service", ...overrides };
}

function freshTable() {
  return sqlite.prepare("SELECT * FROM dining_tables WHERE id != ? ORDER BY CAST(id AS INTEGER) LIMIT 1").get(table.id);
}

function insertOrphanOrder(target, overrides = {}) {
  const id = crypto.randomUUID();
  const record = {
    id,
    code: "OLD" + id.slice(0, 5),
    table_id: target.id,
    table_name: target.name,
    dining_session_id: null,
    customer_name: "",
    client_token: "c".repeat(48),
    request_key: "old-worker:" + id,
    request_hash: "0".repeat(64),
    items: JSON.stringify([{ itemId: "chicken", name: "Món của khách trước", quantity: 1, unitPrice: 75000, total: 75000, extras: ["Thêm trứng"], taste: "", note: "", image: "/images/chicken.webp" }]),
    total: 75000,
    note: "Ghi chú riêng của khách trước",
    status: "served",
    paid: 0,
    cancel_reason: "",
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
  const columns = Object.keys(record);
  sqlite.prepare(`INSERT INTO orders (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...columns.map((column) => record[column]));
  return record;
}

function snapshotLine(itemId, name, quantity, unitPrice) {
  return { itemId, name, quantity, unitPrice, total: quantity * unitPrice, extras: [], taste: "", note: "", image: "/images/chicken.webp" };
}

function insertRevenueOrder(target = table, overrides = {}) {
  const total = overrides.total ?? 75000;
  return insertOrphanOrder(target, {
    dining_session_id: target.id === table.id ? currentSession.id : null,
    customer_name: "Khách báo cáo",
    paid_at: null,
    payment_method: "unknown",
    items: JSON.stringify([snapshotLine("chicken", "Cơm gà tại thời điểm đặt", 1, total)]),
    ...overrides,
  });
}

function revenuePath(filters = {}, endpoint = "admin/revenue") {
  return endpoint + "?" + new URLSearchParams(filters).toString();
}

async function revenueReport(filters = {}) {
  const response = await call("GET", revenuePath(filters), undefined, { staff: true });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
}

async function settlementList(filters = {}) {
  const response = await call("GET", revenuePath(filters, "admin/revenue/settlements"), undefined, { staff: true });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
}

async function settlementDetail(sessionId) {
  const response = await call("GET", "admin/revenue/settlements/" + encodeURIComponent(sessionId), undefined, { staff: true });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
}

async function tablePaymentQuote(sessionId = currentSession.id) {
  const response = await call("GET", "admin/table-payment?session=" + encodeURIComponent(sessionId), undefined, { staff: true });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
}

function tablePayment(quote, overrides = {}) {
  return {
    sessionId: quote.session.id,
    requestId: crypto.randomUUID(),
    orderIds: quote.orders.map((order) => order.id),
    expectedTotal: quote.unpaidTotal,
    paymentMethod: "cash",
    ...overrides,
  };
}

async function collectTable(body) {
  return call("PATCH", "admin/table-payment", body, { staff: true });
}

function paymentState(id) {
  return { ...sqlite.prepare("SELECT paid, paid_at, payment_method FROM orders WHERE id = ?").get(id) };
}

function tableTransfer(target = freshTable(), overrides = {}) {
  const session = sqlite.prepare("SELECT * FROM table_sessions WHERE id = ?").get(overrides.sessionId ?? currentSession.id);
  return {
    sessionId: session?.id ?? currentSession.id,
    requestId: crypto.randomUUID(),
    fromTableId: session?.table_id ?? table.id,
    expectedUpdatedAt: session?.updated_at ?? currentSession.updated_at,
    toTableId: target.id,
    ...overrides,
  };
}

function transferTable(body) {
  return call("PATCH", "admin/table-transfer", body, { staff: true });
}

function otherTables() {
  return sqlite.prepare("SELECT * FROM dining_tables WHERE id != ? ORDER BY CAST(id AS INTEGER)").all(table.id);
}

function transferState() {
  return Object.fromEntries(["table_sessions", "orders", "service_requests", "table_payment_receipts", "table_settlements", "table_transfers"].map((name) => [name, sqlite.prepare(`SELECT * FROM ${name} ORDER BY ${name === "table_settlements" ? "session_id" : "id"}`).all().map((row) => ({ ...row }))]));
}

function insertClosedVisit(target = table, overrides = {}) {
  const closedAt = overrides.closed_at ?? Date.parse("2026-10-17T03:00:00Z");
  const session = {
    id: crypto.randomUUID(), table_id: target.id, table_name: target.name,
    browser_hash: "f".repeat(64), customer_name: "Khách lượt cũ", status: "closed",
    created_at: closedAt - 3600000, updated_at: closedAt, closed_at: closedAt,
    ...overrides,
  };
  const columns = Object.keys(session);
  sqlite.prepare(`INSERT INTO table_sessions (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...columns.map((column) => session[column]));
  return session;
}

function assertNoSecrets(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!["client_token", "request_key", "request_hash", "browser_hash", "token"].includes(key), `Private field leaked: ${key}`);
    assertNoSecrets(child);
  }
}

function pauseNextWrite(matches) {
  let notifyReached;
  let release;
  let paused = false;
  const reached = new Promise((resolve) => { notifyReached = resolve; });
  const released = new Promise((resolve) => { release = resolve; });
  beforeWrite = async (statements) => {
    if (!paused && statements.some(matches)) {
      paused = true;
      notifyReached();
      await released;
    }
  };
  return { reached, release };
}

async function requestTable(targetTable, guest = guestA, customerName = "Khách kiểm thử") {
  const scanned = await call("GET", "menu?table=" + targetTable.token, undefined, { guest });
  assert.equal(scanned.status, 200);
  return call("POST", "table-session", { tableToken: targetTable.token, customerName }, { guest });
}

async function openTable(targetTable, guest = guestA, customerName = "Khách kiểm thử") {
  const requested = await requestTable(targetTable, guest, customerName);
  assert.equal(requested.status, 201, JSON.stringify(requested.data));
  const session = requested.data.connection.session;
  assert.equal(session.status, "pending");
  assert.equal((await call("PATCH", "admin/session", { id: session.id, action: "approve" }, { staff: true })).status, 200);
  return { ...session, status: "active" };
}

function rowCount(name) {
  assert.ok(["orders", "service_requests", "dining_tables", "menu_items", "table_sessions", "table_settlements", "table_payment_receipts", "table_transfers"].includes(name));
  return sqlite.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get().count;
}

beforeEach(async () => {
  sqlite = new DatabaseSync(":memory:");
  const migrations = readdirSync(root + "drizzle").filter((name) => name.endsWith(".sql")).sort();
  assert.ok(migrations.length > 0, "Generate the checked-in Drizzle migration before running integration checks.");
  for (const migration of migrations) sqlite.exec(readFileSync(root + "drizzle/" + migration, "utf8"));
  environment.DB = d1(sqlite);
  environment.STAFF_EMAILS = "test@example.test";
  beforeWrite = null;
  cookieJars = new Map();
  const menu = await call("GET", "menu");
  assert.equal(menu.status, 200);
  initialMenu = menu.data;
  initialMenuHeaders = menu.headers;
  table = menu.data.table;
  currentSession = await openTable(table);
});

afterEach(() => {
  environment.DB = null;
  sqlite?.close();
});

test("menu bootstraps the real schema and repeated reads do not duplicate seed data", async () => {
  assert.equal(initialMenu.items.length, 7);
  assert.equal(initialMenu.preview, true);
  assert.equal(initialMenu.isStaff, false);
  const menu = await call("GET", "menu?table=" + table.token);
  assert.equal(menu.status, 200);
  assert.equal(menu.data.preview, false);
  assert.equal(menu.data.table.id, table.id);
  assert.equal(menu.headers.get("cache-control"), "no-store");
  assert.equal(rowCount("menu_items"), 7);
  assert.equal(rowCount("dining_tables"), 12);
});

test("existing installations get the current display defaults without creating a settings row on reads", async () => {
  const defaults = { popupSeconds: 3, fontPercent: 200, foodImagePercent: 200 };
  assert.deepEqual(initialMenu.displaySettings, defaults);
  assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("display-settings"), undefined);
  const admin = await call("GET", "admin", undefined, { staff: true });
  assert.equal(admin.status, 200);
  assert.deepEqual(admin.data.displaySettings, defaults);
  assert.equal(admin.headers.get("cache-control"), "no-store");
  assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("display-settings"), undefined);
});

test("display settings persist at both inclusive bounds and reach public menu and staff board responses", async () => {
  for (const settings of [
    { popupSeconds: 1, fontPercent: 100, foodImagePercent: 100 },
    { popupSeconds: 30, fontPercent: 250, foodImagePercent: 250 },
    { popupSeconds: 7, fontPercent: 175, foodImagePercent: 225 },
  ]) {
    const saved = await call("PATCH", "admin/display-settings", settings, { staff: true });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.deepEqual(saved.data, { ok: true, displaySettings: settings });
    assert.deepEqual(JSON.parse(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("display-settings").value), settings);
    const menu = await call("GET", "menu?table=" + table.token, undefined, { guest: guestB });
    const admin = await call("GET", "admin", undefined, { staff: true });
    assert.equal(menu.status, 200);
    assert.equal(admin.status, 200);
    assert.deepEqual(menu.data.displaySettings, settings);
    assert.deepEqual(admin.data.displaySettings, settings);
    assert.equal(menu.headers.get("cache-control"), "no-store");
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM settings WHERE key = ?").get("display-settings").count, 1);
});

test("display setting validation rejects missing fields, coercions, fractions and out-of-range values without altering saved settings", async () => {
  const saved = { popupSeconds: 4, fontPercent: 150, foodImagePercent: 225 };
  assert.equal((await call("PATCH", "admin/display-settings", saved, { staff: true })).status, 200);
  const invalid = [{}, null, [], ...Object.keys(saved).map((key) => Object.fromEntries(Object.entries(saved).filter(([name]) => name !== key)))];
  for (const key of Object.keys(saved)) {
    const bounds = key === "popupSeconds" ? [0, 31] : [99, 251];
    for (const value of [...bounds, 1.5, "200", true, false, null, {}, []]) invalid.push({ ...saved, [key]: value });
  }
  for (const value of invalid) {
    const result = await call("PATCH", "admin/display-settings", value, { staff: true });
    assert.equal(result.status, 400, JSON.stringify(value));
    assert.deepEqual(JSON.parse(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("display-settings").value), saved);
  }
});

test("display setting saves discard unsupported properties instead of leaking them into shared configuration", async () => {
  const settings = { popupSeconds: 5, fontPercent: 160, foodImagePercent: 240 };
  const result = await call("PATCH", "admin/display-settings", { ...settings, open: false, shop: { name: "Injected" }, privateToken: "must-not-persist" }, { staff: true });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.displaySettings, settings);
  assert.deepEqual(JSON.parse(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("display-settings").value), settings);
  assert.deepEqual((await call("GET", "menu")).data.shop, initialMenu.shop);
});

test("only same-origin authorized staff can save display settings", async () => {
  const settings = { popupSeconds: 6, fontPercent: 150, foodImagePercent: 150 };
  const rejected = [
    {},
    { identity: { id: "guest-unlisted-account", email: "guest@example.test" } },
    { staff: true, headers: { origin: "https://untrusted.example.test" } },
    { staff: true, headers: { "sec-fetch-site": "cross-site" } },
  ];
  for (const options of rejected) assert.equal((await call("PATCH", "admin/display-settings", settings, options)).status, 403);
  assert.equal((await call("PATCH", "admin/display-settings", settings, { staff: true, headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("display-settings"), undefined);
  environment.STAFF_EMAILS = "";
  assert.equal((await call("PATCH", "admin/display-settings", settings, { staff: true })).status, 403);
});

test("shop edits, seed retries and repeated board polling preserve display configuration independently", async () => {
  const settings = { popupSeconds: 8, fontPercent: 180, foodImagePercent: 220 };
  assert.equal((await call("PATCH", "admin/display-settings", settings, { staff: true })).status, 200);
  const shop = { ...initialMenu.shop, name: "Quán kiểm thử", open: false };
  assert.equal((await call("PATCH", "admin/shop", { ...shop, displaySettings: { popupSeconds: 1, fontPercent: 100, foodImagePercent: 100 } }, { staff: true })).status, 200);
  sqlite.prepare("DELETE FROM settings WHERE key = ?").run("seeded-v1");
  for (let index = 0; index < 3; index++) {
    const menu = await call("GET", "menu");
    const admin = await call("GET", "admin", undefined, { staff: true });
    assert.deepEqual(menu.data.shop, shop);
    assert.deepEqual(admin.data.shop, shop);
    assert.deepEqual(menu.data.displaySettings, settings);
    assert.deepEqual(admin.data.displaySettings, settings);
  }
  const next = { popupSeconds: 9, fontPercent: 125, foodImagePercent: 175 };
  assert.equal((await call("PATCH", "admin/display-settings", next, { staff: true })).status, 200);
  assert.deepEqual((await call("GET", "menu")).data.shop, shop);
  assert.equal(rowCount("menu_items"), 7);
  assert.equal(rowCount("dining_tables"), 12);
});

test("malformed or obsolete stored display settings fall back safely without rewriting the stored value", async () => {
  const defaults = { popupSeconds: 3, fontPercent: 200, foodImagePercent: 200 };
  for (const raw of ["broken-json", "null", "[]", '"200"', "{}", '{"popupSeconds":5}', '{"popupSeconds":5,"fontPercent":"200","foodImagePercent":200}', '{"popupSeconds":31,"fontPercent":200,"foodImagePercent":200}']) {
    sqlite.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(store_id,key) DO UPDATE SET value = excluded.value").run("display-settings", raw);
    const menu = await call("GET", "menu");
    const admin = await call("GET", "admin", undefined, { staff: true });
    assert.equal(menu.status, 200);
    assert.equal(admin.status, 200);
    assert.deepEqual(menu.data.displaySettings, defaults);
    assert.deepEqual(admin.data.displaySettings, defaults);
    assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("display-settings").value, raw);
  }
});

test("a failed display settings insert or replacement cannot partially apply the new configuration", async () => {
  const settings = { popupSeconds: 10, fontPercent: 140, foodImagePercent: 210 };
  sqlite.exec("CREATE TRIGGER fail_display_insert BEFORE INSERT ON settings WHEN NEW.key = 'display-settings' BEGIN SELECT RAISE(ABORT,'Simulated display settings insert failure'); END;");
  assert.equal((await call("PATCH", "admin/display-settings", settings, { staff: true })).status, 500);
  assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("display-settings"), undefined);
  sqlite.exec("DROP TRIGGER fail_display_insert");
  assert.equal((await call("PATCH", "admin/display-settings", settings, { staff: true })).status, 200);
  sqlite.exec("CREATE TRIGGER fail_display_update BEFORE UPDATE ON settings WHEN NEW.key = 'display-settings' BEGIN SELECT RAISE(ABORT,'Simulated display settings update failure'); END;");
  assert.equal((await call("PATCH", "admin/display-settings", { popupSeconds: 20, fontPercent: 250, foodImagePercent: 100 }, { staff: true })).status, 500);
  assert.deepEqual((await call("GET", "menu")).data.displaySettings, settings);
  assert.deepEqual((await call("GET", "admin", undefined, { staff: true })).data.displaySettings, settings);
  assert.deepEqual((await call("GET", "menu")).data.shop, initialMenu.shop);
});

test("concurrent staff saves leave one complete display configuration rather than a mixture of individual fields", async () => {
  const choices = [
    { popupSeconds: 2, fontPercent: 100, foodImagePercent: 250 },
    { popupSeconds: 25, fontPercent: 250, foodImagePercent: 100 },
  ];
  const results = await Promise.all(choices.map((settings) => call("PATCH", "admin/display-settings", settings, { staff: true })));
  for (let index = 0; index < results.length; index++) {
    assert.equal(results[index].status, 200);
    assert.deepEqual(results[index].data.displaySettings, choices[index]);
  }
  const actual = (await call("GET", "menu")).data.displaySettings;
  assert.ok(choices.some((choice) => JSON.stringify(choice) === JSON.stringify(actual)));
  assert.deepEqual((await call("GET", "admin", undefined, { staff: true })).data.displaySettings, actual);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM settings WHERE key = ?").get("display-settings").count, 1);
});

test("existing installations receive theme defaults without a settings write", async () => {
  const defaults = { accentColor: "#244f3c", textColor: "#27382e" };
  assert.deepEqual(initialMenu.themeSettings, defaults);
  const admin = await call("GET", "admin", undefined, { staff: true });
  assert.equal(admin.status, 200);
  assert.deepEqual(admin.data.themeSettings, defaults);
  assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("theme-settings"), undefined);
});

test("theme saves canonicalize hex case and expose complete colors to menu and staff clients", async () => {
  for (const submitted of [
    { accentColor: "#000000", textColor: "#FFFFFF" },
    { accentColor: "#aBcDeF", textColor: "#123456" },
    { accentColor: "#ffffff", textColor: "#000000" },
  ]) {
    const canonical = { accentColor: submitted.accentColor.toLowerCase(), textColor: submitted.textColor.toLowerCase() };
    const saved = await call("PATCH", "admin/theme-settings", submitted, { staff: true });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.deepEqual(saved.data, { ok: true, themeSettings: canonical });
    assert.deepEqual(JSON.parse(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("theme-settings").value), canonical);
    assert.deepEqual((await call("GET", "menu?table=" + table.token, undefined, { guest: guestB })).data.themeSettings, canonical);
    assert.deepEqual((await call("GET", "admin", undefined, { staff: true })).data.themeSettings, canonical);
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM settings WHERE key = ?").get("theme-settings").count, 1);
});

test("theme validation rejects incomplete colors, CSS injection and coerced values without changing saved colors", async () => {
  const saved = { accentColor: "#1f4f93", textColor: "#263449" };
  assert.equal((await call("PATCH", "admin/theme-settings", saved, { staff: true })).status, 200);
  const invalid = [{}, null, [], { accentColor: saved.accentColor }, { textColor: saved.textColor }];
  for (const key of Object.keys(saved)) {
    for (const value of ["", "#fff", "123456", "#12345", "#1234567", "#gggggg", "#123456 ", "#123456\n", "#123456\r\n", " #123456", "red", "rgb(0,0,0)", "var(--theme)", "#123456; background:url(https://example.test)", 123456, true, false, null, {}, []]) invalid.push({ ...saved, [key]: value });
  }
  for (const value of invalid) {
    const result = await call("PATCH", "admin/theme-settings", value, { staff: true });
    assert.equal(result.status, 400, JSON.stringify(value));
    assert.deepEqual(JSON.parse(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("theme-settings").value), saved);
  }
});

test("only same-origin authorized staff may save theme colors", async () => {
  const settings = { accentColor: "#65428f", textColor: "#352d43" };
  const rejected = [
    {},
    { identity: { id: "guest-unlisted-account", email: "guest@example.test" } },
    { staff: true, headers: { origin: "https://untrusted.example.test" } },
    { staff: true, headers: { "sec-fetch-site": "cross-site" } },
  ];
  for (const options of rejected) assert.equal((await call("PATCH", "admin/theme-settings", settings, options)).status, 403);
  assert.equal((await call("PATCH", "admin/theme-settings", settings, { staff: true, headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("theme-settings"), undefined);
  environment.STAFF_EMAILS = "";
  assert.equal((await call("PATCH", "admin/theme-settings", settings, { staff: true })).status, 403);
});

test("theme saves project only supported fields while shop, display settings and seed retries remain independent", async () => {
  const theme = { accentColor: "#995035", textColor: "#3f3028" };
  const display = { popupSeconds: 19, fontPercent: 175, foodImagePercent: 225 };
  const shop = { ...initialMenu.shop, name: "Mộc sắc màu", open: false };
  assert.equal((await call("PATCH", "admin/display-settings", display, { staff: true })).status, 200);
  const saved = await call("PATCH", "admin/theme-settings", { ...theme, popupSeconds: 1, displaySettings: {}, shop: {}, privateToken: "must-not-persist" }, { staff: true });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data, { ok: true, themeSettings: theme });
  assert.deepEqual(JSON.parse(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("theme-settings").value), theme);
  assert.equal((await call("PATCH", "admin/shop", { ...shop, themeSettings: { accentColor: "#000000", textColor: "#ffffff" } }, { staff: true })).status, 200);
  sqlite.prepare("DELETE FROM settings WHERE key = ?").run("seeded-v1");
  for (let index = 0; index < 3; index++) {
    for (const result of [await call("GET", "menu"), await call("GET", "admin", undefined, { staff: true })]) {
      assert.equal(result.status, 200);
      assert.deepEqual(result.data.themeSettings, theme);
      assert.deepEqual(result.data.displaySettings, display);
      assert.deepEqual(result.data.shop, shop);
    }
  }
  assert.equal((await call("PATCH", "admin/display-settings", { ...display, fontPercent: 250 }, { staff: true })).status, 200);
  assert.deepEqual((await call("GET", "menu")).data.themeSettings, theme);
  assert.equal(rowCount("menu_items"), 7);
  assert.equal(rowCount("dining_tables"), 12);
});

test("broken saved themes fall back safely and valid legacy case is normalized without a write", async () => {
  const defaults = { accentColor: "#244f3c", textColor: "#27382e" };
  for (const raw of ["broken-json", "null", "[]", '"#244f3c"', "{}", '{"accentColor":"#244f3c"}', '{"accentColor":"#fff","textColor":"#27382e"}', '{"accentColor":"#244f3c","textColor":123456}']) {
    sqlite.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(store_id,key) DO UPDATE SET value = excluded.value").run("theme-settings", raw);
    assert.deepEqual((await call("GET", "menu")).data.themeSettings, defaults);
    assert.deepEqual((await call("GET", "admin", undefined, { staff: true })).data.themeSettings, defaults);
    assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("theme-settings").value, raw);
  }
  const raw = '{"accentColor":"#ABCDEF","textColor":"#FEDCBA","unsupported":"ignored"}';
  sqlite.prepare("UPDATE settings SET value = ? WHERE key = ?").run(raw, "theme-settings");
  assert.deepEqual((await call("GET", "menu")).data.themeSettings, { accentColor: "#abcdef", textColor: "#fedcba" });
  assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("theme-settings").value, raw);
});

test("failed theme inserts and replacements retain the prior complete configuration", async () => {
  const saved = { accentColor: "#1f4f93", textColor: "#263449" };
  sqlite.exec("CREATE TRIGGER fail_theme_insert BEFORE INSERT ON settings WHEN NEW.key = 'theme-settings' BEGIN SELECT RAISE(ABORT,'Simulated theme settings insert failure'); END;");
  assert.equal((await call("PATCH", "admin/theme-settings", saved, { staff: true })).status, 500);
  assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("theme-settings"), undefined);
  sqlite.exec("DROP TRIGGER fail_theme_insert");
  assert.equal((await call("PATCH", "admin/theme-settings", saved, { staff: true })).status, 200);
  sqlite.exec("CREATE TRIGGER fail_theme_update BEFORE UPDATE ON settings WHEN NEW.key = 'theme-settings' BEGIN SELECT RAISE(ABORT,'Simulated theme settings update failure'); END;");
  assert.equal((await call("PATCH", "admin/theme-settings", { accentColor: "#995035", textColor: "#3f3028" }, { staff: true })).status, 500);
  assert.deepEqual((await call("GET", "menu")).data.themeSettings, saved);
  assert.deepEqual((await call("GET", "admin", undefined, { staff: true })).data.themeSettings, saved);
  assert.deepEqual((await call("GET", "menu")).data.shop, initialMenu.shop);
});

test("competing theme saves leave one entire color pair instead of a mix", async () => {
  const choices = [
    { accentColor: "#995035", textColor: "#3f3028" },
    { accentColor: "#65428f", textColor: "#352d43" },
  ];
  const results = await Promise.all(choices.map(settings => call("PATCH", "admin/theme-settings", settings, { staff: true })));
  results.forEach((result, index) => {
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.themeSettings, choices[index]);
  });
  const actual = (await call("GET", "menu")).data.themeSettings;
  assert.ok(choices.some(choice => JSON.stringify(choice) === JSON.stringify(actual)));
  assert.deepEqual((await call("GET", "admin", undefined, { staff: true })).data.themeSettings, actual);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM settings WHERE key = ?").get("theme-settings").count, 1);
});

test("theme foreground helper selects readable neutral labels for dark, light and intermediate accent colors", () => {
  const { readableForeground, contrastRatio, normalizeThemeSettings, isThemeSettings } = loadApp("themeSettings");
  assert.equal(readableForeground("#000000"), "#ffffff");
  assert.equal(readableForeground("#ffffff"), "#000000");
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  for (const color of ["#244f3c", "#777777", "#ff0000", "#ffff00", "#00ffff", "#0000ff", "#65428f"]) {
    assert.ok(contrastRatio(color, readableForeground(color)) >= 4.5, color);
  }
  assert.equal(isThemeSettings({ accentColor: "red", textColor: "#27382e" }), false);
  assert.deepEqual(normalizeThemeSettings(null), { accentColor: "#244f3c", textColor: "#27382e" });
});

test("checkout persists authoritative menu prices and extras despite forged client price fields", async () => {
  const submitted = checkout({
    items: [line({ quantity: 2, extras: ["egg", "rice"], price: 1, unitPrice: 1, total: 2 }), line({ itemId: "coffee", quantity: 1, extras: ["large"], taste: "Ít ngọt", price: 0 })],
    expectedTotal: 225000,
    note: "  Mang món cùng lúc  ",
  });
  const response = await call("POST", "orders", submitted);
  assert.equal(response.status, 201);
  const order = response.data.order;
  assert.equal(order.total, 225000);
  assert.deepEqual(order.items.map((item) => [item.unitPrice, item.total]), [[90000, 180000], [45000, 45000]]);
  assert.deepEqual(order.items[0].extras, ["Thêm trứng", "Thêm phần ăn kèm"]);
  assert.equal(order.note, "Mang món cùng lúc");
  assert.equal(order.status, "new");
  assert.equal(order.table_id, table.id);
  for (const secret of ["client_token", "request_key", "request_hash"]) assert.equal(secret in order, false);
  assert.equal(rowCount("orders"), 1);
  assert.equal(sqlite.prepare("SELECT total FROM orders").get().total, 225000);
});

test("identical concurrent retries create exactly one order, while changed retries conflict", async () => {
  const submitted = checkout();
  const responses = await Promise.all([call("POST", "orders", submitted), call("POST", "orders", submitted)]);
  assert.ok(responses.every((response) => [200, 201].includes(response.status)));
  assert.equal(responses[0].data.order.id, responses[1].data.order.id);
  assert.equal(rowCount("orders"), 1);
  const replay = await call("POST", "orders", submitted);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replayed, true);
  const changed = await call("POST", "orders", { ...submitted, note: "Changed after submitting" });
  assert.equal(changed.status, 409);
  assert.equal(rowCount("orders"), 1);
});

test("checkout request IDs must be strings with the complete UUID shape", async () => {
  const invalid = [undefined, null, 42, true, {}, [], [crypto.randomUUID()], "-".repeat(36), "a".repeat(36), crypto.randomUUID().replaceAll("-", ""), " " + crypto.randomUUID()];
  for (const requestId of invalid) {
    const denied = await call("POST", "orders", checkout({ requestId }));
    assert.equal(denied.status, 400, JSON.stringify(requestId));
  }
  assert.equal(rowCount("orders"), 0);
  const requestId = crypto.randomUUID().toUpperCase();
  const body = checkout({ requestId });
  const created = await call("POST", "orders", body);
  assert.equal(created.status, 201);
  const replay = await call("POST", "orders", body);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.order.id, created.data.order.id);
  assert.equal(rowCount("orders"), 1);
});

test("invalid quantities, excessive units, extras, taste and unknown items are rejected without writes", async () => {
  const cases = [
    ...[0, -1, 1.5, 21, "2", null].map((quantity) => ({ items: [line({ quantity })], status: 400 })),
    { items: [line({ extras: ["free-discount"] })], status: 400 },
    { items: [line({ extras: ["egg", "egg"] })], status: 400 },
    { items: [line({ extras: "egg" })], status: 400 },
    { items: [line({ itemId: "coffee", extras: [], taste: "invalid" })], status: 400 },
    { items: [line({ taste: "Vừa vị" })], status: 400 },
    { items: [line({ note: "x".repeat(241) })], status: 400 },
    { items: [line({ itemId: "nonexistent-item" })], status: 409 },
    { items: [], status: 400 },
    { items: Array.from({ length: 31 }, () => line()), status: 400 },
    { items: [line({ quantity: 20 }), line({ quantity: 20 }), line({ quantity: 20 }), line()], status: 400 },
  ];
  for (const invalid of cases) {
    const response = await call("POST", "orders", checkout({ items: invalid.items }));
    assert.equal(response.status, invalid.status, JSON.stringify(invalid.items));
  }
  const stalePrice = await call("POST", "orders", checkout({ expectedTotal: 1 }));
  assert.equal(stalePrice.status, 409);
  assert.equal(rowCount("orders"), 0);
});

test("an item made unavailable by staff cannot be ordered from a stale guest menu", async () => {
  assert.equal((await call("PATCH", "admin/item", { id: "chicken", toggle: 0 }, { staff: true })).status, 200);
  const response = await call("POST", "orders", checkout());
  assert.equal(response.status, 409);
  assert.match(response.data.error, /hết/);
  assert.equal(rowCount("orders"), 0);
});

test("guest history requires ownership of the active session and its table", async () => {
  const created = await call("POST", "orders", checkout());
  const own = await call("GET", historyPath());
  assert.equal(own.data.orders[0].id, created.data.order.id);
  const otherGuest = await call("GET", historyPath(), undefined, { guest: guestB });
  assert.equal(otherGuest.status, 403);
  assert.equal(otherGuest.data.orders, undefined);
  const otherTable = sqlite.prepare("SELECT token FROM dining_tables WHERE id != ? LIMIT 1").get(table.id);
  assert.equal((await call("GET", historyPath(otherTable.token))).status, 403);
  assert.equal((await call("GET", historyPath(), undefined, { guest: null })).status, 403);
  assert.equal((await call("GET", "orders?table=" + table.token)).status, 403);
  assert.equal((await call("POST", "orders", checkout(), { guest: "uninitialized-browser" })).status, 403);
  assert.equal(rowCount("orders"), 1);
});

test("invalid or absent QR table tokens cannot retrieve history, submit orders or call staff", async () => {
  assert.equal((await call("GET", "menu?table=invalid-qr-token")).status, 404);
  assert.equal((await call("GET", "menu?table=")).status, 404);
  assert.equal((await call("GET", "orders")).status, 404);
  assert.equal((await call("GET", "orders?table=")).status, 404);
  assert.equal((await call("POST", "orders", checkout({ tableToken: "invalid-qr-token" }))).status, 404);
  assert.equal((await call("POST", "calls", serviceCall({ tableToken: "invalid-qr-token" }))).status, 404);
  assert.equal(rowCount("orders"), 0);
  assert.equal(rowCount("service_requests"), 0);
});

test("generated QR links resolve all physical tables exactly and never include a customer's session", async () => {
  const { readQrEntry, tableQrPath } = loadApp("qrEntry");
  const tables = sqlite.prepare("SELECT * FROM dining_tables ORDER BY CAST(id AS INTEGER)").all();
  for (const physical of tables) {
    const qr = new URL(tableQrPath(physical.token), origin);
    assert.equal(qr.pathname, "/");
    assert.deepEqual([...qr.searchParams.keys()], ["table"]);
    assert.deepEqual(readQrEntry(qr.searchParams), { preview: false, tableToken: physical.token, sessionHint: null });
    const resolved = await call("GET", "menu" + qr.search);
    assert.equal(resolved.status, 200, physical.name);
    assert.equal(resolved.data.table.id, physical.id);
    assert.equal(resolved.data.table.token, physical.token);
    assert.equal(resolved.data.preview, false);
    assert.equal(resolved.data.connection.state, physical.id === table.id ? "active" : "available");
  }
  assert.equal(rowCount("table_sessions"), 1, "Scanning alone must not reserve or open any other table.");
});

test("bare menu remains a preview even when this browser owns a live visit", async () => {
  const { readQrEntry } = loadApp("qrEntry");
  for (const suffix of ["", "?view=menu", "?view=admin&tab=tables"]) {
    assert.deepEqual(readQrEntry(new URLSearchParams(suffix)), { preview: true, tableToken: null, sessionHint: null });
    const menu = await call("GET", "menu" + suffix);
    assert.equal(menu.status, 200);
    assert.equal(menu.data.preview, true);
    assert.deepEqual(menu.data.connection, { state: "preview" });
  }
});

test("ambiguous QR query parameters are rejected before a table or session can be selected", async () => {
  const { readQrEntry } = loadApp("qrEntry");
  const other = freshTable();
  const valid = new URLSearchParams({ table: table.token, session: currentSession.id });
  const queries = [
    "table=" + table.token + "&table=" + other.token,
    "table=" + other.token + "&table=" + table.token,
    "table=" + table.token + "&table=" + table.token,
    "table=&table=" + table.token,
    "table=" + table.token + "&%74able=" + other.token,
    valid.toString() + "&session=" + currentSession.id,
    valid.toString() + "&session=" + crypto.randomUUID(),
    "session=" + currentSession.id,
    "table=" + table.token + "&session=",
    "table=" + table.token + "&session=" + "x".repeat(61),
    "table=" + table.token + "&session=%20" + currentSession.id,
  ];
  for (const query of queries) {
    assert.throws(() => readQrEntry(new URLSearchParams(query)), /QR|Liên kết/);
    for (const endpoint of ["menu", "orders"]) {
      const response = await call("GET", endpoint + "?" + query);
      assert.equal(response.status, 400, endpoint + ": " + query);
      assert.equal(response.data.connection, undefined);
      assert.equal(response.data.orders, undefined);
      assert.equal(response.headers.get("set-cookie"), null);
    }
  }
  assert.equal(rowCount("table_sessions"), 1);
  assert.equal(rowCount("orders"), 0);
});

test("blank, oversized, whitespace and control-character QR table tokens never fall back to the preview table", async () => {
  const { readQrEntry, tableQrPath } = loadApp("qrEntry");
  for (const value of ["", " ", "x".repeat(81), " " + table.token, table.token + "\n", "\0" + table.token]) {
    const query = new URLSearchParams({ table: value });
    assert.throws(() => readQrEntry(query), /Mã bàn không hợp lệ/);
    assert.throws(() => tableQrPath(value), /Mã bàn không hợp lệ/);
    const response = await call("GET", "menu?" + query);
    assert.equal(response.status, 404, JSON.stringify(value));
    assert.equal(response.data.table, undefined);
  }
});

test("customer history retains every order in a long open visit beyond the previous 40-order limit", async () => {
  const now = Date.now();
  const expectedIds = [];
  for (let index = 0; index < 47; index++) {
    expectedIds.push(insertRevenueOrder(table, {
      client_token: sqlite.prepare("SELECT browser_hash FROM table_sessions WHERE id = ?").get(currentSession.id).browser_hash,
      total: 1000 + index,
      created_at: now - index * 1000,
      status: index % 3 === 0 ? "new" : "served",
    }).id);
  }
  const other = freshTable();
  insertRevenueOrder(other, { note: "Another table's history must remain private" });
  const history = await call("GET", historyPath());
  assert.equal(history.status, 200);
  assert.deepEqual(history.data.orders.map(order => order.id), expectedIds);
  assert.equal(history.data.orders.reduce((sum, order) => sum + order.total, 0), 47 * 1000 + 46 * 47 / 2);
  assert.ok(history.data.orders.every(order => order.dining_session_id === currentSession.id && order.table_id === table.id));
  assertNoSecrets(history.data);
  assert.equal((await call("GET", historyPath(), undefined, { guest: guestB })).status, 403);
});

test("all administrative endpoints require the allowed staff identity", async () => {
  assert.equal((await call("GET", "admin")).status, 403);
  assert.equal((await call("GET", "admin", undefined, { headers: { "oai-authenticated-user-email": "test@example.test" } })).status, 403);
  assert.equal((await call("GET", "admin", undefined, { headers: { "oai-authenticated-user-id": "other-user", "oai-authenticated-user-email": "other@example.test" } })).status, 403);
  for (const endpoint of ["order", "call", "item", "shop", "table", "session"]) {
    assert.equal((await call("PATCH", "admin/" + endpoint, {})).status, 403, endpoint);
  }
  environment.STAFF_EMAILS = "";
  assert.equal((await call("GET", "admin", undefined, { staff: true })).status, 403);
  environment.STAFF_EMAILS = "test@example.test";
  assert.equal((await call("GET", "admin", undefined, { staff: true })).status, 200);
});

test("orders progress through preparation and service while skipped or reversed transitions fail", async () => {
  const created = await call("POST", "orders", checkout());
  const id = created.data.order.id;
  const transition = (status) => call("PATCH", "admin/order", { id, status }, { staff: true });
  assert.equal((await transition("ready")).status, 409);
  assert.equal((await transition("preparing")).status, 200);
  assert.equal((await transition("new")).status, 409);
  assert.equal((await transition("ready")).status, 200);
  assert.equal((await transition("served")).status, 200);
  assert.equal((await transition("cancelled")).status, 409);
  assert.equal((await call("PATCH", "admin/order", { id, action: "paid" }, { staff: true })).status, 200);
  const order = (await call("GET", historyPath())).data.orders[0];
  assert.equal(order.status, "served");
  assert.equal(order.paid, 1);
});

test("cancellation needs a reason, cancelled orders cannot be paid, and paid orders cannot be cancelled", async () => {
  const created = await call("POST", "orders", checkout());
  const id = created.data.order.id;
  assert.equal((await call("PATCH", "admin/order", { id, status: "cancelled", reason: " " }, { staff: true })).status, 400);
  assert.equal((await call("PATCH", "admin/order", { id, status: "cancelled", reason: "Khách đổi ý" }, { staff: true })).status, 200);
  assert.equal((await call("PATCH", "admin/order", { id, action: "paid" }, { staff: true })).status, 409);
  assert.equal((await call("PATCH", "admin/order", { id, status: "preparing" }, { staff: true })).status, 409);
  const cancelled = sqlite.prepare("SELECT status, paid, cancel_reason FROM orders WHERE id = ?").get(id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.paid, 0);
  assert.equal(cancelled.cancel_reason, "Khách đổi ý");
  const paid = await call("POST", "orders", checkout());
  assert.equal((await call("PATCH", "admin/order", { id: paid.data.order.id, action: "paid" }, { staff: true })).status, 200);
  assert.equal((await call("PATCH", "admin/order", { id: paid.data.order.id, status: "cancelled", reason: "Khách đổi ý" }, { staff: true })).status, 409);
});

test("concurrent payment and cancellation cannot leave an order both paid and cancelled", async () => {
  for (const paymentFirst of [true, false]) {
    const created = await call("POST", "orders", checkout());
    const id = created.data.order.id;
    const payment = () => call("PATCH", "admin/order", { id, action: "paid" }, { staff: true });
    const cancellation = () => call("PATCH", "admin/order", { id, status: "cancelled", reason: "Khách đổi ý" }, { staff: true });
    const actions = paymentFirst ? [payment, cancellation] : [cancellation, payment];
    const results = await Promise.all(actions.map((action) => action()));
    const state = sqlite.prepare("SELECT status, paid FROM orders WHERE id = ?").get(id);
    assert.ok(!(state.status === "cancelled" && state.paid === 1), "A cancellation racing with payment must preserve the payment rule.");
    assert.deepEqual(results.map((response) => response.status).sort(), [200, 409], "Only the winning staff action should report success.");
  }
});

test("service and bill calls deduplicate by dining session and kind, and can reopen after resolution", async () => {
  const service = serviceCall();
  assert.equal((await call("POST", "calls", service)).status, 200);
  const first = sqlite.prepare("SELECT * FROM service_requests WHERE id = ?").get(currentSession.id + ":service");
  assert.equal((await call("POST", "calls", service)).status, 200);
  assert.equal((await call("POST", "calls", service, { guest: guestB })).status, 403);
  assert.equal(sqlite.prepare("SELECT created_at FROM service_requests WHERE id = ?").get(first.id).created_at, first.created_at);
  assert.equal((await call("POST", "calls", { ...service, kind: "bill" })).status, 200);
  assert.equal(rowCount("service_requests"), 2);
  assert.equal((await call("PATCH", "admin/call", { id: first.id }, { staff: true })).status, 400);
  assert.equal((await call("PATCH", "admin/call", { id: first.id, createdAt: first.created_at }, { staff: true })).status, 200);
  assert.equal(sqlite.prepare("SELECT status FROM service_requests WHERE id = ?").get(first.id).status, "done");
  assert.equal((await call("POST", "calls", service)).status, 429);
  const clock=Date.now;Date.now=()=>first.created_at+30001;
  try{assert.equal((await call("POST", "calls", service)).status,200);}finally{Date.now=clock;}
  const reopened = sqlite.prepare("SELECT * FROM service_requests WHERE id = ?").get(first.id);
  assert.equal(reopened.status, "open");
  assert.ok(reopened.created_at > first.created_at);
  assert.equal((await call("PATCH", "admin/call", { id: first.id, createdAt: first.created_at }, { staff: true })).status, 409);
  assert.equal(sqlite.prepare("SELECT status FROM service_requests WHERE id = ?").get(first.id).status, "open");
  assert.equal((await call("PATCH", "admin/call", { id: first.id, createdAt: reopened.created_at }, { staff: true })).status, 200);
  assert.equal(rowCount("service_requests"), 2);
});

test("historical order snapshots survive menu edits and stale checkout totals require review", async () => {
  const submitted = checkout();
  const original = await call("POST", "orders", submitted);
  const chicken = initialMenu.items.find((item) => item.id === "chicken");
  const updatedItem = { ...chicken, name: "Cơm gà mới", price: 99000, description: "Công thức cập nhật" };
  assert.equal((await call("PATCH", "admin/item", updatedItem, { staff: true })).status, 200);
  const history = (await call("GET", historyPath())).data.orders;
  assert.equal(history[0].items[0].name, chicken.name);
  assert.equal(history[0].items[0].unitPrice, 75000);
  assert.equal(history[0].total, 75000);
  const replay = await call("POST", "orders", submitted);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.order.id, original.data.order.id);
  assert.equal(replay.data.order.total, 75000);
  assert.equal((await call("POST", "orders", checkout())).status, 409);
  const accepted = await call("POST", "orders", checkout({ expectedTotal: 109000 }));
  assert.equal(accepted.status, 201);
  assert.equal(accepted.data.order.items[0].name, updatedItem.name);
  assert.equal(accepted.data.order.total, 109000);
  assert.equal(rowCount("orders"), 2);
});

test("closing the shop blocks new orders while preserving successful request retries", async () => {
  const submitted = checkout();
  const original = await call("POST", "orders", submitted);
  assert.equal((await call("PATCH", "admin/shop", { ...initialMenu.shop, open: false }, { staff: true })).status, 200);
  assert.equal((await call("GET", "menu")).data.shop.open, false);
  assert.equal((await call("POST", "orders", checkout())).status, 409);
  const replay = await call("POST", "orders", submitted);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.order.id, original.data.order.id);
  assert.equal(rowCount("orders"), 1);
});

test("shop acceptance state requires a boolean and rejects ambiguous coercions", async () => {
  for (const open of ["false", "true", 0, 1, null, undefined]) {
    assert.equal((await call("PATCH", "admin/shop", { ...initialMenu.shop, open }, { staff: true })).status, 400);
  }
  assert.equal((await call("GET", "menu")).data.shop.open, true);
  assert.equal((await call("PATCH", "admin/shop", { ...initialMenu.shop, open: false }, { staff: true })).status, 200);
  assert.equal((await call("GET", "menu")).data.shop.open, false);
});

test("admin retains old unresolved orders beyond the archive cap and counts the full Vietnam day", async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-10-17T15:00:00Z");
  try {
    const created = await call("POST", "orders", checkout());
    assert.equal(created.status, 201);
    const base = sqlite.prepare("SELECT * FROM orders WHERE id = ?").get(created.data.order.id);
    // Keep the original called order as archived fixture data; called records are append-only.
    sqlite.prepare("UPDATE orders SET status = 'served',paid = 1,created_at = ?,dining_session_id = NULL WHERE id = ?").run(Date.parse("2026-10-10T00:00:00Z"),base.id);
    const columns = Object.keys(base);
    const insert = sqlite.prepare(`INSERT INTO orders (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
    const add = (id, overrides) => {
      const record = { ...base, id, request_key: "fixture:" + id, dining_session_id: null, ...overrides };
      insert.run(...columns.map((column) => record[column]));
    };
    const unresolved = [["new", 0], ["preparing", 0], ["ready", 1], ["served", 0]];
    for (const [status, paid] of unresolved) add("old-" + status, { status, paid, created_at: Date.parse("2026-10-15T12:00:00Z") });
    for (let i = 0; i < 205; i++) add("completed-" + i, { status: "served", paid: 1, created_at: Date.parse("2026-10-17T02:00:00Z") + i, paid_at: Date.parse("2026-10-17T02:00:00Z") + i });
    add("at-vietnam-midnight", { status: "served", paid: 1, created_at: Date.parse("2026-10-16T17:00:00Z"), paid_at: Date.parse("2026-10-16T17:00:00Z") });
    add("just-before-vietnam-midnight", { status: "served", paid: 1, created_at: Date.parse("2026-10-16T16:59:59.999Z"), paid_at: Date.parse("2026-10-16T16:59:59.999Z") });
    add("cancelled-today", { status: "cancelled", paid: 0, created_at: Date.parse("2026-10-17T03:00:00Z") });
    add("settled-but-active-session", { status: "served", paid: 1, dining_session_id: currentSession.id, created_at: Date.parse("2026-10-15T12:00:00Z") });
    const response = await call("GET", "admin", undefined, { staff: true });
    assert.equal(response.status, 200);
    assert.equal(response.data.orders.length, 205);
    for (const [status] of unresolved) assert.ok(response.data.orders.some((order) => order.id === "old-" + status), status);
    assert.ok(response.data.orders.some((order) => order.id === "settled-but-active-session"), "All orders of an active dining session must remain available beyond the archive cutoff.");
    assert.deepEqual(response.data.stats, { todayCount: 206, todayCollected: 206 * 75000 });
  } finally {
    Date.now = originalNow;
  }
});

test("write requests enforce origin, JSON format and body size before changing data", async () => {
  const submitted = checkout();
  assert.equal((await call("POST", "orders", submitted, { headers: { origin: "https://untrusted.example.test" } })).status, 403);
  assert.equal((await call("POST", "orders", submitted, { headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  assert.equal((await call("POST", "orders", submitted, { headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal((await call("POST", "orders", submitted, { rawBody: "{broken" })).status, 400);
  assert.equal((await call("POST", "orders", submitted, { rawBody: "x".repeat(32001) })).status, 413);
  assert.equal(rowCount("orders"), 0);
});

test("scanning bootstraps a secure browser cookie and only exposes the owning session", async () => {
  const cookie = initialMenuHeaders.get("set-cookie");
  assert.match(cookie, /^__Host-moc-device=[a-f0-9]{64};/);
  for (const flag of [/;\s*HttpOnly/i, /;\s*Secure/i, /;\s*SameSite=Lax/i, /;\s*Path=\//i, /;\s*Max-Age=2592000/i]) {
    assert.match(cookie, flag);
  }
  assert.doesNotMatch(cookie, /;\s*Domain=/i);
  assert.equal(initialMenu.connection.state, "preview");
  const originalCookie = cookieJars.get(guestA);
  const reloaded = await call("GET", "menu?table=" + table.token);
  assert.equal(reloaded.data.connection.state, "active");
  assert.equal(reloaded.data.connection.session.id, currentSession.id);
  assert.equal(reloaded.data.connection.session.customer_name, "Khách kiểm thử");
  assert.equal(cookieJars.get(guestA), originalCookie);
  assert.equal("browser_hash" in reloaded.data.connection.session, false);
  assert.equal("closed_at" in reloaded.data.connection.session, false);
  const otherBrowser = await call("GET", "menu?table=" + table.token, undefined, { guest: guestB });
  assert.equal(otherBrowser.data.connection.state, "blocked");
  assert.equal(otherBrowser.data.connection.session, undefined);
  assert.notEqual(cookieJars.get(guestB), originalCookie);
  assert.equal(JSON.stringify(otherBrowser.data).includes(currentSession.customer_name), false);
  const admin = await call("GET", "admin", undefined, { staff: true });
  assert.ok(admin.data.sessions.some((session) => session.id === currentSession.id));
  assert.ok(admin.data.sessions.every((session) => !("browser_hash" in session)));
});

test("a QR scan requires a valid customer name and reserves only a pending request", async () => {
  const target = freshTable();
  const scanned = await call("GET", "menu?table=" + target.token, undefined, { guest: guestB });
  assert.equal(scanned.data.connection.state, "available");
  for (const customerName of ["", "   ", null, 42, {}, "x".repeat(81)]) {
    const invalid = await call("POST", "table-session", { tableToken: target.token, customerName }, { guest: guestB });
    assert.equal(invalid.status, 400, JSON.stringify(customerName));
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM table_sessions WHERE table_id = ?").get(target.id).count, 0);
  const requested = await call("POST", "table-session", { tableToken: target.token, customerName: "  Nguyễn An  " }, { guest: guestB });
  assert.equal(requested.status, 201);
  assert.equal(requested.data.connection.state, "pending");
  const pending = requested.data.connection.session;
  assert.equal(pending.customer_name, "Nguyễn An");
  assert.equal(pending.table_id, target.id);
  assert.equal((await call("POST", "orders", checkout({ tableToken: target.token, sessionId: pending.id }), { guest: guestB })).status, 403);
  assert.equal((await call("POST", "calls", serviceCall({ tableToken: target.token, sessionId: pending.id }), { guest: guestB })).status, 403);
  assert.equal((await call("GET", historyPath(target.token, pending.id), undefined, { guest: guestB })).status, 403);
  const admin = await call("GET", "admin", undefined, { staff: true });
  assert.ok(admin.data.sessions.some((session) => session.id === pending.id && session.customer_name === "Nguyễn An" && session.status === "pending"));
  assert.equal(rowCount("orders"), 0);
  assert.equal(rowCount("service_requests"), 0);
});

test("the reserved browser can retry and reconnect while every other browser stays blocked", async () => {
  const target = freshTable();
  const requested = await requestTable(target, guestB, "Khách B");
  const pending = requested.data.connection.session;
  const again = await requestTable(target, guestB, "Tên thay đổi từ lần gửi lại");
  assert.equal(again.status, 200);
  assert.equal(again.data.connection.session.id, pending.id);
  assert.equal(again.data.connection.session.customer_name, "Khách B");
  assert.equal((await call("GET", "menu?table=" + target.token, undefined, { guest: guestB })).data.connection.state, "pending");
  const intruder = await requestTable(target, "browser-C", "Khách C");
  assert.equal(intruder.status, 409);
  assert.equal(intruder.data.connection?.session, undefined);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM table_sessions WHERE table_id = ?").get(target.id).count, 1);
  assert.equal((await call("PATCH", "admin/session", { id: pending.id, action: "approve" }, { guest: guestB })).status, 403);
  assert.equal((await call("PATCH", "admin/session", { id: pending.id, action: "reject" }, { guest: "browser-C" })).status, 403);
  assert.equal((await call("PATCH", "admin/session", { id: pending.id, action: "close" }, { guest: guestB })).status, 403);
  assert.equal((await call("PATCH", "admin/session", { id: pending.id, action: "approve" }, { staff: true })).status, 200);
  const resumed = await call("GET", "menu?table=" + target.token, undefined, { guest: guestB });
  assert.equal(resumed.data.connection.state, "active");
  assert.equal(resumed.data.connection.session.id, pending.id);
  assert.equal((await requestTable(target, "browser-C", "Khách C")).status, 409);
  const ordered = await call("POST", "orders", checkout({ tableToken: target.token, sessionId: pending.id }), { guest: guestB });
  assert.equal(ordered.status, 201);
  assert.equal(ordered.data.order.dining_session_id, pending.id);
  assert.equal(ordered.data.order.customer_name, "Khách B");
  const forgedName = await call("POST", "orders", checkout({ tableToken: target.token, sessionId: pending.id, customerName: "Người khác" }), { guest: guestB });
  assert.equal(forgedName.status, 201);
  assert.equal(forgedName.data.order.customer_name, "Khách B");
});

test("simultaneous browser claims produce exactly one pending owner", async () => {
  const target = freshTable();
  await Promise.all([
    call("GET", "menu?table=" + target.token, undefined, { guest: guestB }),
    call("GET", "menu?table=" + target.token, undefined, { guest: "browser-C" }),
  ]);
  const results = await Promise.all([
    call("POST", "table-session", { tableToken: target.token, customerName: "Khách B" }, { guest: guestB }),
    call("POST", "table-session", { tableToken: target.token, customerName: "Khách C" }, { guest: "browser-C" }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  const winner = results.findIndex((result) => result.status === 201);
  const guests = [guestB, "browser-C"];
  const own = await call("GET", "menu?table=" + target.token, undefined, { guest: guests[winner] });
  const lost = await call("GET", "menu?table=" + target.token, undefined, { guest: guests[1 - winner] });
  assert.equal(own.data.connection.state, "pending");
  assert.equal(lost.data.connection.state, "blocked");
  assert.equal(lost.data.connection.session, undefined);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM table_sessions WHERE table_id = ? AND status IN ('pending','active')").get(target.id).count, 1);
});

test("forged legacy headers, missing session IDs and cross-table IDs never authorize ordering", async () => {
  await call("GET", "menu?table=" + table.token, undefined, { guest: guestB });
  const forgedLegacyHeader = { guest: null, headers: { "x-guest-session": guestA } };
  assert.equal((await call("POST", "orders", checkout(), forgedLegacyHeader)).status, 403);
  assert.equal((await call("POST", "calls", serviceCall(), forgedLegacyHeader)).status, 403);
  assert.equal((await call("GET", historyPath(), undefined, forgedLegacyHeader)).status, 403);
  assert.equal((await call("POST", "orders", checkout(), { guest: guestB, headers: { "x-guest-session": guestA } })).status, 403);
  for (const sessionId of [undefined, null, "", crypto.randomUUID(), "x".repeat(61)]) {
    assert.equal((await call("POST", "orders", checkout({ sessionId }))).status, 403);
    assert.equal((await call("POST", "calls", serviceCall({ sessionId }))).status, 403);
  }
  const other = freshTable();
  const otherSession = await openTable(other, guestB);
  assert.equal((await call("POST", "orders", checkout({ sessionId: otherSession.id }))).status, 403);
  assert.equal((await call("POST", "orders", checkout({ tableToken: other.token }))).status, 403);
  assert.equal((await call("GET", historyPath(table.token, otherSession.id), undefined, { guest: guestB })).status, 403);
  assert.equal((await call("POST", "table-session", { tableToken: other.token, customerName: "Khách giả" }, { guest: null })).status, 403);
  assert.equal(rowCount("orders"), 0);
  assert.equal(rowCount("service_requests"), 0);
});

test("rejecting a pending request releases the table and stale staff actions cannot open it", async () => {
  const target = freshTable();
  const pending = (await requestTable(target, guestB, "Khách bị từ chối")).data.connection.session;
  assert.equal((await call("PATCH", "admin/session", { id: pending.id, action: "close" }, { staff: true })).status, 409);
  assert.equal((await call("PATCH", "admin/session", { id: pending.id, action: "reject" }, { staff: true })).status, 200);
  const rejected = await call("GET", "menu?table=" + target.token, undefined, { guest: guestB });
  assert.equal(rejected.data.connection.state, "rejected");
  assert.equal(rejected.data.connection.session.id, pending.id);
  assert.equal((await call("PATCH", "admin/session", { id: pending.id, action: "approve" }, { staff: true })).status, 409);
  assert.equal((await call("POST", "orders", checkout({ tableToken: target.token, sessionId: pending.id }), { guest: guestB })).status, 403);
  const replacement = await requestTable(target, "browser-C", "Khách mới");
  assert.equal(replacement.status, 201);
  assert.notEqual(replacement.data.connection.session.id, pending.id);
  assert.equal((await call("PATCH", "admin/session", { id: replacement.data.connection.session.id, action: "approve" }, { staff: true })).status, 200);
  assert.equal((await call("PATCH", "admin/session", { id: replacement.data.connection.session.id, action: "reject" }, { staff: true })).status, 409);
});

test("closing waits for service and payment, resolves calls, then isolates the next dining session", async () => {
  const submitted = checkout();
  const ordered = await call("POST", "orders", submitted);
  const orderId = ordered.data.order.id;
  const close = () => call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true });
  assert.equal((await call("POST", "calls", serviceCall())).status, 200);
  assert.equal((await call("POST", "calls", serviceCall({ kind: "bill" }))).status, 200);
  assert.equal((await close()).status, 409);
  assert.equal((await call("PATCH", "admin/order", { id: orderId, action: "paid" }, { staff: true })).status, 200);
  assert.equal((await close()).status, 409, "Payment alone must not end an unfinished service.");
  for (const status of ["preparing", "ready", "served"]) {
    assert.equal((await call("PATCH", "admin/order", { id: orderId, status }, { staff: true })).status, 200);
  }
  const unpaid = await call("POST", "orders", checkout());
  for (const status of ["preparing", "ready", "served"]) {
    assert.equal((await call("PATCH", "admin/order", { id: unpaid.data.order.id, status }, { staff: true })).status, 200);
  }
  assert.equal((await close()).status, 409, "Serving all food alone must not hide an unpaid order.");
  assert.equal((await call("PATCH", "admin/order", { id: unpaid.data.order.id, action: "paid" }, { staff: true })).status, 200);
  assert.equal((await close()).status, 200);
  assert.equal((await close()).status, 409);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM service_requests WHERE session_id = ? AND status = 'open'").get(currentSession.id).count, 0);
  const closed = await call("GET", "menu?table=" + table.token);
  assert.equal(closed.data.connection.state, "closed");
  assert.equal((await call("POST", "orders", submitted)).status, 403, "A successful historical request cannot bypass closed-session authorization.");
  assert.equal((await call("POST", "calls", serviceCall())).status, 403);
  assert.equal((await call("GET", historyPath())).status, 403);
  const next = await openTable(table, guestB, "Khách lượt tiếp theo");
  assert.notEqual(next.id, currentSession.id);
  assert.deepEqual((await call("GET", historyPath(table.token, next.id), undefined, { guest: guestB })).data.orders, []);
  assert.equal((await call("POST", "orders", checkout())).status, 403);
  const nextOrder = await call("POST", "orders", checkout({ sessionId: next.id }), { guest: guestB });
  assert.equal(nextOrder.status, 201);
  assert.equal(nextOrder.data.order.customer_name, "Khách lượt tiếp theo");
  assert.equal((await call("POST", "calls", serviceCall({ sessionId: next.id }), { guest: guestB })).status, 200);
  assert.equal(sqlite.prepare("SELECT session_id FROM service_requests WHERE id = ?").get(next.id + ":service").session_id, next.id);
  assert.equal(rowCount("orders"), 3, "Closing and reopening must preserve historical orders.");
});

test("a cancelled order does not prevent closing an otherwise settled table", async () => {
  const created = await call("POST", "orders", checkout());
  assert.equal((await call("PATCH", "admin/order", { id: created.data.order.id, status: "cancelled", reason: "Khách không dùng" }, { staff: true })).status, 200);
  assert.equal((await call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true })).status, 200);
  assert.equal(sqlite.prepare("SELECT status, paid FROM orders WHERE id = ?").get(created.data.order.id).status, "cancelled");
  assert.equal((await requestTable(table, guestB, "Khách mới")).status, 201);
});

test("an order paused after its authorization cannot insert after the table closes", { timeout: 5000 }, async () => {
  const pause = pauseNextWrite((sql) => /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+orders\b/i.test(sql));
  const pendingOrder = call("POST", "orders", checkout());
  try {
    await pause.reached;
    const closed = await call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true });
    assert.equal(closed.status, 200);
  } finally {
    pause.release();
    beforeWrite = null;
  }
  const denied = await pendingOrder;
  assert.ok([403, 409].includes(denied.status), JSON.stringify(denied));
  assert.equal(rowCount("orders"), 0);
  assert.equal(sqlite.prepare("SELECT status FROM table_sessions WHERE id = ?").get(currentSession.id).status, "closed");
  assert.equal(rowCount("table_settlements"), 1);
  assert.equal((await settlementDetail(currentSession.id)).settlement.orderCount, 0);
});

test("a close paused before its write must fail when a new order wins the race", { timeout: 5000 }, async () => {
  const pause = pauseNextWrite((sql) => /UPDATE\s+table_sessions\s+SET\s+status\s*=\s*'closed'/i.test(sql));
  const pendingClose = call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true });
  try {
    await pause.reached;
    const placed = await call("POST", "orders", checkout());
    assert.equal(placed.status, 201);
  } finally {
    pause.release();
    beforeWrite = null;
  }
  assert.equal((await pendingClose).status, 409);
  assert.equal(rowCount("orders"), 1);
  assert.equal(sqlite.prepare("SELECT status FROM table_sessions WHERE id = ?").get(currentSession.id).status, "active");
  assert.equal(rowCount("table_settlements"), 0, "A close that loses to a new order must not create a settlement.");
});

test("a staff call paused after authorization cannot remain open after its table closes", { timeout: 5000 }, async () => {
  const pause = pauseNextWrite((sql) => /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+service_requests\b/i.test(sql));
  const pendingCall = call("POST", "calls", serviceCall());
  try {
    await pause.reached;
    assert.equal((await call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true })).status, 200);
  } finally {
    pause.release();
    beforeWrite = null;
  }
  assert.ok([403, 409].includes((await pendingCall).status));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM service_requests WHERE status = 'open'").get().count, 0);
});

test("table-session writes retain the same cross-origin and JSON protections as checkout", async () => {
  const target = freshTable();
  const body = { tableToken: target.token, customerName: "Khách thử" };
  assert.equal((await call("POST", "table-session", body, { headers: { origin: "https://attacker.example.test" } })).status, 403);
  assert.equal((await call("POST", "table-session", body, { headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  assert.equal((await call("POST", "table-session", body, { headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal((await call("POST", "table-session", body, { rawBody: "null" })).status, 400);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM table_sessions WHERE table_id = ?").get(target.id).count, 0);
});

test("upgrading preserves old orders and locks occupied legacy tables until staff closes them", async () => {
  const created = await call("POST", "orders", checkout());
  const prototype = sqlite.prepare("SELECT * FROM orders WHERE id = ?").get(created.data.order.id);
  const originalTable = { ...table };
  const callOnlyTable = { id: "6", name: "Bàn 06", zone: "Sảnh chính", token: "legacy-call-table-token" };
  const fixtures = [
    { id: "legacy-unpaid", status: "served", paid: 0 },
    { id: "legacy-unserved", status: "ready", paid: 1 },
    { id: "legacy-finished", status: "served", paid: 1 },
    { id: "legacy-cancelled", status: "cancelled", paid: 0, cancel_reason: "Đã hủy trước nâng cấp" },
  ].map((fixture) => ({ ...prototype, ...fixture, request_key: "legacy-fixture:" + fixture.id }));

  sqlite.close();
  sqlite = new DatabaseSync(":memory:");
  const migrations = readdirSync(root + "drizzle").filter((name) => name.endsWith(".sql")).sort();
  assert.ok(migrations.length >= 2, "The ownership migration must append to the existing schema.");
  sqlite.exec(readFileSync(root + "drizzle/" + migrations[0], "utf8"));
  const insertTable = sqlite.prepare("INSERT INTO dining_tables (id,name,zone,token) VALUES (?,?,?,?)");
  for (const target of [originalTable, callOnlyTable]) insertTable.run(target.id, target.name, target.zone, target.token);
  const originalColumns = sqlite.prepare("PRAGMA table_info(orders)").all().map((column) => column.name);
  const insertOrder = sqlite.prepare(`INSERT INTO orders (${originalColumns.join(",")}) VALUES (${originalColumns.map(() => "?").join(",")})`);
  for (const fixture of fixtures) insertOrder.run(...originalColumns.map((column) => fixture[column]));
  const insertCall = sqlite.prepare("INSERT INTO service_requests (id,table_id,table_name,kind,status,created_at) VALUES (?,?,?,?,?,?)");
  for (const target of [originalTable, callOnlyTable]) insertCall.run(target.id + ":service", target.id, target.name, "service", "open", 1792230000000);

  for (const migration of migrations.slice(1)) sqlite.exec(readFileSync(root + "drizzle/" + migration, "utf8"));
  environment.DB = d1(sqlite);
  assert.equal(rowCount("orders"), fixtures.length);
  for (const fixture of fixtures) {
    const migrated = sqlite.prepare("SELECT * FROM orders WHERE id = ?").get(fixture.id);
    for (const column of originalColumns) assert.equal(migrated[column], fixture[column], fixture.id + "." + column);
    assert.equal(migrated.paid_at, null, "The revenue migration must not invent collection timestamps for old orders.");
    assert.equal(migrated.payment_method, "unknown");
    if (fixture.id === "legacy-unpaid" || fixture.id === "legacy-unserved") {
      assert.equal(migrated.dining_session_id, "legacy-" + originalTable.id);
      assert.equal(migrated.customer_name, "Khách trước khi cập nhật");
    } else assert.equal(migrated.dining_session_id, null);
  }
  const legacy = sqlite.prepare("SELECT * FROM table_sessions WHERE table_id = ?").get(originalTable.id);
  assert.equal(legacy.status, "active");
  assert.equal(legacy.browser_hash, "");
  const legacyCallOnly = sqlite.prepare("SELECT * FROM table_sessions WHERE table_id = ?").get(callOnlyTable.id);
  assert.equal(legacyCallOnly.status, "active");
  const scanned = await call("GET", "menu?table=" + originalTable.token);
  assert.equal(scanned.data.connection.state, "blocked");
  assert.equal(scanned.data.connection.session, undefined);
  assert.equal((await requestTable(originalTable, guestB, "Khách mới")).status, 409);
  const closeLegacy = () => call("PATCH", "admin/session", { id: legacy.id, action: "close" }, { staff: true });
  assert.equal((await closeLegacy()).status, 409);
  assert.equal((await call("PATCH", "admin/order", { id: "legacy-unpaid", action: "paid" }, { staff: true })).status, 200);
  assert.equal((await call("PATCH", "admin/order", { id: "legacy-unserved", status: "served" }, { staff: true })).status, 200);
  assert.equal((await requestTable(originalTable, guestB, "Khách mới")).status, 409, "Settling orders alone must not release a legacy table before explicit close.");
  assert.equal((await closeLegacy()).status, 200);
  assert.equal(sqlite.prepare("SELECT status FROM service_requests WHERE id = ?").get(originalTable.id + ":service").status, "done");
  assert.equal((await requestTable(originalTable, guestB, "Khách mới")).status, 201);
  assert.equal((await call("PATCH", "admin/session", { id: legacyCallOnly.id, action: "close" }, { staff: true })).status, 200);
  assert.equal(sqlite.prepare("SELECT status FROM service_requests WHERE id = ?").get(callOnlyTable.id + ":service").status, "done");
  assert.equal(rowCount("orders"), fixtures.length);
});

test("late orders from the old worker create a visible legacy lock that requires explicit closure", async () => {
  const target = freshTable();
  const orphan = insertOrphanOrder(target);
  const callId = target.id + ":service";
  sqlite.prepare("INSERT INTO service_requests (id,table_id,table_name,session_id,kind,status,created_at) VALUES (?,?,?,NULL,'service','open',?)").run(callId, target.id, target.name, Date.now());
  const scanned = await call("GET", "menu?table=" + target.token, undefined, { guest: guestB });
  assert.equal(scanned.data.connection.state, "blocked");
  assert.equal(scanned.data.connection.session, undefined);
  const legacy = sqlite.prepare("SELECT * FROM table_sessions WHERE table_id = ? AND status = 'active'").get(target.id);
  assert.ok(legacy);
  assert.equal(legacy.browser_hash, "");
  const repaired = sqlite.prepare("SELECT * FROM orders WHERE id = ?").get(orphan.id);
  assert.equal(repaired.dining_session_id, legacy.id);
  assert.equal(repaired.client_token, orphan.client_token);
  assert.equal(repaired.items, orphan.items);
  assert.equal(sqlite.prepare("SELECT session_id FROM service_requests WHERE id = ?").get(callId).session_id, legacy.id);
  const admin = await call("GET", "admin", undefined, { staff: true });
  assert.ok(admin.data.sessions.some((session) => session.id === legacy.id && session.status === "active"));
  assert.ok(admin.data.orders.some((order) => order.id === orphan.id && order.dining_session_id === legacy.id));
  assert.equal((await requestTable(target, guestB)).status, 409);
  assert.equal((await call("PATCH", "admin/session", { id: legacy.id, action: "close" }, { staff: true })).status, 409);
  assert.equal((await call("PATCH", "admin/order", { id: orphan.id, action: "paid" }, { staff: true })).status, 200);
  assert.equal((await requestTable(target, guestB)).status, 409, "Payment must not implicitly release the repaired legacy lock.");
  assert.equal((await call("PATCH", "admin/session", { id: legacy.id, action: "close" }, { staff: true })).status, 200);
  assert.equal(sqlite.prepare("SELECT status FROM service_requests WHERE id = ?").get(callId).status, "done");

  // A second late write must create another lock even after this one is closed.
  const later = insertOrphanOrder(target);
  const refreshed = await call("GET", "admin", undefined, { staff: true });
  const nextLegacy = refreshed.data.sessions.find((session) => session.table_id === target.id);
  assert.ok(nextLegacy);
  assert.notEqual(nextLegacy.id, legacy.id);
  assert.equal(nextLegacy.status, "active");
  assert.equal(sqlite.prepare("SELECT dining_session_id FROM orders WHERE id = ?").get(later.id).dining_session_id, nextLegacy.id);
  assert.equal((await requestTable(target, guestB)).status, 409);
  assert.equal((await call("PATCH", "admin/order", { id: later.id, action: "paid" }, { staff: true })).status, 200);
  assert.equal((await call("PATCH", "admin/session", { id: nextLegacy.id, action: "close" }, { staff: true })).status, 200);
  assert.equal((await requestTable(target, guestB)).status, 201);
});

test("a late orphan displaces a pending reservation without allowing its rejection to free old work", async () => {
  const target = freshTable();
  const pending = (await requestTable(target, guestB, "Khách đang đợi")).data.connection.session;
  const orphan = insertOrphanOrder(target);
  const admin = await call("GET", "admin", undefined, { staff: true });
  const legacy = admin.data.sessions.find((session) => session.table_id === target.id);
  assert.ok(legacy);
  assert.notEqual(legacy.id, pending.id);
  assert.equal(legacy.status, "active");
  assert.equal(sqlite.prepare("SELECT status FROM table_sessions WHERE id = ?").get(pending.id).status, "rejected");
  assert.equal(sqlite.prepare("SELECT browser_hash FROM table_sessions WHERE id = ?").get(legacy.id).browser_hash, "");
  assert.equal(sqlite.prepare("SELECT dining_session_id FROM orders WHERE id = ?").get(orphan.id).dining_session_id, legacy.id);
  const guest = await call("GET", "menu?table=" + target.token, undefined, { guest: guestB });
  assert.equal(guest.data.connection.state, "blocked");
  assert.equal(guest.data.connection.session, undefined);
  for (const action of ["approve", "reject"]) {
    assert.equal((await call("PATCH", "admin/session", { id: pending.id, action }, { staff: true })).status, 409);
  }
  assert.equal((await call("POST", "orders", checkout({ tableToken: target.token, sessionId: pending.id }), { guest: guestB })).status, 403);
  assert.equal((await call("PATCH", "admin/order", { id: orphan.id, action: "paid" }, { staff: true })).status, 200);
  assert.equal((await requestTable(target, guestB)).status, 409);
  assert.equal((await call("PATCH", "admin/session", { id: legacy.id, action: "close" }, { staff: true })).status, 200);
  const replacement = await requestTable(target, guestB, "Khách đang đợi");
  assert.equal(replacement.status, 201);
  assert.notEqual(replacement.data.connection.session.id, pending.id);
});

test("repairing a late orphan on an active table preserves its owner and hides the previous guest's order", async () => {
  const own = await call("POST", "orders", checkout());
  assert.equal(own.status, 201);
  const oldOwner = sqlite.prepare("SELECT browser_hash, customer_name FROM table_sessions WHERE id = ?").get(currentSession.id);
  const orphan = insertOrphanOrder(table);
  const admin = await call("GET", "admin", undefined, { staff: true });
  const active = admin.data.sessions.filter((session) => session.table_id === table.id);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, currentSession.id);
  assert.equal(active[0].status, "active");
  assert.equal(active[0].customer_name, currentSession.customer_name);
  const unchangedOwner = sqlite.prepare("SELECT browser_hash, customer_name FROM table_sessions WHERE id = ?").get(currentSession.id);
  assert.deepEqual(unchangedOwner, oldOwner);
  const attached = sqlite.prepare("SELECT * FROM orders WHERE id = ?").get(orphan.id);
  assert.equal(attached.dining_session_id, currentSession.id);
  assert.equal(attached.client_token, orphan.client_token);
  assert.equal(attached.customer_name, "Khách trước khi cập nhật");
  assert.ok(admin.data.orders.some((order) => order.id === orphan.id));
  const menu = await call("GET", "menu?table=" + table.token);
  assert.equal(menu.data.connection.state, "active");
  assert.equal(menu.data.connection.session.id, currentSession.id);
  const history = await call("GET", historyPath());
  assert.equal(history.status, 200);
  assert.deepEqual(history.data.orders.map((order) => order.id), [own.data.order.id]);
  assert.equal(JSON.stringify(history.data).includes(orphan.note), false);
  assert.equal((await call("GET", historyPath(), undefined, { guest: guestB })).status, 403);
  assert.equal((await call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true })).status, 409);
});

test("settlement validates its method and records the first server timestamp without allowing replay to rewrite it", async () => {
  const created = await call("POST", "orders", checkout());
  const id = created.data.order.id;
  for (const paymentMethod of [null, "", "card", "CASH", 42, [], {}]) {
    const rejected = await call("PATCH", "admin/order", { id, action: "paid", paymentMethod }, { staff: true });
    assert.equal(rejected.status, 400, JSON.stringify(paymentMethod));
  }
  const unpaid = sqlite.prepare("SELECT paid, paid_at, payment_method FROM orders WHERE id = ?").get(id);
  assert.equal(unpaid.paid, 0);
  assert.equal(unpaid.paid_at, null);
  assert.equal(unpaid.payment_method, "unknown");

  const originalNow = Date.now;
  const firstPaidAt = Date.parse("2026-10-17T17:00:00Z");
  Date.now = () => firstPaidAt;
  try {
    assert.equal((await call("PATCH", "admin/order", { id, action: "paid", paymentMethod: "bank", paidAt: 1, paid_at: 1 }, { staff: true })).status, 200);
    Date.now = () => firstPaidAt + 86400000;
    assert.equal((await call("PATCH", "admin/order", { id, action: "paid", paymentMethod: "cash" }, { staff: true })).status, 200);
    assert.equal((await call("PATCH", "admin/order", { id, action: "paid" }, { staff: true })).status, 200);
    const settled = sqlite.prepare("SELECT paid, paid_at, payment_method FROM orders WHERE id = ?").get(id);
    assert.equal(settled.paid, 1);
    assert.equal(settled.paid_at, firstPaidAt);
    assert.equal(settled.payment_method, "bank");
    const publicHistory = (await call("GET", historyPath())).data.orders[0];
    assert.equal(publicHistory.paid_at, firstPaidAt);
    assert.equal(publicHistory.payment_method, "bank");
    assertNoSecrets(publicHistory);

    const oldClient = await call("POST", "orders", checkout());
    assert.equal((await call("PATCH", "admin/order", { id: oldClient.data.order.id, action: "paid" }, { staff: true })).status, 200);
    const compatible = sqlite.prepare("SELECT paid_at, payment_method FROM orders WHERE id = ?").get(oldClient.data.order.id);
    assert.equal(compatible.paid_at, firstPaidAt + 86400000);
    assert.equal(compatible.payment_method, "unknown");
  } finally {
    Date.now = originalNow;
  }
});

test("two competing payments keep only the winning method and timestamp", { timeout: 5000 }, async () => {
  const created = await call("POST", "orders", checkout());
  const id = created.data.order.id;
  const originalNow = Date.now;
  const earlier = Date.parse("2026-10-17T12:00:00Z");
  const later = earlier + 60000;
  Date.now = () => earlier;
  const pause = pauseNextWrite((sql) => /UPDATE\s+orders\s+SET\s+paid\s*=\s*1/i.test(sql));
  const slower = call("PATCH", "admin/order", { id, action: "paid", paymentMethod: "cash" }, { staff: true });
  try {
    await pause.reached;
    Date.now = () => later;
    assert.equal((await call("PATCH", "admin/order", { id, action: "paid", paymentMethod: "bank" }, { staff: true })).status, 200);
  } finally {
    pause.release();
    beforeWrite = null;
  }
  try {
    assert.equal((await slower).status, 200, "A retry that loses the write race should acknowledge the already-settled order.");
    const settled = sqlite.prepare("SELECT paid_at, payment_method FROM orders WHERE id = ?").get(id);
    assert.equal(settled.paid_at, later);
    assert.equal(settled.payment_method, "bank");
  } finally {
    Date.now = originalNow;
  }
});

test("legacy paid records stay undated on replay and are not assigned invented collection dates", async () => {
  const legacy = insertRevenueOrder(table, {
    total: 98000,
    paid: 1,
    paid_at: null,
    payment_method: "unknown",
    created_at: Date.parse("2026-10-17T03:00:00Z"),
  });
  assert.equal((await call("PATCH", "admin/order", { id: legacy.id, action: "paid", paymentMethod: "cash" }, { staff: true })).status, 200);
  const unchanged = sqlite.prepare("SELECT paid_at, payment_method FROM orders WHERE id = ?").get(legacy.id);
  assert.equal(unchanged.paid_at, null);
  assert.equal(unchanged.payment_method, "unknown");
  const report = await revenueReport({ from: "2026-10-17", to: "2026-10-17" });
  assert.equal(report.summary.orderRevenue, 98000);
  assert.equal(report.summary.paidForOrders, 98000);
  assert.equal(report.summary.collected, 0);
  assert.deepEqual(report.undatedPaid, { count: 1, total: 98000 });
  const laterReport = await revenueReport({ from: "2026-12-01", to: "2026-12-01" });
  assert.equal(laterReport.summary.orderRevenue, 0);
  assert.deepEqual(laterReport.undatedPaid, { count: 1, total: 98000 }, "Undated history cannot be attributed to the selected dates.");
});

test("revenue distinguishes order dates from collection dates at Vietnam midnight and excludes cancellations", async () => {
  const otherTable = freshTable();
  const firstMidnight = Date.parse("2026-10-16T17:00:00Z");
  const afterLastDay = Date.parse("2026-10-19T17:00:00Z");
  insertRevenueOrder(table, { total: 100000, paid: 1, paid_at: firstMidnight, payment_method: "cash", created_at: firstMidnight, items: JSON.stringify([snapshotLine("chicken", "Cơm gà giá cũ", 2, 50000)]) });
  insertRevenueOrder(table, { total: 60000, created_at: Date.parse("2026-10-18T02:00:00Z"), items: JSON.stringify([snapshotLine("chicken", "Cơm gà giá cũ", 1, 60000)]) });
  insertRevenueOrder(otherTable, { total: 80000, paid: 1, created_at: Date.parse("2026-10-19T10:00:00Z"), items: JSON.stringify([snapshotLine("coffee", "Cà phê giá cũ", 1, 80000)]) });
  insertRevenueOrder(otherTable, { total: 40000, status: "cancelled", cancel_reason: "Khách đổi ý", created_at: afterLastDay - 1 });
  insertRevenueOrder(otherTable, { total: 120000, paid: 1, paid_at: Date.parse("2026-10-18T12:00:00Z"), payment_method: "bank", created_at: Date.parse("2026-10-16T02:00:00Z"), items: JSON.stringify([snapshotLine("chicken", "Cơm gà giá cũ", 3, 40000)]) });
  insertRevenueOrder(table, { total: 30000, paid: 1, paid_at: firstMidnight - 1, payment_method: "cash", created_at: firstMidnight - 1 });
  insertRevenueOrder(table, { total: 70000, paid: 1, paid_at: afterLastDay, payment_method: "other", created_at: afterLastDay });
  // This inconsistent historical row cannot be produced by the new payment API,
  // but a cancelled order must never inflate collections even after an import.
  insertRevenueOrder(table, { total: 20000, status: "cancelled", paid: 1, paid_at: Date.parse("2026-10-18T11:00:00Z"), payment_method: "other", created_at: Date.parse("2026-10-18T10:00:00Z") });

  const report = await revenueReport({ from: "2026-10-17", to: "2026-10-19" });
  assert.deepEqual(report.range, { from: "2026-10-17", to: "2026-10-19", days: 3, timezone: "Asia/Ho_Chi_Minh", tableId: null, previousFrom: "2026-10-14", previousTo: "2026-10-16" });
  assert.deepEqual(report.summary, {
    orderRevenue: 240000, validOrders: 3, paidForOrders: 180000, unpaidForOrders: 60000, unpaidOrders: 1,
    cancelledAmount: 60000, cancelledOrders: 2, collected: 220000, collectedOrders: 2, averageOrder: 80000, unitsSold: 4,
  });
  assert.equal(report.previous.orderRevenue, 150000);
  assert.equal(report.previous.validOrders, 2);
  assert.equal(report.previous.paidForOrders, 150000);
  assert.equal(report.previous.collected, 30000, "The preceding period's orders can be paid in the selected period.");
  assert.equal(report.previous.collectedOrders, 1);
  assert.deepEqual(report.daily.map((day) => [day.date, day.orderRevenue, day.collected]), [
    ["2026-10-17", 100000, 100000], ["2026-10-18", 60000, 120000], ["2026-10-19", 80000, 0],
  ]);
  assert.equal(report.daily.reduce((sum, day) => sum + day.orderRevenue, 0), report.summary.orderRevenue);
  assert.equal(report.daily.reduce((sum, day) => sum + day.collected, 0), report.summary.collected);
  assert.deepEqual(report.undatedPaid, { count: 1, total: 80000 });
  assert.equal(report.payments.find((entry) => entry.method === "cash").total, 100000);
  assert.equal(report.payments.find((entry) => entry.method === "bank").total, 120000);
  assert.equal(report.payments.reduce((sum, entry) => sum + entry.total, 0), 220000);
  assert.equal(report.byTable.reduce((sum, entry) => sum + entry.orderRevenue, 0), 240000);
  assert.equal(report.byTable.reduce((sum, entry) => sum + entry.collected, 0), 220000);
  assertNoSecrets(report);

  const filtered = await revenueReport({ from: "2026-10-17", to: "2026-10-19", table: otherTable.id });
  assert.equal(filtered.range.tableId, otherTable.id);
  assert.equal(filtered.summary.orderRevenue, 80000);
  assert.equal(filtered.summary.collected, 120000);
  assert.equal(filtered.previous.orderRevenue, 120000);
  assert.ok(filtered.byTable.every((entry) => entry.tableId === otherTable.id));
  assert.deepEqual(filtered.undatedPaid, { count: 1, total: 80000 });
  const own = await revenueReport({ from: "2026-10-17", to: "2026-10-19", table: table.id });
  assert.deepEqual(own.undatedPaid, { count: 0, total: 0 });
});

test("daily revenue includes quiet dates and default reporting switches dates at 17:00 UTC", async () => {
  const report = await revenueReport({ from: "2026-10-17", to: "2026-10-20" });
  assert.equal(report.daily.length, 4);
  assert.deepEqual(report.daily.map((day) => day.date), ["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"]);
  for (const daily of report.daily) for (const [key, value] of Object.entries(daily)) if (key !== "date") assert.equal(value, 0);
  assert.ok(Object.values(report.summary).every((value) => value === 0));
  assert.ok(Object.values(report.previous).every((value) => value === 0));

  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse("2026-10-17T16:59:59.999Z");
    const before = await revenueReport();
    assert.equal(before.range.from, "2026-10-17");
    assert.equal(before.range.to, "2026-10-17");
    Date.now = () => Date.parse("2026-10-17T17:00:00Z");
    const after = await revenueReport();
    assert.equal(after.range.from, "2026-10-18");
    assert.equal(after.range.to, "2026-10-18");
    assert.equal(after.range.previousFrom, "2026-10-17");
    assert.equal(after.range.previousTo, "2026-10-17");
    assert.equal(after.generatedAt, Date.now());
  } finally {
    Date.now = originalNow;
  }
});

test("report date ranges validate calendar dates, order and inclusive length before querying", async () => {
  for (const endpoint of ["admin/revenue", "admin/revenue/orders"]) {
    for (const from of ["2026-02-30", "2025-02-29", "2026-00-01", "2026-13-01", "2026-1-01", "2026-10-00", "0000-01-01", "2026-10-17' OR 1=1--", "not-a-date"]) {
      const response = await call("GET", revenuePath({ from, to: "2026-12-31" }, endpoint), undefined, { staff: true });
      assert.equal(response.status, 400, endpoint + " " + from);
    }
    assert.equal((await call("GET", revenuePath({ from: "2026-10-19", to: "2026-10-17" }, endpoint), undefined, { staff: true })).status, 400);
    assert.equal((await call("GET", revenuePath({ from: "2024-01-01", to: "2025-01-01" }, endpoint), undefined, { staff: true })).status, 400);
    assert.equal((await call("GET", revenuePath({ from: "2024-01-01", to: "2024-12-31" }, endpoint), undefined, { staff: true })).status, 200);
    assert.equal((await call("GET", revenuePath({ from: "2024-02-29", to: "2024-02-29" }, endpoint), undefined, { staff: true })).status, 200);
    assert.equal((await call("GET", revenuePath({ from: "2026-10-17", to: "2026-10-17", table: "unknown-table" }, endpoint), undefined, { staff: true })).status, 404);
  }
  const leap = await revenueReport({ from: "2024-01-01", to: "2024-12-31" });
  assert.equal(leap.range.days, 366);
  assert.equal(leap.daily.length, 366);
  assert.equal(leap.range.previousFrom, "2022-12-31");
  assert.equal(leap.range.previousTo, "2023-12-31");
});

test("revenue report and detail endpoints require staff and never expose session or request secrets", async () => {
  insertRevenueOrder(table, { created_at: Date.parse("2026-10-17T02:00:00Z") });
  for (const endpoint of ["admin/revenue", "admin/revenue/orders"]) {
    const path = revenuePath({ from: "2026-10-17", to: "2026-10-17" }, endpoint);
    assert.equal((await call("GET", path)).status, 403);
    assert.equal((await call("GET", path, undefined, { headers: { "oai-authenticated-user-email": "test@example.test" } })).status, 403);
    assert.equal((await call("GET", path, undefined, { headers: { "oai-authenticated-user-id": "outsider", "oai-authenticated-user-email": "outsider@example.test" } })).status, 403);
    const authorized = await call("GET", path, undefined, { staff: true });
    assert.equal(authorized.status, 200);
    assert.equal(authorized.headers.get("cache-control"), "no-store");
    assertNoSecrets(authorized.data);
  }
});

test("revenue uses historical item snapshots and counts multiple lines once per order", async () => {
  const submitted = checkout({ items: [line({ quantity: 2 }), line({ itemId: "coffee", quantity: 1, extras: [], taste: "Ít ngọt" })], expectedTotal: 185000 });
  const created = await call("POST", "orders", submitted);
  assert.equal(created.status, 201);
  const fixedTime = Date.parse("2026-10-17T02:00:00Z");
  sqlite.prepare("UPDATE orders SET created_at = ? WHERE id = ?").run(fixedTime, created.data.order.id);
  const chicken = initialMenu.items.find((item) => item.id === "chicken");
  assert.equal((await call("PATCH", "admin/item", { ...chicken, name: "Tên và giá mới", price: 999000 }, { staff: true })).status, 200);
  insertRevenueOrder(table, {
    total: 140000,
    created_at: fixedTime + 1,
    items: JSON.stringify([snapshotLine("chicken", chicken.name, 1, 65000), snapshotLine("chicken", chicken.name, 1, 75000)]),
  });
  const report = await revenueReport({ from: "2026-10-17", to: "2026-10-17" });
  assert.equal(report.summary.orderRevenue, 325000);
  assert.equal(report.summary.unitsSold, 5);
  const historical = report.topItems.find((item) => item.itemId === "chicken");
  assert.ok(historical);
  assert.equal(historical.name, chicken.name);
  assert.equal(historical.quantity, 4);
  assert.equal(historical.orderRevenue, 290000);
  assert.equal(historical.orderCount, 2, "Different options for the same dish in one order should not inflate its order count.");
  assert.equal(report.topItems.find((item) => item.itemId === "coffee").orderRevenue, 35000);
});

test("report aggregates all history and paginated details have no duplicates beyond the old 200-order cap", async () => {
  const createdAt = Date.parse("2026-10-17T04:00:00Z");
  const methods = ["cash", "bank", "other", "unknown"];
  for (let index = 0; index < 241; index++) {
    const paid = index < 211;
    const cancelled = index >= 238;
    insertRevenueOrder(table, {
      id: "revenue-batch-" + String(index).padStart(4, "0"),
      total: 1000,
      paid: paid ? 1 : 0,
      paid_at: paid ? createdAt : null,
      payment_method: paid ? methods[index % methods.length] : "unknown",
      status: cancelled ? "cancelled" : "served",
      created_at: createdAt,
    });
  }
  const filters = { from: "2026-10-17", to: "2026-10-17" };
  const report = await revenueReport(filters);
  assert.equal(report.summary.validOrders, 238);
  assert.equal(report.summary.orderRevenue, 238000);
  assert.equal(report.summary.paidForOrders, 211000);
  assert.equal(report.summary.unpaidForOrders, 27000);
  assert.equal(report.summary.unpaidOrders, 27);
  assert.equal(report.summary.cancelledAmount, 3000);
  assert.equal(report.summary.cancelledOrders, 3);
  assert.equal(report.summary.collected, 211000);
  assert.equal(report.summary.collectedOrders, 211);
  assert.equal(report.summary.unitsSold, 238);
  const first = await call("GET", revenuePath(filters, "admin/revenue/orders"), undefined, { staff: true });
  assert.equal(first.status, 200);
  assert.equal(first.data.total, 241);
  assert.equal(first.data.page, 1);
  assert.equal(first.data.pageSize, 25);
  assert.equal(first.data.pages, 10);
  const ids = first.data.orders.map((order) => order.id);
  for (let page = 2; page <= first.data.pages; page++) {
    const next = await call("GET", revenuePath({ ...filters, page: String(page) }, "admin/revenue/orders"), undefined, { staff: true });
    assert.equal(next.status, 200);
    assert.equal(next.data.total, 241);
    assert.equal(next.data.page, page);
    assert.ok(next.data.orders.length <= 25);
    assertNoSecrets(next.data);
    ids.push(...next.data.orders.map((order) => order.id));
  }
  assert.equal(ids.length, 241);
  assert.equal(new Set(ids).size, 241, "Pagination must have a stable tie-breaker when orders share timestamps.");
  for (const [status, expected] of [["paid", 211], ["unpaid", 27], ["cancelled", 3]]) {
    const details = await call("GET", revenuePath({ ...filters, status }, "admin/revenue/orders"), undefined, { staff: true });
    assert.equal(details.status, 200);
    assert.equal(details.data.total, expected);
  }
  for (const [payment, expected] of [["cash", 53], ["bank", 53], ["other", 53], ["unknown", 52]]) {
    const details = await call("GET", revenuePath({ ...filters, payment }, "admin/revenue/orders"), undefined, { staff: true });
    assert.equal(details.status, 200);
    assert.equal(details.data.total, expected);
    assert.ok(details.data.orders.every((order) => order.paid === 1 && order.payment_method === payment));
    const bucket = report.payments.find((entry) => entry.method === payment);
    assert.equal(bucket.total, expected * 1000);
    assert.equal(bucket.count, expected);
  }
  const impossible = await call("GET", revenuePath({ ...filters, status: "unpaid", payment: "unknown" }, "admin/revenue/orders"), undefined, { staff: true });
  assert.equal(impossible.data.total, 0, "Unrecorded payment method means a paid order; unpaid orders have no payment.");
});

test("collection-date details match collected totals while creation-date details include unpaid and undated payments", async () => {
  const old = insertRevenueOrder(table, { total: 90000, paid: 1, payment_method: "cash", created_at: Date.parse("2026-10-16T02:00:00Z"), paid_at: Date.parse("2026-10-17T03:00:00Z") });
  const later = insertRevenueOrder(table, { total: 80000, paid: 1, payment_method: "bank", created_at: Date.parse("2026-10-17T03:00:00Z"), paid_at: Date.parse("2026-10-18T03:00:00Z") });
  const undated = insertRevenueOrder(table, { total: 70000, paid: 1, created_at: Date.parse("2026-10-17T03:00:00Z") });
  const unpaid = insertRevenueOrder(table, { total: 60000, created_at: Date.parse("2026-10-17T03:00:00Z") });
  const filters = { from: "2026-10-17", to: "2026-10-17" };
  const collected = await call("GET", revenuePath({ ...filters, basis: "paid" }, "admin/revenue/orders"), undefined, { staff: true });
  assert.equal(collected.status, 200);
  assert.deepEqual(collected.data.orders.map((order) => order.id), [old.id]);
  assert.equal(collected.data.total, 1);
  const created = await call("GET", revenuePath({ ...filters, basis: "created" }, "admin/revenue/orders"), undefined, { staff: true });
  assert.deepEqual(new Set(created.data.orders.map((order) => order.id)), new Set([later.id, undated.id, unpaid.id]));
  for (const status of ["unpaid", "cancelled"]) {
    const none = await call("GET", revenuePath({ ...filters, basis: "paid", status }, "admin/revenue/orders"), undefined, { staff: true });
    assert.equal(none.status, 200);
    assert.equal(none.data.total, 0);
    assert.deepEqual(none.data.orders, []);
  }
  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse("2026-10-17T04:00:00Z");
    const admin = await call("GET", "admin", undefined, { staff: true });
    assert.deepEqual(admin.data.stats, { todayCount: 3, todayCollected: 90000 }, "The admin overview must agree with actual money collected today.");
  } finally {
    Date.now = originalNow;
  }
});

test("detail queries reject invalid filters and pagination instead of widening the report", async () => {
  const filters = { from: "2026-10-17", to: "2026-10-17" };
  const invalid = [
    ...["0", "-1", "1.5", "NaN", "01", "1 OR 1=1"].map((page) => ({ page })),
    { basis: "arbitrary" }, { status: "arbitrary" }, { payment: "arbitrary" },
  ];
  for (const extra of invalid) {
    const response = await call("GET", revenuePath({ ...filters, ...extra }, "admin/revenue/orders"), undefined, { staff: true });
    assert.equal(response.status, 400, JSON.stringify(extra));
  }
  const beyond = await call("GET", revenuePath({ ...filters, page: "5" }, "admin/revenue/orders"), undefined, { staff: true });
  assert.equal(beyond.status, 200);
  assert.equal(beyond.data.total, 0);
  assert.deepEqual(beyond.data.orders, []);
});

test("CSV exports complete report sections, safe text and machine-readable amounts without spreadsheet formulas", async () => {
  const { makeRevenueCsv } = loadApp("revenueCsv");
  const report = await revenueReport({ from: "2026-10-17", to: "2026-10-18" });
  report.summary.collected = 123456;
  report.previous.collected = 98765;
  report.undatedPaid = { count: 2, total: 88000 };
  const names = ["=2+2", " +SUM(1,2)", "-10+20", "@SUM(1,2)", "\tplain text", "\rplain text", "\nplain text", " \t=2+2", 'Món "ngon",\r\nvị Việt'];
  report.topItems = names.map((name, index) => ({ itemId: "item-" + index, name, quantity: index + 1, orderRevenue: (index + 1) * 1000, orderCount: 1 }));
  report.byTable = [{ tableId: "@table", tableName: '=HYPERLINK("https://untrusted.example.test","x")', orderRevenue: 123456, validOrders: 1, unpaidForOrders: 0, collected: 123456, collectedOrders: 1 }];
  const csv = makeRevenueCsv(report);
  assert.ok(csv.startsWith("\uFEFF"), "Excel must recognize Vietnamese text as UTF-8.");
  assert.ok(csv.endsWith("\r\n"));
  assert.ok(csv.includes('"Tiền thu trong kỳ","123456","98765"'), "Amounts are raw VND values, without locale separators.");
  assert.ok(csv.includes('"Múi giờ","Asia/Ho_Chi_Minh"'));
  assert.ok(csv.includes('"Từ ngày","2026-10-17","Đến ngày","2026-10-18"'));
  for (const marker of ["TỔNG HỢP", "THEO NGÀY", "MÓN GỌI NHIỀU", "THEO BÀN", "PHƯƠNG THỨC THU TIỀN", "KHOẢN ĐÃ THANH TOÁN CHƯA BIẾT THỜI ĐIỂM THU"]) assert.ok(csv.includes(marker), marker);
  for (const date of ["2026-10-17", "2026-10-18"]) assert.ok(csv.includes(`"${date}","0","0","0"`), "Quiet days must be exported too.");
  for (const name of names.slice(0, -1)) assert.ok(csv.includes('"\'' + name + '"'), JSON.stringify(name));
  assert.ok(csv.includes('"Món ""ngon"",\r\nvị Việt","item-8","9","9000","1"'), "Quotes, commas and line breaks must stay inside one quoted field.");
  assert.ok(csv.includes('"\'=HYPERLINK(""https://untrusted.example.test"",""x"")","\'@table"'));
  assert.ok(csv.includes('"Không cộng vào tiền thu trong kỳ","2","88000"'));
  assert.ok(csv.includes("Toàn bộ lịch sử của tất cả bàn, không giới hạn khoảng ngày đang chọn."));
  assert.ok(csv.includes("TỐI ĐA 20 MÓN"), "The limited item breakdown must not be presented as all items.");
});

test("closing a table archives the complete visit, cancelled lines and original payment details exactly once", async () => {
  const closedAt = Date.parse("2026-10-17T17:00:00Z");
  const openedAt = closedAt - 3600000;
  sqlite.prepare("UPDATE table_sessions SET created_at = ? WHERE id = ?").run(openedAt, currentSession.id);
  const paid = insertRevenueOrder(table, { total: 75000, paid: 1, paid_at: closedAt - 60000, payment_method: "bank", created_at: openedAt + 1 });
  const undated = insertRevenueOrder(table, { total: 50000, paid: 1, paid_at: null, created_at: openedAt + 2, items: JSON.stringify([snapshotLine("coffee", "Cà phê theo giá khi gọi", 2, 25000)]) });
  const cancelled = insertRevenueOrder(table, { total: 30000, status: "cancelled", cancel_reason: "Khách đổi món", created_at: openedAt + 3 });
  const originalNow = Date.now;
  Date.now = () => closedAt;
  try {
    const closed = await call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true });
    assert.equal(closed.status, 200, JSON.stringify(closed.data));
    assert.equal(rowCount("table_settlements"), 1);
    const detail = await settlementDetail(currentSession.id);
    assert.deepEqual(detail.settlement, {
      sessionId: currentSession.id, tableId: table.id, tableName: table.name, customerName: currentSession.customer_name,
      openedAt, closedAt, orderCount: 3, validOrderCount: 2, cancelledCount: 1,
      total: 125000, paidTotal: 125000, cancelledTotal: 30000, source: "snapshot",
    });
    assert.deepEqual(new Set(detail.orders.map((order) => order.id)), new Set([paid.id, undated.id, cancelled.id]));
    const paidOrder = detail.orders.find((order) => order.id === paid.id);
    assert.equal(paidOrder.paid_at, closedAt - 60000);
    assert.equal(paidOrder.payment_method, "bank");
    assert.equal(detail.orders.find((order) => order.id === undated.id).paid_at, null, "Closing must not invent a date for a legacy payment.");
    assert.equal(detail.orders.find((order) => order.id === cancelled.id).cancel_reason, "Khách đổi món");
    assertNoSecrets(detail);
    assert.equal((await call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true })).status, 409);
    assert.equal(rowCount("table_settlements"), 1);

    // A settlement is an immutable record of what was closed. Even a later
    // data correction to the operational rows must not silently rewrite it.
    sqlite.prepare("UPDATE orders SET total = 1, note = 'Later correction' WHERE id = ?").run(paid.id);
    sqlite.prepare("UPDATE dining_tables SET name = 'Bàn đổi tên' WHERE id = ?").run(table.id);
    const reread = await settlementDetail(currentSession.id);
    assert.deepEqual(reread, detail);
    assert.equal(rowCount("orders"), 3, "Archiving must retain the original order history.");
  } finally {
    Date.now = originalNow;
  }
});

test("simultaneous table closures produce one archive and never add a second collection to revenue", async () => {
  const fixedTime = Date.parse("2026-10-17T05:00:00Z");
  insertRevenueOrder(table, { total: 90000, paid: 1, paid_at: fixedTime, payment_method: "cash", created_at: fixedTime - 1000 });
  const filters = { from: "2026-10-17", to: "2026-10-17" };
  const before = await revenueReport(filters);
  const originalNow = Date.now;
  Date.now = () => fixedTime + 60000;
  try {
    const close = () => call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true });
    const results = await Promise.all([close(), close()]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal(rowCount("table_settlements"), 1);
    const report = await revenueReport(filters);
    assert.deepEqual(report.summary, before.summary, "Moving a visit to the archive must not count its orders or payments twice.");
    assert.equal(report.summary.collected, 90000);
    assert.equal(report.summary.collectedOrders, 1);
    const list = await settlementList(filters);
    assert.deepEqual(list.summary, { count: 1, total: 90000, paidTotal: 90000, cancelledTotal: 0 });
    assert.equal(list.total, 1);
  } finally {
    Date.now = originalNow;
  }
});

test("a failed settlement write rolls back the table closure and leaves its service calls visible", async () => {
  assert.equal((await call("POST", "calls", serviceCall())).status, 200);
  sqlite.exec("CREATE TRIGGER fail_settlement_insert BEFORE INSERT ON table_settlements BEGIN SELECT RAISE(ABORT,'Simulated settlement storage failure'); END;");
  try {
    const response = await call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true });
    assert.equal(response.status, 500);
    assert.equal(sqlite.prepare("SELECT status FROM table_sessions WHERE id = ?").get(currentSession.id).status, "active");
    assert.equal(sqlite.prepare("SELECT status FROM service_requests WHERE session_id = ?").get(currentSession.id).status, "open");
    assert.equal(rowCount("table_settlements"), 0);
  } finally {
    sqlite.exec("DROP TRIGGER fail_settlement_insert");
  }
  assert.equal((await call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true })).status, 200);
  assert.equal(rowCount("table_settlements"), 1);
  assert.equal(sqlite.prepare("SELECT status FROM service_requests WHERE session_id = ?").get(currentSession.id).status, "done");
});

test("all orders in an open visit remain available beyond 200 and its closed archive is isolated from the next visit", async () => {
  const fixedTime = Date.parse("2026-10-17T06:00:00Z");
  const expectedIds = [];
  for (let index = 0; index < 241; index++) {
    const fixture = insertRevenueOrder(table, {
      id: "visit-batch-" + String(index).padStart(4, "0"),
      total: 1000, paid: 1, paid_at: fixedTime, payment_method: "cash", created_at: fixedTime + index,
    });
    expectedIds.push(fixture.id);
  }
  const admin = await call("GET", "admin", undefined, { staff: true });
  assert.equal(admin.status, 200);
  assert.equal(admin.data.orders.filter((order) => order.dining_session_id === currentSession.id).length, 241);
  assert.equal((await call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true })).status, 200);
  const archived = await settlementDetail(currentSession.id);
  assert.equal(archived.settlement.orderCount, 241);
  assert.equal(archived.settlement.total, 241000);
  assert.equal(archived.orders.length, 241, "A visit archive must include its complete history, not the first 200 orders.");
  assert.deepEqual(new Set(archived.orders.map((order) => order.id)), new Set(expectedIds));
  assertNoSecrets(archived);

  const replacement = await openTable(table, guestB, "Khách lượt sau");
  const nextOrder = await call("POST", "orders", checkout({ sessionId: replacement.id }), { guest: guestB });
  assert.equal(nextOrder.status, 201);
  assert.equal(nextOrder.data.order.customer_name, "Khách lượt sau");
  assert.deepEqual(await settlementDetail(currentSession.id), archived);
  assert.deepEqual((await call("GET", historyPath(table.token, replacement.id), undefined, { guest: guestB })).data.orders.map((order) => order.id), [nextOrder.data.order.id]);
  assert.equal((await call("GET", "admin/revenue/settlements/" + replacement.id, undefined, { staff: true })).status, 404, "An open visit has no closed settlement yet.");
  assert.equal(rowCount("orders"), 242);
});

test("settlement filters use the Vietnam date of table closure instead of order creation or payment", async () => {
  const otherTable = freshTable();
  const firstMidnight = Date.parse("2026-10-16T17:00:00Z");
  const nextMidnight = firstMidnight + 86400000;
  const fixtures = [
    { target: table, closedAt: firstMidnight - 1, total: 10000 },
    { target: table, closedAt: firstMidnight, total: 20000 },
    { target: otherTable, closedAt: nextMidnight - 1, total: 30000 },
    { target: table, closedAt: nextMidnight, total: 40000 },
  ];
  const sessions = fixtures.map(({ target, closedAt, total }) => {
    const session = insertClosedVisit(target, { closed_at: closedAt, created_at: firstMidnight - 3 * 86400000 });
    insertRevenueOrder(target, { dining_session_id: session.id, total, paid: 1, paid_at: firstMidnight - 2 * 86400000, payment_method: "bank", created_at: firstMidnight - 3 * 86400000 });
    return session;
  });
  const filters = { from: "2026-10-17", to: "2026-10-17" };
  const report = await settlementList(filters);
  assert.deepEqual(report.range, { from: "2026-10-17", to: "2026-10-17", days: 1, timezone: "Asia/Ho_Chi_Minh", tableId: null });
  assert.deepEqual(new Set(report.settlements.map((settlement) => settlement.sessionId)), new Set([sessions[1].id, sessions[2].id]));
  assert.deepEqual(report.summary, { count: 2, total: 50000, paidTotal: 50000, cancelledTotal: 0 });
  const filtered = await settlementList({ ...filters, table: table.id });
  assert.equal(filtered.range.tableId, table.id);
  assert.equal(filtered.total, 1);
  assert.equal(filtered.settlements[0].sessionId, sessions[1].id);
  assert.equal(filtered.summary.total, 20000);
  const oldRevenue = await revenueReport(filters);
  assert.equal(oldRevenue.summary.orderRevenue, 0);
  assert.equal(oldRevenue.summary.collected, 0, "Closing yesterday's paid orders today must not turn them into today's cash.");

  const originalNow = Date.now;
  try {
    Date.now = () => nextMidnight - 1;
    assert.equal((await settlementList()).range.from, "2026-10-17");
    Date.now = () => nextMidnight;
    assert.equal((await settlementList()).range.from, "2026-10-18");
  } finally {
    Date.now = originalNow;
  }
});

test("closed-visit pagination includes all visits with stable ties and full-period totals", async () => {
  const closedAt = Date.parse("2026-10-17T07:00:00Z");
  const expected = [];
  for (let index = 0; index < 43; index++) {
    const session = insertClosedVisit(table, { id: "past-visit-" + String(index).padStart(3, "0"), closed_at: closedAt });
    insertRevenueOrder(table, { dining_session_id: session.id, total: 1000, paid: 1, paid_at: closedAt - 1000, created_at: closedAt - 2000 });
    expected.push(session.id);
  }
  const filters = { from: "2026-10-17", to: "2026-10-17" };
  const ids = [];
  for (let page = 1; page <= 3; page++) {
    const result = await settlementList({ ...filters, page: String(page) });
    assert.equal(result.page, page);
    assert.equal(result.pageSize, 20);
    assert.equal(result.pages, 3);
    assert.equal(result.total, 43);
    assert.equal(result.settlements.length, page === 3 ? 3 : 20);
    assert.deepEqual(result.summary, { count: 43, total: 43000, paidTotal: 43000, cancelledTotal: 0 });
    assertNoSecrets(result);
    ids.push(...result.settlements.map((settlement) => settlement.sessionId));
  }
  assert.equal(ids.length, 43);
  assert.equal(new Set(ids).size, 43);
  assert.deepEqual(new Set(ids), new Set(expected));
  const beyond = await settlementList({ ...filters, page: "4" });
  assert.deepEqual(beyond.settlements, []);
  assert.equal(beyond.summary.count, 43);
});

test("settlement endpoints guard staff access and reject invalid filters without exposing active or unknown visits", async () => {
  const session = insertClosedVisit();
  insertRevenueOrder(table, { dining_session_id: session.id, paid: 1 });
  const listPath = revenuePath({ from: "2026-10-17", to: "2026-10-17" }, "admin/revenue/settlements");
  const detailPath = "admin/revenue/settlements/" + session.id;
  for (const path of [listPath, detailPath]) {
    assert.equal((await call("GET", path)).status, 403);
    assert.equal((await call("GET", path, undefined, { headers: { "oai-authenticated-user-email": "test@example.test" } })).status, 403);
    assert.equal((await call("GET", path, undefined, { headers: { "oai-authenticated-user-id": "outsider", "oai-authenticated-user-email": "outsider@example.test" } })).status, 403);
    const authorized = await call("GET", path, undefined, { staff: true });
    assert.equal(authorized.status, 200);
    assert.equal(authorized.headers.get("cache-control"), "no-store");
    assertNoSecrets(authorized.data);
  }
  for (const extra of [{ from: "2026-02-30" }, { to: "2026-10-16" }, { from: "2024-01-01", to: "2025-01-01" }, ...["0", "-1", "1.5", "01", "NaN", "9007199254740992"].map((page) => ({ page }))]) {
    const path = revenuePath({ from: "2026-10-17", to: "2026-10-17", ...extra }, "admin/revenue/settlements");
    assert.equal((await call("GET", path, undefined, { staff: true })).status, 400, JSON.stringify(extra));
  }
  assert.equal((await call("GET", revenuePath({ from: "2026-10-17", to: "2026-10-17", table: "unknown-table" }, "admin/revenue/settlements"), undefined, { staff: true })).status, 404);
  assert.equal((await call("GET", "admin/revenue/settlements/" + currentSession.id, undefined, { staff: true })).status, 404);
  assert.equal((await call("GET", "admin/revenue/settlements/not-a-session", undefined, { staff: true })).status, 404);
});

test("the settlement upgrade preserves old closed visits and explicitly reconstructs history without invented payment dates", async () => {
  const oldSession = insertClosedVisit(table, { id: "closed-before-settlements", customer_name: "Khách trước nâng cấp" });
  const oldOrder = insertRevenueOrder(table, { dining_session_id: oldSession.id, total: 88000, paid: 1, paid_at: null, payment_method: "unknown", note: "Ghi chú lưu từ trước" });
  const cancelled = insertRevenueOrder(table, { dining_session_id: oldSession.id, total: 12000, status: "cancelled", cancel_reason: "Đã hủy từ trước" });
  const initialSessions = sqlite.prepare("SELECT * FROM table_sessions").all();
  const initialOrders = sqlite.prepare("SELECT * FROM orders").all();
  const initialTables = sqlite.prepare("SELECT * FROM dining_tables").all();
  const migrations = readdirSync(root + "drizzle").filter((name) => name.endsWith(".sql")).sort();
  const settlementMigration = migrations.findIndex((name) => /table_settlements/.test(readFileSync(root + "drizzle/" + name, "utf8")));
  assert.ok(settlementMigration > 1, "The settlement schema must be added in its own migration after existing revenue history.");
  sqlite.close();
  sqlite = new DatabaseSync(":memory:");
  for (const migration of migrations.slice(0, settlementMigration)) sqlite.exec(readFileSync(root + "drizzle/" + migration, "utf8"));
  for (const [tableName, records] of [["dining_tables", initialTables], ["table_sessions", initialSessions], ["orders", initialOrders]]) {
    for (const record of records) {
      const available=new Set(sqlite.prepare(`PRAGMA table_info(${tableName})`).all().map(column=>column.name));
      const columns = Object.keys(record).filter(column=>available.has(column));
      sqlite.prepare(`INSERT INTO ${tableName} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...columns.map((column) => record[column]));
    }
  }
  for (const migration of migrations.slice(settlementMigration)) sqlite.exec(readFileSync(root + "drizzle/" + migration, "utf8"));
  environment.DB = d1(sqlite);
  assert.equal(rowCount("table_settlements"), 0, "A new migration must not pass reconstructed rows off as original close-time snapshots.");
  for (const old of initialOrders) assert.deepEqual({ ...sqlite.prepare("SELECT * FROM orders WHERE id = ?").get(old.id) }, { ...old });
  for (const old of initialSessions) assert.deepEqual({ ...sqlite.prepare("SELECT * FROM table_sessions WHERE id = ?").get(old.id) }, { ...old });
  const detail = await settlementDetail(oldSession.id);
  assert.equal(detail.settlement.source, "reconstructed");
  assert.equal(detail.settlement.customerName, "Khách trước nâng cấp");
  assert.equal(detail.settlement.closedAt, oldSession.closed_at);
  assert.equal(detail.settlement.total, 88000);
  assert.equal(detail.settlement.paidTotal, 88000);
  assert.equal(detail.settlement.cancelledTotal, 12000);
  assert.equal(detail.settlement.orderCount, 2);
  assert.deepEqual(new Set(detail.orders.map((order) => order.id)), new Set([oldOrder.id, cancelled.id]));
  assert.equal(detail.orders.find((order) => order.id === oldOrder.id).paid_at, null);
  assert.equal(detail.orders.find((order) => order.id === oldOrder.id).payment_method, "unknown");
  assertNoSecrets(detail);
  assert.equal(rowCount("table_settlements"), 0, "Reading legacy history must be non-mutating.");
});

test("individual collection followed by the table balance preserves earlier payments and counts revenue only once", async () => {
  const firstPaidAt = Date.parse("2026-10-18T03:00:00Z");
  const laterPaidAt = firstPaidAt + 60000;
  const orders = [75000, 150000, 35000].map((total, index) => insertRevenueOrder(table, { total, created_at: firstPaidAt - 10000 + index }));
  const cancelled = insertRevenueOrder(table, { total: 25000, status: "cancelled", cancel_reason: "Khách đổi ý", created_at: firstPaidAt - 9990 });
  const earlierVisit = insertClosedVisit(table);
  const unrelated = insertRevenueOrder(table, { dining_session_id: earlierVisit.id, total: 99000, paid: 1, paid_at: earlierVisit.closed_at, payment_method: "other", created_at: earlierVisit.created_at });
  const originalNow = Date.now;
  Date.now = () => firstPaidAt;
  try {
    assert.equal((await call("PATCH", "admin/order", { id: orders[0].id, action: "paid", paymentMethod: "bank" }, { staff: true })).status, 200);
    const priorPayment = paymentState(orders[0].id);
    const unrelatedPayment = paymentState(unrelated.id);
    const quote = await tablePaymentQuote();
    assert.equal(quote.session.id, currentSession.id);
    assert.equal(quote.total, 260000);
    assert.equal(quote.paidTotal, 75000);
    assert.equal(quote.unpaidTotal, 185000);
    assert.equal(quote.unpaidCount, 2);
    assert.deepEqual(new Set(quote.orders.map((order) => order.id)), new Set(orders.slice(1).map((order) => order.id)));
    assertNoSecrets(quote);

    Date.now = () => laterPaidAt;
    const body = tablePayment(quote);
    const collected = await collectTable({ ...body, paidAt: 1, paid_at: 1, amount: 1 });
    assert.equal(collected.status, 200, JSON.stringify(collected.data));
    assert.equal(collected.data.ok, true);
    assert.equal(collected.data.replayed, false);
    assert.deepEqual(collected.data.receipt, {
      requestId: body.requestId, sessionId: currentSession.id,
      orderIds: orders.slice(1).map((order) => order.id).sort(),
      amount: 185000, paymentMethod: "cash", paidAt: laterPaidAt,
    });
    assertNoSecrets(collected.data);
    assert.equal("id" in collected.data.receipt, false, "The receipt must not expose its private attempt identifier.");
    for (const order of orders.slice(1)) assert.deepEqual(paymentState(order.id), { paid: 1, paid_at: laterPaidAt, payment_method: "cash" });
    assert.deepEqual(paymentState(orders[0].id), priorPayment);
    assert.deepEqual(paymentState(unrelated.id), unrelatedPayment);
    assert.deepEqual(paymentState(cancelled.id), { paid: 0, paid_at: null, payment_method: "unknown" });
    assert.equal(rowCount("table_payment_receipts"), 1);
    assert.equal(sqlite.prepare("SELECT status FROM table_sessions WHERE id = ?").get(currentSession.id).status, "active", "Collecting the balance must keep the visit open for service and later orders.");
    const paidQuote = await tablePaymentQuote();
    assert.equal(paidQuote.total, 260000);
    assert.equal(paidQuote.paidTotal, 260000);
    assert.equal(paidQuote.unpaidTotal, 0);
    assert.equal(paidQuote.unpaidCount, 0);
    assert.deepEqual(paidQuote.orders, []);

    const filters = { from: "2026-10-18", to: "2026-10-18" };
    const report = await revenueReport(filters);
    assert.equal(report.summary.collected, 260000);
    assert.equal(report.summary.collectedOrders, 3);
    assert.equal(report.summary.unpaidForOrders, 0);
    assert.equal(report.payments.find((method) => method.method === "bank").total, 75000);
    assert.equal(report.payments.find((method) => method.method === "cash").total, 185000);
    assert.equal((await call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true })).status, 200);
    const archived = await settlementDetail(currentSession.id);
    assert.equal(archived.settlement.total, 260000);
    assert.equal(archived.settlement.paidTotal, 260000);
    assert.equal(archived.settlement.cancelledTotal, 25000);
    assert.equal(archived.settlement.orderCount, 4);
    assert.deepEqual(archived.orders.filter((order) => order.id !== cancelled.id).map((order) => [order.id, order.paid_at, order.payment_method]).sort(), orders.map((order, index) => [order.id, index === 0 ? firstPaidAt : laterPaidAt, index === 0 ? "bank" : "cash"]).sort());
    assert.deepEqual((await revenueReport(filters)).summary, report.summary, "Closing and archiving a collected table must not collect its total again.");
  } finally {
    Date.now = originalNow;
  }
});

test("table collection requires staff, valid request origin and an active dining session", async () => {
  const order = insertRevenueOrder();
  const path = "admin/table-payment?session=" + currentSession.id;
  const body = tablePayment(await tablePaymentQuote());
  assert.equal((await call("GET", path)).status, 403);
  assert.equal((await call("GET", path, undefined, { headers: { "oai-authenticated-user-email": "test@example.test" } })).status, 403);
  assert.equal((await call("PATCH", "admin/table-payment", body)).status, 403);
  assert.equal((await call("PATCH", "admin/table-payment", body, { staff: true, headers: { origin: "https://untrusted.example.test" } })).status, 403);
  assert.equal((await call("PATCH", "admin/table-payment", body, { staff: true, headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  assert.equal((await call("PATCH", "admin/table-payment", body, { staff: true, headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal((await call("PATCH", "admin/table-payment", body, { staff: true, rawBody: "{broken" })).status, 400);
  assert.equal((await call("GET", "admin/table-payment", undefined, { staff: true })).status, 400);
  assert.equal((await call("GET", "admin/table-payment?session=not-found", undefined, { staff: true })).status, 404);
  const pending = await requestTable(freshTable(), guestB);
  assert.equal((await call("GET", "admin/table-payment?session=" + pending.data.connection.session.id, undefined, { staff: true })).status, 409);
  const closed = insertClosedVisit(table);
  assert.equal((await call("GET", "admin/table-payment?session=" + closed.id, undefined, { staff: true })).status, 409);
  assert.equal((await collectTable({ ...body, sessionId: pending.data.connection.session.id })).status, 409);
  assert.equal((await collectTable({ ...body, sessionId: closed.id })).status, 409);
  assert.equal(rowCount("table_payment_receipts"), 0);
  assert.equal(paymentState(order.id).paid, 0);
});

test("table collection rejects invalid fields and requires the exact server balance and order set", async () => {
  const first = insertRevenueOrder(table, { total: 75000 });
  const second = insertRevenueOrder(table, { total: 35000 });
  const body = tablePayment(await tablePaymentQuote());
  const invalid = [
    ...[undefined, null, "", "not-a-uuid", 42].map((requestId) => ({ requestId })),
    ...[undefined, null, "", 42, {}].map((sessionId) => ({ sessionId })),
    ...[undefined, null, "", [], [first.id, first.id], [null], [42], [{}], [""], Array.from({ length: 601 }, () => crypto.randomUUID())].map((orderIds) => ({ orderIds })),
    ...[undefined, null, 0, -1, 1.25, "110000", Number.MAX_SAFE_INTEGER + 1].map((expectedTotal) => ({ expectedTotal })),
    ...[undefined, null, "", "unknown", "card", "CASH", 42].map((paymentMethod) => ({ paymentMethod })),
  ];
  for (const extra of invalid) {
    const result = await collectTable({ ...body, ...extra });
    assert.equal(result.status, 400, JSON.stringify(extra));
  }
  for (const extra of [
    { expectedTotal: 1 }, { expectedTotal: 110001 },
    { orderIds: [first.id], expectedTotal: first.total },
    { orderIds: [first.id, crypto.randomUUID()] },
    { sessionId: crypto.randomUUID() },
  ]) {
    const result = await collectTable({ ...body, ...extra });
    assert.equal(result.status, 409, JSON.stringify(extra));
  }
  assert.equal(rowCount("table_payment_receipts"), 0);
  for (const order of [first, second]) assert.deepEqual(paymentState(order.id), { paid: 0, paid_at: null, payment_method: "unknown" });
});

test("concurrent table retries return one receipt and never sweep a later order into the original payment", async () => {
  const originals = [50000, 30000].map((total) => insertRevenueOrder(table, { total }));
  const body = tablePayment(await tablePaymentQuote());
  const results = await Promise.all([collectTable(body), collectTable(body)]);
  assert.ok(results.every((response) => response.status === 200), JSON.stringify(results));
  assert.deepEqual(results.map((response) => response.data.replayed).sort(), [false, true]);
  assert.deepEqual(results[0].data.receipt, results[1].data.receipt);
  assert.equal(rowCount("table_payment_receipts"), 1);
  const receipt = results[0].data.receipt;
  const later = insertRevenueOrder(table, { total: 42000 });
  const replay = await collectTable({ ...body, orderIds: [...body.orderIds].reverse() });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replayed, true);
  assert.deepEqual(replay.data.receipt, receipt, "Order-set normalization must allow the same receipt to be recovered after a lost response.");
  assert.deepEqual(paymentState(later.id), { paid: 0, paid_at: null, payment_method: "unknown" });
  assert.equal((await tablePaymentQuote()).unpaidTotal, 42000);
  for (const extra of [
    { paymentMethod: "bank" },
    { expectedTotal: 80001 },
    { orderIds: [originals[0].id], expectedTotal: originals[0].total },
    { orderIds: [later.id], expectedTotal: later.total },
    { sessionId: crypto.randomUUID() },
  ]) assert.equal((await collectTable({ ...body, ...extra })).status, 409, JSON.stringify(extra));
  assert.equal(rowCount("table_payment_receipts"), 1);
  assert.equal(paymentState(later.id).paid, 0);
});

test("a closed visit's payment retry cannot charge a new guest occupying the same table", async () => {
  const first = insertRevenueOrder(table, { total: 90000 });
  const originalBody = tablePayment(await tablePaymentQuote());
  const firstPayment = await collectTable(originalBody);
  assert.equal(firstPayment.status, 200);
  assert.equal((await call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true })).status, 200);
  const archived = await settlementDetail(currentSession.id);
  const replacement = await openTable(table, guestB, "Khách tiếp theo");
  const nextOrder = await call("POST", "orders", checkout({ sessionId: replacement.id }), { guest: guestB });
  assert.equal(nextOrder.status, 201);
  const replay = await collectTable(originalBody);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replayed, true);
  assert.deepEqual(replay.data.receipt, firstPayment.data.receipt);
  assert.equal((await collectTable({ ...originalBody, requestId: crypto.randomUUID() })).status, 409);
  assert.equal((await collectTable({ ...originalBody, requestId: crypto.randomUUID(), orderIds: [nextOrder.data.order.id], expectedTotal: 75000 })).status, 409);
  assert.deepEqual(paymentState(nextOrder.data.order.id), { paid: 0, paid_at: null, payment_method: "unknown" });
  assert.equal(paymentState(first.id).paid, 1);
  assert.equal(rowCount("table_payment_receipts"), 1);
  assert.deepEqual(await settlementDetail(currentSession.id), archived);
  assert.equal((await tablePaymentQuote(replacement.id)).unpaidTotal, 75000);
});

for (const change of ["a new order", "an individual payment", "an order cancellation"]) {
  test(`a table payment paused before its transaction rejects ${change} without partially paying the stale quote`, { timeout: 5000 }, async () => {
    const first = insertRevenueOrder(table, { total: 50000, status: "new" });
    const second = insertRevenueOrder(table, { total: 30000, status: "new" });
    const body = tablePayment(await tablePaymentQuote());
    const pause = pauseNextWrite((sql) => /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+table_payment_receipts\b/i.test(sql));
    const pending = collectTable(body);
    try {
      await pause.reached;
      if (change === "a new order") assert.equal((await call("POST", "orders", checkout())).status, 201);
      if (change === "an individual payment") assert.equal((await call("PATCH", "admin/order", { id: first.id, action: "paid", paymentMethod: "bank" }, { staff: true })).status, 200);
      if (change === "an order cancellation") assert.equal((await call("PATCH", "admin/order", { id: first.id, status: "cancelled", reason: "Khách đổi ý" }, { staff: true })).status, 200);
    } finally {
      pause.release();
      beforeWrite = null;
    }
    const result = await pending;
    assert.equal(result.status, 409, JSON.stringify(result.data));
    assert.equal(rowCount("table_payment_receipts"), 0, "A stale quote must not leave a successful-looking receipt.");
    assert.deepEqual(paymentState(second.id), { paid: 0, paid_at: null, payment_method: "unknown" });
    assert.equal(paymentState(first.id).paid, change === "an individual payment" ? 1 : 0);
    assert.equal(paymentState(first.id).payment_method, change === "an individual payment" ? "bank" : "unknown");
    const quote = await tablePaymentQuote();
    assert.equal(quote.unpaidTotal, change === "a new order" ? 155000 : 30000);
  });
}

test("competing table payments with different receipts have one winner and preserve its method and timestamp", { timeout: 5000 }, async () => {
  const orders = [60000, 40000].map((total) => insertRevenueOrder(table, { total }));
  const quote = await tablePaymentQuote();
  const earlier = Date.parse("2026-10-18T04:00:00Z");
  const later = earlier + 60000;
  const originalNow = Date.now;
  Date.now = () => earlier;
  const pause = pauseNextWrite((sql) => /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+table_payment_receipts\b/i.test(sql));
  const slower = collectTable(tablePayment(quote, { paymentMethod: "cash" }));
  try {
    await pause.reached;
    Date.now = () => later;
    assert.equal((await collectTable(tablePayment(quote, { paymentMethod: "bank" }))).status, 200);
  } finally {
    pause.release();
    beforeWrite = null;
  }
  try {
    assert.equal((await slower).status, 409);
    assert.equal(rowCount("table_payment_receipts"), 1);
    for (const order of orders) assert.deepEqual(paymentState(order.id), { paid: 1, paid_at: later, payment_method: "bank" });
    const report = await revenueReport({ from: "2026-10-18", to: "2026-10-18" });
    assert.equal(report.summary.collected, 100000);
    assert.equal(report.payments.find((method) => method.method === "bank").total, 100000);
    assert.equal(report.payments.find((method) => method.method === "cash").total, 0);
  } finally {
    Date.now = originalNow;
  }
});

test("an individual payment losing to a whole-table collection cannot overwrite its receipt details", { timeout: 5000 }, async () => {
  const first = insertRevenueOrder(table, { total: 70000 });
  const second = insertRevenueOrder(table, { total: 30000 });
  const body = tablePayment(await tablePaymentQuote(), { paymentMethod: "bank" });
  const pause = pauseNextWrite((sql) => /UPDATE\s+orders\s+SET\s+paid\s*=\s*1/i.test(sql));
  const individual = call("PATCH", "admin/order", { id: first.id, action: "paid", paymentMethod: "cash" }, { staff: true });
  let combined;
  try {
    await pause.reached;
    combined = await collectTable(body);
    assert.equal(combined.status, 200, JSON.stringify(combined.data));
  } finally {
    pause.release();
    beforeWrite = null;
  }
  assert.equal((await individual).status, 200, "A losing individual retry may acknowledge that this order was already paid.");
  for (const order of [first, second]) assert.deepEqual(paymentState(order.id), { paid: 1, paid_at: combined.data.receipt.paidAt, payment_method: "bank" });
  assert.equal(rowCount("table_payment_receipts"), 1);
});

test("an order storage failure rolls back the entire table receipt and permits a clean retry", async () => {
  const first = insertRevenueOrder(table, { total: 50000 });
  const second = insertRevenueOrder(table, { total: 30000 });
  const body = tablePayment(await tablePaymentQuote());
  assert.match(second.id, /^[a-f0-9-]+$/);
  sqlite.exec(`CREATE TRIGGER fail_table_payment_update BEFORE UPDATE OF paid ON orders WHEN NEW.id = '${second.id}' AND NEW.paid = 1 BEGIN SELECT RAISE(ABORT,'Simulated order storage failure'); END;`);
  try {
    const failed = await collectTable(body);
    assert.equal(failed.status, 500);
    assert.equal(rowCount("table_payment_receipts"), 0, "A receipt inserted before a failed order write must roll back with it.");
    for (const order of [first, second]) assert.deepEqual(paymentState(order.id), { paid: 0, paid_at: null, payment_method: "unknown" });
    assert.equal((await tablePaymentQuote()).unpaidTotal, 80000);
  } finally {
    sqlite.exec("DROP TRIGGER fail_table_payment_update");
  }
  const retried = await collectTable(body);
  assert.equal(retried.status, 200);
  assert.equal(retried.data.replayed, false);
  assert.equal(retried.data.receipt.amount, 80000);
  assert.equal(rowCount("table_payment_receipts"), 1);
  assert.equal((await tablePaymentQuote()).unpaidTotal, 0);
});

test("whole-table quotes and collection include every unpaid order beyond the administrative archive limit", async () => {
  const expectedIds = [];
  for (let index = 0; index < 241; index++) expectedIds.push(insertRevenueOrder(table, { total: 1000 }).id);
  const quote = await tablePaymentQuote();
  assert.equal(quote.total, 241000);
  assert.equal(quote.unpaidTotal, 241000);
  assert.equal(quote.unpaidCount, 241);
  assert.deepEqual(new Set(quote.orders.map((order) => order.id)), new Set(expectedIds));
  const collected = await collectTable(tablePayment(quote, { paymentMethod: "other" }));
  assert.equal(collected.status, 200, JSON.stringify(collected.data));
  assert.equal(collected.data.receipt.amount, 241000);
  assert.deepEqual(collected.data.receipt.orderIds, expectedIds.sort());
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM orders WHERE dining_session_id = ? AND paid = 1 AND payment_method = 'other'").get(currentSession.id).count, 241);
  assert.equal((await tablePaymentQuote()).unpaidCount, 0);
  assert.equal(rowCount("table_payment_receipts"), 1);
});

test("moving a table atomically preserves the whole visit, all order states, payment receipts and service-call history", async () => {
  const target = freshTable();
  const paidOrders = [55000, 45000].map((total) => insertRevenueOrder(table, { total, note: "Ghi chú của lượt đang dùng" }));
  const paid = await collectTable(tablePayment(await tablePaymentQuote(), { paymentMethod: "bank" }));
  assert.equal(paid.status, 200);
  const moreOrders = ["new", "preparing", "ready", "served", "cancelled"].map((status, index) => insertRevenueOrder(table, {
    status, total: 12000 + index * 1000, note: "Giữ nguyên ghi chú " + status,
    cancel_reason: status === "cancelled" ? "Khách đổi món" : "",
    items: JSON.stringify([{ ...snapshotLine("chicken", "Tên món khi đặt", 1, 12000 + index * 1000), taste: "ít cay", extras: ["Thêm trứng"], note: "Không hành" }]),
  }));
  const oldVisits = [table, target].map((oldTable) => insertClosedVisit(oldTable));
  const historicalOrders = oldVisits.map((visit, index) => insertRevenueOrder(index ? target : table, {
    dining_session_id: visit.id, total: 33000, paid: 1, paid_at: visit.closed_at, payment_method: "cash",
  }));
  for (const kind of ["service", "bill"]) assert.equal((await call("POST", "calls", serviceCall({ kind }))).status, 200);
  const bill = sqlite.prepare("SELECT * FROM service_requests WHERE id = ?").get(currentSession.id + ":bill");
  assert.equal((await call("PATCH", "admin/call", { id: bill.id, createdAt: bill.created_at }, { staff: true })).status, 200);
  for (let index = 0; index < oldVisits.length; index++) {
    const oldTable = index ? target : table;
    sqlite.prepare("INSERT INTO service_requests (id,table_id,table_name,session_id,kind,status,created_at) VALUES (?,?,?,?,?,'done',?)")
      .run(oldVisits[index].id + ":service", oldTable.id, oldTable.name, oldVisits[index].id, "service", oldVisits[index].closed_at);
  }
  const before = transferState();
  const revenueBefore = await revenueReport();
  const body = tableTransfer(target);
  const moved = await transferTable({ ...body, customerName: "Tên giả mạo", browserHash: "forged", amount: 1, transferredAt: 1 });
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.equal(moved.data.ok, true);
  assert.equal(moved.data.replayed, false);
  assert.equal(moved.data.session.id, currentSession.id);
  assert.equal(moved.data.session.table_id, target.id);
  assert.equal(moved.data.session.table_name, target.name);
  assert.equal(moved.data.session.customer_name, currentSession.customer_name);
  assert.deepEqual({ ...moved.data.transfer, id: "receipt", transferredAt: 0 }, {
    id: "receipt", requestId: body.requestId, sessionId: currentSession.id,
    fromTableId: table.id, fromTableName: table.name, toTableId: target.id, toTableName: target.name, transferredAt: 0,
  });
  assertNoSecrets(moved.data);
  const after = transferState();
  const priorSession = before.table_sessions.find((session) => session.id === currentSession.id);
  const movedSession = after.table_sessions.find((session) => session.id === currentSession.id);
  assert.ok(movedSession.updated_at > priorSession.updated_at, "Every move must advance the visit version, even within one millisecond.");
  assert.deepEqual(movedSession, { ...priorSession, table_id: target.id, table_name: target.name, updated_at: movedSession.updated_at });
  for (const name of ["orders", "service_requests", "table_payment_receipts"]) {
    for (const previous of before[name]) {
      const isCurrent = (previous.dining_session_id ?? previous.session_id) === currentSession.id;
      const expected = isCurrent ? { ...previous, table_id: target.id, table_name: target.name } : previous;
      assert.deepEqual(after[name].find((row) => row.id === previous.id), expected, `${name}/${previous.id} must preserve its original content and payment timestamps.`);
    }
  }
  assert.equal(after.orders.length, paidOrders.length + moreOrders.length + historicalOrders.length);
  assert.equal(after.table_sessions.length, before.table_sessions.length);
  assert.equal(after.table_transfers.length, 1);
  assert.deepEqual(after.table_settlements, before.table_settlements);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM table_sessions WHERE table_id = ? AND status IN ('active','pending')").get(table.id).count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM table_sessions WHERE table_id = ? AND status IN ('active','pending')").get(target.id).count, 1);
  const admin = await call("GET", "admin", undefined, { staff: true });
  assert.equal(admin.status, 200);
  assert.deepEqual(admin.data.transfers.filter((entry) => entry.sessionId === currentSession.id), [moved.data.transfer]);
  assert.ok(admin.data.orders.filter((order) => order.dining_session_id === currentSession.id).every((order) => order.table_id === target.id));
  assert.equal(admin.data.calls.find((entry) => entry.session_id === currentSession.id).table_id, target.id);
  assertNoSecrets(admin.data.transfers);
  assertNoSecrets(admin.data.sessions);
  assert.deepEqual((await revenueReport()).summary, revenueBefore.summary, "A table move changes the table association, not collected revenue.");
});

test("table moves require staff, trusted write requests, valid fields and an active matching source version", async () => {
  const body = tableTransfer();
  const before = transferState();
  for (const options of [{}, { headers: { "oai-authenticated-user-email": "test@example.test" } }, { headers: { "oai-authenticated-user-id": "other-user", "oai-authenticated-user-email": "other@example.test" } }]) {
    assert.equal((await call("PATCH", "admin/table-transfer", body, options)).status, 403);
  }
  for (const headers of [{ origin: "https://untrusted.example.test" }, { "sec-fetch-site": "cross-site" }]) {
    assert.equal((await call("PATCH", "admin/table-transfer", body, { staff: true, headers })).status, 403);
  }
  assert.equal((await call("PATCH", "admin/table-transfer", body, { staff: true, headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal((await call("PATCH", "admin/table-transfer", body, { staff: true, rawBody: "{broken" })).status, 400);
  assert.equal((await call("PATCH", "admin/table-transfer", body, { staff: true, rawBody: "x".repeat(32001) })).status, 413);
  for (const extra of [
    ...[undefined, null, "", 12, {}, "x".repeat(61)].map((sessionId) => ({ sessionId })),
    ...[undefined, null, "", 12, "not-a-uuid"].map((requestId) => ({ requestId })),
    ...[undefined, null, "", 12, {}, "x".repeat(61)].map((fromTableId) => ({ fromTableId })),
    ...[undefined, null, "", 12, {}, "x".repeat(61)].map((toTableId) => ({ toTableId })),
    ...[undefined, null, "", "1", -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map((expectedUpdatedAt) => ({ expectedUpdatedAt })),
    { toTableId: table.id },
  ]) assert.equal((await transferTable({ ...body, ...extra })).status, 400, JSON.stringify(extra));
  for (const extra of [
    { sessionId: crypto.randomUUID() }, { fromTableId: otherTables()[1].id },
    { expectedUpdatedAt: body.expectedUpdatedAt + 1 }, { expectedUpdatedAt: 0 }, { toTableId: "missing" },
  ]) assert.equal((await transferTable({ ...body, ...extra })).status, 409, JSON.stringify(extra));
  assert.deepEqual(transferState(), before);
  const pending = await requestTable(freshTable(), guestB);
  const pendingBody = tableTransfer(otherTables()[1], { sessionId: pending.data.connection.session.id });
  assert.equal((await transferTable(pendingBody)).status, 409);
  const closed = insertClosedVisit();
  assert.equal((await transferTable(tableTransfer(otherTables()[1], { sessionId: closed.id }))).status, 409);
  assert.equal(rowCount("table_transfers"), 0);
});

test("destinations with pending guests, active guests, unfinished old orders or open service calls cannot receive a move", async () => {
  const [pendingTable, activeTable, unpaidTable, preparingTable, callTable] = otherTables();
  assert.equal((await requestTable(pendingTable, guestB)).status, 201);
  await openTable(activeTable, "active-destination-browser");
  insertOrphanOrder(unpaidTable, { status: "served", paid: 0 });
  insertOrphanOrder(preparingTable, { status: "ready", paid: 1 });
  sqlite.prepare("INSERT INTO service_requests (id,table_id,table_name,session_id,kind,status,created_at) VALUES (?,?,?,NULL,'service','open',?)")
    .run("orphan-destination-call", callTable.id, callTable.name, Date.now());
  for (const target of [pendingTable, activeTable, unpaidTable, preparingTable, callTable]) {
    const moved = await transferTable(tableTransfer(target));
    assert.equal(moved.status, 409, target.name + ": " + JSON.stringify(moved.data));
    assert.equal(sqlite.prepare("SELECT table_id FROM table_sessions WHERE id = ?").get(currentSession.id).table_id, table.id);
  }
  assert.equal(rowCount("table_transfers"), 0);
});

test("duplicate move requests produce one receipt and later retries never undo another move or reopen a closed visit", async () => {
  const [target, onward] = otherTables();
  const body = tableTransfer(target);
  const results = await Promise.all([transferTable(body), transferTable(body)]);
  assert.ok(results.every((result) => result.status === 200), JSON.stringify(results));
  assert.deepEqual(results.map((result) => result.data.replayed).sort(), [false, true]);
  assert.deepEqual(results[0].data.transfer, results[1].data.transfer);
  assert.equal(rowCount("table_transfers"), 1);
  const firstReceipt = results[0].data.transfer;
  for (const extra of [{ toTableId: onward.id }, { fromTableId: onward.id }, { expectedUpdatedAt: body.expectedUpdatedAt + 1 }, { sessionId: crypto.randomUUID() }]) {
    assert.equal((await transferTable({ ...body, ...extra })).status, 409, JSON.stringify(extra));
  }
  assert.equal((await transferTable(tableTransfer(onward))).status, 200);
  const again = await transferTable(body);
  assert.equal(again.status, 200);
  assert.equal(again.data.replayed, true);
  assert.deepEqual(again.data.transfer, firstReceipt);
  assert.equal(again.data.session.table_id, onward.id);
  assert.equal(rowCount("table_transfers"), 2);
  assert.equal((await call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true })).status, 200);
  const closedReplay = await transferTable(body);
  assert.equal(closedReplay.status, 200);
  assert.equal(closedReplay.data.replayed, true);
  assert.deepEqual(closedReplay.data.transfer, firstReceipt);
  assert.equal(closedReplay.data.session.status, "closed");
  assert.equal(closedReplay.data.session.table_id, onward.id);
  assert.equal(rowCount("table_transfers"), 2);
  assert.equal(rowCount("table_settlements"), 1);
});

test("the move version rejects a stale A-to-C request even after the same visit moves A-to-B-to-A within one millisecond", async () => {
  const [target, onward] = otherTables();
  const originalBody = tableTransfer(onward);
  const originalNow = Date.now;
  Date.now = () => originalBody.expectedUpdatedAt;
  try {
    assert.equal((await transferTable(tableTransfer(target))).status, 200);
    const middle = sqlite.prepare("SELECT updated_at FROM table_sessions WHERE id = ?").get(currentSession.id).updated_at;
    assert.ok(middle > originalBody.expectedUpdatedAt);
    assert.equal((await transferTable(tableTransfer(table))).status, 200);
    const returned = sqlite.prepare("SELECT table_id,updated_at FROM table_sessions WHERE id = ?").get(currentSession.id);
    assert.equal(returned.table_id, table.id);
    assert.ok(returned.updated_at > middle);
    assert.equal((await transferTable(originalBody)).status, 409);
    assert.equal(rowCount("table_transfers"), 2);
    assert.equal(sqlite.prepare("SELECT table_id FROM table_sessions WHERE id = ?").get(currentSession.id).table_id, table.id);
  } finally {
    Date.now = originalNow;
  }
});

test("the owning browser resolves historical QR links to its new table while the next guest remains isolated at the freed table", async () => {
  const [target, unrelated] = otherTables();
  const first = await call("POST", "orders", checkout({ note: "Nội dung riêng của khách chuyển bàn" }));
  assert.equal(first.status, 201);
  assert.equal((await transferTable(tableTransfer(target))).status, 200);
  const cookie = cookieJars.get(guestA);
  for (const scanned of [table, target]) {
    for (const hint of ["", "&session=" + currentSession.id]) {
      const menu = await call("GET", "menu?table=" + scanned.token + hint);
      assert.equal(menu.status, 200);
      assert.equal(menu.data.table.id, target.id);
      assert.equal(menu.data.table.token, target.token);
      assert.equal(menu.data.connection.state, "active");
      assert.equal(menu.data.connection.session.id, currentSession.id);
      assert.equal(menu.data.connection.session.customer_name, currentSession.customer_name);
      assertNoSecrets(menu.data.connection);
    }
  }
  assert.equal(cookieJars.get(guestA), cookie, "Moving the visit must retain its existing browser binding.");
  const unrelatedScan = await call("GET", "menu?table=" + unrelated.token + "&session=" + currentSession.id);
  assert.equal(unrelatedScan.status, 200);
  assert.equal(unrelatedScan.data.table.id, unrelated.id);
  assert.notEqual(unrelatedScan.data.connection.session?.id, currentSession.id);
  for (const scanned of [table, target]) {
    const intruder = await call("GET", "menu?table=" + scanned.token + "&session=" + currentSession.id, undefined, { guest: guestB });
    assert.equal(intruder.status, 200);
    assert.equal(intruder.data.table.id, scanned.id);
    assert.notEqual(intruder.data.connection.session?.id, currentSession.id);
    assert.equal(JSON.stringify(intruder.data.connection).includes(currentSession.customer_name), false);
  }
  const next = await openTable(table, guestB, "Khách mới tại bàn cũ");
  const nextOrder = await call("POST", "orders", checkout({ sessionId: next.id, note: "Đơn riêng của khách mới" }), { guest: guestB });
  assert.equal(nextOrder.status, 201);
  assert.notEqual(next.id, currentSession.id);
  const ownerViaOldQr = await call("GET", "menu?table=" + table.token);
  assert.equal(ownerViaOldQr.data.table.id, target.id);
  assert.equal(ownerViaOldQr.data.connection.session.id, currentSession.id);
  assert.deepEqual((await call("GET", historyPath(target.token))).data.orders.map((order) => order.id), [first.data.order.id]);
  assert.deepEqual((await call("GET", historyPath(table.token, next.id), undefined, { guest: guestB })).data.orders.map((order) => order.id), [nextOrder.data.order.id]);
  assert.equal((await call("GET", historyPath(target.token), undefined, { guest: guestB })).status, 403);
  assert.equal((await call("GET", historyPath(table.token, next.id))).status, 403);
  assert.equal((await call("POST", "orders", checkout({ tableToken: target.token }), { guest: guestB })).status, 403);
  assert.equal((await call("POST", "calls", serviceCall({ tableToken: target.token }), { guest: guestB })).status, 403);
  const history = (await call("GET", historyPath(target.token))).data.orders;
  assert.ok(history.every((order) => order.table_id === target.id && order.dining_session_id === currentSession.id));
  assertNoSecrets(history);
});

for (const legacy of [false, true]) {
  test(`${legacy ? "legacy table-token" : "current session-based"} order request hashes permit safe retries across a move but reject changed content`, async () => {
    const target = freshTable();
    const submitted = checkout({ note: "Giữ đơn này khi đổi bàn", items: [line({ note: "Ít cay, không hành" })] });
    const created = await call("POST", "orders", submitted);
    assert.equal(created.status, 201, JSON.stringify(created.data));
    if (legacy) {
      const normalized = JSON.stringify({ tableToken: submitted.tableToken, sessionId: currentSession.id, items: submitted.items, note: submitted.note, expectedTotal: submitted.expectedTotal });
      const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized))).toString("hex");
      sqlite.prepare("UPDATE orders SET request_hash = ? WHERE id = ?").run(hash, created.data.order.id);
    }
    assert.equal((await transferTable(tableTransfer(target))).status, 200);
    for (const tableToken of [table.token, target.token]) {
      const replay = await call("POST", "orders", { ...submitted, tableToken });
      assert.equal(replay.status, 200, JSON.stringify(replay.data));
      assert.equal(replay.data.replayed, true);
      assert.equal(replay.data.order.id, created.data.order.id);
      assert.equal(replay.data.order.table_id, target.id);
      assert.equal((await call("POST", "orders", { ...submitted, tableToken, note: "Đã sửa nội dung" })).status, 409);
      assert.equal((await call("POST", "orders", { ...submitted, tableToken }, { guest: guestB })).status, 403);
    }
    assert.equal(rowCount("orders"), 1);
    assert.equal((await call("POST", "orders", checkout())).status, 403, "The historical QR may recover a saved request, but cannot place a fresh order at the freed table.");
    const later = await call("POST", "orders", checkout({ tableToken: target.token }));
    assert.equal(later.status, 201);
    assert.equal(later.data.order.table_id, target.id);
    assert.equal(later.data.order.dining_session_id, currentSession.id);
    assert.equal(rowCount("orders"), 2);
  });
}

test("a resolved support request can reopen on the new table and an old acknowledgement cannot hide the new request", async () => {
  const target = freshTable();
  assert.equal((await call("POST", "calls", serviceCall())).status, 200);
  const old = sqlite.prepare("SELECT * FROM service_requests WHERE id = ?").get(currentSession.id + ":service");
  assert.equal((await transferTable(tableTransfer(target))).status, 200);
  const moved = sqlite.prepare("SELECT * FROM service_requests WHERE id = ?").get(old.id);
  assert.deepEqual({ ...moved }, { ...old, table_id: target.id, table_name: target.name });
  assert.equal((await call("PATCH", "admin/call", { id: old.id, createdAt: old.created_at }, { staff: true })).status, 200);
  const originalNow = Date.now;
  Date.now = () => old.created_at+30001;
  try {
    assert.equal((await call("POST", "calls", serviceCall({ tableToken: target.token }))).status, 200);
  } finally {
    Date.now = originalNow;
  }
  const reopened = sqlite.prepare("SELECT * FROM service_requests WHERE id = ?").get(old.id);
  assert.ok(reopened.created_at > old.created_at);
  assert.equal(reopened.table_id, target.id);
  assert.equal(reopened.status, "open");
  assert.equal((await call("PATCH", "admin/call", { id: old.id, createdAt: old.created_at }, { staff: true })).status, 409);
  const admin = await call("GET", "admin", undefined, { staff: true });
  assert.deepEqual(admin.data.calls.filter((entry) => entry.session_id === currentSession.id), [{ ...reopened }]);
  assert.equal((await call("PATCH", "admin/call", { id: reopened.id, createdAt: reopened.created_at }, { staff: true })).status, 200);
  assert.equal(sqlite.prepare("SELECT status FROM service_requests WHERE id = ?").get(old.id).status, "done");
});

test("closing a moved visit archives the destination, transfer history and original payments without collecting money twice", async () => {
  const target = freshTable();
  const orders = [60000, 40000].map((total) => insertRevenueOrder(table, { total }));
  const collected = await collectTable(tablePayment(await tablePaymentQuote(), { paymentMethod: "bank" }));
  assert.equal(collected.status, 200);
  insertRevenueOrder(table, { total: 12000, status: "cancelled", cancel_reason: "Khách đổi ý" });
  assert.equal((await call("POST", "calls", serviceCall())).status, 200);
  const moved = await transferTable(tableTransfer(target));
  assert.equal(moved.status, 200);
  const report = await revenueReport();
  assert.equal((await call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true })).status, 200);
  const archived = await settlementDetail(currentSession.id);
  assert.equal(archived.settlement.tableId, target.id);
  assert.equal(archived.settlement.tableName, target.name);
  assert.equal(archived.settlement.customerName, currentSession.customer_name);
  assert.equal(archived.settlement.total, 100000);
  assert.equal(archived.settlement.paidTotal, 100000);
  assert.equal(archived.settlement.cancelledTotal, 12000);
  assert.equal(archived.settlement.orderCount, 3);
  assert.deepEqual(archived.transfers, [moved.data.transfer]);
  assert.ok(archived.orders.every((order) => order.table_id === target.id));
  for (const order of orders) assert.deepEqual(paymentState(order.id), { paid: 1, paid_at: collected.data.receipt.paidAt, payment_method: "bank" });
  assert.deepEqual((await revenueReport()).summary, report.summary);
  assert.equal((await call("GET", "admin", undefined, { staff: true })).data.transfers.some((entry) => entry.sessionId === currentSession.id), false);
  const next = await openTable(target, guestB, "Khách sau khi đóng bàn mới");
  const nextOrder = await call("POST", "orders", checkout({ tableToken: target.token, sessionId: next.id }), { guest: guestB });
  assert.equal(nextOrder.status, 201);
  for (const scanned of [table, target]) {
    const menu = await call("GET", "menu?table=" + scanned.token + "&session=" + currentSession.id);
    assert.equal(menu.status, 200);
    assert.notEqual(menu.data.connection.state, "active");
  }
  assert.equal((await call("POST", "orders", checkout({ tableToken: target.token }))).status, 403);
  assert.equal((await call("GET", historyPath(target.token))).status, 403);
  assert.deepEqual(await settlementDetail(currentSession.id), archived, "The next guest's order must not alter the closed visit or its transfer history.");
  assertNoSecrets(archived);
});

test("moving an open visit carries all orders beyond the 200-order administrative archive limit", async () => {
  const target = freshTable();
  const ids = [];
  for (let index = 0; index < 241; index++) ids.push(insertRevenueOrder(table, { total: 1000 }).id);
  assert.equal((await transferTable(tableTransfer(target))).status, 200);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM orders WHERE dining_session_id = ? AND table_id = ?").get(currentSession.id, target.id).count, 241);
  const quote = await tablePaymentQuote();
  assert.equal(quote.session.table_id, target.id);
  assert.equal(quote.unpaidTotal, 241000);
  assert.deepEqual(new Set(quote.orders.map((order) => order.id)), new Set(ids));
  const admin = await call("GET", "admin", undefined, { staff: true });
  assert.equal(admin.data.orders.filter((order) => order.dining_session_id === currentSession.id && order.table_id === target.id).length, 241);
});

test("competing moves of the same visit have one winner and cannot split its orders between destinations", { timeout: 5000 }, async () => {
  const [slowTarget, winningTarget] = otherTables();
  const orders = [50000, 30000].map((total) => insertRevenueOrder(table, { total }));
  assert.equal((await call("POST", "calls", serviceCall())).status, 200);
  const pause = pauseNextWrite((sql) => /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+table_transfers\b/i.test(sql));
  const slow = transferTable(tableTransfer(slowTarget));
  let winner;
  try {
    await pause.reached;
    winner = await transferTable(tableTransfer(winningTarget));
    assert.equal(winner.status, 200, JSON.stringify(winner.data));
  } finally {
    pause.release();
    beforeWrite = null;
  }
  assert.equal((await slow).status, 409);
  assert.equal(rowCount("table_transfers"), 1);
  assert.equal(sqlite.prepare("SELECT table_id FROM table_sessions WHERE id = ?").get(currentSession.id).table_id, winningTarget.id);
  for (const order of orders) assert.equal(sqlite.prepare("SELECT table_id FROM orders WHERE id = ?").get(order.id).table_id, winningTarget.id);
  assert.equal(sqlite.prepare("SELECT table_id FROM service_requests WHERE id = ?").get(currentSession.id + ":service").table_id, winningTarget.id);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM table_sessions WHERE table_id = ? AND status IN ('pending','active')").get(slowTarget.id).count, 0);
});

test("a destination claimed by another guest before the move transaction makes the entire move fail", { timeout: 5000 }, async () => {
  const target = freshTable();
  const order = insertRevenueOrder();
  const pause = pauseNextWrite((sql) => /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+table_transfers\b/i.test(sql));
  const pending = transferTable(tableTransfer(target));
  let reservation;
  try {
    await pause.reached;
    reservation = await requestTable(target, guestB, "Khách vừa quét bàn đích");
    assert.equal(reservation.status, 201);
  } finally {
    pause.release();
    beforeWrite = null;
  }
  assert.equal((await pending).status, 409);
  assert.equal(rowCount("table_transfers"), 0);
  assert.equal(sqlite.prepare("SELECT table_id FROM table_sessions WHERE id = ?").get(currentSession.id).table_id, table.id);
  assert.equal(sqlite.prepare("SELECT table_id FROM orders WHERE id = ?").get(order.id).table_id, table.id);
  assert.equal(sqlite.prepare("SELECT status FROM table_sessions WHERE id = ?").get(reservation.data.connection.session.id).status, "pending");
});

test("a guest claim paused before insertion cannot occupy a destination after a transfer wins it", { timeout: 5000 }, async () => {
  const target = freshTable();
  const pause = pauseNextWrite((sql) => /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+table_sessions\b/i.test(sql));
  const pending = requestTable(target, guestB, "Khách quét cùng thời điểm");
  try {
    await pause.reached;
    assert.equal((await transferTable(tableTransfer(target))).status, 200);
  } finally {
    pause.release();
    beforeWrite = null;
  }
  assert.equal((await pending).status, 409);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM table_sessions WHERE table_id = ? AND status IN ('pending','active')").get(target.id).count, 1);
  assert.equal(sqlite.prepare("SELECT id FROM table_sessions WHERE table_id = ? AND status = 'active'").get(target.id).id, currentSession.id);
  const denied = await call("GET", "menu?table=" + target.token, undefined, { guest: guestB });
  assert.equal(denied.data.connection.state, "blocked");
  assert.equal(denied.data.connection.session, undefined);
});

test("an order authorized at the old table cannot insert there after a move and can safely retry at the new table", { timeout: 5000 }, async () => {
  const target = freshTable();
  const submitted = checkout();
  const pause = pauseNextWrite((sql) => /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+orders\b/i.test(sql));
  const pending = call("POST", "orders", submitted);
  try {
    await pause.reached;
    assert.equal((await transferTable(tableTransfer(target))).status, 200);
  } finally {
    pause.release();
    beforeWrite = null;
  }
  assert.ok([403, 409].includes((await pending).status));
  assert.equal(rowCount("orders"), 0);
  const refreshed = await call("GET", "menu?table=" + table.token + "&session=" + currentSession.id);
  assert.equal(refreshed.data.table.id, target.id);
  const retry = await call("POST", "orders", { ...submitted, tableToken: refreshed.data.table.token });
  assert.equal(retry.status, 201);
  assert.equal(retry.data.order.table_id, target.id);
  assert.equal(retry.data.order.dining_session_id, currentSession.id);
  assert.equal(rowCount("orders"), 1);
});

test("a support call authorized before a move cannot create a stranded notification on the freed table", { timeout: 5000 }, async () => {
  const target = freshTable();
  const pause = pauseNextWrite((sql) => /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+service_requests\b/i.test(sql));
  const pending = call("POST", "calls", serviceCall());
  try {
    await pause.reached;
    assert.equal((await transferTable(tableTransfer(target))).status, 200);
  } finally {
    pause.release();
    beforeWrite = null;
  }
  assert.ok([403, 409].includes((await pending).status));
  assert.equal(rowCount("service_requests"), 0);
  assert.equal((await call("POST", "calls", serviceCall({ tableToken: target.token }))).status, 200);
  const saved = sqlite.prepare("SELECT * FROM service_requests WHERE id = ?").get(currentSession.id + ":service");
  assert.equal(saved.table_id, target.id);
  assert.equal(saved.status, "open");
});

test("a close started before a transfer archives the current destination atomically", { timeout: 5000 }, async () => {
  const target = freshTable();
  insertRevenueOrder(table, { total: 50000, paid: 1, paid_at: Date.now(), payment_method: "cash" });
  assert.equal((await call("POST", "calls", serviceCall())).status, 200);
  const pause = pauseNextWrite((sql) => /UPDATE\s+table_sessions\s+SET\s+status\s*=\s*'closed'/i.test(sql));
  const pending = call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true });
  let moved;
  try {
    await pause.reached;
    moved = await transferTable(tableTransfer(target));
    assert.equal(moved.status, 200);
  } finally {
    pause.release();
    beforeWrite = null;
  }
  assert.equal((await pending).status, 200);
  const session = sqlite.prepare("SELECT * FROM table_sessions WHERE id = ?").get(currentSession.id);
  assert.equal(session.table_id, target.id);
  assert.equal(session.status, "closed");
  const archive = await settlementDetail(currentSession.id);
  assert.equal(archive.settlement.tableId, target.id);
  assert.equal(archive.settlement.total, 50000);
  assert.deepEqual(archive.transfers, [moved.data.transfer]);
  assert.equal(sqlite.prepare("SELECT status FROM service_requests WHERE id = ?").get(currentSession.id + ":service").status, "done");
});

test("a move paused before its transaction cannot resurrect a visit that was already closed", { timeout: 5000 }, async () => {
  const target = freshTable();
  const pause = pauseNextWrite((sql) => /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+table_transfers\b/i.test(sql));
  const pending = transferTable(tableTransfer(target));
  try {
    await pause.reached;
    assert.equal((await call("PATCH", "admin/session", { id: currentSession.id, action: "close" }, { staff: true })).status, 200);
  } finally {
    pause.release();
    beforeWrite = null;
  }
  assert.equal((await pending).status, 409);
  assert.equal(rowCount("table_transfers"), 0);
  const session = sqlite.prepare("SELECT * FROM table_sessions WHERE id = ?").get(currentSession.id);
  assert.equal(session.table_id, table.id);
  assert.equal(session.status, "closed");
  assert.equal((await settlementDetail(currentSession.id)).settlement.tableId, table.id);
});

test("a table payment paused before collection follows the same visit and records its destination after a move", { timeout: 5000 }, async () => {
  const target = freshTable();
  const orders = [60000, 40000].map((total) => insertRevenueOrder(table, { total }));
  const body = tablePayment(await tablePaymentQuote(), { paymentMethod: "bank" });
  const pause = pauseNextWrite((sql) => /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+table_payment_receipts\b/i.test(sql));
  const pending = collectTable(body);
  try {
    await pause.reached;
    assert.equal((await transferTable(tableTransfer(target))).status, 200);
  } finally {
    pause.release();
    beforeWrite = null;
  }
  const collected = await pending;
  assert.equal(collected.status, 200, JSON.stringify(collected.data));
  assert.equal(collected.data.receipt.amount, 100000);
  for (const order of orders) {
    assert.deepEqual(paymentState(order.id), { paid: 1, paid_at: collected.data.receipt.paidAt, payment_method: "bank" });
    assert.equal(sqlite.prepare("SELECT table_id FROM orders WHERE id = ?").get(order.id).table_id, target.id);
  }
  const receipt = sqlite.prepare("SELECT * FROM table_payment_receipts WHERE request_id = ?").get(body.requestId);
  assert.equal(receipt.table_id, target.id);
  assert.equal(receipt.table_name, target.name);
  assert.equal(receipt.session_id, currentSession.id);
  const replay = await collectTable(body);
  assert.equal(replay.data.replayed, true);
  assert.deepEqual(replay.data.receipt, collected.data.receipt);
  assert.equal(rowCount("table_payment_receipts"), 1);
  assert.equal((await revenueReport()).summary.collected, 100000);
});

test("an individual payment read before a table move stays attached to the same order at its new table", { timeout: 5000 }, async () => {
  const target = freshTable();
  const order = insertRevenueOrder(table, { total: 70000 });
  const pause = pauseNextWrite((sql) => /UPDATE\s+orders\s+SET\s+paid\s*=\s*1/i.test(sql));
  const pending = call("PATCH", "admin/order", { id: order.id, action: "paid", paymentMethod: "cash" }, { staff: true });
  try {
    await pause.reached;
    assert.equal((await transferTable(tableTransfer(target))).status, 200);
  } finally {
    pause.release();
    beforeWrite = null;
  }
  assert.equal((await pending).status, 200);
  const saved = sqlite.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
  assert.equal(saved.table_id, target.id);
  assert.equal(saved.table_name, target.name);
  assert.equal(saved.dining_session_id, currentSession.id);
  assert.equal(saved.paid, 1);
  assert.equal(saved.payment_method, "cash");
  assert.ok(saved.paid_at > 0);
  assert.equal((await revenueReport()).summary.collected, 70000);
});

for (const brokenTable of ["table_sessions", "orders", "service_requests", "table_payment_receipts"]) {
  test(`a ${brokenTable} write failure rolls back the transfer, every table reference and its audit receipt`, async () => {
    const target = freshTable();
    insertRevenueOrder(table, { total: 30000 });
    assert.equal((await collectTable(tablePayment(await tablePaymentQuote()))).status, 200);
    insertRevenueOrder(table, { total: 20000, status: "preparing" });
    assert.equal((await call("POST", "calls", serviceCall())).status, 200);
    const before = transferState();
    const body = tableTransfer(target);
    sqlite.exec(`CREATE TRIGGER fail_table_transfer BEFORE UPDATE OF table_id ON ${brokenTable} BEGIN SELECT RAISE(ABORT,'Simulated transfer storage failure'); END;`);
    try {
      const failed = await transferTable(body);
      assert.equal(failed.status, 500);
      assert.deepEqual(transferState(), before, "A partial write must not leave a moved session, orphaned call, changed receipt or successful-looking transfer history.");
    } finally {
      sqlite.exec("DROP TRIGGER fail_table_transfer");
    }
    const retry = await transferTable(body);
    assert.equal(retry.status, 200, JSON.stringify(retry.data));
    assert.equal(retry.data.replayed, false);
    assert.equal(rowCount("table_transfers"), 1);
    assert.equal(sqlite.prepare("SELECT table_id FROM table_sessions WHERE id = ?").get(currentSession.id).table_id, target.id);
  });
}

test("account access is private to the signed-in identity and unknown users cannot read administrative data", async () => {
  const employee = await grantStaff(["orders.view"]);
  const unauthenticated = await call("GET", "account");
  assert.equal(unauthenticated.status, 200);
  assert.equal(unauthenticated.data.access.isStaff, false);
  assert.deepEqual(unauthenticated.data.access.permissions, []);
  assert.equal(unauthenticated.data.access.account, null);
  for (const options of [
    {},
    { headers: { "oai-authenticated-user-email": "test@example.test" } },
    { headers: { "oai-authenticated-user-id": "test-owner-id" } },
    { identity: { id: "uninvited-user", email: "uninvited@example.test" } },
  ]) {
    for (const path of ["admin", "admin/accounts", "admin/revenue", "admin/table-payment?session=" + currentSession.id]) {
      const result = await call("GET", path, undefined, options);
      assert.equal(result.status, 403, `${path}: ${JSON.stringify(result.data)}`);
      assert.equal(JSON.stringify(result.data).includes(employee.account.email), false);
    }
  }
  const own = await call("GET", "account", undefined, { identity: employee.identity });
  assert.equal(own.data.access.isStaff, true);
  assert.equal(own.data.access.isOwner, false);
  assert.deepEqual(own.data.access.permissions, ["orders.view"]);
  assert.equal(own.data.access.account.email, employee.identity.email);
  assert.equal(JSON.stringify(own.data).includes("test@example.test"), false);
  assert.equal(own.data.accounts, undefined);
  assert.equal(own.data.audit, undefined);
  assert.equal(own.headers.get("cache-control"), "no-store");
});

test("staff invitations normalize names and email, bind a stable identity and reject reused email by another identity", async () => {
  const employee = await grantStaff(["orders.manage"], { email: "  LAN.Staff@Example.Test  ", name: "  Lan phụ bếp  " });
  assert.equal(employee.account.email, "lan.staff@example.test");
  assert.equal(employee.account.name, "Lan phụ bếp");
  assert.equal(employee.account.userBound, true);
  assert.deepEqual(new Set(employee.access.permissions), new Set(["orders.view", "orders.manage"]));
  const secondBrowser = await call("GET", "admin", undefined, { identity: { id: "different-account-id", email: employee.identity.email } });
  assert.equal(secondBrowser.status, 403, "A platform identity cannot reuse a claimed email invitation.");
  const changedEmail = await call("GET", "account", undefined, { identity: { ...employee.identity, email: "lan.changed@example.test" } });
  assert.equal(changedEmail.data.access.isStaff, true, "Permissions follow the previously bound platform user ID.");
  assert.equal(changedEmail.data.access.account.id, employee.account.id);
  const stored = sqlite.prepare("SELECT user_id, email FROM staff_accounts WHERE id = ?").get(employee.account.id);
  assert.equal(stored.user_id, employee.identity.id);
  assert.equal(stored.email, "lan.staff@example.test");
  const duplicate = await call("POST", "admin/accounts", { email: "LAN.STAFF@EXAMPLE.TEST", name: "Người khác", role: "custom", permissions: ["orders.view"], status: "active" }, { staff: true });
  assert.equal(duplicate.status, 409);
});

test("configured owners bind once, reject recycled emails and lose owner access when removed from configuration", async () => {
  const owner = await call("GET", "account", undefined, { staff: true });
  assert.equal(owner.data.access.isOwner, true);
  assert.deepEqual(new Set(owner.data.access.permissions), new Set(staffPermissions));
  const changedEmail = await call("GET", "admin", undefined, { identity: { id: "test-owner-id", email: "owner-changed@example.test" } });
  assert.equal(changedEmail.status, 200);
  assert.equal(changedEmail.data.access.isOwner, true);
  const recycled = await call("GET", "admin", undefined, { identity: { id: "recycled-owner-email", email: "test@example.test" } });
  assert.equal(recycled.status, 403);
  const protectedOwner = (await accountsList()).accounts.find((account) => account.protected && account.email === "test@example.test");
  assert.ok(protectedOwner);
  assert.equal(protectedOwner.userBound, true);
  environment.STAFF_EMAILS = "";
  assert.equal((await call("GET", "admin", undefined, { staff: true })).status, 403);
});

test("permission changes and suspension take effect on the very next API request without a fresh login", async () => {
  const employee = await grantStaff(["menu.manage"]);
  const item = initialMenu.items[0];
  assert.equal((await call("PATCH", "admin/item", { id: item.id, toggle: 0 }, { identity: employee.identity })).status, 200);
  const changed = await call("PATCH", "admin/accounts", accountUpdate(employee.account, { permissions: ["revenue.view"] }), { staff: true });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal((await call("PATCH", "admin/item", { id: item.id, toggle: 1 }, { identity: employee.identity })).status, 403);
  assert.equal((await call("GET", "admin/revenue", undefined, { identity: employee.identity })).status, 200);
  const suspended = await call("PATCH", "admin/accounts", accountUpdate(changed.data.account, { status: "suspended" }), { staff: true });
  assert.equal(suspended.status, 200, JSON.stringify(suspended.data));
  const own = await call("GET", "account", undefined, { identity: employee.identity });
  assert.equal(own.data.access.isStaff, false);
  assert.deepEqual(own.data.access.permissions, []);
  for (const path of ["admin", "admin/revenue", "admin/accounts"]) assert.equal((await call("GET", path, undefined, { identity: employee.identity })).status, 403);
  const reactivated = await call("PATCH", "admin/accounts", accountUpdate(suspended.data.account, { status: "active" }), { staff: true });
  assert.equal(reactivated.status, 200);
  assert.equal((await call("GET", "admin/revenue", undefined, { identity: employee.identity })).status, 200);
  assert.equal((await call("PATCH", "admin/item", { id: item.id, toggle: 1 }, { identity: employee.identity })).status, 403);
  const audit = (await accountsList()).audit.filter((entry) => entry.accountId === employee.account.id);
  assert.deepEqual(new Set(audit.map((entry) => entry.action)), new Set(["created", "updated", "suspended", "reactivated"]));
});

test("account management denies self modification, configured owner edits and grants beyond the manager's own scope", async () => {
  const limitedManager = await grantStaff(["staff.manage", "orders.view"]);
  const target = await grantStaff(["orders.view"]);
  const stronger = await grantStaff(["payments.collect"]);
  const options = { identity: limitedManager.identity };
  const self = await call("PATCH", "admin/accounts", accountUpdate(limitedManager.account, { name: "Tự đổi quyền" }), options);
  assert.equal(self.status, 403);
  const owner = (await accountsList()).accounts.find((account) => account.protected);
  assert.ok(owner);
  assert.equal((await call("PATCH", "admin/accounts", accountUpdate(owner, { status: "suspended" }), { staff: true })).status, 403);
  assert.equal((await call("PATCH", "admin/accounts", accountUpdate(owner, { status: "suspended" }), options)).status, 403);
  assert.equal((await call("PATCH", "admin/accounts", accountUpdate(stronger.account, { permissions: ["orders.view"] }), options)).status, 403, "A manager cannot seize control of an account with broader existing rights.");
  const allowed = await call("PATCH", "admin/accounts", accountUpdate(target.account, { name: "Phục vụ ca tối" }), options);
  assert.equal(allowed.status, 200, JSON.stringify(allowed.data));
  assert.equal((await call("PATCH", "admin/accounts", accountUpdate(allowed.data.account, { permissions: ["orders.view", "payments.collect"] }), options)).status, 403);
  const deniedCreate = await call("POST", "admin/accounts", { email: "escalated@example.test", name: "Xin quyền thu tiền", role: "custom", permissions: ["payments.collect"], status: "active" }, options);
  assert.equal(deniedCreate.status, 403);
  assert.equal(sqlite.prepare("SELECT id FROM staff_accounts WHERE email = ?").get("escalated@example.test"), undefined);
  const scoped = await grantStaff(["orders.view"], { name: "Nhân viên trong phạm vi" }, options);
  assert.equal(scoped.access.isStaff, true);
});

test("account writes require trusted same-origin JSON and reject malformed roles or permissions without partial changes", async () => {
  const target = await grantStaff(["orders.view"]);
  const newBody = { email: "new-staff@example.test", name: "Nhân viên mới", role: "custom", permissions: ["orders.view"], status: "active" };
  for (const [headers, expected] of [
    [{ origin: "https://untrusted.example.test" }, 403],
    [{ "sec-fetch-site": "cross-site" }, 403],
    [{ "content-type": "text/plain" }, 415],
  ]) {
    const before = staffStorage();
    assert.equal((await call("POST", "admin/accounts", newBody, { staff: true, headers })).status, expected);
    assert.equal((await call("PATCH", "admin/accounts", accountUpdate(target.account, { name: "Thay đổi bị chặn" }), { staff: true, headers })).status, expected);
    assert.deepEqual(staffStorage(), before);
  }
  for (const invalid of [
    { email: "invalid-email" }, { email: "a\nb@example.test" }, { name: "" }, { role: "owner" },
    { permissions: ["superuser"] }, { permissions: [] }, { permissions: "orders.view" },
    { status: "deleted" }, { role: "kitchen", permissions: ["payments.collect"] },
  ]) {
    const before = staffStorage();
    const result = await call("POST", "admin/accounts", { ...newBody, ...invalid }, { staff: true });
    assert.equal(result.status, 400, JSON.stringify({ invalid, response: result.data }));
    assert.deepEqual(staffStorage(), before);
  }
  const before = staffStorage();
  for (const expectedVersion of [-1, 1.5, "1", null]) {
    assert.equal((await call("PATCH", "admin/accounts", accountUpdate(target.account, { expectedVersion }), { staff: true })).status, 400);
  }
  assert.deepEqual(staffStorage(), before);
});

test("stale and simultaneous staff edits cannot overwrite newer permissions or create duplicate audits", async () => {
  const target = await grantStaff(["orders.view"]);
  const initialAudit = (await accountsList()).audit.filter((entry) => entry.accountId === target.account.id).length;
  const writes = await Promise.all([
    call("PATCH", "admin/accounts", accountUpdate(target.account, { name: "Thu ngân", permissions: ["payments.collect"] }), { staff: true }),
    call("PATCH", "admin/accounts", accountUpdate(target.account, { name: "Phục vụ", permissions: ["orders.manage"] }), { staff: true }),
  ]);
  assert.deepEqual(writes.map((result) => result.status).sort(), [200, 409]);
  const winner = writes.find((result) => result.status === 200).data.account;
  assert.equal(winner.version, target.account.version + 1);
  const current = await call("GET", "account", undefined, { identity: target.identity });
  assert.equal(current.data.access.account.name, winner.name);
  assert.deepEqual(current.data.access.permissions, winner.permissions);
  const stale = await call("PATCH", "admin/accounts", accountUpdate(target.account, { status: "suspended" }), { staff: true });
  assert.equal(stale.status, 409);
  assert.equal((await accountsList()).audit.filter((entry) => entry.accountId === target.account.id).length, initialAudit + 1);
});

test("account and audit writes roll back together when the audit store fails", async () => {
  const target = await grantStaff(["orders.view"]);
  const before = staffStorage();
  sqlite.exec("CREATE TRIGGER fail_staff_audit BEFORE INSERT ON staff_account_audit BEGIN SELECT RAISE(ABORT,'Simulated staff audit failure'); END;");
  try {
    const create = await call("POST", "admin/accounts", { email: "rolled-back@example.test", name: "Không được lưu một phần", role: "custom", permissions: ["orders.view"], status: "active" }, { staff: true });
    assert.equal(create.status, 500);
    assert.deepEqual(staffStorage(), before);
    const update = await call("PATCH", "admin/accounts", accountUpdate(target.account, { permissions: ["payments.collect"] }), { staff: true });
    assert.equal(update.status, 500);
    assert.deepEqual(staffStorage(), before);
  } finally {
    sqlite.exec("DROP TRIGGER fail_staff_audit");
  }
});

test("revoking a manager while an account write is in flight prevents that stale manager from granting access", async () => {
  const manager = await grantStaff(["staff.manage", "orders.view"]);
  const pause = pauseNextWrite((sql) => /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+staff_accounts/i.test(sql));
  const pending = call("POST", "admin/accounts", { email: "revoked-grant@example.test", name: "Yêu cầu đang gửi", role: "custom", permissions: ["orders.view"], status: "active" }, { identity: manager.identity });
  await pause.reached;
  try {
    const suspended = await call("PATCH", "admin/accounts", accountUpdate(manager.account, { status: "suspended" }), { staff: true });
    assert.equal(suspended.status, 200, JSON.stringify(suspended.data));
  } finally {
    pause.release();
  }
  const result = await pending;
  assert.ok([403, 409].includes(result.status), JSON.stringify(result.data));
  assert.equal(sqlite.prepare("SELECT id FROM staff_accounts WHERE email = ?").get("revoked-grant@example.test"), undefined);
  assert.equal(sqlite.prepare("SELECT id FROM staff_account_audit WHERE account_email = ?").get("revoked-grant@example.test"), undefined);
});

test("administrative snapshots redact revenue, QR tokens, historical receipts and unrelated management sections", async () => {
  const live = insertRevenueOrder(table, { total: 37000, status: "preparing", paid: 0 });
  const oldVisit = insertClosedVisit(table);
  const old = insertRevenueOrder(table, { dining_session_id: oldVisit.id, total: 912345, paid: 1, paid_at: Date.now(), status: "served", note: "Lịch sử doanh thu riêng" });
  const operations = await grantStaff(["orders.view"]);
  const operational = await call("GET", "admin", undefined, { identity: operations.identity });
  assert.equal(operational.status, 200);
  assert.deepEqual(operational.data.items, []);
  assert.deepEqual(operational.data.stats, { todayCount: null, todayCollected: null });
  assert.ok(operational.data.orders.some((order) => order.id === live.id));
  assert.equal(operational.data.orders.some((order) => order.id === old.id), false);
  assert.ok(operational.data.sessions.some((session) => session.id === currentSession.id));
  operational.data.tables.forEach((entry) => assert.equal(entry.token, undefined));
  const reportViewer = await grantStaff(["revenue.view"]);
  const report = await call("GET", "admin", undefined, { identity: reportViewer.identity });
  assert.equal(report.status, 200);
  for (const field of ["items", "orders", "sessions", "calls", "transfers"]) assert.deepEqual(report.data[field], [], field);
  assert.equal(report.data.stats.todayCollected, 912345);
  assert.ok(report.data.tables.length > 0);
  report.data.tables.forEach((entry) => assert.equal(entry.token, undefined));
  const menuEditor = await grantStaff(["menu.manage"]);
  const menuAdmin = await call("GET", "admin", undefined, { identity: menuEditor.identity });
  assert.equal(menuAdmin.status, 200);
  assert.equal(menuAdmin.data.items.length, initialMenu.items.length);
  for (const field of ["tables", "orders", "sessions", "calls", "transfers"]) assert.deepEqual(menuAdmin.data[field], [], field);
  assert.deepEqual(menuAdmin.data.stats, { todayCount: null, todayCollected: null });
  const tableManager = await grantStaff(["tables.manage"]);
  const tables = await call("GET", "admin", undefined, { identity: tableManager.identity });
  assert.equal(tables.status, 200);
  assert.equal(tables.data.tables.find((entry) => entry.id === table.id).token, table.token);
  for (const response of [operational, report, menuAdmin, tables]) {
    assert.equal(response.data.accounts, undefined);
    assert.equal(response.data.audit, undefined);
    assert.equal(JSON.stringify(response.data).includes("test@example.test"), false);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

function operationalStorage() {
  const tables = ["orders", "settings", "menu_items", "dining_tables", "table_sessions", "service_requests", "table_payment_receipts", "table_transfers", "table_settlements"];
  return Object.fromEntries(tables.map((name) => [name, sqlite.prepare(`SELECT * FROM ${name} ORDER BY ${name === "settings" ? "key" : name === "table_settlements" ? "session_id" : "id"}`).all().map((row) => ({ ...row }))]));
}

const protectedWrites = [
  { name: "advancing an order", path: "admin/order", permission: "orders.manage", body: ({ order }) => ({ id: order.id, status: "preparing" }) },
  { name: "cancelling an order", path: "admin/order", permission: "orders.cancel", body: ({ order }) => ({ id: order.id, status: "cancelled", reason: "Khách đổi ý" }) },
  { name: "collecting a single order", path: "admin/order", permission: "payments.collect", body: ({ order }) => ({ id: order.id, action: "paid", paymentMethod: "cash" }) },
  { name: "collecting a table balance", path: "admin/table-payment", permission: "payments.collect", body: async () => {sqlite.prepare("UPDATE orders SET status = 'served' WHERE dining_session_id = ?").run(currentSession.id);return tablePayment(await tablePaymentQuote());} },
  { name: "approving a table", path: "admin/session", permission: "tables.manage", body: async () => {
    const pending = await requestTable(freshTable(), guestB, "Khách mới");
    assert.equal(pending.status, 201);
    return { id: pending.data.connection.session.id, action: "approve" };
  } },
  { name: "closing a paid and served table", path: "admin/session", permission: "tables.manage", body: () => {
    sqlite.prepare("UPDATE orders SET status = 'served', paid = 1, paid_at = ?, payment_method = 'cash' WHERE dining_session_id = ?").run(Date.now(), currentSession.id);
    return { id: currentSession.id, action: "close" };
  } },
  { name: "renaming a physical table", path: "admin/table", permission: "tables.manage", body: () => ({ id: table.id, name: "Bàn sân vườn", zone: "Khu mới" }) },
  { name: "resolving a support request", path: "admin/call", permission: "tables.manage", body: async () => {
    assert.equal((await call("POST", "calls", serviceCall())).status, 200);
    const support = sqlite.prepare("SELECT * FROM service_requests WHERE session_id = ? AND kind = 'service'").get(currentSession.id);
    return { id: support.id, createdAt: support.created_at };
  } },
  { name: "transferring a table", path: "admin/table-transfer", permission: "tables.transfer", body: () => tableTransfer() },
  { name: "editing the menu", path: "admin/item", permission: "menu.manage", body: () => ({ id: initialMenu.items[0].id, toggle: 0 }) },
  { name: "editing shop information", path: "admin/shop", permission: "settings.manage", body: () => ({ ...initialMenu.shop, tagline: "Thông tin đã được cấp quyền cập nhật" }) },
  { name: "editing display settings", path: "admin/display-settings", permission: "settings.manage", body: () => ({ popupSeconds: 8, fontPercent: 180, foodImagePercent: 220 }) },
  { name: "editing theme settings", path: "admin/theme-settings", permission: "settings.manage", body: () => ({ accentColor: "#65428f", textColor: "#352d43" }) },
];

for (const operation of protectedWrites) {
  test(`only ${operation.permission} authorizes ${operation.name}, even when every other permission is granted`, async () => {
    const ordered = await call("POST", "orders", checkout());
    assert.equal(ordered.status, 201, JSON.stringify(ordered.data));
    const body = await operation.body({ order: ordered.data.order });
    const denied = await grantStaff(staffPermissions.filter((permission) => permission !== operation.permission));
    const allowed = await grantStaff([operation.permission]);
    const before = operationalStorage();
    const rejected = await call("PATCH", operation.path, body, { identity: denied.identity });
    assert.equal(rejected.status, 403, JSON.stringify(rejected.data));
    assert.deepEqual(operationalStorage(), before, "Denied permission must not mutate operational or financial state.");
    const accepted = await call("PATCH", operation.path, body, { identity: allowed.identity });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  });
}

test("read endpoints enforce their own permission independently of every other granted permission", async () => {
  const closed = insertClosedVisit(table);
  insertRevenueOrder(table, { dining_session_id: closed.id, paid: 1, paid_at: closed.closed_at - 1000 });
  assert.equal((await call("POST", "orders", checkout())).status, 201);
  const endpoints = [
    { path: "admin/revenue", permission: "revenue.view" },
    { path: "admin/revenue/orders", permission: "revenue.view" },
    { path: "admin/revenue/settlements", permission: "revenue.view" },
    { path: "admin/revenue/settlements/" + closed.id, permission: "revenue.view" },
    { path: "admin/table-payment?session=" + currentSession.id, permission: "payments.collect" },
    { path: "admin/accounts", permission: "staff.manage" },
  ];
  for (const permission of staffPermissions) {
    const employee = await grantStaff([permission]);
    for (const endpoint of endpoints) {
      const response = await call("GET", endpoint.path, undefined, { identity: employee.identity });
      assert.equal(response.status, permission === endpoint.permission ? 200 : 403, `${permission} -> ${endpoint.path}: ${JSON.stringify(response.data)}`);
    }
  }
});

test("account writes cannot be performed with all permissions except staff.manage", async () => {
  const actor = await grantStaff(staffPermissions.filter((permission) => permission !== "staff.manage"));
  const target = await grantStaff(["orders.view"]);
  const options = { identity: actor.identity };
  const auditCount = sqlite.prepare("SELECT COUNT(*) AS count FROM staff_account_audit").get().count;
  const beforeTarget = { ...sqlite.prepare("SELECT * FROM staff_accounts WHERE id = ?").get(target.account.id) };
  assert.equal((await call("GET", "admin/accounts", undefined, options)).status, 403);
  const created = await call("POST", "admin/accounts", { email: "unauthorized-invite@example.test", name: "Không có quyền", role: "custom", permissions: ["orders.view"], status: "active" }, options);
  assert.equal(created.status, 403);
  assert.equal((await call("PATCH", "admin/accounts", accountUpdate(target.account, { status: "suspended" }), options)).status, 403);
  assert.equal(sqlite.prepare("SELECT id FROM staff_accounts WHERE email = ?").get("unauthorized-invite@example.test"), undefined);
  assert.deepEqual({ ...sqlite.prepare("SELECT * FROM staff_accounts WHERE id = ?").get(target.account.id) }, beforeTarget);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM staff_account_audit").get().count, auditCount);
});

test("kitchen preset can prepare food but cannot cancel orders, collect money or change shop settings", async () => {
  const employee = await grantStaff(["orders.view", "orders.manage"], { role: "kitchen" });
  const response = await call("POST", "orders", checkout());
  assert.equal(response.status, 201);
  const id = response.data.order.id;
  const options = { identity: employee.identity };
  assert.equal((await call("PATCH", "admin/order", { id, status: "preparing" }, options)).status, 200);
  const before = operationalStorage();
  assert.equal((await call("PATCH", "admin/order", { id, status: "cancelled", reason: "Không được tự hủy" }, options)).status, 403);
  assert.equal((await call("PATCH", "admin/order", { id, action: "paid", paymentMethod: "cash" }, options)).status, 403);
  assert.equal((await call("PATCH", "admin/shop", { ...initialMenu.shop, open: false }, options)).status, 403);
  assert.deepEqual(operationalStorage(), before);
});

test("support note persists, duplicate does not overwrite, and next request replaces resolved note", async () => {
  assert.equal((await call("POST","calls",serviceCall({note:"Thêm bát"}))).status,200);
  const read=()=>sqlite.prepare("SELECT * FROM service_requests WHERE session_id = ? AND kind = 'service'").get(currentSession.id);
  const first=read(); assert.equal(first.note,"Thêm bát");
  assert.equal((await call("POST","calls",serviceCall({note:"Khác"}))).status,200);
  assert.equal(read().note,"Thêm bát");assert.equal(read().created_at,first.created_at);
  assert.equal((await call("PATCH","admin/call",{id:first.id,createdAt:first.created_at},{staff:true})).status,200);
  assert.equal((await call("POST","calls",serviceCall({note:"Thêm nước"}))).status,429);
  const clock=Date.now;Date.now=()=>first.created_at+30001;try{assert.equal((await call("POST","calls",serviceCall({note:"Thêm nước"}))).status,200);}finally{Date.now=clock;}
  assert.equal(read().note,"Thêm nước");assert.ok(read().created_at>first.created_at);
  assert.equal((await call("POST","calls",serviceCall({note:"x".repeat(301)}))).status,400);
});

test("guest cancellation changes only the owned new unpaid order and retries do not overwrite the reason", async () => {
 const first=(await call("POST","orders",checkout())).data.order;
 const other=(await call("POST","orders",checkout())).data.order;
 const body={id:first.id,tableToken:table.token,sessionId:currentSession.id,reason:"Đặt nhầm món"};
 const result=await call("POST","orders/cancel",body);
 assert.equal(result.status,200);assert.equal(result.data.order.status,"cancelled");assert.equal(result.data.order.cancel_reason,"Khách hủy: Đặt nhầm món");assertNoSecrets(result.data);
 const replay=await call("POST","orders/cancel",{...body,reason:"Đổi ý"});
 assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);assert.equal(replay.data.order.cancel_reason,result.data.order.cancel_reason);
 assert.equal(sqlite.prepare("SELECT status FROM orders WHERE id = ?").get(other.id).status,"new");
});

test("guest cancellation rejects another browser, another visit, invalid reasons and cross-origin writes", async () => {
 const order=(await call("POST","orders",checkout())).data.order;
 const body={id:order.id,tableToken:table.token,sessionId:currentSession.id,reason:"Đổi ý"};
 assert.equal((await call("POST","orders/cancel",body,{guest:guestB})).status,403);
 const target=freshTable(),session=await openTable(target,guestB);
 assert.equal((await call("POST","orders/cancel",{...body,tableToken:target.token,sessionId:session.id},{guest:guestB})).status,404);
 for(const reason of ["", " ", "x".repeat(181), 12]) assert.equal((await call("POST","orders/cancel",{...body,reason})).status,400);
 assert.equal((await call("POST","orders/cancel",body,{headers:{origin:"https://wrong.example"}})).status,403);
 assert.equal(sqlite.prepare("SELECT status FROM orders WHERE id = ?").get(order.id).status,"new");
});

test("guests cannot cancel an accepted or paid order", async () => {
 for(const action of [{status:"preparing"},{action:"paid",paymentMethod:"cash"}]){
  const order=(await call("POST","orders",checkout())).data.order;
  assert.equal((await call("PATCH","admin/order",{id:order.id,...action},{staff:true})).status,200);
  assert.equal((await call("POST","orders/cancel",{id:order.id,tableToken:table.token,sessionId:currentSession.id,reason:"Đổi ý"})).status,409);
 }
});

test("a staff acceptance or payment winning while guest cancellation waits cannot be overwritten", async () => {
 for(const action of [{status:"preparing"},{action:"paid",paymentMethod:"cash"}]){
  const order=(await call("POST","orders",checkout())).data.order;
  const gate=pauseNextWrite(sql=>sql.startsWith("UPDATE orders SET status = 'cancelled'"));
  const cancellation=call("POST","orders/cancel",{id:order.id,tableToken:table.token,sessionId:currentSession.id,reason:"Đổi ý"});
  await gate.reached;
  assert.equal((await call("PATCH","admin/order",{id:order.id,...action},{staff:true})).status,200);
  gate.release();assert.equal((await cancellation).status,409);
  const saved=sqlite.prepare("SELECT status,paid FROM orders WHERE id = ?").get(order.id);
  assert.notEqual(saved.status,"cancelled");
 }
});

test("a cancelled guest order cannot later be accepted or collected", async () => {
 const order=(await call("POST","orders",checkout())).data.order;
 assert.equal((await call("POST","orders/cancel",{id:order.id,tableToken:table.token,sessionId:currentSession.id,reason:"Đổi ý"})).status,200);
 assert.equal((await call("PATCH","admin/order",{id:order.id,status:"preparing"},{staff:true})).status,409);
 assert.equal((await call("PATCH","admin/order",{id:order.id,action:"paid",paymentMethod:"cash"},{staff:true})).status,409);
});


test("dish promotion is persisted, charges server prices and preserves confirmed orders", async () => {
 const chicken=initialMenu.items.find(item=>item.id==="chicken");
 const promotion={enabled:true,type:"percent",value:20,startsAt:null,endsAt:null};
 assert.equal((await call("PATCH","admin/item",{...chicken,promotion},{staff:true})).status,200);
 const menu=(await call("GET","menu?preview=1")).data.items;
 assert.deepEqual(menu.find(item=>item.id==="chicken").promotion,promotion);
 const submitted=checkout({expectedTotal:62000});
 const result=await call("POST","orders",submitted);
 assert.equal(result.status,201,JSON.stringify(result.data));
 assert.equal(result.data.order.total,62000);
 assert.equal(result.data.order.items[0].unitPrice,62000);
 assert.equal((await call("POST","orders",checkout({expectedTotal:1}))).status,409);
 assert.equal((await call("PATCH","admin/item",{...chicken,promotion:{...promotion,enabled:false}},{staff:true})).status,200);
 const replay=await call("POST","orders",submitted);
 assert.equal(replay.status,200);
 assert.equal(replay.data.order.total,62000);
 assert.equal((await call("POST","orders",checkout({expectedTotal:62000}))).status,409);
 const normal=await call("POST","orders",checkout());
 assert.equal(normal.status,201);
 assert.equal(normal.data.order.total,75000);
 const history=(await call("GET",historyPath())).data.orders;
 assert.equal(history.find(order=>order.id===result.data.order.id).total,62000);
});

test("dish promotion supports fixed amount and scheduled expiry", async () => {
 const chicken=initialMenu.items.find(item=>item.id==="chicken");
 const promotion={enabled:true,type:"amount",value:5000,startsAt:null,endsAt:null};
 assert.equal((await call("PATCH","admin/item",{...chicken,promotion},{staff:true})).status,200);
 assert.equal((await call("POST","orders",checkout({expectedTotal:70000}))).status,201);
 for(const dates of [{startsAt:Date.now()+3600000,endsAt:null},{startsAt:null,endsAt:Date.now()-3600000}]){
  assert.equal((await call("PATCH","admin/item",{...chicken,promotion:{...promotion,...dates}},{staff:true})).status,200);
  assert.equal((await call("POST","orders",checkout({expectedTotal:70000}))).status,409);
  assert.equal((await call("POST","orders",checkout())).status,201);
 }
});

test("dish promotion rejects unauthorized or invalid edits without partially updating the dish", async () => {
 const chicken=initialMenu.items.find(item=>item.id==="chicken");
 const promotion={enabled:true,type:"percent",value:10,startsAt:null,endsAt:null};
 assert.equal((await call("PATCH","admin/item",{...chicken,promotion})).status,403);
 const employee=await grantStaff(["orders.view"]);
 assert.equal((await call("PATCH","admin/item",{...chicken,promotion},{identity:employee.identity})).status,403);
 for(const invalid of [{...promotion,value:101},{...promotion,value:-10},{...promotion,type:"amount",value:65000},{...promotion,startsAt:2000,endsAt:1000}]){
  assert.equal((await call("PATCH","admin/item",{...chicken,name:"Should not save",promotion:invalid},{staff:true})).status,400);
  assert.equal(sqlite.prepare("SELECT name FROM menu_items WHERE id = 'chicken'").get().name,chicken.name);
 }
 assert.equal((await call("PATCH","admin/item",{...chicken,promotion},{staff:true})).status,200);
 const legacyEdit={...chicken,name:"Updated name"};delete legacyEdit.promotion;
 assert.equal((await call("PATCH","admin/item",legacyEdit,{staff:true})).status,200);
 assert.deepEqual((await call("GET","menu?preview=1")).data.items.find(item=>item.id==="chicken").promotion,promotion);
});


test("adding a dining table creates a unique working QR and retains it after editing", async () => {
 const body={create:true,requestId:crypto.randomUUID(),name:"Bàn 13",zone:"Sân thượng"};
 const before=sqlite.prepare("SELECT * FROM dining_tables ORDER BY id").all();
 const result=await call("PATCH","admin/table",body,{staff:true});
 assert.equal(result.status,201,JSON.stringify(result.data));
 const added=result.data.table;
 assert.equal(added.id,"13");assert.equal(added.name,body.name);
 assert.match(added.token,/^[a-f0-9]{64}$/);
 assert.ok(!before.some(t=>t.token===added.token));
 assert.deepEqual(sqlite.prepare("SELECT * FROM dining_tables WHERE id != ? ORDER BY id").all(added.id),before);
 const board=await call("GET","admin",undefined,{staff:true});
 assert.ok(board.data.tables.some(t=>t.id===added.id));
 assert.ok(!board.data.sessions.some(s=>s.table_id===added.id));
 const opened=await openTable(added,guestB,"Khách bàn mới");
 assert.equal(opened.table_id,added.id);
 const edited=await call("PATCH","admin/table",{id:added.id,name:"Bàn sân thượng",zone:body.zone},{staff:true});
 assert.equal(edited.status,200);
 const scanned=await call("GET","menu?table="+added.token,undefined,{guest:guestB});
 assert.equal(scanned.status,200);assert.equal(scanned.data.table.name,"Bàn sân thượng");
 assert.equal(scanned.data.connection.session.id,opened.id);
});

test("adding dining tables is idempotent and safe for simultaneous requests", async () => {
 const body={create:true,requestId:crypto.randomUUID(),name:"Bàn 13",zone:"Sân thượng"};
 const results=await Promise.all([call("PATCH","admin/table",body,{staff:true}),call("PATCH","admin/table",body,{staff:true})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);
 assert.equal(results[0].data.table.id,results[1].data.table.id);
 assert.equal(results[0].data.table.token,results[1].data.table.token);
 assert.equal(rowCount("dining_tables"),13);
 assert.equal((await call("PATCH","admin/table",{...body,name:"Khác"},{staff:true})).status,409);
 assert.equal((await call("PATCH","admin/table",{...body,requestId:crypto.randomUUID()},{staff:true})).status,409);
 const more=await Promise.all(["Bàn 14","Bàn 15"].map(name=>call("PATCH","admin/table",{...body,name,requestId:crypto.randomUUID()},{staff:true})));
 assert.ok(more.every(r=>r.status===201));
 assert.notEqual(more[0].data.table.id,more[1].data.table.id);
 assert.notEqual(more[0].data.table.token,more[1].data.table.token);
 assert.equal(rowCount("dining_tables"),15);
});

test("adding dining tables requires permission and validates names and request IDs", async () => {
 const body={create:true,requestId:crypto.randomUUID(),name:"Bàn 13",zone:"Sân thượng"};
 assert.equal((await call("PATCH","admin/table",body)).status,403);
 const employee=await grantStaff(["orders.view"]);
 assert.equal((await call("PATCH","admin/table",body,{identity:employee.identity})).status,403);
 for(const invalid of [{name:" "},{zone:" "},{name:"x".repeat(31)},{zone:"x".repeat(41)},{requestId:"bad"},{create:"yes"}]){
  assert.equal((await call("PATCH","admin/table",{...body,...invalid},{staff:true})).status,400);
 }
 assert.equal(rowCount("dining_tables"),12);
 assert.equal((await call("PATCH","admin/table",{id:"999",name:"Không có",zone:"Sảnh"},{staff:true})).status,404);
});


const storeCall=(store,method,path,body,options={})=>call(method,path+(path.includes("?")?"&":"?")+"store="+encodeURIComponent(store),body,options);
async function createTestStore(id,email=id+"@example.test"){
 const response=await call("POST","platform/stores",{id,name:"Quán "+id,adminEmail:email,requestId:crypto.randomUUID()},{staff:true});
 assert.equal(response.status,201,JSON.stringify(response.data));
 return {id,identity:{id:"manager-"+id,email}};
}
async function seedStoreMenu(store,price=65000){
 const response=await storeCall(store,"PATCH","admin/item",{...initialMenu.items[0],id:"chicken",price,promotion:null},{staff:true});
 assert.equal(response.status,200,JSON.stringify(response.data));
}
async function openStoreVisit(store,guest=guestA){
 const menu=await storeCall(store,"GET","menu",undefined,{guest});assert.equal(menu.status,200,JSON.stringify(menu.data));
 const target=menu.data.table;
 const requested=await storeCall(store,"POST","table-session",{tableToken:target.token,customerName:"Khách "+store},{guest});
 assert.equal(requested.status,201,JSON.stringify(requested.data));
 const session=requested.data.connection.session;
 assert.equal((await storeCall(store,"PATCH","admin/session",{id:session.id,action:"approve"},{staff:true})).status,200);
 return {table:target,session};
}

test("multiple stores restrict platform creation and keep the existing store intact",async()=>{
 const existing=sqlite.prepare("SELECT * FROM dining_tables WHERE store_id='main'").all();
 const a=await createTestStore("alpha");
 const b=await createTestStore("beta");
 assert.deepEqual(sqlite.prepare("SELECT * FROM dining_tables WHERE store_id='main'").all(),existing);
 const rootList=await call("GET","stores",undefined,{staff:true});assert.equal(rootList.data.stores.length,3);
 const local=await storeCall(a.id,"GET","account",undefined,{identity:a.identity});assert.equal(local.data.access.isOwner,false);assert.equal(local.data.access.isStaff,true);
 const ownList=await storeCall(a.id,"GET","stores",undefined,{identity:a.identity});assert.deepEqual(ownList.data.stores.map(s=>s.id),[a.id]);
 assert.equal((await storeCall(b.id,"GET","admin",undefined,{identity:a.identity})).status,403);
 assert.equal((await call("POST","platform/stores",{id:"forged",name:"Forged",adminEmail:"forged@example.test",requestId:crypto.randomUUID(),isOwner:true},{identity:a.identity})).status,403);
 assert.equal((await call("POST","platform/stores",{id:"anon",name:"Anon",adminEmail:"anon@example.test",requestId:crypto.randomUUID()})).status,403);
 const menu=await storeCall(a.id,"GET","menu");assert.equal(menu.data.shop.name,"Quán alpha");assert.equal(menu.data.items.length,0);
 assert.equal((await call("GET","menu")).data.items.length,7);
 assert.equal((await call("GET","menu?store=unknown")).status,404);
 assert.equal((await call("GET","menu?store=alpha&store=beta")).status,400);
 assert.equal((await call("GET","menu?store=alpha%27%20OR%201=1")).status,404);
});

test("multiple stores isolate concurrent menu, settings, table and promotion writes",async()=>{
 await createTestStore("alpha");await createTestStore("beta");
 await Promise.all([seedStoreMenu("alpha",50000),seedStoreMenu("beta",90000)]);
 for(let i=0;i<5;i++){
  const [a,b,main]=await Promise.all([storeCall("alpha","GET","menu"),storeCall("beta","GET","menu"),call("GET","menu")]);
  assert.equal(a.data.items[0].price,50000);assert.equal(b.data.items[0].price,90000);assert.equal(main.data.items[0].price,65000);
  assert.notEqual(a.data.table.token,b.data.table.token);assert.equal(a.data.table.id,b.data.table.id);
 }
 const aMenu=(await storeCall("alpha","GET","menu")).data;
 assert.equal((await storeCall("beta","GET","menu?table="+aMenu.table.token)).status,404);
 assert.equal((await call("GET","menu?table="+aMenu.table.token)).status,404);
 const promotion={enabled:true,type:"percent",value:20,startsAt:null,endsAt:null};
 assert.equal((await storeCall("alpha","PATCH","admin/item",{...aMenu.items[0],promotion,store_id:"beta"},{staff:true})).status,200);
 assert.deepEqual((await storeCall("alpha","GET","menu")).data.items[0].promotion,promotion);
 assert.equal((await storeCall("beta","GET","menu")).data.items[0].promotion,null);
 assert.equal((await storeCall("alpha","PATCH","admin/table",{id:"5",name:"Bàn A",zone:"Sảnh A",store_id:"beta"},{staff:true})).status,200);
 assert.equal((await storeCall("beta","GET","menu")).data.table.name,"Bàn 05");
});

test("multiple stores prevent cross-store order reads, cancellation, payment and transfer",async()=>{
 const a=await createTestStore("alpha");const b=await createTestStore("beta");
 await seedStoreMenu(a.id);await seedStoreMenu(b.id);
 const va=await openStoreVisit(a.id,guestA),vb=await openStoreVisit(b.id,guestA);
 const request={tableToken:va.table.token,sessionId:va.session.id,requestId:crypto.randomUUID(),items:[line()],note:"",expectedTotal:75000};
 const saved=await storeCall(a.id,"POST","orders",request,{guest:guestA});assert.equal(saved.status,201,JSON.stringify(saved.data));const order=saved.data.order;
 const cross={...request,tableToken:vb.table.token,sessionId:vb.session.id};
 assert.equal((await storeCall(b.id,"POST","orders/cancel",{...cross,id:order.id,reason:"Không được phép"},{guest:guestA})).status,404);
 assert.equal((await storeCall(b.id,"PATCH","admin/order",{id:order.id,status:"preparing"},{identity:b.identity})).status,404);
 assert.equal((await storeCall(b.id,"PATCH","admin/order",{id:order.id,action:"paid",paymentMethod:"cash"},{identity:b.identity})).status,404);
 assert.equal((await storeCall(b.id,"GET","admin/table-payment?session="+va.session.id,undefined,{identity:b.identity})).status,404);
 const otherHistory=await storeCall(b.id,"GET","orders?table="+vb.table.token+"&session="+vb.session.id,undefined,{guest:guestA});assert.equal(otherHistory.data.orders.length,0);
 const board=await storeCall(b.id,"GET","admin",undefined,{identity:b.identity});assert.equal(board.data.orders.length,0);assert.ok(board.data.sessions.every(s=>s.id!==va.session.id));
 assert.equal(sqlite.prepare("SELECT status FROM orders WHERE store_id='alpha' AND id=?").get(order.id).status,"new");
 // A matching request key in another store does not replay the first store's receipt.
 const other=await storeCall(b.id,"POST","orders",cross,{guest:guestA});assert.equal(other.status,201);assert.notEqual(other.data.order.id,order.id);
 assert.equal((await storeCall(a.id,"GET","orders?table="+va.table.token+"&session="+va.session.id)).data.orders.length,1);
});

test("multiple stores scope employee invitations, identity binding and suspension",async()=>{
 const a=await createTestStore("alpha"),b=await createTestStore("beta");
 const invitation={email:"shared@example.test",name:"Nhân viên",role:"manager",permissions:staffPermissions,status:"active"};
 const ca=await storeCall(a.id,"POST","admin/accounts",invitation,{identity:a.identity});assert.equal(ca.status,201,JSON.stringify(ca.data));
 const cb=await storeCall(b.id,"POST","admin/accounts",invitation,{identity:b.identity});assert.equal(cb.status,201,JSON.stringify(cb.data));
 const shared={id:"shared-user",email:invitation.email};
 const aa=await storeCall(a.id,"GET","account",undefined,{identity:shared});const ab=await storeCall(b.id,"GET","account",undefined,{identity:shared});
 assert.equal(aa.data.access.isStaff,true);assert.equal(ab.data.access.isStaff,true);
 assert.equal((await storeCall(b.id,"PATCH","admin/accounts",accountUpdate(aa.data.access.account,{status:"suspended"}),{identity:b.identity})).status,404);
 assert.equal((await storeCall(a.id,"PATCH","admin/accounts",accountUpdate(aa.data.access.account,{status:"suspended"}),{identity:a.identity})).status,200);
 assert.equal((await storeCall(a.id,"GET","admin",undefined,{identity:shared})).status,403);
 assert.equal((await storeCall(b.id,"GET","admin",undefined,{identity:shared})).status,200);
 const listed=await storeCall(b.id,"GET","stores",undefined,{identity:shared});assert.deepEqual(listed.data.stores.map(s=>s.id),[b.id]);
 // Reusing the manager's email with a different gateway identity grants no access.
 assert.equal((await storeCall(a.id,"GET","admin",undefined,{identity:{id:"imposter",email:a.identity.email}})).status,403);
});

test("multiple stores create atomically with idempotent retries and unique addresses",async()=>{
 const body={id:"alpha",name:"Alpha",adminEmail:"alpha@example.test",requestId:crypto.randomUUID()};
 const responses=await Promise.all([call("POST","platform/stores",body,{staff:true}),call("POST","platform/stores",body,{staff:true})]);
 assert.ok(responses.every(r=>r.status===201));assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM stores WHERE id='alpha'").get().n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM staff_accounts WHERE store_id='alpha'").get().n,1);
 assert.equal((await call("POST","platform/stores",{...body,name:"Changed"},{staff:true})).status,409);
 assert.equal((await call("POST","platform/stores",{...body,requestId:crypto.randomUUID()},{staff:true})).status,409);
 sqlite.exec("CREATE TRIGGER fail_store_invite BEFORE INSERT ON staff_accounts WHEN NEW.store_id = 'broken' BEGIN SELECT RAISE(ABORT, 'test failure'); END");
 assert.equal((await call("POST","platform/stores",{...body,id:"broken",requestId:crypto.randomUUID()},{staff:true})).status,500);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM stores WHERE id='broken'").get().n,0);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM settings WHERE store_id='broken'").get().n,0);
});


test("multiple stores protect identical order IDs and reject foreign transfer sessions",async()=>{
 const a=await createTestStore("alpha"),b=await createTestStore("beta");
 await seedStoreMenu(a.id);await seedStoreMenu(b.id);
 const va=await openStoreVisit(a.id),vb=await openStoreVisit(b.id);
 const request={tableToken:va.table.token,sessionId:va.session.id,requestId:crypto.randomUUID(),items:[line()],note:"",expectedTotal:75000};
 const saved=await storeCall(a.id,"POST","orders",request,{guest:guestA});assert.equal(saved.status,201);
 const original=sqlite.prepare("SELECT * FROM orders WHERE store_id='alpha' AND id=?").get(saved.data.order.id);
 const clone={...original,store_id:"beta",dining_session_id:vb.session.id};
 const cols=Object.keys(clone);sqlite.prepare("INSERT INTO orders ("+cols.join(",")+") VALUES ("+cols.map(()=>"?").join(",")+")").run(...Object.values(clone));
 assert.equal((await storeCall(b.id,"PATCH","admin/order",{id:original.id,status:"preparing"},{identity:b.identity})).status,200);
 assert.deepEqual(sqlite.prepare("SELECT * FROM orders WHERE store_id='alpha' AND id=?").get(original.id),original);
 assert.equal(sqlite.prepare("SELECT status FROM orders WHERE store_id='beta' AND id=?").get(original.id).status,"preparing");
 const denied=await storeCall(b.id,"PATCH","admin/table-transfer",{sessionId:va.session.id,requestId:crypto.randomUUID(),fromTableId:va.table.id,toTableId:"1",expectedUpdatedAt:va.session.updated_at},{identity:b.identity});
 assert.equal(denied.status,409,JSON.stringify(denied.data));
 const report=await storeCall(b.id,"GET",revenuePath({},"admin/revenue/orders"),undefined,{identity:b.identity});
 assert.equal(report.status,200,JSON.stringify(report.data));
 assert.equal(report.data.orders.length,1);
});

const registrationBody=(id="self-shop")=>({id,name:"Quán tự đăng ký",ownerName:"Nguyễn An",phone:"0901234567",requestId:crypto.randomUUID()});
const registrant={id:"new-store-owner",email:"new-owner@example.test"};

test("GAERU registration binds the signed-in identity, grants only store administration and lists owned stores",async()=>{
 const body={...registrationBody(),adminEmail:"victim@example.test",userId:"forged",role:"owner",isOwner:true};
 const before=sqlite.prepare("SELECT * FROM menu_items WHERE store_id='main'").all();
 const saved=await call("POST","store-registration",body,{identity:registrant});assert.equal(saved.status,201,JSON.stringify(saved.data));
 const store=saved.data.store;assert.equal(store.source,"self");assert.equal(store.status,"active");assert.equal(store.adminEmail,registrant.email);
 const row=sqlite.prepare("SELECT * FROM staff_accounts WHERE store_id=?").get(store.id);assert.equal(row.user_id,registrant.id);assert.equal(row.email,registrant.email);assert.equal(row.role,"manager");
 const account=await storeCall(store.id,"GET","account",undefined,{identity:registrant});assert.equal(account.data.access.isStaff,true);assert.equal(account.data.access.isOwner,false);assert.deepEqual(account.data.access.permissions.sort(),staffPermissions.slice().sort());
 const portal=await call("GET","stores",undefined,{identity:registrant});assert.equal(portal.data.authenticated,true);assert.equal(portal.data.email,registrant.email);assert.deepEqual(portal.data.stores.map(s=>s.id),[store.id]);assert.equal(portal.data.isPlatformOwner,false);
 const otherPortal=await call("GET","stores",undefined,{identity:{id:"unrelated",email:"other@example.test"}});assert.deepEqual(otherPortal.data.stores,[]);
 const menu=await storeCall(store.id,"GET","menu");assert.equal(menu.status,200);assert.equal(menu.data.items.length,0);assert.equal(menu.data.shop.name,body.name);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM dining_tables WHERE store_id=?").get(store.id).n,12);
 assert.equal((await call("POST","platform/stores",registrationBody("forbidden"),{identity:registrant})).status,403);
 assert.deepEqual(sqlite.prepare("SELECT * FROM menu_items WHERE store_id='main'").all(),before);
 const invited=await storeCall(store.id,"POST","admin/accounts",{email:"local-admin@example.test",name:"Quản trị thứ hai",role:"manager",permissions:staffPermissions,status:"active"},{identity:registrant});assert.equal(invited.status,201,JSON.stringify(invited.data));
 assert.equal((await call("GET","admin",undefined,{identity:{id:"local-admin",email:"local-admin@example.test"}})).status,403);
});

test("GAERU registration rejects anonymous, malformed and duplicate addresses without partial stores",async()=>{
 const body=registrationBody();assert.equal((await call("POST","store-registration",body)).status,401);
 for(const patch of [{ownerName:""},{phone:""},{phone:"javascript:alert(1)"},{id:"main"},{id:"a/b"},{requestId:"bad"},{name:""}])assert.equal((await call("POST","store-registration",{...body,...patch},{identity:registrant})).status,400,JSON.stringify(patch));
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM stores WHERE id='self-shop'").get().n,0);
 const first=await call("POST","store-registration",body,{identity:registrant});assert.equal(first.status,201);
 const other={id:"other-owner",email:"other-owner@example.test"};
 assert.equal((await call("POST","store-registration",{...body,requestId:crypto.randomUUID()},{identity:other})).status,409);
 assert.equal((await call("POST","store-registration",{...body,id:"stolen"},{identity:other})).status,403);
 assert.equal((await call("POST","store-registration",{...body,name:"Changed"},{identity:registrant})).status,409);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM staff_accounts WHERE store_id='self-shop'").get().n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM settings WHERE store_id='stolen'").get().n,0);
});

test("GAERU repeated registrations are atomic, retryable and keep a single bound administrator",async()=>{
 const body=registrationBody();
 const outcomes=await Promise.all([1,2].map(()=>call("POST","store-registration",body,{identity:registrant})));assert.ok(outcomes.every(r=>r.status===201));
 const retry=await call("POST","store-registration",body,{identity:registrant});assert.equal(retry.data.replayed,true);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM staff_accounts WHERE store_id=?").get(body.id).n,1);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM staff_account_audit WHERE store_id=?").get(body.id).n,1);
 sqlite.exec("CREATE TRIGGER fail_self_registration BEFORE INSERT ON staff_account_audit WHEN NEW.store_id='failed-shop' BEGIN SELECT RAISE(ABORT,'test self registration failure'); END");
 const failed=await call("POST","store-registration",registrationBody("failed-shop"),{identity:registrant});assert.equal(failed.status,500);
 for(const tableName of ["stores","staff_accounts","settings"]){const col=tableName==="stores"?"id":"store_id";assert.equal(sqlite.prepare(`SELECT COUNT(*) n FROM ${tableName} WHERE ${col}='failed-shop'`).get().n,0);}
});

test("GAERU platform suspension blocks store operations, preserves data and supports safe reactivation",async()=>{
 const a=await createTestStore("alpha"),b=await createTestStore("beta");await seedStoreMenu("alpha");const visit=await openStoreVisit("alpha");
 const request={tableToken:visit.table.token,sessionId:visit.session.id,requestId:crypto.randomUUID(),items:[line()],note:"",expectedTotal:75000};
 const saved=await storeCall("alpha","POST","orders",request,{guest:guestA});assert.equal(saved.status,201);
 const lists=await call("GET","stores",undefined,{staff:true}),store=lists.data.stores.find(s=>s.id==="alpha");
 const change={id:"alpha",status:"suspended",expectedUpdatedAt:store.updatedAt};
 assert.equal((await call("PATCH","platform/stores",change,{identity:a.identity})).status,403);
 assert.equal((await call("PATCH","platform/stores",change)).status,403);
 const old=sqlite.prepare("SELECT * FROM orders WHERE store_id='alpha'").all();
 const suspended=await call("PATCH","platform/stores",change,{staff:true});assert.equal(suspended.status,200);assert.equal(suspended.data.store.status,"suspended");
 for(const [method,path,body,opts] of [["GET","menu",undefined,{}],["GET","admin",undefined,{identity:a.identity}],["POST","orders",{...request,requestId:crypto.randomUUID()},{guest:guestA}],["GET","account",undefined,{identity:a.identity}]])assert.equal((await storeCall("alpha",method,path,body,opts)).status,403,path);
 assert.equal((await storeCall("beta","GET","admin",undefined,{identity:b.identity})).status,200);
 assert.equal((await storeCall("alpha","GET","admin",undefined,{staff:true})).status,200);
 const mine=await call("GET","stores",undefined,{identity:a.identity});assert.equal(mine.data.stores[0].status,"suspended");
 assert.equal((await call("PATCH","platform/stores",{...change,status:"active"},{staff:true})).status,409);
 const active=await call("PATCH","platform/stores",{...change,status:"active",expectedUpdatedAt:suspended.data.store.updatedAt},{staff:true});assert.equal(active.status,200);
 assert.equal((await storeCall("alpha","GET","admin",undefined,{identity:a.identity})).status,200);
 assert.deepEqual(sqlite.prepare("SELECT * FROM orders WHERE store_id='alpha'").all(),old);
 assert.equal((await call("PATCH","platform/stores",{id:"main",status:"suspended",expectedUpdatedAt:0},{staff:true})).status,400);
});

const brandPng="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
test("store branding saves the logo and name atomically, updates registry and stays within its store",async()=>{
 const a=await createTestStore("alpha"),b=await createTestStore("beta");
 const original=(await storeCall("beta","GET","menu")).data.shop;
 const update={...initialMenu.shop,name:"Tôn Cà Phê",logo:brandPng};
 assert.equal((await storeCall("alpha","PATCH","admin/shop",update,{identity:a.identity})).status,200);
 const menu=(await storeCall("alpha","GET","menu")).data;assert.equal(menu.shop.name,update.name);assert.match(menu.shop.logo,/^\/api\/branding-icon\?store=alpha&v=/);
 const cachedIcon=await api.GET(new Request(origin+menu.shop.logo));assert.match(cachedIcon.headers.get("cache-control"),/immutable/);assert.equal(Buffer.from(await cachedIcon.arrayBuffer()).toString("base64"),brandPng.split(",")[1]);
 assert.equal((await storeCall("alpha","GET","admin",undefined,{identity:a.identity})).data.shop.logo,menu.shop.logo);
 const listed=await call("GET","stores",undefined,{staff:true});assert.equal(listed.data.stores.find(s=>s.id==="alpha").name,update.name);
 assert.deepEqual((await storeCall("beta","GET","menu")).data.shop,original);
 const icon=await api.GET(new Request(origin+"/api/branding-icon?store=alpha"));assert.equal(icon.status,200);assert.equal(icon.headers.get("content-type"),"image/png");assert.equal(Buffer.from(await icon.arrayBuffer()).toString("base64"),brandPng.split(",")[1]);
 const {logo,...withoutLogo}=update;assert.equal((await storeCall("alpha","PATCH","admin/shop",withoutLogo,{identity:a.identity})).status,200);assert.equal((await storeCall("alpha","GET","menu")).data.shop.logo,menu.shop.logo);
 assert.equal((await storeCall("alpha","PATCH","admin/shop",{...update,logo:""},{identity:a.identity})).status,200);
 const staleIcon=await api.GET(new Request(origin+menu.shop.logo));assert.equal(staleIcon.status,404);assert.equal(staleIcon.headers.get("cache-control"),"no-store");
 const fallback=await api.GET(new Request(origin+"/api/branding-icon?store=alpha"));assert.match(await fallback.text(),/>TC<\/text>/);
 sqlite.exec("CREATE TRIGGER fail_brand_update BEFORE UPDATE OF name ON stores WHEN NEW.id='alpha' BEGIN SELECT RAISE(ABORT,'branding rollback'); END");
 assert.equal((await storeCall("alpha","PATCH","admin/shop",{...update,name:"Không được lưu"},{identity:a.identity})).status,500);
 assert.equal((await storeCall("alpha","GET","menu")).data.shop.name,update.name);
});
test("store logo upload rejects unsafe data and unauthorized staff",async()=>{
 const body={...initialMenu.shop,logo:brandPng};
 assert.equal((await call("PATCH","admin/shop",body)).status,403);
 const viewer=await grantStaff(["orders.view"]);assert.equal((await call("PATCH","admin/shop",body,{identity:viewer.identity})).status,403);
 for(const logo of ["javascript:alert(1)","data:image/svg+xml;base64,PHN2Zy8+","https://example.test/logo.png","data:image/png;base64,YmFk",brandPng+"x".repeat(220000)])assert.equal((await call("PATCH","admin/shop",{...body,logo},{staff:true})).status,400);
 assert.equal((await call("GET","menu")).data.shop.logo,"");
});

test("personal profiles update contact details and avatar without changing identity or permissions",async()=>{
 const staff=await grantStaff(["orders.view"]);const before=(await call("GET","account",undefined,{identity:staff.identity})).data.access;
 const body={fullName:"Nguyễn Văn An",contactEmail:"new-contact@example.test",phone:"0901234567",avatar:brandPng,expectedUpdatedAt:0,userId:"forged",role:"manager",permissions:staffPermissions,isOwner:true};
 const saved=await call("PATCH","account/profile",body,{identity:staff.identity});assert.equal(saved.status,200,JSON.stringify(saved.data));
 const after=(await call("GET","account",undefined,{identity:staff.identity})).data.access;
 assert.equal(after.profile.fullName,body.fullName);assert.equal(after.profile.avatar,brandPng);assert.equal(after.profile.contactEmail,body.contactEmail);assert.equal(after.profile.phone,body.phone);
 assert.equal(after.email,before.email);assert.equal(after.userId,before.userId);assert.equal(after.isOwner,false);assert.deepEqual(after.permissions,before.permissions);assert.deepEqual(after.account,before.account);
 const unrelated=await grantStaff(["orders.view"],{email:"unrelated-profile@example.test"});
 assert.equal((await call("GET","account",undefined,{identity:unrelated.identity})).data.access.profile,undefined);
 assert.equal((await call("GET","admin",undefined,{identity:{id:"replacement-identity",email:body.contactEmail}})).status,403);
 assert.equal((await call("POST","admin/accounts",{email:"invite@example.test",name:"Escalation",role:"manager"},{identity:staff.identity})).status,403);
});

test("personal profiles require an active account, validate images and prevent stale replacement",async()=>{
 const staff=await grantStaff(["orders.view"]),body={fullName:"Hồ sơ",contactEmail:"contact@example.test",phone:"",avatar:"",expectedUpdatedAt:0};
 assert.equal((await call("PATCH","account/profile",body)).status,403);
 assert.equal((await call("PATCH","account/profile",body,{identity:{id:"unknown-person",email:"unknown@example.test"}})).status,403);
 for(const change of [{fullName:""},{contactEmail:"bad"},{phone:"<script>"},{avatar:"data:image/svg+xml,<svg/>"},{expectedUpdatedAt:-1}])assert.equal((await call("PATCH","account/profile",{...body,...change},{identity:staff.identity})).status,400);
 const first=await call("PATCH","account/profile",body,{identity:staff.identity});assert.equal(first.status,200);
 assert.equal((await call("PATCH","account/profile",{...body,fullName:"Stale"},{identity:staff.identity})).status,409);
 const second=await call("PATCH","account/profile",{...body,fullName:"Đã đổi tên",expectedUpdatedAt:first.data.profile.updatedAt},{identity:staff.identity});assert.equal(second.status,200);
 assert.equal((await call("PATCH","account/profile",{...body,expectedUpdatedAt:first.data.profile.updatedAt},{identity:staff.identity})).status,409);
 const account=(await call("GET","account",undefined,{identity:staff.identity})).data.access.account;
 assert.equal((await call("PATCH","admin/accounts",accountUpdate(account,{status:"suspended"}),{staff:true})).status,200);
 assert.equal((await call("PATCH","account/profile",{...body,expectedUpdatedAt:second.data.profile.updatedAt},{identity:staff.identity})).status,403);
});

test("personal profiles remain isolated between stores while protected owners retain access",async()=>{
 await createTestStore("alpha","shared-profile@example.test");await createTestStore("beta","shared-profile@example.test");
 const identity={id:"shared-profile-user",email:"shared-profile@example.test"};
 const body={fullName:"Quản lý An",contactEmail:"contact@example.test",phone:"0901234567",avatar:brandPng,expectedUpdatedAt:0};
 assert.equal((await storeCall("alpha","PATCH","account/profile",body,{identity})).status,200);
 assert.equal((await storeCall("beta","GET","account",undefined,{identity})).data.access.profile,undefined);
 const first=(await call("GET","account",undefined,{staff:true})).data.access;
 const saved=await call("PATCH","account/profile",body,{staff:true});assert.equal(saved.status,200);
 const after=(await call("GET","account",undefined,{staff:true})).data.access;
 assert.equal(after.isOwner,true);assert.equal(after.email,first.email);assert.deepEqual(after.permissions,first.permissions);assert.equal(after.profile.fullName,body.fullName);
 assert.equal(after.account.name,"Quản lý / Chủ cửa hàng");
});

test("dish uploads persist and independent promotions do not overwrite menu details",async()=>{
 const chicken=initialMenu.items.find(item=>item.id==="chicken");
 const promotion={enabled:true,type:"percent",value:15,startsAt:null,endsAt:null};
 assert.equal((await call("PATCH","admin/promotion",{id:chicken.id,promotion})).status,403);
 assert.equal((await call("PATCH","admin/promotion",{id:"missing",promotion},{staff:true})).status,404);
 assert.equal((await call("PATCH","admin/promotion",{id:chicken.id,promotion:{...promotion,value:101}},{staff:true})).status,400);
 assert.equal((await call("PATCH","admin/promotion",{id:chicken.id,promotion,name:"Do not replace"},{staff:true})).status,200);
 const edit={...chicken,image:brandPng,name:"Ảnh món mới"};delete edit.promotion;
 assert.equal((await call("PATCH","admin/item",edit,{staff:true})).status,200);
 let dish=(await call("GET","menu?preview=1")).data.items.find(m=>m.id===chicken.id);
 assert.equal(dish.image,brandPng);assert.equal(dish.name,edit.name);assert.deepEqual(dish.promotion,promotion);
 assert.equal((await call("PATCH","admin/promotion",{id:chicken.id,promotion:{...promotion,enabled:false}},{staff:true})).status,200);
 dish=(await call("GET","menu?preview=1")).data.items.find(m=>m.id===chicken.id);
 assert.equal(dish.image,brandPng);assert.equal(dish.name,edit.name);assert.equal(dish.promotion.enabled,false);
 for(const image of ["data:image/svg+xml,<svg/>","data:image/png;base64,YmFk",brandPng+"x".repeat(220000)])assert.equal((await call("PATCH","admin/item",{...edit,image},{staff:true})).status,400);
});

test("custom dish extras validate, price checkout and preserve historical orders",async()=>{
 const chicken=initialMenu.items.find(i=>i.id==="chicken");
 const extras=[{id:"custom-egg",label:"Thêm hai trứng",price:17000},{id:"free",label:"Thêm rau",price:0}];
 assert.equal((await call("PATCH","admin/item",{...chicken,extras})).status,403);
 assert.equal((await call("PATCH","admin/item",{...chicken,extras},{staff:true})).status,200);
 assert.deepEqual((await call("GET","menu?preview=1")).data.items.find(i=>i.id===chicken.id).extras,extras);
 const orderBody=checkout({expectedTotal:82000});orderBody.items[0].extras=["custom-egg","free"];
 const placed=await call("POST","orders",orderBody);assert.equal(placed.status,201,JSON.stringify(placed.data));assert.equal(placed.data.order.total,82000);assert.deepEqual(placed.data.order.items[0].extras,["Thêm hai trứng","Thêm rau"]);
 for(const invalid of [[{...extras[0],price:-1}],[{...extras[0],price:1.5}],[extras[0],extras[0]],[{...extras[0],label:""}],Array(21).fill(extras[0])])assert.equal((await call("PATCH","admin/item",{...chicken,extras:invalid},{staff:true})).status,400);
 assert.equal((await call("PATCH","admin/item",{...chicken,name:"Edited"},{staff:true})).status,200);
 assert.deepEqual((await call("GET","menu?preview=1")).data.items.find(i=>i.id===chicken.id).extras,extras);
 assert.equal((await call("PATCH","admin/item",{...chicken,extras:[]},{staff:true})).status,200);
 const stale=checkout({expectedTotal:82000});stale.items[0].extras=["custom-egg"];assert.equal((await call("POST","orders",stale)).status,400);
 assert.equal((await call("POST","orders",orderBody)).data.order.total,82000);
 assert.deepEqual((await call("GET","menu?preview=1")).data.items.find(i=>i.id===chicken.id).extras,[]);
});

test("deleting an unused table requires permission, invalidates its QR and never reuses a creation identity",async()=>{
 const body={create:true,requestId:crypto.randomUUID(),name:"Bàn QA xóa",zone:"QA"};
 const created=await call("PATCH","admin/table",body,{staff:true});
 assert.equal(created.status,201,JSON.stringify(created.data));
 const id=created.data.table.id;
 assert.equal((await call("PATCH","admin/table",{id,action:"delete"})).status,403);
 const employee=await grantStaff(["orders.view"]);
 assert.equal((await call("PATCH","admin/table",{id,action:"delete"},{identity:employee.identity})).status,403);
 assert.equal((await call("PATCH","admin/table",{id,action:"delete"},{staff:true})).status,200);
 assert.equal((await call("GET","menu?table="+created.data.table.token)).status,404);
 const next=await call("PATCH","admin/table",{...body,name:"Bàn QA mới",requestId:crypto.randomUUID()},{staff:true});
 assert.equal(next.status,201,JSON.stringify(next.data));
 assert.notEqual(next.data.table.id,id);
 assert.equal((await call("PATCH","admin/table",body,{staff:true})).status,404);
});
test("table deletion preserves pending, active and closed-session history",async()=>{
 const before=rowCount("dining_tables");
 const protectedTable=await call("PATCH","admin/table",{id:table.id,action:"delete"},{staff:true});
 assert.equal(protectedTable.status,409,JSON.stringify(protectedTable.data));
 const added=await call("PATCH","admin/table",{create:true,requestId:crypto.randomUUID(),name:"Bàn QA lịch sử",zone:"QA"},{staff:true});
 const opened=await openTable(added.data.table,guestB,"Khách QA");
 assert.equal((await call("PATCH","admin/table",{id:added.data.table.id,action:"delete"},{staff:true})).status,409);
 assert.equal((await call("PATCH","admin/session",{id:opened.id,action:"close"},{staff:true})).status,200);
 assert.equal((await call("PATCH","admin/table",{id:added.data.table.id,action:"delete"},{staff:true})).status,409);
 assert.equal(rowCount("dining_tables"),before+1);
});
test("a QR request cannot create an orphan visit if the unused table is deleted before its session insert",async()=>{
 const added=await call("PATCH","admin/table",{create:true,requestId:crypto.randomUUID(),name:"Bàn QA cạnh tranh",zone:"QA"},{staff:true});
 assert.equal(added.status,201);
 const target=added.data.table;
 await call("GET","menu?table="+target.token,undefined,{guest:guestB});
 let raced=false;
 beforeWrite=async statements=>{
  if(raced||!statements.some(sql=>/INSERT OR IGNORE INTO table_sessions/i.test(sql)))return;
  raced=true;beforeWrite=null;
  const removed=await call("PATCH","admin/table",{id:target.id,action:"delete"},{staff:true});
  assert.equal(removed.status,200,JSON.stringify(removed.data));
 };
 const request=await call("POST","table-session",{tableToken:target.token,customerName:"Khách QA"},{guest:guestB});
 assert.equal(raced,true);
 assert.equal(request.status,409,JSON.stringify(request.data));
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM table_sessions WHERE table_id = ?").get(target.id).n,0);
});
test("an empty store keeps preview and administration available after deleting all unused tables",async()=>{
 const store=await createTestStore("empty-layout");
 const board=await storeCall(store.id,"GET","admin",undefined,{staff:true});
 assert.equal(board.status,200);
 for(const unused of board.data.tables){
  const result=await storeCall(store.id,"PATCH","admin/table",{id:unused.id,action:"delete"},{staff:true});
  assert.equal(result.status,200,JSON.stringify(result.data));
 }
 const preview=await storeCall(store.id,"GET","menu?preview=1",undefined,{staff:true});
 assert.equal(preview.status,200,JSON.stringify(preview.data));
 assert.equal(preview.data.connection.state,"preview");
 assert.equal(preview.data.table.token,"");
 const empty=await storeCall(store.id,"GET","admin",undefined,{staff:true});
 assert.equal(empty.status,200);
 assert.equal(empty.data.tables.length,0);
 const recreated=await storeCall(store.id,"PATCH","admin/table",{create:true,requestId:crypto.randomUUID(),name:"Bàn đầu tiên",zone:"Sảnh"},{staff:true});
 assert.equal(recreated.status,201,JSON.stringify(recreated.data));
});

test("compact admin entry omits menu payload while retaining operational data and branding",async()=>{
 const full=await call("GET","admin",undefined,{staff:true});
 const compact=await call("GET","admin?section=board",undefined,{staff:true});
 assert.equal(compact.status,200,JSON.stringify(compact.data));
 assert.equal(compact.data.compact,true);
 assert.deepEqual(compact.data.items,[]);
 assert.deepEqual(compact.data.tables,full.data.tables);
 assert.deepEqual(compact.data.orders,full.data.orders);
 assert.equal(compact.data.shop.name,full.data.shop.name);
 assert.ok(!compact.data.shop.logo||compact.data.shop.logo.startsWith("/api/branding-icon?"));
 const publicInfo=await call("GET","shop-info");
 assert.equal(publicInfo.status,200);
 assert.equal(publicInfo.data.shop.name,full.data.shop.name);
 assert.equal(publicInfo.data.access,undefined);
});

test("admin conditional polling still checks access before honoring its validator",async()=>{
 const first=await call("GET","admin?section=board",undefined,{staff:true});
 const headers={"oai-authenticated-user-id":"test-owner-id","oai-authenticated-user-email":"test@example.test","If-None-Match":first.headers.get("etag")};
 const same=await api.GET(new Request(origin+"/api/admin?section=board",{headers}));assert.equal(same.status,304);assert.equal(await same.text(),"");
 const unauthorized=await api.GET(new Request(origin+"/api/admin?section=board",{headers:{"If-None-Match":first.headers.get("etag")}}));assert.equal(unauthorized.status,403);
});

test("area directory persists its visibility and preserves table IDs, QR tokens and live sessions on rename",async()=>{
 const initial=(await call("GET","admin",undefined,{staff:true})).data.zoneSettings;
 assert.equal(initial.enabled,true);
 const created=await call("PATCH","admin/zones",{action:"create",name:"Khu mới QA",version:initial.version},{staff:true});
 assert.equal(created.status,200,JSON.stringify(created.data));
 const hidden=await call("PATCH","admin/zones",{action:"toggle",enabled:false,version:created.data.zoneSettings.version},{staff:true});
 assert.equal(hidden.status,200);
 assert.equal((await call("GET","admin?section=board",undefined,{staff:true})).data.zoneSettings.enabled,false);
 const before=sqlite.prepare("SELECT id,name,zone,token FROM dining_tables WHERE id = ?").get(table.id);
 const renamed=await call("PATCH","admin/zones",{action:"rename",name:before.zone,newName:"Sảnh QA mới",version:hidden.data.zoneSettings.version},{staff:true});
 assert.equal(renamed.status,200,JSON.stringify(renamed.data));
 const after=sqlite.prepare("SELECT id,name,zone,token FROM dining_tables WHERE id = ?").get(table.id);
 assert.equal(after.zone,"Sảnh QA mới");
 assert.equal(after.id,before.id);assert.equal(after.token,before.token);assert.equal(after.name,before.name);
 assert.equal(sqlite.prepare("SELECT table_id FROM table_sessions WHERE id = ?").get(currentSession.id).table_id,table.id);
 const protectedZone=await call("PATCH","admin/zones",{action:"delete",name:"Sảnh QA mới",version:renamed.data.zoneSettings.version},{staff:true});
 assert.equal(protectedZone.status,409);
 const removed=await call("PATCH","admin/zones",{action:"delete",name:"Khu mới QA",version:renamed.data.zoneSettings.version},{staff:true});
 assert.equal(removed.status,200);
 assert.equal(removed.data.zoneSettings.names.includes("Khu mới QA"),false);
});

test("area writes enforce permissions, reject duplicates and cannot overwrite a concurrent configuration",async()=>{
 const current=(await call("GET","admin",undefined,{staff:true})).data.zoneSettings;
 assert.equal((await call("PATCH","admin/zones",{action:"toggle",enabled:false,version:current.version})).status,403);
 const viewer=await grantStaff(["orders.view"]);
 assert.equal((await call("PATCH","admin/zones",{action:"toggle",enabled:false,version:current.version},{identity:viewer.identity})).status,403);
 const changed=await call("PATCH","admin/zones",{action:"create",name:"Khu độc lập",version:current.version},{staff:true});
 assert.equal(changed.status,200);
 assert.equal((await call("PATCH","admin/zones",{action:"toggle",enabled:false,version:current.version},{staff:true})).status,409);
 const version=changed.data.zoneSettings.version;
 assert.equal((await call("PATCH","admin/zones",{action:"create",name:" khu độc lập ",version},{staff:true})).status,409);
 assert.equal((await call("PATCH","admin/zones",{action:"toggle",enabled:"false",version},{staff:true})).status,400);
 const fresh=(await call("GET","admin",undefined,{staff:true})).data.zoneSettings;
 assert.equal(fresh.enabled,true);assert.equal(fresh.version,version);
});

test("a zone directory race cannot leave tables renamed without its matching directory version",{timeout:5000},async()=>{
 const current=(await call("GET","admin",undefined,{staff:true})).data.zoneSettings;
 const before=sqlite.prepare("SELECT zone FROM dining_tables WHERE id = ?").get(table.id).zone;
 const pause=pauseNextWrite(sql=>sql.startsWith("INSERT INTO settings")||sql.startsWith("UPDATE settings"));
 const first=call("PATCH","admin/zones",{action:"rename",name:before,newName:"Thua cuộc",version:current.version},{staff:true});
 await pause.reached;
 const winner=await call("PATCH","admin/zones",{action:"create",name:"Thắng cuộc",version:current.version},{staff:true});
 assert.equal(winner.status,200,JSON.stringify(winner.data));
 pause.release();
 assert.equal((await first).status,409);
 assert.equal(sqlite.prepare("SELECT zone FROM dining_tables WHERE id = ?").get(table.id).zone,before);
 assert.equal((await call("GET","admin",undefined,{staff:true})).data.zoneSettings.names.includes("Thua cuộc"),false);
});

test("queue source-stage updates never serve fresh portions after another employee has served the waiting ones",async()=>{
 const order=insertOrphanOrder(table,{dining_session_id:currentSession.id,status:"new",items:JSON.stringify([{...snapshotLine("tea","Trà",3,35000),orderLineId:"qa-line",newCount:1,preparingCount:1,readyCount:1,servedCount:0}]),total:105000});
 const move=(fromStatus,count)=>call("PATCH","admin/order",{id:order.id,action:"line_transition",orderLineId:"qa-line",fromStatus,toStatus:"served",count},{staff:true});
 assert.equal((await move("ready",1)).status,200);
 assert.equal((await move("preparing",1)).status,200);
 assert.equal((await move("preparing",1)).status,409);
 const line=JSON.parse(sqlite.prepare("SELECT items FROM orders WHERE id = ?").get(order.id).items)[0];
 assert.equal(line.newCount,1);assert.equal(line.servedCount,2);
 assert.equal((await move("new",1)).status,400);
});

test("invoice statistics paginate 20/50/100 with stable ordering and period totals, excluding unpaid and cancelled orders",async()=>{
 const paidAt=Date.parse('2026-10-23T10:00:00+07:00');
 for(let i=0;i<105;i++)insertRevenueOrder(table,{id:'invoice-order-'+String(i).padStart(3,'0'),paid:1,paid_at:paidAt,payment_method:'cash',total:10000,items:JSON.stringify([snapshotLine('tea','Trà',1,10000)])});
 insertRevenueOrder(table,{paid:0,paid_at:null,total:80000});
 insertRevenueOrder(table,{paid:1,status:'cancelled',paid_at:paidAt,total:90000});
 const prefix='admin/invoices?from=2026-10-23&to=2026-10-23';
 const first=await call('GET',prefix,undefined,{staff:true});
 assert.equal(first.status,200,JSON.stringify(first.data));
 assert.equal(first.data.pageSize,20);assert.equal(first.data.invoices.length,20);assert.equal(first.data.total,105);assert.equal(first.data.totalAmount,1050000);
 for(const size of [20,50,100]){
  const a=(await call('GET',prefix+'&pageSize='+size,undefined,{staff:true})).data;
  const b=(await call('GET',prefix+'&pageSize='+size+'&page=2',undefined,{staff:true})).data;
  assert.equal(a.invoices.length,size);assert.equal(a.pages,Math.ceil(105/size));
  assert.equal(new Set([...a.invoices,...b.invoices].map(invoice=>invoice.id)).size,a.invoices.length+b.invoices.length);
 }
 for(const bad of ['0','21','101','100000','20.5'])assert.equal((await call('GET',prefix+'&pageSize='+bad,undefined,{staff:true})).status,400);
 assert.equal((await call('GET',prefix+'&page=0',undefined,{staff:true})).status,400);
});

test("paid table invoice consolidates its calls, remains readable before closing and does not duplicate legacy paid orders",async()=>{
 for(let i=0;i<2;i++)insertOrphanOrder(table,{dining_session_id:currentSession.id,status:'served',total:75000});
 const paid=await collectTable(tablePayment(await tablePaymentQuote()));assert.equal(paid.status,200);
 const listed=await call('GET','admin/invoices',undefined,{staff:true});
 assert.equal(listed.status,200,JSON.stringify(listed.data));assert.equal(listed.data.total,1);assert.equal(listed.data.totalAmount,150000);
 assert.equal(listed.data.invoices[0].orderCount,2);assert.equal(listed.data.invoices[0].source,'table');
 const detail=await call('GET','admin/invoices/'+encodeURIComponent(listed.data.invoices[0].id),undefined,{staff:true});
 assert.equal(detail.status,200,JSON.stringify(detail.data));assert.equal(detail.data.orders.length,2);
 assert.doesNotMatch(JSON.stringify(detail.data),/client_token|request_hash|browser_hash/);
 assert.equal(sqlite.prepare('SELECT status FROM table_sessions WHERE id = ?').get(currentSession.id).status,'active');
 assert.equal((await call('GET','admin/invoices')).status,403);
 const viewer=await grantStaff(['orders.view']);
 assert.equal((await call('GET','admin/invoices',undefined,{identity:viewer.identity})).status,403);
 const other=await createTestStore('invoice-other');
 assert.equal((await storeCall(other.id,'GET','admin/invoices',undefined,{identity:other.identity})).data.total,0);
 assert.equal((await storeCall(other.id,'GET','admin/invoices/'+encodeURIComponent(listed.data.invoices[0].id),undefined,{identity:other.identity})).status,404);
});

test("invoice time filtering uses the payment clock in Vietnam and includes the selected ending minute",async()=>{
 const moment=Date.parse('2026-10-23T10:30:59+07:00');
 insertRevenueOrder(table,{paid:1,paid_at:moment,total:10000,created_at:Date.parse('2026-09-01T00:00:00Z')});
 insertRevenueOrder(table,{paid:1,paid_at:moment+1000,total:20000});
 const prefix='admin/invoices?from=2026-10-23&to=2026-10-23&fromTime=10:30&toTime=10:30';
 const page=await call('GET',prefix,undefined,{staff:true});assert.equal(page.status,200,JSON.stringify(page.data));
 assert.equal(page.data.total,1);assert.equal(page.data.totalAmount,10000);
 assert.equal((await call('GET',prefix.replace('fromTime=10:30','fromTime=10:31'),undefined,{staff:true})).status,400);
 assert.equal((await call('GET',prefix.replace('fromTime=10:30','fromTime=25:00'),undefined,{staff:true})).status,400);
});

test("area visibility and directory remain isolated across stores",async()=>{
 const other=await createTestStore('zones-other');
 const main=(await call('GET','admin',undefined,{staff:true})).data.zoneSettings;
 assert.equal((await call('PATCH','admin/zones',{action:'toggle',enabled:false,version:main.version},{staff:true})).status,200);
 const remote=(await storeCall(other.id,'GET','admin',undefined,{identity:other.identity})).data.zoneSettings;
 assert.equal(remote.enabled,true);
 assert.equal((await storeCall(other.id,'PATCH','admin/zones',{action:'create',name:'Khu riêng',version:remote.version},{identity:other.identity})).status,200);
 assert.equal((await call('GET','admin',undefined,{staff:true})).data.zoneSettings.names.includes('Khu riêng'),false);
});

test("concurrent portion updates reject stale items even if their revision timestamps collide",{timeout:5000},async()=>{
 const order=insertOrphanOrder(table,{dining_session_id:currentSession.id,status:'preparing',items:JSON.stringify([{...snapshotLine('tea','Trà',2,35000),orderLineId:'collision-line',newCount:0,preparingCount:2,readyCount:0,servedCount:0}]),total:70000});
 const pause=pauseNextWrite(sql=>sql.startsWith('UPDATE orders SET items ='));
 const body={id:order.id,action:'line_transition',orderLineId:'collision-line',fromStatus:'preparing',toStatus:'served',count:1};
 const stale=call('PATCH','admin/order',body,{staff:true});await pause.reached;
 assert.equal((await call('PATCH','admin/order',body,{staff:true})).status,200);
 sqlite.prepare('UPDATE orders SET updated_at = ? WHERE id = ?').run(order.updated_at,order.id);
 pause.release();assert.equal((await stale).status,409);
 const line=JSON.parse(sqlite.prepare('SELECT items FROM orders WHERE id = ?').get(order.id).items)[0];
 assert.equal(line.servedCount,1);assert.equal(line.preparingCount,1);
});

function billCancelBody(order,count=1,changes={}){return {id:order.id,action:'line_cancel',orderLineId:order.items[0].orderLineId??'line_1',count,reason:'Khách đặt nhầm',requestId:crypto.randomUUID(),expectedUpdatedAt:order.updated_at,...changes};}
test('a partial dish cancellation removes only unserved portions, retains audit and replays without a second deduction',async()=>{
 const placed=(await call('POST','orders',checkout())).data.order;
 const raw=sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(placed.id);
 const items=JSON.parse(raw.items);items[0]={...items[0],quantity:3,total:items[0].unitPrice*3,newCount:0,preparingCount:1,readyCount:1,servedCount:1};
 sqlite.prepare("UPDATE orders SET items = ?,total = ?,status = 'preparing' WHERE id = ?").run(JSON.stringify(items),items.reduce((sum,item)=>sum+item.total,0),placed.id);
 const order=(await call('GET',historyPath())).data.orders[0],body=billCancelBody(order,1);
 assert.equal((await call('PATCH','admin/order',body,{staff:true})).status,200);
 const read=()=>sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);const after=read(),line=JSON.parse(after.items)[0];
 assert.equal(line.quantity,2);assert.equal(line.servedCount,1);assert.equal(line.preparingCount+line.readyCount,1);assert.equal(line.cancellations[0].reason,'Khách đặt nhầm');assert.equal(after.total,order.total-line.unitPrice);
 assert.equal((await call('PATCH','admin/order',body,{staff:true})).data.replayed,true);assert.deepEqual(read(),after);
 assert.equal((await call('PATCH','admin/order',{...body,count:2},{staff:true})).status,409);
 const fresh=(await call('GET',historyPath())).data.orders[0];assert.equal((await call('PATCH','admin/order',billCancelBody(fresh,2),{staff:true})).status,409);
});
test('cancelling the last unserved dish removes its entire call from the bill and preserves cancelled value',async()=>{
 const order=(await call('POST','orders',checkout({items:[{itemId:'coffee',quantity:1,extras:[],taste:'Vừa vị',note:''}],expectedTotal:35000}))).data.order;
 assert.ok(order);
 assert.equal((await call('PATCH','admin/order',billCancelBody(order),{staff:true})).status,200);
 const saved=sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);assert.equal(saved.status,'cancelled');assert.equal(saved.total,35000);assert.equal(JSON.parse(saved.items)[0].quantity,0);
 assert.equal((await tablePaymentQuote()).total,0);
});
test('dish cancellation needs orders.cancel and cannot alter paid portions or a stale line snapshot',async()=>{
 const order=(await call('POST','orders',checkout())).data.order;const body=billCancelBody(order);
 const staff=await grantStaff(['orders.manage']);assert.equal((await call('PATCH','admin/order',body,{identity:staff.identity})).status,403);
 assert.equal((await call('PATCH','admin/order',{id:order.id,status:'preparing'},{staff:true})).status,200);
 assert.equal((await call('PATCH','admin/order',body,{staff:true})).status,409);
 assert.equal((await call('PATCH','admin/order',{id:order.id,action:'paid'},{staff:true})).status,200);
 const fresh=(await call('GET',historyPath())).data.orders[0];assert.equal((await call('PATCH','admin/order',billCancelBody(fresh),{staff:true})).status,409);
});
test('a dish cancellation racing with served portions does not erase the service update', {timeout:5000},async()=>{
 const order=(await call('POST','orders',checkout())).data.order;
 const pause=pauseNextWrite(sql=>/UPDATE\s+orders\s+SET\s+items\s*=.*total\s*=/is.test(sql));
 const pending=call('PATCH','admin/order',billCancelBody(order),{staff:true});
 try{await pause.reached;for(const status of ['preparing','ready','served'])assert.equal((await call('PATCH','admin/order',{id:order.id,status},{staff:true})).status,200);}finally{pause.release();beforeWrite=null;}
 assert.equal((await pending).status,409);assert.equal(sqlite.prepare('SELECT status FROM orders WHERE id = ?').get(order.id).status,'served');
});
test('table collection rejects unserved calls including earlier paid calls and accepts legacy served visits',async()=>{
 const order=insertRevenueOrder(table,{status:'ready'}),body=tablePayment(await tablePaymentQuote());
 assert.equal((await collectTable(body)).status,409);assert.equal(rowCount('table_payment_receipts'),0);
 sqlite.prepare("UPDATE orders SET paid = 1 WHERE id = ?").run(order.id);insertRevenueOrder(table,{status:'served'});
 assert.equal((await collectTable(tablePayment(await tablePaymentQuote()))).status,409);
 sqlite.prepare("UPDATE orders SET status = 'served' WHERE id = ?").run(order.id);
 assert.equal((await collectTable(tablePayment(await tablePaymentQuote()))).status,200);
 // Old persisted visit identifiers and the previous query spelling remain readable.
 sqlite.prepare('UPDATE table_sessions SET id = ? WHERE id = ?').run('legacy-03',currentSession.id);
 sqlite.prepare('UPDATE orders SET dining_session_id = ? WHERE dining_session_id = ?').run('legacy-03',currentSession.id);
 const legacy=await call('GET','admin/table-payment?sessionId=legacy-03',undefined,{staff:true});assert.equal(legacy.status,200);assert.equal(legacy.data.session.id,'legacy-03');
});
test('reminders increment accepted counts after cooldown, are idempotent and preserve newer requests from stale resolution',async()=>{
 const originalNow=Date.now;let now=originalNow();Date.now=()=>now;
 try{
  const request={...serviceCall(),requestId:crypto.randomUUID()};const first=await call('POST','calls',request);assert.equal(first.status,200);assert.equal(first.data.requestCount,1);
  assert.equal((await call('POST','calls',request)).data.replayed,true);
  assert.equal((await call('POST','calls',{...request,requestId:crypto.randomUUID()})).status,429);
  const old=sqlite.prepare("SELECT * FROM service_requests WHERE kind = 'service'").get();
  now+=30001;const next={...request,requestId:crypto.randomUUID(),note:'Nhắc lại: thêm nước'};const second=await call('POST','calls',next);assert.equal(second.status,200);assert.equal(second.data.requestCount,2);assert.equal(second.data.pendingCount,2);
  assert.equal((await call('PATCH','admin/call',{id:old.id,createdAt:old.created_at},{staff:true})).status,409);
  const current=sqlite.prepare('SELECT * FROM service_requests WHERE id = ?').get(old.id);assert.equal((await call('PATCH','admin/call',{id:old.id,createdAt:current.created_at},{staff:true})).status,200);
  now+=30001;const third=await call('POST','calls',{...request,requestId:crypto.randomUUID()});assert.equal(third.data.requestCount,3);assert.equal(third.data.pendingCount,1);
  assert.equal((await call('POST','calls',request)).data.replayed,true);assert.equal(sqlite.prepare('SELECT request_count FROM service_requests WHERE id = ?').get(old.id).request_count,3);
  assert.equal((await call('POST','calls',{...request,note:'Changed replay'})).status,409);
 }finally{Date.now=originalNow;}
});
test('payment reminders have independent counters and a simultaneous repeat creates only one alert',async()=>{
 const first={...serviceCall({kind:'bill'}),requestId:crypto.randomUUID()};const second={...first,requestId:crypto.randomUUID()};
 const replies=await Promise.all([call('POST','calls',first),call('POST','calls',second)]);assert.deepEqual(replies.map(value=>value.status).sort(),[200,429]);
 const bill=sqlite.prepare("SELECT * FROM service_requests WHERE kind = 'bill'").get();assert.equal(bill.request_count,1);
 assert.equal((await call('POST','calls',{...serviceCall(),requestId:crypto.randomUUID()})).status,200);
 assert.equal((await call('GET','menu?table='+table.token)).data.callSummary.length,2);
});

test('bill history retains the original called quantity, actor and cancelled portions and cannot be deleted',async()=>{
 const order=(await call('POST','orders',checkout())).data.order;assert.equal((await call('PATCH','admin/order',billCancelBody(order),{staff:true})).status,200);
 const response=await call('GET','admin/bill-history?session='+currentSession.id,undefined,{staff:true});assert.equal(response.status,200);assertNoSecrets(response.data);
 const history=response.data.history;assert.equal(history[0].kind,'created');assert.equal(history[0].after.items[0].quantity,order.items[0].quantity);
 const cancelled=history.at(-1);assert.equal(cancelled.kind,'cancel');assert.ok(cancelled.actor.includes('·'));assert.equal(cancelled.before.total,order.total);assert.equal(cancelled.after.items[0].cancellations[0].quantity,1);
 assert.throws(()=>sqlite.prepare('DELETE FROM order_audit WHERE order_id = ?').run(order.id),/cannot be deleted/);
 assert.throws(()=>sqlite.prepare("UPDATE order_audit SET actor = 'Other' WHERE order_id = ?").run(order.id),/cannot be changed/);
 assert.throws(()=>sqlite.prepare('DELETE FROM orders WHERE id = ?').run(order.id),/cannot be deleted/);
 assert.equal((await call('GET','admin/bill-history?session='+currentSession.id)).status,403);
});
test('paid invoice snapshot includes cancelled calls and remains unchanged after later live data changes',async()=>{
 const cancelled=(await call('POST','orders',checkout())).data.order;assert.equal((await call('PATCH','admin/order',billCancelBody(cancelled),{staff:true})).status,200);
 insertRevenueOrder(table,{status:'served',total:70000});
 const collected=await collectTable(tablePayment(await tablePaymentQuote()));assert.equal(collected.status,200,JSON.stringify(collected.data));
 const receipt=sqlite.prepare('SELECT * FROM table_payment_receipts').get();assert.ok(receipt.orders_json);
 const url='admin/invoices/'+encodeURIComponent('payment:'+receipt.id);const first=(await call('GET',url,undefined,{staff:true})).data;
 assert.equal(first.snapshot,true);assert.ok(first.history.some(event=>event.kind==='cancel'));assert.ok(first.orders.some(order=>order.id===cancelled.id&&order.status==='cancelled'));
 assertNoSecrets(first);const paid=first.orders.find(order=>order.status==='served');assert.equal(paid.paid,1);
 sqlite.prepare("UPDATE orders SET note = 'Changed live record' WHERE id = ?").run(paid.id);
 assert.deepEqual((await call('GET',url,undefined,{staff:true})).data,first);
 const moved=await transferTable(tableTransfer(freshTable()));assert.equal(moved.status,200);
 assert.deepEqual((await call('GET',url,undefined,{staff:true})).data,first,'A later table transfer must not rename the paid invoice');
 assert.throws(()=>sqlite.prepare("UPDATE table_payment_receipts SET orders_json = '[]' WHERE id = ?").run(receipt.id),/cannot be changed/);
 assert.throws(()=>sqlite.prepare('DELETE FROM table_payment_receipts WHERE id = ?').run(receipt.id),/cannot be deleted/);
});
test('a missing audit write rolls back a cancellation rather than changing the bill without history',async()=>{
 const order=(await call('POST','orders',checkout())).data.order;
 sqlite.exec("CREATE TRIGGER fail_cancel_audit BEFORE INSERT ON order_audit WHEN NEW.kind = 'cancel' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
 const before=sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);const response=await call('PATCH','admin/order',billCancelBody(order),{staff:true});assert.equal(response.status,500);assert.deepEqual(sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(order.id),before);
});

test('full and compact admin use a versioned logo URL and never repeat the stored image payload',async()=>{
 const raw=JSON.parse(sqlite.prepare("SELECT value FROM settings WHERE key = 'shop'").get().value);raw.logo=brandPng;sqlite.prepare("UPDATE settings SET value = ? WHERE key = 'shop'").run(JSON.stringify(raw));
 for(const path of ['admin','admin?section=board']){const response=await call('GET',path,undefined,{staff:true});assert.equal(response.status,200);assert.match(response.data.shop.logo,/^\/api\/branding-icon\?/);assert.ok(!JSON.stringify(response.data).includes('data:image/png;base64,'));}
 const bytes=Buffer.concat([Buffer.from(brandPng.split(',')[1],'base64'),Buffer.alloc(45000)]);const rejected=await call('PATCH','admin/shop',{...initialMenu.shop,logo:'data:image/png;base64,'+bytes.toString('base64')},{staff:true});assert.equal(rejected.status,400);assert.match(rejected.data.error,/45 KB/);
});
test('server timing is opt-in and realtime sockets require the same origin',async()=>{
 delete environment.ENABLE_SERVER_TIMING;assert.equal((await call('GET','admin',undefined,{staff:true})).headers.get('server-timing'),null);
 environment.ENABLE_SERVER_TIMING='true';try{assert.match((await call('GET','admin',undefined,{staff:true})).headers.get('server-timing'),/total;dur=/);}finally{delete environment.ENABLE_SERVER_TIMING;}
 assert.equal((await call('GET','realtime/ws',undefined,{staff:true,headers:{Origin:'https://foreign.example'}})).status,403);
});
