import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import ts from "typescript";
const module={exports:{}};
new Function("module","exports",ts.transpileModule(readFileSync(new URL("../lib/conditional-json.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports);
const {conditionalJson}=module.exports;
test("validators save unchanged payload but track permissions and device cookie issuance",async()=>{
 const request=new Request("https://example.test/api/admin");
 const first=await conditionalJson(request,{permissions:["orders.view"],orders:[]});
 const etag=first.headers.get("etag");assert.ok(etag);assert.equal(first.headers.get("cache-control"),"no-store");
 const conditional=new Request(request,{headers:{"If-None-Match":etag}});
 const unchanged=await conditionalJson(conditional,{permissions:["orders.view"],orders:[]});assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),"");
 assert.equal((await conditionalJson(conditional,{permissions:[],orders:[]})).status,200);
 const withCookie=await conditionalJson(conditional,{permissions:["orders.view"],orders:[]},{"Set-Cookie":"device=new; HttpOnly"});assert.equal(withCookie.status,200);assert.ok(withCookie.headers.get("set-cookie"));
});
