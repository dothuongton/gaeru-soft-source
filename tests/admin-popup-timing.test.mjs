import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import ts from "typescript";

function loadModule(path, imports = {}) {
  const module = {exports: {}};
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  new Function("require", "module", "exports", output)(specifier => {
    if (specifier in imports) return imports[specifier];
    throw new Error("Unexpected import: " + specifier);
  }, module, module.exports);
  return module.exports;
}

const settings = loadModule("../lib/display-settings.ts");
const {resolvePopupTiming} = loadModule("../lib/admin-popup-timing.ts", {"./display-settings": settings});

test("each newly displayed popup captures its configured duration, including range edges", () => {
  for (const seconds of [1, 3, 7, 30]) {
    const timing = resolvePopupTiming(null, "visit-a:new-orders", seconds);
    assert.equal(timing.durationMs, seconds * 1_000);
  }
});

test("polling and a configuration change cannot extend or shorten a popup already showing", () => {
  const current = resolvePopupTiming(null, "visit-a:new-orders", 10);
  for (const newSetting of [10, 1, 30, 3]) {
    assert.strictEqual(resolvePopupTiming(current, "visit-a:new-orders", newSetting), current);
    assert.equal(current.durationMs, 10_000);
  }
});

test("the next queued popup takes the latest duration instead of inheriting the previous timer", () => {
  const previous = resolvePopupTiming(null, "visit-a:new-orders", 30);
  const next = resolvePopupTiming(previous, "visit-b:new-orders", 2);
  assert.equal(next.alertId, "visit-b:new-orders");
  assert.equal(next.durationMs, 2_000);
  assert.equal(previous.durationMs, 30_000);
});

test("missing or invalid persisted durations retain the three-second default", () => {
  for (const seconds of [undefined, null, 0, -1, 31, 1.5, NaN, Infinity, "5"]) {
    assert.equal(resolvePopupTiming(null, "visit-a:new-orders", seconds).durationMs, 3_000);
  }
});

test("the default 200 percent preserves the existing doubled layout", () => {
  assert.equal(settings.displayScale(settings.DEFAULT_DISPLAY_SETTINGS.fontPercent), 1);
  assert.equal(settings.displayScale(settings.DEFAULT_DISPLAY_SETTINGS.foodImagePercent), 1);
  assert.equal(settings.displayScale(100), .5);
  assert.equal(settings.displayScale(250), 1.25);
  assert.equal(settings.displayScale(175), .875);
});
