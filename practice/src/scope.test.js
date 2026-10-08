// Run: node practice/src/scope.test.js (synthetic DOM, no browser/human verification)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCOPE_STORAGE_KEY, SCOPE_ORDER, isBasicLetter, isValidScope, normalizeScope, filterByScope, parseScope, readStoredScope, writeStoredScope, resolveScope, scopeSearch } from './scope.js';
import { mountScopeSwitch } from './scopeSwitch.js';
import { PROGRESS_KEY, loadProgress, saveProgress, clearProgressKey } from './progress.js';
const letters=JSON.parse(readFileSync(new URL('../content/letters.json',import.meta.url),'utf8')).letters;
const basicIds=Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ',c=>`GF0021.${c}`);
const extendedIds=['ZH','CH','SH','NG','EH','UE'].map(c=>`GF0021.${c}`);
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
function storage(initial=[]){const values=new Map(initial);return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};}
test('exact 26/32 sets and order; filtering never mutates original or aliases array',()=>{
 const original=JSON.stringify(letters);const basic=filterByScope(letters,'basic'),full=filterByScope(letters,'full');
 assert.deepEqual(basic.map(l=>l.id),basicIds);assert.deepEqual(full.map(l=>l.id),[...basicIds,...extendedIds]);
 assert.equal(new Set(full.map(l=>l.id)).size,32);assert.notEqual(full,letters);assert.notEqual(basic,letters);
 full.reverse();basic.pop();assert.equal(JSON.stringify(letters),original);
 assert.deepEqual(filterByScope(letters,'invalid'),letters);assert.deepEqual(filterByScope(),[]);
 for(const id of basicIds)assert.equal(isBasicLetter({id}),true);
 for(const id of [...extendedIds,'GF0021.a','GF0021.AA','other.A'])assert.equal(isBasicLetter({id}),false);
 assert.equal(isBasicLetter(null),false);
});
test('URL precedes storage; invalid values fall back; default full',()=>{
 const s=storage([[SCOPE_STORAGE_KEY,'basic']]);
 assert.equal(resolveScope({search:'?scope=full',storage:s}),'full');
 for(const search of ['','?scope=invalid','?scope=','?scope=BASIC'])assert.equal(resolveScope({search,storage:s}),'basic');
 s.values.set(SCOPE_STORAGE_KEY,'invalid');assert.equal(resolveScope({storage:s}),'full');assert.equal(resolveScope(),'full');
 assert.equal(parseScope('scope=basic'),'basic');assert.equal(parseScope('?scope=full&scope=basic'),'full');
 assert.equal(parseScope('?scope=invalid&scope=basic'),null,'first duplicate parameter controls parsing');
 for(const value of ['invalid',null,undefined,'Basic']){assert.equal(isValidScope(value),false);assert.equal(normalizeScope(value),'full');}
 assert.equal(normalizeScope('invalid','basic'),'basic');
});
test('storage denied/read/write exceptions fail safely; invalid writes touch nothing',()=>{
 const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
 assert.equal(readStoredScope(denied),null);assert.equal(resolveScope({storage:denied}),'full');
 assert.equal(resolveScope({search:'?scope=basic',storage:denied}),'basic');assert.equal(writeStoredScope(denied,'basic'),false);
 assert.equal(writeStoredScope(null,'full'),false);const s=storage();assert.equal(writeStoredScope(s,'invalid'),false);assert.equal(s.values.size,0);
 assert.equal(writeStoredScope(s,'basic'),true);assert.equal(readStoredScope(s),'basic');
});
test('query replacement preserves repeated unrelated parameters, collapses scope and normalizes invalid',()=>{
 for(const next of ['basic','full','invalid']){
 const params=new URLSearchParams(scopeSearch('?mode=test&tag=a&scope=full&tag=b&scope=basic&empty=',next));
 assert.deepEqual(params.getAll('scope'),[normalizeScope(next)]);params.delete('scope');
 assert.deepEqual([...params],[['mode','test'],['tag','a'],['tag','b'],['empty','']]);
 }
});
class Element{
 constructor(){this.children=[];this.dataset={};this.attrs=new Map();this.events=new Map();}
 replaceChildren(...nodes){this.children=nodes;}appendChild(node){this.children.push(node);return node;}append(...nodes){this.children.push(...nodes);}
 setAttribute(k,v){this.attrs.set(k,String(v));}hasAttribute(k){return this.attrs.has(k);}addEventListener(k,f){this.events.set(k,f);}click(){this.events.get('click')?.();}
}
test('real scope controls: native buttons, order, ARIA, callbacks and updates',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');globalThis.document={createElement:()=>new Element()};
 try{
 const container=new Element(),calls=[];const control=mountScopeSwitch(container,{scope:'basic',onChange:s=>calls.push(s)});
 assert.deepEqual(container.children.map(b=>b.dataset.scope),Array.from(SCOPE_ORDER));assert.equal(container.attrs.get('role'),'group');assert.equal(container.attrs.get('aria-label'),'字母范围');
 for(const b of container.children){assert.equal(b.type,'button');assert.equal(b.children.length,2);assert.equal(b.attrs.get('aria-pressed'),b.dataset.scope==='basic'?'true':'false');b.click();}
 assert.deepEqual(calls,['basic','full']);control.update('full');assert.deepEqual(container.children.map(b=>b.attrs.get('aria-pressed')),['false','true']);
 control.update('invalid');assert.deepEqual(container.children.map(b=>b.attrs.get('aria-pressed')),['false','true']);
 container.setAttribute('aria-label','自定义范围');mountScopeSwitch(container,{scope:'full'});assert.equal(container.attrs.get('aria-label'),'自定义范围');container.children[0].click();
 assert.equal(mountScopeSwitch(null).element,null);mountScopeSwitch(null).update('basic');
 }finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}
});
test('all 32 historical records incl six extended survive 32→26→32 load/save; clear only record key',()=>{
 const entries=letters.map((l,i)=>({letterId:l.id,mode:i%2?'test':'learn',count:i+1,lastAt:'2026-10-08T00:00:00.000Z'}));
 const original={schemaVersion:1,entries};const s=storage([[PROGRESS_KEY,JSON.stringify(original)],[SCOPE_STORAGE_KEY,'full'],['unrelated','keep']]);
 for(const scope of ['full','basic','full']){
 writeStoredScope(s,scope);const loaded=loadProgress(s,letters);assert.equal(loaded.persisted,true);assert.deepEqual(loaded.progress,original);
 assert.deepEqual(loaded.progress.entries.filter(e=>extendedIds.includes(e.letterId)).map(e=>e.letterId),extendedIds);
 assert.equal(filterByScope(letters,scope).length,scope==='basic'?26:32);assert.equal(saveProgress(s,loaded.progress).persisted,true);
 assert.deepEqual(JSON.parse(s.getItem(PROGRESS_KEY)),original);
 }
 assert.equal(clearProgressKey(s).ok,true);assert.equal(s.getItem(PROGRESS_KEY),null);assert.equal(s.getItem(SCOPE_STORAGE_KEY),'full');assert.equal(s.getItem('unrelated'),'keep');
});
let failed=0;for(const [name,fn] of tests){try{await fn();console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.stack);}}
console.log(`scope: ${tests.length-failed}/${tests.length} passed`);if(failed)process.exitCode=1;
