import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import ts from "typescript";

const compiledModule = {exports: {}};
const output = ts.transpileModule(readFileSync(new URL("../lib/theme-settings.ts", import.meta.url), "utf8"), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
new Function("module", "exports", output)(compiledModule, compiledModule.exports);
const {accentTextColor, contrastRatio, DEFAULT_THEME_SETTINGS} = compiledModule.exports;
const channels = color => [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));

test("brand text retains default and already-readable dark or blue accent colors", () => {
  for (const color of [DEFAULT_THEME_SETTINGS.accentColor, "#000000", "#1f4f93", "#65428f", "#767676", "#1F4F93"]) {
    assert.equal(accentTextColor(color), color.toLowerCase());
  }
});

test("white brand fills receive neutral text with sufficient contrast on a white surface", () => {
  const result = accentTextColor("#FFFFFF");
  assert.match(result, /^#[0-9a-f]{6}$/);
  assert.notEqual(result, "#ffffff");
  const [red, green, blue] = channels(result);
  assert.equal(red, green);
  assert.equal(green, blue);
  assert.ok(red > 0, "Preserve the closest usable shade instead of always falling back to black.");
  assert.ok(contrastRatio(result, "#ffffff") >= 4.5);
});

test("pale yellow and other light accents darken their existing channels until readable", () => {
  for (const color of ["#ffffcc", "#fff7b0", "#eaf8ff", "#ffff00", "#00ffff"]) {
    const result = accentTextColor(color);
    assert.match(result, /^#[0-9a-f]{6}$/);
    assert.notEqual(result, color);
    assert.ok(contrastRatio(result, "#ffffff") >= 4.5, `${color} produced ${result}`);
    channels(result).forEach((channel, index) => assert.ok(channel <= channels(color)[index], "Darkening must not add a new color channel."));
  }
});

test("rounding at the contrast boundary cannot return an unreadable shade", () => {
  assert.ok(contrastRatio("#777777", "#ffffff") < 4.5);
  const result = accentTextColor("#777777");
  assert.notEqual(result, "#777777");
  assert.ok(contrastRatio(result, "#ffffff") >= 4.5);
  assert.equal(accentTextColor(result), result);
});

test("malformed accents use the established default instead of propagating unsafe CSS", () => {
  for (const color of ["", "#fff", "#123456\n", "red", "var(--accent)", "#abcdef;background:red", null, undefined]) {
    assert.equal(accentTextColor(color), DEFAULT_THEME_SETTINGS.accentColor);
  }
});
