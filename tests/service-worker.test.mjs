import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url).pathname;

function sw() {
  const handlers = {};
  const destinations = [];
  const self = {
    location: { origin: "https://example.test" },
    addEventListener: (name, cb) => (handlers[name] = cb),
    clients: {
      matchAll: async () => [],
      openWindow: async (url) => destinations.push(url),
    },
  };
  vm.runInNewContext(readFileSync(root + "public/sw.js", "utf8"), {
    self,
    URL,
    Response,
    fetch: async () => {
      throw new Error("offline");
    },
    caches: {
      open: async () => ({
        match: async () => new Response("offline"),
      }),
    },
  });
  return { handlers, destinations };
}

test("QA: notification click preserves the originating store", async () => {
  const { handlers, destinations } = sw();
  let work;
  handlers.notificationclick({
    notification: {
      close() {},
      data: { url: "/?view=admin&tab=tables", storeId: "store-b" },
    },
    waitUntil: (p) => (work = p),
  });
  await work;
  assert.equal(new URL(destinations[0]).searchParams.get("store"), "store-b");
});

test("QA: notification click rejects external origins", async () => {
  const { handlers, destinations } = sw();
  let work;
  handlers.notificationclick({
    notification: {
      close() {},
      data: { url: "https://outside.example/phish", storeId: "main" },
    },
    waitUntil: (p) => (work = p),
  });
  await work;
  assert.ok(
    destinations.every((url) => new URL(url).origin === "https://example.test"),
    "must not open an external URL"
  );
});

test("QA: QR navigation gets a neutral offline fallback without caching QR HTML", () => {
  const { handlers } = sw();
  let response;
  handlers.fetch({
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://example.test/?table=test-token",
      headers: new Headers(),
    },
    respondWith: (p) => (response = p),
  });
  assert.ok(response, "QR navigation must have an offline fallback, not a raw browser network error");
});

test("QA: controllerchange without local consent must not reload a tab", () => {
  const listeners = {};
  let reloads = 0;
  const out = ts.transpileModule(readFileSync(root + "components/pwa-registration.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const componentModule = { exports: {} };
  const require = (s) =>
    s === "react"
      ? { useState: (x) => [x, () => {}], useEffect: (effect) => effect() }
      : s === "react/jsx-runtime"
      ? { jsx: () => null, jsxs: () => null }
      : {};
  const navigator = {
    serviceWorker: {
      controller: {},
      addEventListener: (name, fn) => (listeners[name] = fn),
      removeEventListener() {},
      register: async () => ({ waiting: null, addEventListener() {} }),
    },
  };
  vm.runInNewContext(out, {
    module: componentModule,
    exports: componentModule.exports,
    require,
    navigator,
    window: { location: { reload: () => reloads++ } },
    console,
  });
  componentModule.exports.PwaRegistration();
  listeners.controllerchange();
  assert.equal(reloads, 0, "First activation or another tab accepting an update must not force this tab to reload");
});

test('warm Vite bundles with letter hashes are served from cache while APIs remain network-only',async()=>{
 const handlers={},cached=new Map();let network=0;
 vm.runInNewContext(readFileSync(root+'public/sw.js','utf8'),{self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>handlers[name]=fn},URL,Response,fetch:async()=>{network++;return {status:200,type:'basic',headers:new Headers({'Content-Type':'application/javascript'}),clone:()=>new Response('bundle')};},caches:{match:async req=>cached.get(req.url),open:async()=>({put:async(req,res)=>cached.set(req.url,res)})}});
 const req={method:'GET',mode:'cors',url:'https://example.test/assets/admin-panel-BdKm_qTZ.js',headers:new Headers()};
 let work;handlers.fetch({request:req,respondWith:p=>work=p});await work;await Promise.resolve();
 handlers.fetch({request:req,respondWith:p=>work=p});await work;assert.equal(network,1);assert.ok(cached.has(req.url));
 let handled=false;handlers.fetch({request:{...req,url:'https://example.test/api/admin?section=board'},respondWith:()=>handled=true});assert.equal(handled,false);assert.equal(cached.size,1);
});
test('navigation preload reuses fresh HTML without caching authenticated pages',async()=>{
 const {handlers}=sw();let work;handlers.fetch({request:{method:'GET',mode:'navigate',url:'https://example.test/?view=admin',headers:new Headers()},preloadResponse:Promise.resolve(new Response('fresh admin shell')),respondWith:p=>work=p});assert.equal(await (await work).text(),'fresh admin shell');
});
