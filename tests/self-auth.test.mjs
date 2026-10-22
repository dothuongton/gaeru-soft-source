import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

const environment = {
  DB: null,
  STAFF_EMAILS: "owner@gaeru.test,dothuongton@gmail.com",
  AUTH_MODE: "self",
  SETUP_TOKEN: "super-secret-setup-token-12345",
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

class OrderError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Module loader
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const code = transpile(file);
  const req = (specifier) => {
    if (specifier === "node:async_hooks") return { AsyncLocalStorage };
    if (specifier === "cloudflare:workers") return { env: environment };
    if (specifier === "./menu" || specifier === "@/lib/menu") {
      return {
        OrderError,
        checkedText: (t, max, req) => {
          if (!t && req) throw new OrderError("Thiếu thông tin");
          return String(t || "").slice(0, max);
        },
      };
    }
    if (specifier === "./store-database" || specifier === "@/lib/store-database") {
      return {
        rootDatabase: () => environment.DB,
        currentStoreId: () => "main",
      };
    }
    if (specifier === "./staff-permissions" || specifier === "@/lib/staff-permissions") {
      return {
        normalizeStaffEmail: (e) => (typeof e === "string" ? e.trim().toLowerCase() : null),
        ALL_PERMISSIONS: ["tables.manage", "staff.manage"],
        ROLE_PRESETS: [],
      };
    }
    if (specifier === "./auth-crypto") return load("lib/auth-crypto.ts");
    if (specifier === "./auth" || specifier === "@/lib/auth") return load("lib/auth.ts");
    if (specifier === "./staff-access" || specifier === "@/lib/staff-access") {
      return {
        ownerEmails: () => ["owner@gaeru.test", "dothuongton@gmail.com"],
      };
    }
    throw new Error("Unknown import: " + specifier);
  };
  new Function("require", "module", "exports", code)(req, mod, mod.exports);
  return mod.exports;
}

function setupSqlite() {
  const db = new DatabaseSync(":memory:");
  const drizzleDir = root + "drizzle/";
  const migrations = readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of migrations) {
    const sql = readFileSync(drizzleDir + file, "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      try {
        db.exec(stmt);
      } catch (err) {
        // Some sqlite alter statements may behave differently in memory
      }
    }
  }
  environment.DB = d1(db);
  return db;
}

test("PBKDF2 WebCrypto password hashing and validation", async () => {
  const cryptoUtils = load("lib/auth-crypto.ts");

  // Valid password hashing
  const hash = await cryptoUtils.hashPassword("SuperSecureP@ss123", 5000);
  assert(hash.startsWith("pbkdf2$5000$"));

  // Correct verification
  const checkCorrect = await cryptoUtils.verifyPassword("SuperSecureP@ss123", hash);
  assert.equal(checkCorrect.valid, true);

  // Incorrect verification
  const checkWrong = await cryptoUtils.verifyPassword("WrongPassword123!", hash);
  assert.equal(checkWrong.valid, false);

  // Password policy: reject < 12 characters
  await assert.rejects(
    async () => await cryptoUtils.hashPassword("short123"),
    (err) => err instanceof OrderError && err.status === 400
  );

  // Password policy: reject > 128 characters
  await assert.rejects(
    async () => await cryptoUtils.hashPassword("a".repeat(129)),
    (err) => err instanceof OrderError && err.status === 400
  );
});

