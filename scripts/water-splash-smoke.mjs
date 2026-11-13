// Run Vite on 5337 and Chrome with remote debugging on 9371.
// Pixel regression: transparent splash pools must composite after water while
// opaque cover continues to occlude them. No external or paid requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5337',chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9371';
const output=new URL('../.cache/splash-clipping/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(chrome+'/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
if(m.method==='Log.entryAdded'&&/WebGL|Shader Error|GL_INVALID/.test(m.params.entry.text))errors.push(m.params.entry);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function load(query=''){await send('Page.navigate',{url:origin+'/scripts/fixtures/ultra-water.html'+query});for(let i=0;i<240;i++){await new Promise(r=>setTimeout(r,250));if(await evaluate('window.ready===true'))return;}throw Error('Fixture failed to load: '+JSON.stringify(errors));}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));}
const results={};
try {
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
 for(const real of [false,true]) {
  await load(real?'?marina':'');
  await evaluate(`(async()=>{
   const THREE=await import('/node_modules/three/build/three.module.js');
   const {createFpsEffects}=await import('/src/game/fps-effects.ts');
   const {impactProfile}=await import('/src/game/fps-impact-profile.ts');
   const {FPS_WEAPONS}=await import('/src/game/fps-rules.ts');
   const {MARINA_WATER}=await import('/src/game/marina-water.ts');
   const {scene,camera,renderer,water}=window.review;
   const effects=createFpsEffects(scene,new THREE.Scene(),{worldLight:false});
   const meshes=['fps-splash-rings','fps-splash-foam','fps-splash-column','fps-spray'].map(n=>scene.getObjectByName(n));
   const orders=meshes.map(m=>m.renderOrder);
   const real=${real}, point=new THREE.Vector3(real?-30:0,real?MARINA_WATER.surface:0,real?20:2);
   if(!real)for(const o of [...scene.children])if(o.material?.color?.getHexString()==='ed5832')scene.remove(o);
   const cover=new THREE.Mesh(new THREE.BoxGeometry(5,6,.4),new THREE.MeshBasicMaterial({color:'#aa4422'}));
   cover.position.copy(point).add(new THREE.Vector3(0,2,3));cover.visible=false;scene.add(cover);
   const read=()=>{const c=document.createElement('canvas');c.width=renderer.domElement.width;c.height=renderer.domElement.height;const ctx=c.getContext('2d');ctx.drawImage(renderer.domElement,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
   window.splashCase=(age=.2,family=0,distance=8,height=2,detail='ultra',blocked=false)=>{
    effects.reset();camera.position.copy(point).add(new THREE.Vector3(0,height,distance));camera.lookAt(point.clone().add(new THREE.Vector3(0,.4,0)));
    cover.visible=blocked;
    const spec=FPS_WEAPONS[family];effects.splash(point,new THREE.Vector3(0,-1,0),1,impactProfile(spec.caliberMm,spec.damage));
    for(let t=0;t<age-1e-6;t+=1/60)effects.update(Math.min(1/60,age-t),camera);
    effects.root.visible=false;window.draw({detail,time:7});const base=read();effects.root.visible=true;
    const measure=order=>{
     meshes.forEach((m,i)=>m.renderOrder=order??orders[i]);const state=window.draw();const p=read();let changed=0,lower=0;
     const a=point.clone().add(new THREE.Vector3(-.25,.18,0)).project(camera),b=point.clone().add(new THREE.Vector3(.25,.65,0)).project(camera);
     const w=renderer.domElement.width,h=renderer.domElement.height;
     const x0=Math.floor((a.x+1)*w/2),x1=Math.ceil((b.x+1)*w/2),y0=Math.floor((1-b.y)*h/2),y1=Math.ceil((1-a.y)*h/2);
     for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,d=Math.abs(p[i]-base[i])+Math.abs(p[i+1]-base[i+1])+Math.abs(p[i+2]-base[i+2]);if(d>12){changed++;if(x>=x0&&x<=x1&&y>=y0&&y<=y1)lower++;}}
     return {changed,lower,state};
    };
    const legacy=measure(0),fixed=measure();return {legacy,fixed,counts:effects.counts};
   };
   window.splashOrder=order=>{meshes.forEach(m=>m.renderOrder=order);window.draw();};
  })()`);
  const name=real?'marina':'fixture';results[name]=[];
  for(const c of [[.2,0,8,2,'ultra'],[.38,3,12,2,'ultra'],[.2,4,18,1,'ultra'],[.2,4,8,5,'ultra'],[.2,0,8,2,'high']]) {
   const r=await evaluate('window.splashCase(...'+JSON.stringify(c)+')');results[name].push({case:c,...r});console.log(name,c,r);
   assert.equal(r.fixed.state.glError,0);assert(r.fixed.lower>20,'Lower plume remains visible');
   if(c[4]==='ultra')assert(r.fixed.lower>r.legacy.lower*1.2,'Water no longer overwrites the lower plume');
  }
  await evaluate('window.splashCase(.2,4,8,2)');await screenshot(name+'-fixed');
  await evaluate('window.splashOrder(0)');await screenshot(name+'-before');
  const blocked=await evaluate('window.splashCase(.2,0,8,2,"ultra",true)');results[name+'Blocked']=blocked;
  assert.equal(blocked.fixed.changed,0,'Solid cover still occludes the entire splash');
 }
 assert.deepEqual(errors,[]);console.log('PASS splash base visibility across age, calibre, angle, distance and High/Ultra; solid cover occlusion.');
} finally {
 results.errors=errors;await fs.writeFile(new URL('results.json',output),JSON.stringify(results,null,2));
 try{await evaluate('window.dispose()');}catch{}ws.close();await fetch(chrome+'/json/close/'+tab.id);
}
