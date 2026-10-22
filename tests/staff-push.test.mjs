import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import ts from "typescript";

const root = new URL("../", import.meta.url).pathname;

// Transpile helper
function transpile(filePath) {
  const content = readFileSync(root + filePath, "utf8");
  return ts.transpileModule(content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

// Load staff-push module with mocked cloudflare environment
const environment = { DB: null, STAFF_EMAILS: "owner@gaeru.test", VAPID_PUBLIC_KEY: "test_pub", VAPID_PRIVATE_KEY: "test_priv", VAPID_SUBJECT: "mailto:admin@gaeru.test" };

function d1(db) {
  return {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) {
          values = args;
          return statement;
        },
        async first() {
          const stmt = db.prepare(sql);
          return stmt.get(...values) || null;
        },
        async all() {
          const stmt = db.prepare(sql);
          return { results: stmt.all(...values) };
        },
        async run() {
          const stmt = db.prepare(sql);
          const info = stmt.run(...values);
          return { meta: { changes: info.changes } };
        },
      };
      return statement;
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    },
  };
}

let cachedStoreDb;
function getStoreDb() {
  if (cachedStoreDb) return cachedStoreDb;
  const storeDbModule = { exports: {} };
  new Function("require", "module", "exports", transpile("lib/store-database.ts"))(
    (s) => {
      if (s === "node:async_hooks") return { AsyncLocalStorage };
      if (s === "cloudflare:workers") return { env: environment };
      if (s === "./menu") return { OrderError: class OrderError extends Error { constructor(m, code) { super(m); this.status = code; } } };
      throw new Error("Unexpected store-database import: " + s);
    },
    storeDbModule,
    storeDbModule.exports
  );
  cachedStoreDb = storeDbModule.exports;
  return cachedStoreDb;
}

// Load staffPush
const pushModule = { exports: {} };
const pushOutput = transpile("lib/staff-push.ts");
const pushRequire = (specifier) => {
  if (specifier === "cloudflare:workers") return { env: environment };
  if (specifier === "./store-database" || specifier.endsWith("/store-database")) {
    return getStoreDb();
  }
  if (specifier === "./server") {
    return {
      database: () => environment.DB,
    };
  }
  if (specifier === "./staff-access") {
    return {
      ownerEmails: () => (environment.STAFF_EMAILS || "").split(","),
    };
  }
  if (specifier === "./staff-permissions") {
    const permModule = { exports: {} };
    new Function("require", "module", "exports", transpile("lib/staff-permissions.ts"))(
      () => {},
      permModule,
      permModule.exports
    );
    return permModule.exports;
  }
  if (specifier === "./worker-context") {
    return {
      waitUntil: (promise) => { promise.catch(() => {}); },
    };
  }
  if (specifier === "./menu") {
    return { OrderError: class OrderError extends Error { constructor(m, code) { super(m); this.status = code; } } };
  }
  if (specifier === "@block65/webcrypto-web-push") {
    return {
      buildPushPayload: async (msg) => ({
        headers: { authorization: "vapid t=mock", ttl: "60", "content-encoding": "aes128gcm" },
        method: "POST",
        body: new TextEncoder().encode(JSON.stringify(msg)),
      }),
    };
  }
  throw new Error("Unexpected import: " + specifier);
};

new Function("require", "module", "exports", pushOutput)(pushRequire, pushModule, pushModule.exports);
const {
  isValidPushEndpoint,
  subscribeStaffDevice,
  unsubscribeStaffDevice,
  getStaffSubscriptionStatus,
  dispatchStaffPush,
  sendTestPush,
  getVapidConfig,
} = pushModule.exports;