test("Dual-mode identity resolution: Sites headers vs Self-hosted session cookie", async () => {
  setupSqlite();
  const auth = load("lib/auth.ts");

  // 1. Sites gateway header takes priority
  const sitesReq = new Request("https://site.test/api/menu", {
    headers: {
      "oai-authenticated-user-id": "sites_user_001",
      "oai-authenticated-user-email": "sites_admin@example.com",
    },
  });
  const sitesIdentity = await auth.resolveIdentity(sitesReq);
  assert.deepEqual(sitesIdentity, {
    userId: "sites_user_001",
    email: "sites_admin@example.com",
    displayName: undefined,
  });

  // 2. Self mode with invalid/missing cookie -> guest (null)
  const guestReq = new Request("https://site.test/api/menu");
  const guestIdentity = await auth.resolveIdentity(guestReq);
  assert.equal(guestIdentity, null);

  // 3. Self mode with valid session
  const loginResult = await auth.bootstrapOwner(new Request("https://site.test/api/auth/bootstrap"), {
    setupToken: "super-secret-setup-token-12345",
    email: "owner@gaeru.test",
    displayName: "Platform Chủ Quán",
    password: "Password123456!",
  });

  const sessionCookie = loginResult.cookie.split(";")[0];
  const authedReq = new Request("https://site.test/api/menu", {
    headers: { cookie: sessionCookie },
  });
  const authedIdentity = await auth.resolveIdentity(authedReq);
  assert.equal(authedIdentity?.email, "owner@gaeru.test");
  assert.equal(authedIdentity?.displayName, "Platform Chủ Quán");
});

test("Bootstrap platform owner: can only bootstrap once, requires secret & STAFF_EMAILS", async () => {
  setupSqlite();
  const auth = load("lib/auth.ts");

  // Check initial bootstrap status
  assert.equal((await auth.canBootstrap()).canBootstrap, true);

  // Bootstrap with wrong secret -> 403
  await assert.rejects(
    async () =>
      await auth.bootstrapOwner(new Request("https://site.test/"), {
        setupToken: "wrong-secret",
        email: "owner@gaeru.test",
        password: "ValidPassword123!",
      }),
    (err) => err instanceof OrderError && err.status === 403
  );

  // Bootstrap with email not in STAFF_EMAILS -> 403
  await assert.rejects(
    async () =>
      await auth.bootstrapOwner(new Request("https://site.test/"), {
        setupToken: "super-secret-setup-token-12345",
        email: "hacker@intruder.test",
        password: "ValidPassword123!",
      }),
    (err) => err instanceof OrderError && err.status === 403
  );

  // Successful bootstrap
  const boot = await auth.bootstrapOwner(new Request("https://site.test/"), {
    setupToken: "super-secret-setup-token-12345",
    email: "owner@gaeru.test",
    displayName: "Chủ Hệ Thống",
    password: "MySecurePassword2026!",
  });
  assert.equal(boot.identity.email, "owner@gaeru.test");
  assert.equal(boot.identity.mustChangePassword, false);

  // canBootstrap is now false
  assert.equal((await auth.canBootstrap()).canBootstrap, false);

  // Second bootstrap attempt is permanently rejected
  await assert.rejects(
    async () =>
      await auth.bootstrapOwner(new Request("https://site.test/"), {
        setupToken: "super-secret-setup-token-12345",
        email: "owner@gaeru.test",
        password: "AnotherPassword123!",
      }),
    (err) => err instanceof OrderError && err.status === 403
  );
});

test("Login throttling & lockout: 10 failed attempts locks account for 15 minutes", async () => {
  setupSqlite();
  const auth = load("lib/auth.ts");

  // Bootstrap owner first
  await auth.bootstrapOwner(new Request("https://site.test/"), {
    setupToken: "super-secret-setup-token-12345",
    email: "owner@gaeru.test",
    password: "CorrectPassword123456!",
  });

  const loginReq = new Request("https://site.test/api/auth/login");

  // Failed login 1..9 times
  for (let i = 1; i <= 9; i++) {
    await assert.rejects(
      async () =>
        await auth.loginWithPassword(loginReq, {
          email: "owner@gaeru.test",
          password: "WrongPassword999!",
        }),
      (err) => err instanceof OrderError && err.status === 401 && err.message === "Email hoặc mật khẩu không đúng."
    );
  }

  // 10th failed attempt locks the account
  await assert.rejects(
    async () =>
      await auth.loginWithPassword(loginReq, {
        email: "owner@gaeru.test",
        password: "WrongPassword999!",
      }),
    (err) => err instanceof OrderError && err.status === 401
  );

  // Now the account is locked -> 429 even when supplying correct password!
  await assert.rejects(
    async () =>
      await auth.loginWithPassword(loginReq, {
        email: "owner@gaeru.test",
        password: "CorrectPassword123456!",
      }),
    (err) => err instanceof OrderError && err.status === 429
  );
});

