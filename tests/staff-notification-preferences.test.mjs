import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";

const root=fileURLToPath(new URL("../",import.meta.url)), requireNode=createRequire(import.meta.url),cache=new Map();
function load(path){
 path=resolve(root,path);
 if(cache.has(path))return cache.get(path).exports;
 const module={exports:{}};cache.set(path,module);
 const source=ts.transpileModule(readFileSync(path,"utf8"),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function("require","module","exports",source)(specifier=>{
  if(specifier.endsWith(".css"))return {};
  if(specifier.startsWith("@/"))return load(specifier.slice(2)+".ts");
  if(specifier.startsWith("."))return load(resolve(dirname(path),specifier)+".ts");
  return requireNode(specifier);
 },module,module.exports);
 return module.exports;
}
const {staffNotificationKey,readNotificationPreferences,saveNotificationPreferences}=load("lib/staff-notification-preferences.ts");
const {checkStaffPush,readPushHint,savePushHint,withPushTimeout}=load("lib/staff-push-client.ts");
const {AdminWorkspace,SupportRequestBadge}=load("app/admin-workspace.tsx");
const {AdminPushToggle}=load("app/admin-push-toggle.tsx");
const storage=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};};
const key=Buffer.from([1,2,3,4]).toString("base64url"), sub={options:{applicationServerKey:Uint8Array.from([1,2,3,4]).buffer}};
const enabled={enabled:true,vapidPublicKey:key,subscribed:true};

test("sound mode and selected voice survive reopening, isolated by account and shop",()=>{
 const local=storage(),a=staffNotificationKey("a","employee1");
 saveNotificationPreferences(local,a,{soundMode:"silent",voice:"vi-selected"});
 assert.deepEqual(readNotificationPreferences(local,a),{soundMode:"silent",voice:"vi-selected"});
 for(const other of [staffNotificationKey("a","employee2"),staffNotificationKey("b","employee1"),null])
  assert.deepEqual(readNotificationPreferences(local,other),{soundMode:"voice",voice:""});
 saveNotificationPreferences(local,a,{soundMode:"chime",voice:"vi-selected"});
 assert.equal(readNotificationPreferences(local,a).soundMode,"chime");
});

test("broken or blocked storage never crashes notification controls or grants permissions",()=>{
 const blocked={getItem(){throw Error("denied");},setItem(){throw Error("denied");}};
 assert.deepEqual(readNotificationPreferences(blocked,"scope"),{soundMode:"voice",voice:""});
 assert.doesNotThrow(()=>saveNotificationPreferences(blocked,"scope",{soundMode:"voice",voice:""}));
 const local=storage();local.setItem("bad",'{"soundMode":"execute"}');
 assert.equal(readNotificationPreferences(local,"bad").soundMode,"voice");
 assert.equal(readPushHint(blocked,"scope"),null);
});

test("local subscription check starts while the server response is still pending",async()=>{
 let resolveRemote,localStarted=false;
 const pending=new Promise(resolve=>{resolveRemote=resolve;});
 const result=checkStaffPush(()=>pending,async()=>{localStarted=true;return sub;},"granted");
 assert.equal(localStarted,true);
 resolveRemote(enabled);
 assert.deepEqual(await result,{state:"subscribed",vapidKey:key});
});

test("saved push hint never overrides denied/default permission, missing server subscription or rotated VAPID",async()=>{
 const local=storage(),scope=staffNotificationKey("a","employee1");
 savePushHint(local,scope,"subscribed");
 assert.equal(readPushHint(local,scope),"subscribed");
 assert.equal(readPushHint(local,staffNotificationKey("b","employee1")),null);
 for(const [remote,subscription,permission,state] of [
  [enabled,sub,"denied","denied"], [enabled,sub,"default","ready"],
  [enabled,null,"granted","ready"], [{...enabled,subscribed:false},sub,"granted","ready"],
  [{...enabled,vapidPublicKey:"CQgH"},sub,"granted","key_changed"],
  [{...enabled,enabled:false},sub,"granted","server_disabled"],
 ]) assert.equal((await checkStaffPush(async()=>remote,async()=>subscription,permission)).state,state);
 savePushHint(local,scope,"ready");
 assert.equal(readPushHint(local,scope),"ready");
});

test("a stalled worker lookup has a bounded failure and settled timers are cleaned up",async()=>{
 await assert.rejects(withPushTimeout(new Promise(()=>{}),5),/Chưa kiểm tra/);
 assert.equal(await withPushTimeout(Promise.resolve("ready"),1000),"ready");
});

const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
test("support icon exposes the exact pending count and hides its badge at zero",()=>{
 const base={shop:{name:"Test Shop"},access:null,tab:"orders",canOrders:true,canTables:true,pendingCount:0,newOrdersCount:0,onSwitch:()=>{},onAudio:()=>{}};
 const html=render(AdminWorkspace,{...base,supportCount:3});
 assert.match(html,/aria-label="Hỗ trợ · 3 yêu cầu chưa xử lý"/);
 assert.equal((html.match(/class="aw-support-badge"/g)||[]).length,2,"header and bottom navigation");
 assert.match(render(SupportRequestBadge,{count:125}),/99\+/);
 assert.equal(render(SupportRequestBadge,{count:0}),"");
 assert.doesNotMatch(render(AdminWorkspace,{...base,supportCount:0}),/aw-support-live-dot/);
});

test("push renders a distinct phone icon without a mount-time spinner or disabled control",()=>{
 const html=render(AdminPushToggle,{userId:"employee1",notify:()=>{},iconOnly:true});
 assert.match(html,/lucide-smartphone/);
 assert.doesNotMatch(html,/lucide-bell|animate-spin|disabled=/);
 assert.match(html,/Đang xác minh/);
});