test("SSRF protection: rejects non-HTTPS, internal IPs, localhost, and fake push domains", () => {
  // Valid endpoints
  assert.equal(isValidPushEndpoint("https://fcm.googleapis.com/fcm/send/device-token-123"), true);
  assert.equal(isValidPushEndpoint("https://web.push.apple.com/q1w2e3r4t5y6"), true);
  assert.equal(isValidPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/sub"), true);
  assert.equal(isValidPushEndpoint("https://db5p.notify.windows.com/?token=abc"), true);

  // Invalid: HTTP (plain text)
  assert.equal(isValidPushEndpoint("http://fcm.googleapis.com/fcm/send/123"), false);

  // Invalid: Credentials embedded
  assert.equal(isValidPushEndpoint("https://admin:pass@fcm.googleapis.com/fcm"), false);

  // Invalid: Custom ports
  assert.equal(isValidPushEndpoint("https://fcm.googleapis.com:8443/fcm"), false);

  // Invalid: Localhost & Private / Internal IPs
  assert.equal(isValidPushEndpoint("https://localhost/fcm"), false);
  assert.equal(isValidPushEndpoint("https://127.0.0.1/push"), false);
  assert.equal(isValidPushEndpoint("https://10.0.0.1/push"), false);
  assert.equal(isValidPushEndpoint("https://192.168.1.1/push"), false);
  assert.equal(isValidPushEndpoint("https://169.254.169.254/latest/meta-data"), false);

  // Invalid: Spoofed hostnames and suffixes
  assert.equal(isValidPushEndpoint("https://fcm.googleapis.com.attacker.com/fcm"), false);
  assert.equal(isValidPushEndpoint("https://attacker-fcm.googleapis.com/fcm"), false);
  assert.equal(isValidPushEndpoint("https://malicious.org/push"), false);
  assert.equal(isValidPushEndpoint(""), false);
});

test("Staff push subscription CRUD operates with store isolation and idempotency", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = readdirSync(root + "drizzle").filter((name) => name.endsWith(".sql")).sort();
  for (const migration of migrations) sqlite.exec(readFileSync(root + "drizzle/" + migration, "utf8"));
  environment.DB = d1(sqlite);

  const { inStore } = pushRequire("./store-database");

  // Subscribe in store 'store-a'
  await inStore("store-a", async () => {
    await subscribeStaffDevice({
      userId: "user-1",
      staffAccountId: "account-1",
      deviceId: "device-uuid-1",
      endpoint: "https://fcm.googleapis.com/fcm/send/token-1",
      p256dh: "BCVxsr7N_eNg6gPP2vCHP16Nd4bWB1x5yZ34G_test_p256dh_key_sample_value_12345",
      auth: "test_auth_secret_key_1234",
    });

    const status = await getStaffSubscriptionStatus({ userId: "user-1", deviceId: "device-uuid-1" });
    assert.equal(status.subscribed, true);

    const otherDeviceStatus = await getStaffSubscriptionStatus({ userId: "user-1", deviceId: "device-uuid-2" });
    assert.equal(otherDeviceStatus.subscribed, false);
  });

  // Verify store isolation: user-1 in 'store-b' is NOT subscribed yet
  await inStore("store-b", async () => {
    const statusB = await getStaffSubscriptionStatus({ userId: "user-1", deviceId: "device-uuid-1" });
    assert.equal(statusB.subscribed, false);

    // Can subscribe the same device endpoint in store-b independently
    await subscribeStaffDevice({
      userId: "user-1",
      staffAccountId: "account-2",
      deviceId: "device-uuid-1",
      endpoint: "https://fcm.googleapis.com/fcm/send/token-1",
      p256dh: "BCVxsr7N_eNg6gPP2vCHP16Nd4bWB1x5yZ34G_test_p256dh_key_sample_value_12345",
      auth: "test_auth_secret_key_1234",
    });

    const statusBAfter = await getStaffSubscriptionStatus({ userId: "user-1", deviceId: "device-uuid-1" });
    assert.equal(statusBAfter.subscribed, true);
  });

  // Unsubscribe in store-a leaves store-b intact
  await inStore("store-a", async () => {
    await unsubscribeStaffDevice({ userId: "user-1", deviceId: "device-uuid-1" });
    const statusAfter = await getStaffSubscriptionStatus({ userId: "user-1", deviceId: "device-uuid-1" });
    assert.equal(statusAfter.subscribed, false);
  });

  await inStore("store-b", async () => {
    const statusBStill = await getStaffSubscriptionStatus({ userId: "user-1", deviceId: "device-uuid-1" });
    assert.equal(statusBStill.subscribed, true);
  });
});

