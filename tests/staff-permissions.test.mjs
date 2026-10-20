/** Shared policy checks for the employee editor and API authorization. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const path = new URL("../lib/staff-permissions.ts", import.meta.url);
const source = ts.transpileModule(readFileSync(path, "utf8"), {
  fileName: path.pathname,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = { exports: {} };
new Function("module", "exports", source)(compiled, compiled.exports);
const { ALL_PERMISSIONS, PERMISSIONS, ROLE_PRESETS, normalizePermissions, hasPermission, canGrantPermissions, canManageAccount, normalizeStaffEmail } = compiled.exports;

function access(permissions, overrides = {}) {
  return { authenticated: true, userId: "signed-in-id", email: "manager@example.test", isStaff: true, isOwner: false, account: { id: "self" }, permissions, ...overrides };
}

function account(permissions, overrides = {}) {
  return { id: "colleague", email: "staff@example.test", name: "Nhân viên", role: "custom", permissions, status: "active", protected: false, userBound: true, version: 1, createdAt: 1, updatedAt: 1, lastLoginAt: 1, ...overrides };
}

test("presets preserve separation between kitchen, service, cashier, report readers and account administrators", () => {
  const role = (id) => ROLE_PRESETS.find((preset) => preset.id === id).permissions;
  assert.equal(new Set(PERMISSIONS.map((permission) => permission.id)).size, PERMISSIONS.length);
  assert.deepEqual(new Set(role("manager")), new Set(ALL_PERMISSIONS));
  assert.deepEqual(role("kitchen"), ["orders.view", "orders.manage"]);
  assert.deepEqual(role("viewer"), ["revenue.view"]);
  for (const preset of ["kitchen", "service"]) {
    for (const forbidden of ["payments.collect", "revenue.view", "orders.cancel", "settings.manage", "menu.manage", "staff.manage"]) assert.equal(role(preset).includes(forbidden), false, `${preset}: ${forbidden}`);
  }
  for (const permission of ["orders.view", "tables.manage", "tables.transfer", "payments.collect", "revenue.view"]) assert.equal(role("cashier").includes(permission), true);
  for (const forbidden of ["orders.cancel", "staff.manage", "settings.manage", "menu.manage"]) assert.equal(role("cashier").includes(forbidden), false);
});

test("operational permission dependencies add read access without adding write, payment or account rights", () => {
  for (const permission of ["orders.manage", "orders.cancel", "tables.manage", "tables.transfer", "payments.collect"]) {
    assert.deepEqual(new Set(normalizePermissions([permission, permission])), new Set(["orders.view", permission]));
  }
  for (const permission of ["revenue.view", "menu.manage", "settings.manage", "staff.manage"]) assert.deepEqual(normalizePermissions([permission]), [permission]);
  assert.deepEqual(normalizePermissions(["payments.collect", "orders.view", "payments.collect"]), normalizePermissions(["orders.view", "payments.collect"]));
});

test("permission normalization rejects forged or malformed grants instead of silently widening access", () => {
  for (const input of [undefined, null, {}, "manager", ["owner"], ["*"], ["orders.view", "staff.admin"], ["orders.view", 1], [{ id: "staff.manage" }]]) {
    assert.throws(() => normalizePermissions(input), /quyền/i);
  }
});

test("suspended or signed-out access cannot authorize actions even when old permission lists remain in memory", () => {
  for (const candidate of [null, undefined, access(ALL_PERMISSIONS, { isStaff: false })]) {
    assert.equal(hasPermission(candidate, "staff.manage"), false);
    assert.equal(hasPermission(candidate, "payments.collect"), false);
  }
  const cached = access(ALL_PERMISSIONS, { isStaff: false });
  assert.equal(canGrantPermissions(cached, ["orders.view"]), false);
  assert.equal(canManageAccount(cached, account(["orders.view"])), false);
});

test("account editor safeguards honor the current grant scope, protect owners and reject editing one's own account", () => {
  const scoped = access(["staff.manage", "orders.view"]);
  assert.equal(canGrantPermissions(scoped, ["orders.view"]), true);
  assert.equal(canGrantPermissions(scoped, ["payments.collect"]), false);
  assert.equal(canManageAccount(scoped, account(["orders.view"])), true);
  assert.equal(canManageAccount(scoped, account(["orders.view", "payments.collect"])), false);
  assert.equal(canManageAccount(scoped, account(["orders.view"], { id: "self" })), false);
  assert.equal(canManageAccount(access(ALL_PERMISSIONS, { isOwner: true }), account(ALL_PERMISSIONS, { protected: true })), false);
  assert.equal(canGrantPermissions(access(["orders.view"], { isOwner: true }), ["orders.view"]), false, "A display-only owner flag cannot replace the required staff.manage permission.");
});

test("invitation email normalization accepts deliberate surrounding whitespace and rejects header-like or ambiguous identities", () => {
  assert.equal(normalizeStaffEmail("  Lan+CaToi@Example.Test  "), "lan+catoi@example.test");
  for (const value of [null, 42, "", "a", "a@b", "a@@example.test", "a b@example.test", "a\nb@example.test", "<a@example.test>", "a@example.test,b@example.test", "a@" + "x".repeat(250) + ".test"]) {
    assert.equal(normalizeStaffEmail(value), null, JSON.stringify(value));
  }
});
