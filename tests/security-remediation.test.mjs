import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import ts from "typescript";

const root = new URL("../", import.meta.url).pathname;

function transpile(filePath) {
  const content = readFileSync(root + filePath, "utf8");
  return ts.transpileModule(content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const STAGING_SETUP_TOKEN = "staging-secret-setup-token-min-32-chars-ok!";
const environment = {
  DB: null,
  STAFF_EMAILS: "owner@gaeru.test,dothuongton@gmail.com",
  AUTH_MODE: "self",
  SETUP_TOKEN: STAGING_SETUP_TOKEN,
  PBKDF2_ITERATIONS: "10000", // fast for tests
};

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

let currentDb = null;
const als = new AsyncLocalStorage();

function setupSqlite() {
  const db = new DatabaseSync(":memory:");
  currentDb = db;
  environment.DB = d1(db);
  return db;
}

function load(filePath) {
  const code = transpile(filePath);
  const module = { exports: {} };
  const require = (specifier) => {
    if (specifier === "cloudflare:workers") return { env: environment };
    if (specifier === "./store-database") {
      return {
        rootDatabase() {
          return environment.DB;
        },
        database() {
          return environment.DB;
        },
        currentStoreId() {
          return "test-store";
        },
      };
    }
    if (specifier === "./auth-crypto") return load("lib/auth-crypto.ts");
    if (specifier === "./menu") {
      return {
        OrderError: class OrderError extends Error {
          constructor(message, status = 400) {
            super(message);
            this.status = status;
          }
        },
        checkedText(text, max = 255) {
          return String(text || "").trim().slice(0, max);
        },
      };
    }
    if (specifier === "./staff-permissions") {
      return {
        normalizeStaffEmail(email) {
          return typeof email === "string" ? email.trim().toLowerCase() : "";
        },
      };
    }
    if (specifier === "./auth") return load("lib/auth.ts");
    throw new Error(`Unknown specifier: ${specifier}`);
  };
  const fn = new Function("module", "exports", "require", "crypto", code);
  fn(module, module.exports, require, globalThis.crypto);
  return module.exports;
}

test("P0 Security (P-01): Old hardcoded token and forceReset are rejected with 403", async () => {
  setupSqlite();
  const auth = load("lib/auth.ts");

  // Step 1: Initial legitimate bootstrap with staging environment token
  const boot = await auth.bootstrapOwner(new Request("https://site.test/api/auth/bootstrap"), {
    setupToken: STAGING_SETUP_TOKEN,
    email: "owner@gaeru.test",
    displayName: "Chủ Quán Hợp Lệ",
    password: "MatKhauGoc@123456",
  });
  assert.equal(boot.identity.email, "owner@gaeru.test");

  // Verify legitimate login works with MatKhauGoc@123456
  const loginSuccess = await auth.loginWithPassword(new Request("https://site.test/api/auth/login"), {
    email: "owner@gaeru.test",
    password: "MatKhauGoc@123456",
  });
  assert.equal(loginSuccess.identity.email, "owner@gaeru.test");

  // Test A: Attempt bootstrap with the old hardcoded token from the report + forceReset -> must return 403
  await assert.rejects(
    async () =>
      await auth.bootstrapOwner(new Request("https://site.test/api/auth/bootstrap"), {
        setupToken: "gaeru_sec_8f3a9b2e7c1d4a6e8b0d5f2a7e4c1b9d",
        email: "owner@gaeru.test",
        displayName: "Staging Probe",
        password: "MatKhauMoi@456789",
        forceReset: true,
      }),
    (err) => err.status === 403
  );

  // Test B: Attempt bootstrap with staging setup token + forceReset: true -> must return 403
  await assert.rejects(
    async () =>
      await auth.bootstrapOwner(new Request("https://site.test/api/auth/bootstrap"), {
        setupToken: STAGING_SETUP_TOKEN,
        email: "owner@gaeru.test",
        displayName: "Staging Probe",
        password: "MatKhauMoi@456789",
        forceReset: true,
      }),
    (err) => err.status === 403
  );

  // Verify that owner credentials were NOT overwritten: MatKhauGoc@123456 remains valid
  const reVerify = await auth.loginWithPassword(new Request("https://site.test/api/auth/login"), {
    email: "owner@gaeru.test",
    password: "MatKhauGoc@123456",
  });
  assert.equal(reVerify.identity.email, "owner@gaeru.test");

  // Attacker's password fails with 401
  await assert.rejects(
    async () =>
      await auth.loginWithPassword(new Request("https://site.test/api/auth/login"), {
        email: "owner@gaeru.test",
        password: "MatKhauMoi@456789",
      }),
    (err) => err.status === 401
  );
});

test("P0 Security (P-04): bootstrap-status returns only { canBootstrap: boolean } without leaks", async () => {
  setupSqlite();
  const auth = load("lib/auth.ts");

  // Before bootstrap: canBootstrap is true, no tokenPrefix, no count, no hasSetupToken
  const statusBefore = await auth.canBootstrap();
  assert.equal(statusBefore.canBootstrap, true);
  assert.equal(statusBefore.tokenPrefix, undefined);
  assert.equal(statusBefore.count, undefined);
  assert.equal(statusBefore.hasSetupToken, undefined);
  assert.equal(statusBefore.existingAccounts, undefined);

  // Perform bootstrap
  await auth.bootstrapOwner(new Request("https://site.test/"), {
    setupToken: STAGING_SETUP_TOKEN,
    email: "owner@gaeru.test",
    password: "Password123456!",
  });

  // After bootstrap: canBootstrap is false, strictly clean
  const statusAfter = await auth.canBootstrap();
  assert.equal(statusAfter.canBootstrap, false);
  assert.equal(statusAfter.tokenPrefix, undefined);
  assert.equal(statusAfter.count, undefined);
  assert.equal(statusAfter.hasSetupToken, undefined);
  assert.equal(statusAfter.existingAccounts, undefined);
});

test("P1 Security (P-03): Multi-dimensional rate limit protects owner from external lockout", async () => {
  setupSqlite();
  const auth = load("lib/auth.ts");

  await auth.bootstrapOwner(new Request("https://site.test/"), {
    setupToken: STAGING_SETUP_TOKEN,
    email: "owner@gaeru.test",
    password: "OwnerLegitPassword123!",
  });

  // Attacker from IP 203.0.113.5 attempts to brute-force owner@gaeru.test
  const attackerReq = new Request("https://site.test/api/auth/login", {
    headers: { "cf-connecting-ip": "203.0.113.5" },
  });

  // 10 failed attempts from attacker IP
  for (let i = 1; i <= 10; i++) {
    await assert.rejects(
      async () =>
        await auth.loginWithPassword(attackerReq, {
          email: "owner@gaeru.test",
          password: "BadGuess@" + i,
        }),
      (err) => err.status === 401
    );
  }

  // 11th attempt from attacker IP is locked (429)
  await assert.rejects(
    async () =>
      await auth.loginWithPassword(attackerReq, {
        email: "owner@gaeru.test",
        password: "BadGuess@11",
      }),
    (err) => err.status === 429
  );

  // Legitimate owner from legitimate IP 198.51.100.1 is NOT locked out and logs in successfully!
  const ownerReq = new Request("https://site.test/api/auth/login", {
    headers: { "cf-connecting-ip": "198.51.100.1" },
  });
  const ownerLogin = await auth.loginWithPassword(ownerReq, {
    email: "owner@gaeru.test",
    password: "OwnerLegitPassword123!",
  });
  assert.equal(ownerLogin.identity.email, "owner@gaeru.test");
});

test("P1 Security (P-08): Non-existent account verifies against dummy hash for timing equality", async () => {
  setupSqlite();
  const auth = load("lib/auth.ts");

  // Login attempt with non-existent email must run verification and fail with 401
  await assert.rejects(
    async () =>
      await auth.loginWithPassword(new Request("https://site.test/api/auth/login"), {
        email: "nonexistent@gaeru.test",
        password: "RandomPassword123!",
      }),
    (err) => err.status === 401 && err.message === "Email hoặc mật khẩu không đúng."
  );
});

test("P1 Security (P-09): checkRateLimit limits excessive session requests per IP", async () => {
  setupSqlite();
  const auth = load("lib/auth.ts");

  // Normal burst within limit
  for (let i = 0; i < 5; i++) {
    const res = await auth.checkRateLimit("test_rate_ip", 5, 60_000, 60_000);
    if (i < 4) {
      assert.equal(res.allowed, true);
    } else {
      // 5th attempt hits cap -> locked
      assert.equal(res.allowed, false);
      assert.ok(res.retryAfter && res.retryAfter > 0);
    }
  }

  // Next attempt while locked is immediately rejected
  const lockedRes = await auth.checkRateLimit("test_rate_ip", 5, 60_000, 60_000);
  assert.equal(lockedRes.allowed, false);
});