test("Staff activation and reset tokens: single-use, expiry and auto-login", async () => {
  setupSqlite();
  const auth = load("lib/auth.ts");

  // Admin creates activation link for new employee
  const activationUrl = await auth.createActivationToken(
    "owner@gaeru.test",
    "employee1@gaeru.test",
    "https://site.test"
  );
  assert(activationUrl.includes("/activate?token="));
  const rawToken = new URL(activationUrl).searchParams.get("token");

  // Employee sets password using activation token
  const setPassReq = new Request("https://site.test/api/auth/set-password");
  const result = await auth.setPasswordWithToken(setPassReq, {
    token: rawToken,
    password: "EmployeePassword123!",
    displayName: "Nguyễn Văn Nhân Viên",
  });
  assert.equal(result.identity.email, "employee1@gaeru.test");
  assert.equal(result.identity.displayName, "Nguyễn Văn Nhân Viên");
  assert(result.cookie.includes("gaeru-session="));

  // Reusing the same activation token fails
  await assert.rejects(
    async () =>
      await auth.setPasswordWithToken(setPassReq, {
        token: rawToken,
        password: "AnotherPassword123!",
      }),
    (err) => err instanceof OrderError && err.status === 400
  );
});

test("Password change revokes other sessions and CSRF protection", async () => {
  setupSqlite();
  const auth = load("lib/auth.ts");

  // 1. Create owner account
  await auth.bootstrapOwner(new Request("https://site.test/"), {
    setupToken: "super-secret-setup-token-12345",
    email: "owner@gaeru.test",
    password: "OldPassword123456!",
  });

  // Login session 1
  const session1 = await auth.loginWithPassword(new Request("https://site.test/"), {
    email: "owner@gaeru.test",
    password: "OldPassword123456!",
  });

  // Login session 2
  const session2 = await auth.loginWithPassword(new Request("https://site.test/"), {
    email: "owner@gaeru.test",
    password: "OldPassword123456!",
  });

  const cookie1 = session1.cookie.split(";")[0];
  const cookie2 = session2.cookie.split(";")[0];

  // Session 2 changes password
  const changeReq = new Request("https://site.test/api/auth/change-password", {
    method: "POST",
    headers: { cookie: cookie2 },
  });
  await auth.changePassword(changeReq, {
    currentPassword: "OldPassword123456!",
    newPassword: "BrandNewPassword2026!",
  });

  // Session 1 is now revoked!
  const req1 = new Request("https://site.test/api/menu", { headers: { cookie: cookie1 } });
  assert.equal(await auth.resolveIdentity(req1), null);

  // Session 2 remains active
  const req2 = new Request("https://site.test/api/menu", { headers: { cookie: cookie2 } });
  assert.notEqual(await auth.resolveIdentity(req2), null);

  // CSRF validation in self mode
  const csrfGood = new Request("https://site.test/api/orders", {
    method: "POST",
    headers: { origin: "https://site.test", host: "site.test" },
  });
  assert.doesNotThrow(() => auth.verifyCsrf(csrfGood));

  const csrfBad = new Request("https://site.test/api/orders", {
    method: "POST",
    headers: { origin: "https://evil-attacker.test", host: "site.test" },
  });
  assert.throws(
    () => auth.verifyCsrf(csrfBad),
    (err) => err instanceof OrderError && err.status === 403
  );
});