test("Push notification dispatch enforces permissions and protects customer privacy", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = readdirSync(root + "drizzle").filter((name) => name.endsWith(".sql")).sort();
  for (const migration of migrations) sqlite.exec(readFileSync(root + "drizzle/" + migration, "utf8"));
  environment.DB = d1(sqlite);

  const { inStore } = pushRequire("./store-database");

  // Create staff accounts in store 'main'
  // 1. Kitchen staff: only orders.manage (has orders.view)
  sqlite.prepare("INSERT INTO staff_accounts (store_id, id, email, name, role, permissions_json, status, version, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    "main", "staff-kitchen", "kitchen@test.com", "Đầu bếp", "kitchen", JSON.stringify(["orders.view", "orders.manage"]), "active", 1, Date.now(), Date.now(), "user-kitchen"
  );
  // 2. Service staff: has tables.manage and orders.view
  sqlite.prepare("INSERT INTO staff_accounts (store_id, id, email, name, role, permissions_json, status, version, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    "main", "staff-service", "service@test.com", "Phục vụ", "service", JSON.stringify(["orders.view", "tables.manage"]), "active", 1, Date.now(), Date.now(), "user-service"
  );
  // 3. Suspended staff
  sqlite.prepare("INSERT INTO staff_accounts (store_id, id, email, name, role, permissions_json, status, version, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    "main", "staff-suspended", "suspended@test.com", "Đã khóa", "service", JSON.stringify(["orders.view", "tables.manage"]), "suspended", 1, Date.now(), Date.now(), "user-suspended"
  );

  // Subscribe devices
  await inStore("main", async () => {
    await subscribeStaffDevice({
      userId: "user-kitchen",
      staffAccountId: "staff-kitchen",
      deviceId: "dev-kitchen",
      endpoint: "https://fcm.googleapis.com/fcm/send/kitchen",
      p256dh: "BCVxsr7N_eNg6gPP2vCHP16Nd4bWB1x5yZ34G_test_p256dh_key_sample_value_12345",
      auth: "test_auth_secret_key_1234",
    });
    await subscribeStaffDevice({
      userId: "user-service",
      staffAccountId: "staff-service",
      deviceId: "dev-service",
      endpoint: "https://fcm.googleapis.com/fcm/send/service",
      p256dh: "BCVxsr7N_eNg6gPP2vCHP16Nd4bWB1x5yZ34G_test_p256dh_key_sample_value_12345",
      auth: "test_auth_secret_key_1234",
    });
    await subscribeStaffDevice({
      userId: "user-suspended",
      staffAccountId: "staff-suspended",
      deviceId: "dev-suspended",
      endpoint: "https://fcm.googleapis.com/fcm/send/suspended",
      p256dh: "BCVxsr7N_eNg6gPP2vCHP16Nd4bWB1x5yZ34G_test_p256dh_key_sample_value_12345",
      auth: "test_auth_secret_key_1234",
    });
  });

  // Track dispatched fetches
  const sent = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect,"manual","Workers supports manual redirects, never error; push must not follow redirects");
    sent.push({ url, body: new TextDecoder().decode(options.body) });
    return { ok: true, status: 200 };
  };

  try {
    // 1. Dispatch table opening (requires tables.manage): only user-service should receive, kitchen should NOT
    await dispatchStaffPush({
      storeId: "main",
      requiredPermission: "tables.manage",
      eventType: "table_opening",
      eventTag: "main:table_opening:session-1",
      title: "Yêu cầu mở bàn mới",
      body: "Bàn 01 — Yêu cầu mở bàn cần duyệt",
      url: "/?view=admin&tab=tables",
    });

    // Check sent: should only contain service endpoint
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, "https://fcm.googleapis.com/fcm/send/service");
    const payload = JSON.parse(sent[0].body);
    const data = JSON.parse(payload.data);
    assert.equal(data.type, "table_opening");
    assert.equal(data.title, "Yêu cầu mở bàn mới");
    // Ensure NO PII in push data
    assert.equal(data.customerName, undefined);
    assert.equal(data.phone, undefined);
    assert.equal(data.cookie, undefined);
    assert.equal(data.qrUrl, undefined);

    // 2. Dispatch order_new (requires orders.view): both kitchen and service should receive, suspended should NOT
    sent.length = 0;
    await dispatchStaffPush({
      storeId: "main",
      requiredPermission: "orders.view",
      eventType: "order_new",
      eventTag: "main:order_new:order-1",
      title: "Đơn gọi món mới",
      body: "Bàn 01 — Đơn M1A2B3",
      url: "/?view=admin&tab=orders",
    });

    assert.equal(sent.length, 2);
    const endpoints = sent.map((s) => s.url).sort();
    assert.deepEqual(endpoints, [
      "https://fcm.googleapis.com/fcm/send/kitchen",
      "https://fcm.googleapis.com/fcm/send/service",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PWA manifest, offline fallback, and Service Worker security rules", () => {
  // 1. Manifest
  const manifest = JSON.parse(readFileSync(root + "public/manifest.webmanifest", "utf8"));
  assert.equal(manifest.id, "/gaeru");
  assert.equal(manifest.start_url, "/gaeru");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.length >= 2);
  assert.ok(manifest.icons.some((i) => i.purpose === "maskable"));

  // 2. Offline HTML
  const offlineHtml = readFileSync(root + "public/offline.html", "utf8");
  assert.ok(offlineHtml.includes("Không có kết nối mạng"));
  assert.ok(offlineHtml.includes("Thử kết nối lại"));
  assert.ok(!offlineHtml.includes("<script src="), "Offline page should be self-contained without external script dependencies");

  // 3. Service Worker
  const swCode = readFileSync(root + "public/sw.js", "utf8");
  assert.ok(swCode.includes("url.pathname.startsWith(\"/api/\")"), "Service Worker must exclude API from caching");
  assert.ok(swCode.includes("request.mode === \"navigate\""), "Service Worker must handle navigation offline fallback");
  assert.ok(swCode.includes("notificationclick"), "Service Worker must handle notification clicks");
});

