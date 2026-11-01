import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const chrome=process.env.FPS_CHROME_ORIGIN||'http://127.0.0.1:9353',origin=process.env.FPS_APP_ORIGIN||'http://127.0.0.1:5199';
const output=new URL('../.cache/bailout-roll/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?${encodeURIComponent(origin+'/scripts/fixtures/bailout-roll.html')}`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push({text:m.params.entry.text,url:m.params.entry.url});};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Timeout '+method));},45000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const wait=async expression=>{const until=Date.now()+30000;while(!await evaluate(expression)){assert(Date.now()<until,expression);await new Promise(r=>setTimeout(r,150));}};
const capture=async name=>{const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(shot.data,'base64'));};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const rollState='JSON.parse(document.querySelector("canvas").dataset.bailoutRoll)';
const samples=[];
try {
 await send('Runtime.enable');await send('Page.enable');await send('Log.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await wait('window.hud?.phase === "ready"');
 const p=await evaluate('(()=>{const r=document.querySelector("#start").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
 await wait('hud.phase === "playing"');await evaluate('engine.interactVehicle()');await wait('hud.vehicle === "car"');
 assert((await evaluate('document.querySelector(".fps-vehicle-hud").textContent')).includes('EXIT AT SPEED RISKS INJURY'));
 await evaluate('engine.setInput("w",true)');await wait('hud.vehicleSpeed > 30');
 const before=await evaluate('({health:hud.health,armor:hud.armor,speed:hud.vehicleSpeed})');
 await evaluate('engine.interactVehicle()');await wait('hud.vehicle === "on-foot"');
 assert(await evaluate('hud.health')<before.health,'moving exit injures player');
 assert.equal(await evaluate('hud.armor'),before.armor,'inserts cannot absorb bailout injury');
 for(let i=0;i<15;i++){samples.push(await evaluate(rollState));if(i===4){assert.equal(await evaluate('JSON.parse(document.querySelector("canvas").dataset.body).visible'),false,'local rolling body stays clear of the eye');await capture('landing-first-person');}await pause(55);}
 assert(samples.some(s=>s.active&&s.tuck>.8&&s.eyeDrop>.6),'roll dips and tucks');
 assert(samples.some(s=>Math.abs(s.bank)>.1),'roll banks the camera');
 await wait(`${rollState}.active === false`);
 await capture('recovered-first-person');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await evaluate('engine.reset()');await wait('hud.phase === "ready"');
 // Start requires a real user gesture for pointer capture.
 await send('Runtime.evaluate',{expression:'document.body.insertAdjacentHTML("beforeend",`<button id="again" style="position:absolute;z-index:100;top:20px;left:20px" onclick="engine.start()">Start</button>`)'});
 const q=await evaluate('(()=>{const r=document.querySelector("#again").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...q,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...q,button:'left',clickCount:1});
 await wait('hud.phase === "playing"');await evaluate('engine.interactVehicle();engine.setInput("w",true)');await wait('hud.vehicleSpeed > 30');
 await evaluate('engine.interactVehicle()');await wait('hud.vehicle === "on-foot"');await pause(180);
 const reduced=await evaluate(rollState);assert(reduced.active&&reduced.tuck>.5);assert.equal(reduced.eyeDrop,0);assert.equal(reduced.pitch,0);assert.equal(reduced.bank,0);
 await wait(`${rollState}.active === false`);await evaluate('engine.dispose()');
 // Render the shared third-person rig through the same complete roll.
 await evaluate(`(async()=>{
 const THREE=await import('/node_modules/.vite/deps/three.js');
 const {createCharacterRig}=await import('/src/game/character-rig.ts');
 const {arenaCharacterLook}=await import('/src/game/character-looks.ts');
 document.body.innerHTML='';
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1440,900);document.body.append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#c2cdd0');scene.add(new THREE.HemisphereLight(0xffffff,0x556655,2.5));
 const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(2,5,3);scene.add(light);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:'#78846a'}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;scene.add(floor);scene.add(new THREE.GridHelper(20,20));
 const camera=new THREE.PerspectiveCamera(40,1440/900,.01,100);camera.position.set(2.8,1.8,-3.5);camera.lookAt(0,.8,0);
 const rig=createCharacterRig(arenaCharacterLook({bot:true,role:'rifle',id:'bailout-preview'}));scene.add(rig.root);
 window.showRoll=age=>{rig.update(0,{bailoutAge:age});scene.updateMatrixWorld(true);renderer.render(scene,camera);return {age,angle:rig.body.rotation.x,head:rig.joints.head.getWorldPosition(new THREE.Vector3()).toArray(),feet:rig.joints.footL.getWorldPosition(new THREE.Vector3()).toArray()};};
 })()`);
 const poses=[];
 for(const age of [0,.16,.3,.4,.52,.67,.82,.9]){poses.push(await evaluate(`showRoll(${age})`));await capture('body-'+String(age).replace('.','-'));}
 assert.deepEqual(errors,[]);
 await fs.writeFile(new URL('results.json',output),JSON.stringify({passed:true,before,samples,reduced,poses,errors},null,2));
 console.log('PASS: real engine moving bailout, health-only injury, roll/recovery, reduced-motion camera, shared body poses, zero browser errors.');
} finally {ws.close();await fetch(`${chrome}/json/close/${tab.id}`);}
