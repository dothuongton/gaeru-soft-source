import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import ts from "typescript";

const module = {exports: {}};
const code = ts.transpileModule(readFileSync(new URL("../lib/api-client.ts", import.meta.url), "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const links={exports:{}};new Function("module","exports",ts.transpileModule(readFileSync(new URL("../lib/store-links.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(links,links.exports);
new Function("require", "module", "exports", code)(()=>links.exports, module, module.exports);
const {api, ApiError} = module.exports;

test("API client distinguishes definitive validation errors from uncertain writes", async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [400, 403, 409, 429]) {
      globalThis.fetch = async () => Response.json({error: "Vui lòng kiểm tra bàn"}, {status});
      await assert.rejects(api("orders", {method: "POST"}), error => error instanceof ApiError && error.status === status && !error.uncertain);
    }
    for (const status of [408, 500, 502, 503]) {
      globalThis.fetch = async () => Response.json({error: "Chưa nhận được phản hồi"}, {status});
      await assert.rejects(api("orders", {method: "POST"}), error => error instanceof ApiError && error.uncertain);
    }
  } finally {globalThis.fetch = original;}
});

test("network loss, an aborted request and malformed success all retain uncertainty", async () => {
  const original = globalThis.fetch;
  try {
    for (const fetch of [async () => {throw new TypeError("offline");}, async () => {throw new DOMException("aborted", "AbortError");}, async () => new Response("not JSON", {status: 200})]) {
      globalThis.fetch = fetch;
      await assert.rejects(api("orders", {method: "POST"}), error => error instanceof ApiError && error.uncertain);
    }
  } finally {globalThis.fetch = original;}
});

test("successful calls keep same-origin credentials and caller headers", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/menu");
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.headers.get("Content-Type"), "application/json");
      assert.equal(options.headers.get("X-Request"), "test");
      return Response.json({ok: true});
    };
    assert.deepEqual(await api("menu", {headers: new Headers({"X-Request": "test"})}), {ok: true});
  } finally {globalThis.fetch = original;}
});

test("conditional reads reuse a private snapshot, invalidate writes and reject revoked access",async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({tables:["one"]},{headers:{ETag:'"board-one"'}});
  const first=await api("admin?section=board");first.tables.push("local-change");
  globalThis.fetch=async(url,options)=>{assert.equal(options.headers.get("If-None-Match"),'"board-one"');return new Response(null,{status:304});};
  assert.deepEqual(await api("admin?section=board"),{tables:["one"]});
  globalThis.fetch=async()=>Response.json({ok:true});await api("admin/shop",{method:"PATCH",body:"{}"});
  globalThis.fetch=async(url,options)=>{assert.equal(options.headers.get("If-None-Match"),null);return Response.json({error:"revoked"},{status:403});};
  await assert.rejects(api("admin?section=board"),error=>error.status===403);
 }finally{globalThis.fetch=original;}
});
