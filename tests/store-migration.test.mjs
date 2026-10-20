import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {test} from "node:test";

test("the multi-store migration preserves every existing record and assigns only the default store",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  const migrations=readdirSync(new URL("../drizzle",import.meta.url)).filter(name=>name.endsWith(".sql")).sort();
  const upgrade=migrations.findIndex(name=>name.startsWith("0008_"));assert.ok(upgrade>0);
  for(const name of migrations.slice(0,upgrade))db.exec(readFileSync(new URL("../drizzle/"+name,import.meta.url),"utf8"));
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(x=>x.name);
  const originals=new Map();
  for(const name of tables){
   const columns=db.prepare(`PRAGMA table_info(${name})`).all();
   const fields=columns.map(x=>x.name),values=columns.map(x=>x.type==="integer"?123456:x.name==="status"?"active":"legacy-"+name+"-"+x.name);
   db.prepare(`INSERT INTO ${name} (${fields.join(",")}) VALUES (${fields.map(()=>"?").join(",")})`).run(...values);
   originals.set(name,db.prepare(`SELECT * FROM ${name}`).all());
  }
  for(const name of migrations.slice(upgrade))db.exec(readFileSync(new URL("../drizzle/"+name,import.meta.url),"utf8"));
  for(const name of tables){const rows=db.prepare(`SELECT * FROM ${name}`).all();for(const row of rows){if(name!=="staff_owner_bindings"){assert.equal(row.store_id,"main");delete row.store_id;}}assert.deepEqual(rows,originals.get(name),name+" must preserve all columns");}
  assert.deepEqual(db.prepare("PRAGMA integrity_check").get(),Object.assign(Object.create(null),{integrity_check:"ok"}));
 }finally{db.close();}
});
