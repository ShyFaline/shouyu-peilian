// Behavioral regression: real SourceTextModule app/core, only browser/vendor boundaries faked.
// Run: node --experimental-vm-modules practice/src/reliability.test.js
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto, createHash } from 'node:crypto';
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
  constructor(){this.events=new Map();this.dataset={};this.children=[];this.disabled=false;this.textContent='';}
  addEventListener(n,f){if(!this.events.has(n))this.events.set(n,[]);this.events.get(n).push(f);}
  removeEventListener(n,f){this.events.set(n,(this.events.get(n)||[]).filter(x=>x!==f));}
  async emit(n){for(const f of this.events.get(n)||[])await f({target:this});}
  appendChild(x){this.children.push(x);}
  removeAttribute(n){delete this[n];}
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function harness(){
  const h={now:1000,epoch:1700000000000,raf:new Map(),seq:0,downloads:[],detects:0,painted:false,hands:[hand()],logs:[],streams:[],images:[]};
  const ids=['video','overlay','status','verdict','hint','how','demo-stage','demo-image','demo-glyph','demo-badge','demo-label','letter-btns','atlas-btns','start-btn','stop-btn','mirror-toggle','export-toggle','export-btn','stage'];
  h.els=Object.fromEntries(ids.map(id=>[id,new Target()]));
  const canvas=h.els.overlay;
  canvas.getContext=()=>({clearRect(){h.painted=false;},beginPath(){},moveTo(){},lineTo(){},stroke(){h.painted=true;},arc(){},fill(){h.painted=true;}});
  Object.assign(h.els.video,{readyState:4,currentTime:0,videoWidth:640,videoHeight:480,srcObject:null,play:()=>h.play? h.play():Promise.resolve()});
  const document=new Target(); document.hidden=false;document.visibilityState='visible';
  document.getElementById=id=>h.els[id];
  document.querySelectorAll=()=>[...h.els['letter-btns'].children,...h.els['atlas-btns'].children];
  document.createElement=tag=>{const el=new Target();el.click=()=>{if(tag==='a')h.downloads.push(el);else return el.emit('click');};return el;};
  h.document=document;
  h.newStream=()=>{const track=new Target();track.muted=false;track.readyState='live';track.stops=0;track.stop=()=>{track.stops++;track.readyState='ended';};const s={track,getTracks:()=>[track],getVideoTracks:()=>[track]};h.streams.push(s);return s;};
  class ClockDate extends Date {constructor(...args){super(...(args.length?args:[h.epoch]));}static now(){return h.epoch;}}
  const sandbox={document,performance:{now:()=>h.now},Date:ClockDate,TextEncoder,crypto:webcrypto,Blob,
    console:{log:(...a)=>h.logs.push(a),info:(...a)=>h.logs.push(a),warn:(...a)=>h.logs.push(a),error:(...a)=>h.logs.push(a)},
    URL:{createObjectURL:blob=>{h.blob=blob;return 'blob:test';},revokeObjectURL(){}},
    navigator:{mediaDevices:{getUserMedia:()=>h.gum?h.gum():Promise.resolve(h.newStream())}},
    requestAnimationFrame:f=>{const id=++h.seq;h.raf.set(id,f);return id;},cancelAnimationFrame:id=>h.raf.delete(id),
    fetch:async path=>{let text=readFileSync(resolve(practice,String(path).replace(/^\.\//,'')),'utf8');if(h.fetchTransform)text=h.fetchTransform(path,text);return {ok:true,status:200,text:async()=>text,json:async()=>JSON.parse(text)};}};
  // 可控 Image 伪类：记录每次探测，手动触发 onload/onerror 来模拟慢图、失败图与竞争。
  sandbox.Image=class{constructor(){this.onload=null;this.onerror=null;h.images.push(this);}
    set src(v){this._src=v;if(h.imageAutoLoad!==false)queueMicrotask(()=>this.onload&&this.onload());}
    get src(){return this._src;}
    load(){this.onload&&this.onload();}
    fail(){this.onerror&&this.onerror();}};
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
  h.pass=async()=>{await h.boot();await h.select();await h.start();for(let i=0;i<6;i++)await h.tick();assert.equal(h.els.verdict.dataset.state,'ok','synthetic V reaches pass after six frames');};
  h.download=async()=>{h.els['export-toggle'].checked=true;await h.els['export-toggle'].emit('change');await h.els['export-btn'].emit('click');};
  h.invalid=async()=>{assert.notEqual(h.els.verdict.dataset.state,'ok');assert.equal(h.painted,false);const n=h.downloads.length;await h.download();assert.equal(h.downloads.length,n,'invalid snapshot must not download');};
  h.recover=async()=>{for(let i=0;i<5;i++){await h.tick();assert.notEqual(h.els.verdict.dataset.state,'ok','must recount six new frames');}await h.tick();assert.equal(h.els.verdict.dataset.state,'ok');};
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
test('demo image: load failure falls back to glyph, never leaves broken image',async()=>{
 const h=await harness();h.imageAutoLoad=false;await h.boot();
 await h.select('GF0021.V');
 const probe=h.images[h.images.length-1];assert.ok(String(probe.src).includes('GF0021.V_front.png'));
 probe.fail();
 await new Promise(r=>setTimeout(r,5));
 assert.notEqual(h.els['demo-stage'].dataset.hasImage,'true','failed demo must not be shown');
 assert.equal(h.els['demo-glyph'].textContent.length>0,true,'glyph fallback must be visible');
});
test('demo image: rapid target switch, slow old callback must not overwrite new target',async()=>{
 const h=await harness();h.imageAutoLoad=false;await h.boot();
 await h.select('GF0021.V');const slow=h.images[h.images.length-1];
 await h.select('GF0021.U');const newer=h.images[h.images.length-1];
 newer.load();await new Promise(r=>setTimeout(r,5));
 const shownAfterNew=String(h.els['demo-image'].src||'');
 slow.load();await new Promise(r=>setTimeout(r,5));
 assert.equal(String(h.els['demo-image'].src||''),shownAfterNew,'stale V image callback must not overwrite U');
 assert.ok(shownAfterNew.includes('GF0021.U')||shownAfterNew==='','shown demo must belong to U or be empty');
});
test('demo image: error callback of old target must not blank the new target image',async()=>{
 const h=await harness();h.imageAutoLoad=false;await h.boot();
 await h.select('GF0021.V');const old=h.images[h.images.length-1];
 await h.select('GF0021.U');const newer=h.images[h.images.length-1];
 newer.load();await new Promise(r=>setTimeout(r,5));
 const keep=String(h.els['demo-image'].src||'');
 old.fail();await new Promise(r=>setTimeout(r,5));
 assert.equal(String(h.els['demo-image'].src||''),keep,'stale error callback must not touch new target demo');
});
let passed=0,failed=0;
for(const [name,fn] of tests){try{await fn();passed++;console.log('ok -',name);}catch(e){failed++;console.error('not ok -',name);console.error(e.stack);}}
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total (synthetic VM behavior; no human/browser verification)`);
process.exitCode=failed?1:0;