test("A different user must not overwrite an existing device subscription", async () => {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(root + "drizzle").filter((x) => x.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(root + "drizzle/" + file, "utf8"));
  }
  environment.DB = d1(sqlite);
  const endpoint = "https://fcm.googleapis.com/fcm/send/private-owner-device";
  await getStoreDb().inStore("main", async () => {
    await subscribeStaffDevice({
      userId: "original-user",
      deviceId: "original-device",
      endpoint,
      p256dh: "A".repeat(87),
      auth: "B".repeat(22),
    });
    try {
      await subscribeStaffDevice({
        userId: "second-user",
        deviceId: "different-device",
        endpoint,
        p256dh: "C".repeat(87),
        auth: "D".repeat(22),
      });
    } catch {
      // expected error
    }
  });
  const saved = sqlite.prepare("SELECT user_id, p256dh FROM staff_push_subscriptions WHERE endpoint = ?").get(endpoint);
  assert.equal(saved.user_id, "original-user", "A new user must not silently take over an existing endpoint association");
});

test("sendTestPush validates endpoint and cleans up 404/410 subscriptions", async () => {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(root + "drizzle").filter((x) => x.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(root + "drizzle/" + file, "utf8"));
  }
  environment.DB = d1(sqlite);
  const deadEndpoint = "https://fcm.googleapis.com/fcm/send/dead-device";
  await getStoreDb().inStore("main", async () => {
    await subscribeStaffDevice({
      userId: "test-user",
      deviceId: "dev-dead",
      endpoint: deadEndpoint,
      p256dh: "A".repeat(87),
      auth: "B".repeat(22),
    });
  });

  const config = getVapidConfig();
  assert.equal(config.enabled, true);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Not Found", { status: 404 });
  try {
    const res = await getStoreDb().inStore("main", async () =>
      sendTestPush({ userId: "test-user", deviceId: "dev-dead", storeId: "main" })
    );
    assert.equal(res.success, false);
    const remaining = sqlite.prepare("SELECT COUNT(*) as c FROM staff_push_subscriptions WHERE endpoint = ?").get(deadEndpoint);
    assert.equal(remaining.c, 0, "Dead subscription must be evicted on 404/410");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("test push reports provider VAPID errors without leaking endpoint or credentials", async () => {
 const sqlite=new DatabaseSync(":memory:");
 for(const file of readdirSync(root+"drizzle").filter(x=>x.endsWith(".sql")).sort())sqlite.exec(readFileSync(root+"drizzle/"+file,"utf8"));
 environment.DB=d1(sqlite);
 await getStoreDb().inStore("main",()=>subscribeStaffDevice({userId:"test-error",deviceId:"device-error",endpoint:"https://fcm.googleapis.com/fcm/send/private-endpoint",p256dh:"A".repeat(87),auth:"B".repeat(22)}));
 const previous=globalThis.fetch;
 globalThis.fetch=async(_url,options)=>{assert.equal(options.redirect,"manual");return Response.json({reason:"BadJwtToken"},{status:403});};
 try{
  const result=await getStoreDb().inStore("main",()=>sendTestPush({userId:"test-error",deviceId:"device-error",storeId:"main"}));
  assert.equal(result.success,false);
  assert.match(result.error,/403/);assert.match(result.error,/BadJwtToken/);
  assert.doesNotMatch(JSON.stringify(result),/private-endpoint|test_priv/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM staff_push_subscriptions").get().n,1);
 }finally{globalThis.fetch=previous;}
});
