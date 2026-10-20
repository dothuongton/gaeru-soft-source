import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const module = {exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync(new URL('../lib/media-chime.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports);
const {MediaChime} = module.exports;
const fake = play => ({paused:true,ended:false,play,pause(){this.paused=true;},setAttribute(){},removeAttribute(){},load(){}});
test('play runs synchronously in the gesture and success waits for browser confirmation', async()=>{
 let resolve, calls=0;const results=[];
 const audio=fake(()=>{calls++;return new Promise(r=>{resolve=r;});});
 const player=new MediaChime(audio,(...args)=>results.push(args));
 const first=player.play();assert.equal(calls,1);assert.equal(results.length,0);
 assert.equal(player.play(),first);assert.equal(calls,1);
 resolve();assert.equal(await first,true);assert.deepEqual(results,[[true]]);
 audio.paused=true;const second=player.play();assert.equal(calls,2);resolve();await second;
});
test('Safari rejection is reported and the same element can retry on a tap',async()=>{
 let calls=0;const results=[];
 const audio=fake(()=>++calls===1?Promise.reject(new DOMException('blocked','NotAllowedError')):Promise.resolve());
 const player=new MediaChime(audio,(...args)=>results.push(args));
 assert.equal(await player.play(),false);assert.deepEqual(results,[[false,'NotAllowedError']]);
 assert.equal(await player.play(),true);assert.equal(calls,2);
});
test('leaving the page invalidates late playback promises',async()=>{
 let resolve;const results=[];
 const player=new MediaChime(fake(()=>new Promise(r=>resolve=r)),(...args)=>results.push(args));
 const attempt=player.play();player.dispose();resolve();assert.equal(await attempt,false);
 assert.equal(await player.play(),false);assert.deepEqual(results,[]);
});
test('stopping the chime for a speech test suppresses stale media callbacks and permits reuse',async()=>{
 const completions=[];const results=[];
 const player=new MediaChime(fake(()=>new Promise(resolve=>completions.push(resolve))),(...args)=>results.push(args));
 const old=player.play();player.stop();
 const next=player.play();completions[0]();assert.equal(await old,false);
 assert.deepEqual(results,[]);completions[1]();assert.equal(await next,true);
 assert.deepEqual(results,[[true]]);
});
test('speech sequencing waits for the chime end rather than the play promise',async()=>{
 const events=new EventTarget();const audio=Object.assign(events,fake(()=>Promise.resolve()));audio.paused=false;
 const player=new MediaChime(audio,()=>{});let completed=false;
 const waiting=player.waitForEnd().then(()=>{completed=true;});await Promise.resolve();assert.equal(completed,false);
 audio.dispatchEvent(new Event('ended'));await waiting;assert.equal(completed,true);
});
test('stopped and unavailable chimes do not block subsequent speech',async()=>{
 const events=new EventTarget();const audio=Object.assign(events,fake(()=>Promise.resolve()));audio.paused=false;
 const player=new MediaChime(audio,()=>{});const waiting=player.waitForEnd();audio.dispatchEvent(new Event('error'));await waiting;
 audio.paused=true;await player.waitForEnd();
});
