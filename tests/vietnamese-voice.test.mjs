import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const module={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync(new URL('../lib/vietnamese-voice.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports);
const {selectVietnameseVoice}=module.exports;
const english={lang:'en-US',voiceURI:'en',localService:true};
const remote={lang:'vi-VN',voiceURI:'remote',localService:false};
const local={lang:'vi_VN',voiceURI:'local',localService:true};
test('a non-Vietnamese default or stale saved selection is never used',()=>{
 assert.equal(selectVietnameseVoice([english],'en'),null);
 assert.equal(selectVietnameseVoice([]),null);
 assert.equal(selectVietnameseVoice([english,remote],'en'),remote);
});
test('Vietnamese local voice is preferred unless another Vietnamese voice was chosen',()=>{
 assert.equal(selectVietnameseVoice([english,remote,local]),local);
 assert.equal(selectVietnameseVoice([english,remote,local],'remote'),remote);
});
test('locale matching accepts Vietnamese tags but rejects unrelated prefixes',()=>{
 const basic={lang:'VI',voiceURI:'basic',localService:true};
 assert.equal(selectVietnameseVoice([{...english,lang:'vie'},basic]),basic);
 assert.equal(selectVietnameseVoice([{...english,lang:'vietnamese'}]),null);
});
