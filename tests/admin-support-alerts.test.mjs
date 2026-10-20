/**
 * Table-opening notifications and the shared announcement lifecycle, using the
 * production event helpers, popup timing policy and audio queue. These tests do
 * not simulate a browser or claim that autoplay succeeds on a physical device.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const cache = new Map();
function load(relativePath) {
  const path = resolve(projectRoot, relativePath);
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", output)((specifier) => {
    if (specifier.startsWith("@/")) return load(specifier.slice(2) + ".ts");
    if (specifier.startsWith(".")) return load(resolve(dirname(path), specifier) + ".ts");
    throw new Error("Unexpected import: " + specifier);
  }, module, module.exports);
  return module.exports;
}

const {collectSupportAlerts,pendingAdminAlerts,adminAlertSpeech,restrictAdminAlerts}=load("lib/admin-opening-alerts.ts");
const call={id:"s:service",table_id:"t5",table_name:"Bàn 05",session_id:"s",kind:"service",note:"Thêm hai bát",status:"open",created_at:10};
test("support baseline and polling are silent; new generation speaks",()=>{const baseline=collectSupportAlerts([call],null);assert.equal(baseline.alerts.length,0);assert.equal(collectSupportAlerts([call],baseline.seenIds).alerts.length,0);const next=collectSupportAlerts([{...call,created_at:11}],baseline.seenIds);assert.equal(next.alerts.length,1);assert.equal(adminAlertSpeech(next.alerts[0]),"Bàn số 5 cần hỗ trợ nhân viên. Nội dung yêu cầu: Thêm hai bát");});
test("resolved, replaced and revoked support alerts disappear",()=>{const a=collectSupportAlerts([call],new Set()).alerts;assert.equal(pendingAdminAlerts(a,[],[],[{...call,status:"done"}]).length,0);assert.equal(pendingAdminAlerts(a,[],[],[{...call,created_at:12}]).length,0);assert.equal(restrictAdminAlerts(a,{orders:true,openings:false}).length,0);const moved=pendingAdminAlerts(a,[],[],[{...call,table_id:"t8",table_name:"Bàn 08"}]);assert.match(adminAlertSpeech(moved[0]),/^Bàn số 8/);});
test("bill and blank note; speech length is bounded",()=>{const a=collectSupportAlerts([{...call,kind:"bill",note:""}],new Set()).alerts[0];assert.equal(adminAlertSpeech(a),"Bàn số 5 yêu cầu thanh toán.");assert.ok(adminAlertSpeech({...a,note:"a".repeat(500)}).length<370);});
