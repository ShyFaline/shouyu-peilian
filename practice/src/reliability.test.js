// Behavioral regression: real SourceTextModule app/core, only browser/vendor boundaries faked.
// Run: node --experimental-vm-modules practice/src/reliability.test.js
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto, createHash } from 'node:crypto';
import { groupLetters, groupIdForStatus, letterAriaLabel, capabilityNote, confusionCluster } from './letterLibrary.js';
import { PROGRESS_KEY } from './progress.js';
import { QUEST_KEY } from './quest.js';
const practice = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pack = JSON.parse(readFileSync(resolve(practice, 'content/letters.json'), 'utf8'));
const V = pack.letters.find(x => x.id === 'GF0021.V');
const UNIT = { coordSpace: 'equal_scale_unit' };
function hand() {
  const p = (x,y) => ({x,y,z:0});
  const lm = Array.from({length:21}, () => p(.5,.5));
  lm[0]=p(.5,.9); lm[1]=p(.42,.82); lm[2]=p(.36,.74); lm[3]=p(.40,.70); lm[4]=p(.44,.76);
  for (const [m,x,tx,extended] of [[5,.44,.32,true],[9,.52,.64,true],[13,.56,.56,false],[17,.62,.62,false]]) {
    lm[m]=p(x,.58);
    if (extended) for(let j=1;j<=3;j++) lm[m+j]=p(x+(tx-x)*j/3,.58-.12*j);
    else {lm[m+1]=p(x,.53);lm[m+2]=p(x+.015,.62);lm[m+3]=p(x+.02,.68);}
  }
  return lm;
}
class Target {
  constructor(){this.events=new Map();this.dataset={};this.children=[];this.disabled=false;this.textContent='';this.hidden=false;this.open=false;this.inert=false;this._attrs=Object.create(null);this.style={setProperty(){}};const classes=new Set();this.classList={add:(...c)=>c.forEach(x=>classes.add(x)),remove:(...c)=>c.forEach(x=>classes.delete(x)),contains:c=>classes.has(c)};}
  addEventListener(n,f){if(!this.events.has(n))this.events.set(n,[]);this.events.get(n).push(f);}
  removeEventListener(n,f){this.events.set(n,(this.events.get(n)||[]).filter(x=>x!==f));}
  async emit(n){for(const f of this.events.get(n)||[])await f({target:this});}
  appendChild(x){this.children.push(x);return x;}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(n,v){const key=String(n);const val=v==null?'':String(v);this._attrs[key]=val;if(key==='hidden')this.hidden=true;}
  getAttribute(n){const key=String(n);return Object.prototype.hasOwnProperty.call(this._attrs,key)?this._attrs[key]:null;}
  removeAttribute(n){delete this._attrs[n];delete this[n];if(n==='hidden')this.hidden=false;}
  scrollIntoView(){}
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function recordCount(h,id,mode){
  const row=(h.els['records-list'].children||[]).find(x=>x.dataset.letterId===id&&x.dataset.mode===mode);
  return row?Number(row.dataset.count):0;
}
async function harness(opts={}){
  const h={now:1000,epoch:1700000000000,raf:new Map(),seq:0,downloads:[],detects:0,painted:false,hands:[hand()],logs:[],streams:[],gumCalls:0,store:opts.store||new Map(),storageClears:0};
  const ids=['video','overlay','status','verdict','hint','how','demo-stage','demo-image','demo-glyph','demo-label','capability','letter-btns','atlas-btns','demo-btns','practice-group','review-group','demo-group','practice-count','review-count','demo-count','similar-hints','similar-hints-text','similar-hint-btns','start-btn','stop-btn','mirror-toggle','export-toggle','export-btn','stage','demo-panel','quest-panel','quest-btns','quest-progress-text','quest-bar-fill','letter-library','confetti-layer','learn-eyebrow','learn-title','live-title','pass-seal','pass-seal-text','records','records-list','records-empty','persist-note','records-clear','records-clear-confirm','records-clear-yes','records-clear-no'];
  h.els=Object.fromEntries(ids.map(id=>[id,new Target()]));
  h.els['similar-hints'].hidden=true;
  for(const id of ['pass-seal','records-clear-confirm','persist-note']) h.els[id].hidden=true;
  const canvas=h.els.overlay;
  canvas.getContext=()=>({clearRect(){h.painted=false;},beginPath(){},moveTo(){},lineTo(){},stroke(){h.painted=true;},arc(){},fill(){h.painted=true;}});
  Object.assign(h.els.video,{readyState:4,currentTime:0,videoWidth:640,videoHeight:480,srcObject:null,play:()=>h.play? h.play():Promise.resolve()});
  const document=new Target(); document.hidden=false;document.visibilityState='visible';
  document.getElementById=id=>h.els[id];
  document.querySelectorAll=()=>[...h.els['letter-btns'].children,...h.els['atlas-btns'].children,...h.els['demo-btns'].children,...h.els['similar-hint-btns'].children,...h.els['quest-btns'].children];
  document.createElement=tag=>{const el=new Target();el.click=()=>{if(tag==='a')h.downloads.push(el);else return el.emit('click');};return el;};
  h.document=document;
  h.newStream=()=>{const track=new Target();track.muted=false;track.readyState='live';track.stops=0;track.stop=()=>{track.stops++;track.readyState='ended';};const s={track,getTracks:()=>[track],getVideoTracks:()=>[track]};h.streams.push(s);return s;};
  class ClockDate extends Date {constructor(...args){super(...(args.length?args:[h.epoch]));}static now(){return h.epoch;}}
  const localStorage={
    get length(){if(h.storageGetThrow)throw Error('storage');return h.store.size;},
    getItem(k){if(h.storageGetThrow)throw Error('storage');return h.store.has(k)?h.store.get(k):null;},
    setItem(k,v){if(h.storageSetThrow)throw Error('storage');h.store.set(String(k),String(v));},
    removeItem(k){if(h.storageRemoveThrow)throw Error('storage');h.store.delete(k);},
    clear(){h.storageClears++;throw Error('clear-all-forbidden');},
    key(i){return [...h.store.keys()][i]??null;},
  };
  h.location={search:opts.search||'',hash:opts.hash||'',pathname:'/learn.html',href:'http://local/learn.html'};
  const sandbox={document,Image:class {},performance:{now:()=>h.now},Date:ClockDate,TextEncoder,crypto:webcrypto,Blob,URLSearchParams,localStorage,location:h.location,
    console:{log:(...a)=>h.logs.push(a),info:(...a)=>h.logs.push(a),warn:(...a)=>h.logs.push(a),error:(...a)=>h.logs.push(a)},
    URL:{createObjectURL:blob=>{h.blob=blob;return 'blob:test';},revokeObjectURL(){}},
    navigator:{mediaDevices:{getUserMedia:()=>{h.gumCalls++;return h.gum?h.gum():Promise.resolve(h.newStream());}}},
    requestAnimationFrame:f=>{const id=++h.seq;h.raf.set(id,f);return id;},cancelAnimationFrame:id=>h.raf.delete(id),
    fetch:async path=>{let text=readFileSync(resolve(practice,String(path).replace(/^\.\//,'')),'utf8');if(h.fetchTransform)text=h.fetchTransform(path,text);return {ok:true,status:200,text:async()=>text,json:async()=>JSON.parse(text)};}};
  h.context=vm.createContext(sandbox); const modules=new Map();
  const vendor=new vm.SyntheticModule(['FilesetResolver','HandLandmarker'],function(){
    this.setExport('FilesetResolver',{forVisionTasks:async()=>({})});
    this.setExport('HandLandmarker',{createFromOptions:async()=>({detectForVideo(){h.detects++;if(h.detectError)throw Error('synthetic detection exception');if(h.detectDelay)h.advance(h.detectDelay);return {landmarks:h.hands,handednesses:[[{categoryName:'Right',score:.05}]]};}})});
  },{context:h.context});
  async function load(file){if(modules.has(file))return modules.get(file);const m=new vm.SourceTextModule(readFileSync(file,'utf8'),{context:h.context,identifier:file});modules.set(file,m);await m.link((s,ref)=>s.includes('vendor/')?vendor:load(resolve(dirname(ref.identifier),s)));return m;}
  h.core=async name=>{const m=await load(resolve(practice,'src',name+'.js'));if(m.status!=='evaluated')await m.evaluate();return m.namespace;};
  h.boot=async()=>{const app=await load(resolve(practice,'app.js'));await app.evaluate();for(let i=0;i<100 && !h.els['start-btn'].events.has('click');i++)await new Promise(r=>setTimeout(r,2));assert.ok(h.els['start-btn'].events.has('click'),'app initialized');};
  h.advance=(ms)=>{h.now+=ms;h.epoch+=ms;};
  h.tick=async({ms=30,fresh=true}={})=>{h.advance(ms);if(fresh)h.els.video.currentTime+=.03;const callbacks=[...h.raf.values()];h.raf.clear();for(const f of callbacks)await f(h.now);};
  h.select=async(id='GF0021.V')=>{const b=document.querySelectorAll().find(x=>x.dataset.id===id);assert.ok(b);await b.emit('click');};
  h.start=()=>h.els['start-btn'].emit('click');h.stop=()=>h.els['stop-btn'].emit('click');
  h.pass=async()=>{await h.boot();await h.select();await h.start();for(let i=0;i<31;i++)await h.tick({ms:100});assert.equal(h.els.verdict.dataset.state,'ok','synthetic V reaches pass after holding 3 seconds');};
  h.download=async()=>{h.els['export-toggle'].checked=true;await h.els['export-toggle'].emit('change');await h.els['export-btn'].emit('click');};
  h.invalid=async()=>{assert.notEqual(h.els.verdict.dataset.state,'ok');assert.equal(h.painted,false);const n=h.downloads.length;await h.download();assert.equal(h.downloads.length,n,'invalid snapshot must not download');};
  h.recover=async()=>{for(let i=0;i<30;i++){await h.tick({ms:100});assert.notEqual(h.els.verdict.dataset.state,'ok','must accumulate 3 seconds of new frames');}await h.tick({ms:100});assert.equal(h.els.verdict.dataset.state,'ok');};
  return h;
}
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
test('passState duplicate expires at 401ms, stays zero on same frame, new frame counts one',async()=>{
 const h=await harness(),p=await h.core('passState'),s=p.createHold();
 for(let i=0;i<6;i++)p.observePass(s,{ok:true,videoTime:i,nowMs:i*30});
 p.observePass(s,{ok:true,videoTime:5,nowMs:550});assert.equal(s.frames,6);
 p.observePass(s,{ok:true,videoTime:5,nowMs:551});assert.equal(s.frames,0);
 p.observePass(s,{ok:true,videoTime:5,nowMs:552});assert.equal(s.frames,0);
 p.observePass(s,{ok:true,videoTime:6,nowMs:553});assert.equal(s.frames,1);
});
test('passState missing/nonfinite/backwards times fail closed',async()=>{
 const h=await harness(),p=await h.core('passState');
 for(const bad of [{},{videoTime:undefined,nowMs:10},{videoTime:1,nowMs:NaN},{videoTime:Infinity,nowMs:1},{videoTime:0,nowMs:20},{videoTime:2,nowMs:9}]){
  const s=p.createHold();p.observePass(s,{ok:true,videoTime:1,nowMs:10});for(let i=0;i<7;i++)p.observePass(s,{ok:true,...bad});assert.equal(s.frames,0,JSON.stringify(bad));
 }
});
for(const mode of ['readyState','frozen videoTime'])test(`app pass then ${mode} 401ms invalidates and recovery recounts`,async()=>{
 const h=await harness();await h.pass();if(mode==='readyState')h.els.video.readyState=1;
 await h.tick({ms:401,fresh:false});await h.invalid();h.els.video.readyState=4;
 await h.tick({ms:1,fresh:false});assert.notEqual(h.els.verdict.dataset.state,'ok');await h.recover();
});
test('download rejects stale frame without any RAF (monotonic clock)',async()=>{const h=await harness();await h.pass();h.now+=401;await h.download();assert.equal(h.downloads.length,0);await h.invalid();});
test('download rejects stale/future epoch without RAF',async()=>{for(const delta of [401,-1]){const h=await harness();await h.pass();h.epoch+=delta;await h.download();assert.equal(h.downloads.length,0);}});
test('exactly 400ms snapshot still downloadable; 401ms refused',async()=>{const h=await harness();await h.pass();h.advance(400);await h.download();assert.equal(h.downloads.length,1);h.advance(1);await h.download();assert.equal(h.downloads.length,1);});
test('hidden and visible each invalidate, duplicate videoTime never recounts',async()=>{
 const h=await harness();await h.pass();h.document.hidden=true;h.document.visibilityState='hidden';await h.document.emit('visibilitychange');await h.invalid();const n=h.detects;await h.tick();assert.equal(h.detects,n);
 h.document.hidden=false;h.document.visibilityState='visible';await h.document.emit('visibilitychange');await h.invalid();await h.recover();
 await h.document.emit('visibilitychange');await h.invalid();const before=h.detects;await h.tick({fresh:false});assert.equal(h.detects,before);await h.recover();
});
test('track mute invalidates immediately and gates detection until unmute',async()=>{const h=await harness();await h.pass();const t=h.streams[0].track;t.muted=true;await t.emit('mute');await h.invalid();const n=h.detects;await h.tick();assert.equal(h.detects,n);t.muted=false;await t.emit('unmute');await h.recover();});
test('track ended stops stream and clears state',async()=>{const h=await harness();await h.pass();const t=h.streams[0].track;t.readyState='ended';await t.emit('ended');await h.invalid();assert.equal(h.els.video.srcObject,null);assert.equal(h.raf.size,0);});
for(const mode of ['exception','target','no hand','multi hand','bad point','missing size'])test(`app ${mode} clears pass/snapshot/canvas`,async()=>{
 const h=await harness();await h.pass();
 if(mode==='target')await h.select('GF0021.U');
 else {if(mode==='exception')h.detectError=true;if(mode==='no hand')h.hands=[];if(mode==='multi hand')h.hands=[hand(),hand()];if(mode==='bad point')h.hands[0][8].x=NaN;if(mode==='missing size')h.els.video.videoWidth=0;await h.tick();}
 await h.invalid();
});
test('slow detect finishing after 401ms must not publish success/snapshot',async()=>{const h=await harness();await h.pass();h.detectDelay=401;await h.tick();await h.invalid();});
test('stop/reopen releases old tracks, clears RAF and recounts',async()=>{const h=await harness();await h.pass();await h.stop();await h.invalid();assert.equal(h.raf.size,0);assert.equal(h.streams[0].track.stops,1);await h.start();assert.equal(h.raf.size,1);await h.recover();});
test('permission rejection leaves no stream/RAF and allows retry',async()=>{const h=await harness();await h.boot();await h.select();h.gum=async()=>{throw Error('permission denied');};await h.start();assert.equal(h.raf.size,0);assert.equal(h.els.video.srcObject,null);assert.equal(h.els['start-btn'].disabled,false);h.gum=null;await h.start();await h.recover();});
test('stop cancels late getUserMedia and newer start is not overwritten',async()=>{
 const h=await harness();await h.boot();const d=deferred();h.gum=()=>d.promise;const first=h.start();await new Promise(r=>setTimeout(r,0));await h.stop();h.gum=null;await h.start();const active=h.els.video.srcObject;const late=h.newStream();d.resolve(late);await first;assert.equal(late.track.stops,1);assert.equal(h.els.video.srcObject,active);assert.equal(h.raf.size,1);
});
test('stop cancels late play fulfillment/rejection without killing newer stream',async()=>{
 for(const reject of [false,true]){const h=await harness();await h.boot();const d=deferred();h.play=()=>d.promise;const first=h.start();await new Promise(r=>setTimeout(r,0));const old=h.streams[0];await h.stop();h.play=null;await h.start();const active=h.els.video.srcObject;if(reject)d.reject(Error('late play'));else d.resolve();await first;assert.ok(old.track.stops>=1);assert.equal(h.els.video.srcObject,active);assert.equal(h.raf.size,1);}
});
test('play rejection releases acquired stream',async()=>{const h=await harness();await h.boot();h.play=async()=>{throw Error('play rejected');};await h.start();assert.equal(h.streams[0].track.stops,1);assert.equal(h.els.video.srcObject,null);assert.equal(h.raf.size,0);});
test('duplicate start while pending does not acquire twice or schedule duplicate RAF',async()=>{const h=await harness();await h.boot();const d=deferred();h.play=()=>d.promise;const a=h.start();await new Promise(r=>setTimeout(r,0));const b=h.start();await new Promise(r=>setTimeout(r,0));d.resolve();await Promise.all([a,b]);assert.equal(h.streams.length,1);assert.equal(h.raf.size,1);});
test('coords/evaluate/quality reject missing or nonfinite dimensions and unknown space',async()=>{
 const h=await harness(),e=await h.core('evaluate'),j=await h.core('judge');
 for(const geom of [undefined,{}, {coordSpace:'image_normalized'}, {width:Infinity,height:480,coordSpace:'image_normalized'}, {width:'640',height:480,coordSpace:'image_normalized'},{width:640,height:480,coordSpace:'unknown'}]){
  const r=e.evaluate(V,hand(),geom);assert.equal(r.pass,false);assert.ok(['missing_size','unsupported_coord_space'].includes(r.issues[0].code));
  assert.equal(j.judge({letter:V,hands:[hand()],geom,videoTime:1,nowMs:1}).decision,'undetermined');
 }
 assert.equal(e.evaluate(V,hand(),UNIT).pass,true);
});
test('snapshot finite 21 points, dimensions and time metadata; age gates',async()=>{
 const h=await harness(),s=await h.core('snapshot');const base={imageWidth:640,imageHeight:480,landmarks:hand(),capturedAt:1000,frameId:1,coordSpace:'image_normalized',targetLetterId:V.id};
 for(const patch of [{imageWidth:Infinity},{imageHeight:'480'},{capturedAt:NaN},{frameId:-1},{frameId:1.5},{coordSpace:'bad'},{landmarks:hand().map((p,i)=>i===3?{...p,z:Infinity}:p)}])assert.equal(s.createSnapshot({...base,...patch}).ok,false);
 const snap=s.createSnapshot(base).snapshot;
 for(const nowMs of [NaN,Infinity,999,1401])assert.equal(s.canExportSnapshot(snap,{nowMs}),false);
 assert.equal(s.canExportSnapshot(snap,{nowMs:1400}),true);
 assert.equal(s.canExportSnapshot({...snap,capturedAt:undefined},{nowMs:1000}),false);
 assert.equal(s.canExportSnapshot(snap,{nowMs:1000,stale:true}),false);
 assert.equal(s.canExportSnapshot(snap,{nowMs:1000,qualityOk:false}),false);
 assert.equal(s.canExportSnapshot(snap,{nowMs:1000,currentLetterId:'other'}),false);
});
test('runtime versions hash actual sources/letters; export retains raw unmirrored points',async()=>{
 const h=await harness();await h.pass();await h.download();const payload=JSON.parse(await h.blob.text());assert.equal(payload.schemaVersion,2);assert.equal(payload.mirrored,true);assert.deepEqual(payload.landmarks,hand());assert.match(payload.codeVersion,/^sha256:[a-f0-9]{64}$/);assert.match(payload.rulesVersion,/^sha256:[a-f0-9]{64}$/);
 const v=await h.core('versions');const manifest=await v.loadVersionManifest();
 for(const entry of manifest.files)assert.equal(entry.sha256,createHash('sha256').update(readFileSync(resolve(practice,entry.path))).digest('hex'));
 assert.equal(payload.codeVersion,manifest.codeVersion);assert.equal(payload.rulesVersion,manifest.rulesVersion);
 h.fetchTransform=(path,text)=>String(path).includes('evaluate.js')?text+'\n// revision\n':text;
 const changed=await v.loadVersionManifest();assert.notEqual(changed.codeVersion,manifest.codeVersion);assert.notEqual(changed.rulesVersion,manifest.rulesVersion);
 h.fetchTransform=(path,text)=>String(path).includes('letters.json')?text+'\n':text;
 const lettersChanged=await v.loadVersionManifest();assert.notEqual(lettersChanged.codeVersion,manifest.codeVersion);assert.notEqual(lettersChanged.rulesVersion,manifest.rulesVersion);
});
test('32 letters grouped exactly once by capability',async()=>{
 const h=await harness();await h.boot();
 const grouped=groupLetters(pack.letters);
 const practice=h.els['letter-btns'].children.map(b=>b.dataset.id);
 const review=h.els['atlas-btns'].children.map(b=>b.dataset.id);
 const demo=h.els['demo-btns'].children.map(b=>b.dataset.id);
 const all=[...practice,...review,...demo];
 assert.equal(pack.letters.length,32);
 assert.equal(all.length,32);
 assert.equal(new Set(all).size,32);
 assert.deepEqual(practice,grouped.practice.map(l=>l.id));
 assert.deepEqual(review,grouped.review.map(l=>l.id));
 assert.deepEqual(demo,grouped.demo.map(l=>l.id));
 assert.equal(groupIdForStatus('accepted_practice'),'practice');
 assert.equal(groupIdForStatus(undefined),'review');
 assert.equal(groupIdForStatus('unknown'),'review');
 assert.equal(h.els['practice-group'].hidden,false);
 assert.equal(h.els['review-group'].hidden,false);
 assert.equal(h.els['demo-group'].hidden,false);
 assert.equal(h.els['practice-count'].textContent,String(practice.length));
 assert.ok(!practice.includes('GF0021.U'));
 assert.ok(review.includes('GF0021.U'));
 assert.ok([...h.els['letter-btns'].children,...h.els['atlas-btns'].children,...h.els['demo-btns'].children].every(b=>!String(b.textContent).includes('易混')));
});
test('U is not practiceable and stays 暂不判定',async()=>{
 const h=await harness();await h.boot();
 assert.ok(!h.els['letter-btns'].children.some(b=>b.dataset.id==='GF0021.U'));
 await h.select('GF0021.U');
 assert.equal(h.els.verdict.textContent,'暂不判定');
 assert.match(h.els.capability.textContent,/暂不判定/);
});
test('J and Z capability notes announce static-only practice',async()=>{
 // 2026-10-01 官方文字转写后，J（食指回勾）与 Z（食小指横伸）均为静态指式，无 motion 规则
 const h=await harness();await h.boot();
 for(const id of ['GF0021.J','GF0021.Z']){
  const letter=pack.letters.find(l=>l.id===id);
  assert.match(capabilityNote(letter),/静态/);
  await h.select(id);
  assert.match(h.els.capability.textContent,/静态/);
  const btn=h.els['letter-btns'].children.find(b=>b.dataset.id===id);
  assert.ok(btn);
  assert.match(btn.getAttribute('aria-label'),/只核静态手型/);
 }
});
test('letter buttons expose unique accessible name and pressed state',async()=>{
 const h=await harness();await h.boot();
 const library=[...h.els['letter-btns'].children,...h.els['atlas-btns'].children,...h.els['demo-btns'].children];
 const names=library.map(b=>b.getAttribute('aria-label'));
 assert.equal(names.length,32);
 assert.equal(new Set(names).size,32);
 for(const btn of library){
  const letter=pack.letters.find(l=>l.id===btn.dataset.id);
  assert.equal(btn.getAttribute('aria-label'),letterAriaLabel(letter));
  assert.ok(btn.getAttribute('aria-label').includes(letter.title));
  assert.equal(btn.getAttribute('aria-pressed'),letter.id==='GF0021.A'?'true':'false');
  assert.equal(btn.type,'button');
 }
 await h.select('GF0021.B');
 for(const btn of h.document.querySelectorAll()){
  assert.equal(btn.getAttribute('aria-pressed'),btn.dataset.id==='GF0021.B'?'true':'false');
 }
});
test('similar-hint panel appears for confusable letters, hides on switch, and clears pass',async()=>{
 const h=await harness();await h.boot();
 assert.equal(h.els['similar-hints'].hidden,true);
 assert.equal(h.els['similar-hints'].open,false);
 await h.select('GF0021.M');
 assert.equal(h.els['similar-hints'].hidden,false);
 assert.equal(h.els['similar-hints'].open,false);
 assert.equal(h.els['similar-hint-btns'].children.length,3);
 assert.equal(h.els['similar-hints-text'].textContent,confusionCluster('GF0021.M').note);
 const n=h.els['similar-hint-btns'].children.find(b=>b.dataset.id==='GF0021.N');
 await n.emit('click');
 assert.equal(h.els['demo-label'].textContent,'字母 N');
 assert.ok(h.document.querySelectorAll().filter(b=>b.dataset.id==='GF0021.N').every(b=>b.getAttribute('aria-pressed')==='true'));
 await h.select('GF0021.A');
 assert.equal(h.els['similar-hints'].hidden,true);
 assert.equal(h.els['similar-hints'].open,false);
 assert.equal(h.els['similar-hint-btns'].children.length,0);
 assert.equal(h.els['similar-hints-text'].textContent,'');
 await h.select('GF0021.E');
 assert.equal(h.els['similar-hints'].hidden,false);
 assert.equal(h.els['similar-hint-btns'].children.length,2);
});
test('switching away from a passed letter via similar-hint target clears success',async()=>{
 const h=await harness();await h.pass();
 await h.select('GF0021.S');
 await h.invalid();
 assert.equal(h.els['similar-hints'].hidden,false);
 assert.equal(h.els['similar-hints'].open,false);
});
test('initialization does not request camera',async()=>{
 const h=await harness();await h.boot();
 await new Promise(r=>setTimeout(r,20));
 assert.equal(h.gumCalls,0);
 assert.equal(h.streams.length,0);
 assert.equal(h.raf.size,0);
});
test('stop button stops camera, cancels late gum, and clears hold snapshot',async()=>{
 const h=await harness();await h.pass();
 await h.els['stop-btn'].emit('click');
 await h.invalid();
 assert.equal(h.raf.size,0);
 assert.equal(h.streams[0].track.stops,1);
 assert.equal(h.els.video.srcObject,null);
 const late=await harness();await late.boot();const d=deferred();late.gum=()=>d.promise;const first=late.start();await new Promise(r=>setTimeout(r,0));
 await late.els['stop-btn'].emit('click');late.gum=null;const incoming=late.newStream();d.resolve(incoming);await first;
 assert.equal(incoming.track.stops,1);assert.equal(late.els.video.srcObject,null);assert.equal(late.raf.size,0);
});
test('unknown or removed mode query stays learn; records hash does not start camera',async()=>{
 const learn=await harness({search:'?mode=exam'});await learn.boot();
 assert.equal(learn.els['demo-panel'].hidden,false);assert.equal(learn.gumCalls,0);
 const legacy=await harness({search:'?mode=test'});await legacy.boot();
 assert.equal(legacy.els['demo-panel'].hidden,false);assert.equal(legacy.els['quest-panel'].hidden,true);
 assert.equal(legacy.els['demo-label'].textContent,'字母 A');assert.equal(legacy.gumCalls,0);
 const rec=await harness({hash:'#records'});await rec.boot();
 assert.equal(rec.gumCalls,0);assert.equal(rec.raf.size,0);assert.ok(rec.els.records);
});
test('fail, short hold, and no hand do not record',async()=>{
 const fail=await harness();await fail.boot();await fail.select('GF0021.A');await fail.start();
 for(let i=0;i<8;i++)await fail.tick();
 assert.notEqual(fail.els.verdict.dataset.state,'ok');
 assert.equal(recordCount(fail,'GF0021.A','learn'),0);
 assert.equal(fail.els['pass-seal'].hidden,true);
 const hold=await harness();await hold.boot();await hold.select();await hold.start();
 for(let i=0;i<5;i++)await hold.tick();
 assert.notEqual(hold.els.verdict.dataset.state,'ok');
 assert.equal(recordCount(hold,'GF0021.V','learn'),0);
 const empty=await harness();await empty.boot();await empty.select();empty.hands=[];await empty.start();
 for(let i=0;i<8;i++)await empty.tick();
 assert.equal(recordCount(empty,'GF0021.V','learn'),0);
});
test('real V pass records once; later frames and recovery do not re-record',async()=>{
 const h=await harness();await h.pass();
 assert.equal(recordCount(h,'GF0021.V','learn'),1);
 assert.equal(h.els['pass-seal'].hidden,false);
 assert.match(h.els['pass-seal-text'].textContent,/静态通过/);
 assert.doesNotMatch(h.els['pass-seal-text'].textContent,/已掌握手语/);
 for(let i=0;i<4;i++)await h.tick();
 assert.equal(recordCount(h,'GF0021.V','learn'),1);
 h.els.video.readyState=1;await h.tick({ms:401,fresh:false});await h.invalid();
 h.els.video.readyState=4;await h.recover();
 assert.equal(recordCount(h,'GF0021.V','learn'),1);
 const same=h.document.querySelectorAll().find(x=>x.dataset.id==='GF0021.V');
 await same.emit('click');
 await h.tick();assert.equal(recordCount(h,'GF0021.V','learn'),1);
});
test('switching letter allows a new record',async()=>{
 const h=await harness();await h.pass();
 assert.equal(recordCount(h,'GF0021.V','learn'),1);
 await h.select('GF0021.A');await h.select('GF0021.V');await h.recover();
 assert.equal(recordCount(h,'GF0021.V','learn'),2);
});
test('refresh reads sanitized records; unknown schema and illegal rows are dropped',async()=>{
 const store=new Map();
 const h=await harness({store});await h.pass();
 const raw=JSON.parse(store.get(PROGRESS_KEY));
 assert.equal(raw.schemaVersion,1);
 assert.equal(raw.entries[0].letterId,'GF0021.V');
 const h2=await harness({store});await h2.boot();
 assert.equal(recordCount(h2,'GF0021.V','learn'),1);
 const bad=new Map([[PROGRESS_KEY,JSON.stringify({schemaVersion:99,entries:[{letterId:'GF0021.V',mode:'learn',count:9,lastAt:'2026-09-30T00:00:00.000Z'}]})]]);
 const h3=await harness({store:bad});await h3.boot();
 assert.equal(recordCount(h3,'GF0021.V','learn'),0);
 const mixed=new Map([[PROGRESS_KEY,JSON.stringify({schemaVersion:1,entries:[
  {letterId:'GF0021.V',mode:'learn',count:2,lastAt:'2026-09-30T00:00:00.000Z'},
  {letterId:'nope',mode:'learn',count:1,lastAt:'2026-09-30T00:00:00.000Z'},
  {letterId:'GF0021.U',mode:'learn',count:4,lastAt:'2026-09-30T00:00:00.000Z'},
  {letterId:'GF0021.A',mode:'exam',count:1,lastAt:'2026-09-30T00:00:00.000Z'},
  {letterId:'GF0021.B',mode:'learn',count:0,lastAt:'2026-09-30T00:00:00.000Z'},
  {letterId:'GF0021.L',mode:'learn',count:1.5,lastAt:'2026-09-30T00:00:00.000Z'},
  {letterId:'GF0021.Y',mode:'learn',count:1,lastAt:'not-a-date'},
  {letterId:'GF0021.V',mode:'learn',count:8,lastAt:'2026-09-30T00:00:00.000Z'},
 ]})]]);
 const h4=await harness({store:mixed});await h4.boot();
 assert.equal(recordCount(h4,'GF0021.V','learn'),2);
 assert.equal(recordCount(h4,'GF0021.U','learn'),0);
 assert.equal(h4.els['records-list'].children.length,1);
 assert.doesNotMatch(h4.els['records-list'].children[0].textContent,/nope|<script>/);
});
test('storage throws do not crash practice; clear confirm, cancel, and failure',async()=>{
 const broken=await harness();broken.storageGetThrow=true;await broken.boot();
 await broken.select();await broken.start();for(let i=0;i<31;i++)await broken.tick({ms:100});
 assert.equal(broken.els.verdict.dataset.state,'ok');
 assert.equal(recordCount(broken,'GF0021.V','learn'),1);
 assert.equal(broken.els['persist-note'].hidden,false);
 const h=await harness();await h.pass();
 assert.equal(recordCount(h,'GF0021.V','learn'),1);
 await h.els['records-clear'].emit('click');
 assert.equal(h.els['records-clear-confirm'].hidden,false);
 await h.els['records-clear-no'].emit('click');
 assert.equal(h.els['records-clear-confirm'].hidden,true);
 assert.equal(recordCount(h,'GF0021.V','learn'),1);
 h.storageRemoveThrow=true;
 await h.els['records-clear'].emit('click');
 await h.els['records-clear-yes'].emit('click');
 assert.equal(recordCount(h,'GF0021.V','learn'),1);
 assert.match(h.els.status.textContent,/未能清除/);
 assert.doesNotMatch(h.els.status.textContent,/已清除/);
 assert.equal(h.storageClears,0);
 h.storageRemoveThrow=false;
 await h.els['records-clear-yes'].emit('click');
 assert.equal(recordCount(h,'GF0021.V','learn'),0);
 assert.equal(h.store.has(PROGRESS_KEY),false);
 assert.equal(h.storageClears,0);
});
test('success seal is only shown on a recorded pass',async()=>{
 const h=await harness();await h.boot();
 assert.equal(h.els['pass-seal'].hidden,true);
 await h.select();await h.start();
 for(let i=0;i<30;i++)await h.tick({ms:100});
 assert.equal(h.els['pass-seal'].hidden,true);
 await h.tick({ms:100});
 assert.equal(h.els.verdict.dataset.state,'ok');
 assert.equal(h.els['pass-seal'].hidden,false);
 assert.equal(h.els['pass-seal'].dataset.animate,'true');
 const text=h.els['pass-seal-text'].textContent;
 await h.tick();
 assert.equal(h.els['pass-seal-text'].textContent,text);
});
test('recordPass and parseProgress keep canonical ISO and drop out-of-range or overflow dates',async()=>{
 const h=await harness(),p=await h.core('progress');
 const empty=p.emptyProgress();
 const args={letterId:V.id,mode:'learn',letters:pack.letters};
 const iso='2023-11-14T22:13:20.000Z';
 const ok=p.recordPass(empty,{...args,at:1700000000000});
 assert.equal(ok.entries.length,1);
 assert.equal(ok.entries[0].lastAt,iso);
 assert.deepEqual(p.parseProgress({schemaVersion:1,entries:ok.entries},pack.letters).entries,ok.entries);
 assert.equal(p.recordPass(empty,{...args,at:iso}).entries[0].lastAt,iso);
 for(const at of [1e20,-1e20,Number.MAX_VALUE,8.64e15+1,'2026-02-31T00:00:00.000Z','2025-02-29T00:00:00.000Z','2026-09-31T00:00:00.000Z','2026-09-30','2026-09-30T00:00:00Z']){
  assert.doesNotThrow(()=>p.recordPass(empty,{...args,at}));
  const next=p.recordPass(empty,{...args,at});
  assert.equal(next,empty,String(at));
  assert.equal(next.entries.length,0);
 }
 const mixed=p.parseProgress({schemaVersion:1,entries:[
  {letterId:V.id,mode:'learn',count:1,lastAt:iso},
  {letterId:'GF0021.A',mode:'learn',count:1,lastAt:'2026-02-31T00:00:00.000Z'},
  {letterId:'GF0021.B',mode:'learn',count:1,lastAt:'2026-09-30T00:00:00Z'},
 ]},pack.letters);
 assert.equal(mixed.entries.length,1);
 assert.equal(mixed.entries[0].letterId,V.id);
 assert.equal(mixed.entries[0].lastAt,iso);
});
test('canRecordPass rejects zero/negative/missing hold duration and status mismatch; real V still records',async()=>{
 const h=await harness(),s=await h.core('practiceSession');
 const attempt={mode:'learn',letterId:V.id,recorded:false};
 const base={judged:{decision:'pass',quality:{ok:true},practiceStatus:V.practiceStatus,hold:{elapsedMs:3000,passMs:3000}},letter:V,mode:'learn',attempt};
 assert.equal(s.canRecordPass(base),true);
 for(const passMs of [0,-1,NaN,Infinity]){
  assert.equal(s.canRecordPass({...base,judged:{...base.judged,hold:{elapsedMs:3000,passMs}}}),false,String(passMs));
 }
 for(const elapsedMs of [2999.9,0,-3000,NaN]){
  assert.equal(s.canRecordPass({...base,judged:{...base.judged,hold:{elapsedMs,passMs:3000}}}),false,String(elapsedMs));
 }
 assert.equal(s.canRecordPass({...base,judged:{...base.judged,practiceStatus:'pending_review'}}),false);
 assert.equal(s.canRecordPass({...base,judged:{...base.judged,practiceStatus:'accepted_practice'}}),false);
 assert.equal(s.canRecordPass({...base,letter:{...V,practiceStatus:'accepted_practice'}}),false);
 await h.pass();
 assert.equal(recordCount(h,'GF0021.V','learn'),1);
});
function aHand(){
 const p=(x,y)=>({x,y,z:0});
 const lm=Array.from({length:21},()=>p(.5,.5));
 lm[0]=p(.5,.9);
 lm[1]=p(.42,.80);lm[2]=p(.42,.70);lm[3]=p(.42,.46);lm[4]=p(.42,.34);
 for(const [m,x] of [[5,.44],[9,.50],[13,.56],[17,.62]]){lm[m]=p(x,.58);lm[m+1]=p(x,.53);lm[m+2]=p(x+.015,.62);lm[m+3]=p(x+.02,.68);}
 return lm;
}
test('quest mode unlocks sequentially, persists separately, and celebrates passes',async()=>{
 const store=new Map();
 const h=await harness({search:'?mode=quest',store});await h.boot();
 assert.equal(h.gumCalls,0,'quest boot must not start camera');
 assert.equal(h.els['quest-panel'].hidden,false);
 assert.equal(h.els['letter-library'].hidden,true);
 assert.equal(h.els['demo-panel'].hidden,false,'quest shows demo');
 assert.equal(h.els['learn-eyebrow'].textContent,'闯关 · 一关一个手型');
 const btns=h.els['quest-btns'].children;
 assert.deepEqual(btns.map(b=>b.dataset.id),['GF0021.A','GF0021.B','GF0021.I','GF0021.J','GF0021.L','GF0021.V','GF0021.W','GF0021.Y','GF0021.Z']);
 assert.match(h.els['quest-progress-text'].textContent,/第 1 关 · 共 9 关/);
 assert.equal(btns[0].disabled,false);
 assert.ok(btns[1].disabled,'second level locked before A passes');
 assert.equal(btns.filter(b=>!b.disabled).length,1,'only the current level is unlocked');
 assert.equal(h.els['demo-label'].textContent,'字母 A','quest boots into level 1 (A)');
 await btns[1].emit('click');
 assert.equal(h.els['demo-label'].textContent,'字母 A','locked level cannot be selected');
 h.hands=[aHand()];
 await h.start();for(let i=0;i<31;i++)await h.tick({ms:100});
 assert.equal(h.els.verdict.dataset.state,'ok','A hand passes level 1 after holding 3 seconds');
 assert.equal(h.els['pass-seal'].hidden,false);
 assert.equal(h.els['confetti-layer'].classList.contains('is-burst'),true,'pass triggers celebration');
 assert.equal(h.els['confetti-layer'].children.length>0,true,'confetti pieces spawned');
 const stored=JSON.parse(store.get(QUEST_KEY));
 assert.deepEqual(stored.passed,['GF0021.A']);
 assert.equal(store.has(PROGRESS_KEY),false,'quest pass does not write practice records');
 const after=h.els['quest-btns'].children;
 assert.equal(after[1].disabled,false,'level 2 unlocked after A');
 assert.match(h.els['quest-progress-text'].textContent,/第 2 关 · 共 9 关/);
 assert.match(h.els.status.textContent,/已解锁第 2 关/);
 for(let i=0;i<4;i++)await h.tick();
 assert.deepEqual(JSON.parse(store.get(QUEST_KEY)).passed,['GF0021.A'],'replay does not double-record');
 const h2=await harness({search:'?mode=quest',store});await h2.boot();
 assert.equal(h2.els['quest-btns'].children[1].disabled,false,'progress survives reload');
 assert.equal(h2.els['demo-label'].textContent,'字母 B','boot lands on first unfinished level');
});
test('quest module sanitizes stored progress and refuses out-of-order passes',async()=>{
 const h=await harness(),q=await h.core('quest');
 const letters=pack.letters;
 const empty=q.emptyQuest();
 let status=q.questStatus(empty,letters);
 assert.equal(status.total,9);assert.equal(status.unlockedIndex,0);assert.equal(status.current.id,'GF0021.A');
 assert.equal(q.markQuestPassed(empty,'GF0021.B',letters),false,'cannot pass level 2 before level 1');
 assert.equal(q.markQuestPassed(empty,'GF0021.A',letters),true);
 assert.equal(q.markQuestPassed(empty,'GF0021.A',letters),false,'duplicate pass is a no-op');
 assert.equal(q.isQuestUnlocked(empty,'GF0021.B',letters),true);
 assert.equal(q.isQuestUnlocked(empty,'GF0021.I',letters),false);
 for(const bad of [null,'','not json','{"schemaVersion":99,"passed":["GF0021.A"]}','{"schemaVersion":1,"passed":"nope"}','{"schemaVersion":1,"passed":["GF0021.U","GF0021.A","GF0021.A"]}']){
  const parsed=q.parseQuest(bad,letters);
  assert.ok(Array.isArray(parsed.passed));
 }
 assert.deepEqual([...q.parseQuest('{"schemaVersion":1,"passed":["GF0021.A","GF0021.B"]}',letters).passed],['GF0021.A','GF0021.B']);
});
let passed=0,failed=0;
for(const [name,fn] of tests){try{await fn();passed++;console.log('ok -',name);}catch(e){failed++;console.error('not ok -',name);console.error(e.stack);}}
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total (synthetic VM behavior; no human/browser verification)`);
process.exitCode=failed?1:0;
