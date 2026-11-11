// Run against Vite and Chrome CDP; uses a fresh browser context, never user storage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5178';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9226';
const output = new URL('../.cache/review-gestures/', import.meta.url); await fs.mkdir(output, { recursive: true });
const browser = await (await fetch(`${chrome}/json/version`)).json();
const ws = new WebSocket(browser.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
function send(method, params = {}, sessionId) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params, sessionId })); }); }
const { browserContextId } = await send('Target.createBrowserContext');
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (method, params) => send(method, params, sessionId);
async function evaluate(expression) { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression) { const start = Date.now(); while (Date.now() - start < 30000) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); }
async function click(selector) { const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing selector');e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); await delay(100); }
async function clickText(text) { const selector = await evaluate(`(()=>{const e=[...document.querySelectorAll('.level-review button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing button: '+${JSON.stringify(text)});e.dataset.smokeButton='target';return '[data-smoke-button="target"]'})()`); await click(selector); await evaluate(`document.querySelector('[data-smoke-button]')?.removeAttribute('data-smoke-button')`); }
async function input(selector, value) { await click(selector); await cdp('Input.insertText', { text: value }); }
async function shot(name, selector = '.level-review') { await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'})`); await delay(200); const r = await cdp('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${name}.png`, output), Buffer.from(r.data, 'base64')); }
async function drag(from,to,{cancel=false}={}) {
 await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
 for(let i=1;i<=8;i++){await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8,id:1}]});await delay(20);}
 assert.equal(await evaluate(`!!document.querySelector('.lr-compose')`),false,'Dragging does not open an editor');
 await cdp('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await delay(150);
}
const point=async(x,y)=>evaluate(`(()=>{const r=document.querySelector('.lr-placement').getBoundingClientRect();return {x:r.x+r.width*${x},y:r.y+r.height*${y}}})()`);
async function pinAndPost(title){assert.equal(await evaluate(`!!document.querySelector('.lr-compose')`),false);await clickText('Pin here');await wait(`!!document.querySelector('.lr-compose') && document.querySelector('.level-review').dataset.reviewPanel==='discussion'`);await input('.lr-compose input',title);await input('.lr-compose textarea','Pointer release verification.');await clickText('Post comment');}
const modelView=()=>evaluate(`JSON.parse(document.querySelector('.lr-model-canvas').dataset.view)`);
const mapView=()=>evaluate(`(()=>{const e=document.querySelector('.lr-map-surface');return {zoom:Number(e.dataset.mapZoom),center:JSON.parse(e.dataset.mapCenter)}})()`);
const touch=(type,points)=>cdp('Input.dispatchTouchEvent',{type,touchPoints:points});
async function gesture(selector,{pin=false,cancel=false,third=false}={}) {
 const r=await evaluate(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);
 let a={x:r.x+r.width*.35,y:r.y+r.height*.45,id:1},b={x:r.x+r.width*.65,y:r.y+r.height*.45,id:2};
 await touch('touchStart',[a]);await touch('touchStart',[a,b]);
 for(let i=1;i<=8;i++){a={x:r.x+r.width*(.35-.04*i/8),y:r.y+r.height*(.45+.06*i/8),id:1};b={x:r.x+r.width*(.65+.12*i/8),y:a.y,id:2};await touch('touchMove',[a,b]);await delay(25);}
 if(third){
  const beforeThird=await modelView(),c={x:r.x+r.width*.5,y:r.y+r.height*.7,id:3};
  await touch('touchStart',[a,b,c]);await touch('touchMove',[a,b,{...c,y:c.y+12}]);await delay(100);
  assert.deepEqual(await modelView(),beforeThird,'Third finger freezes rather than jumping the camera');await touch('touchEnd',[{...c,y:c.y+12}]);
 }
 if(pin){assert.equal(await evaluate(`!!document.querySelector('.lr-pointer-actions')`),false);assert.equal(await evaluate(`!!document.querySelector('.lr-compose')`),false);}
 const before=selector.includes('model')?await modelView():await mapView();
 if(cancel) await touch('touchCancel',[]);
 else {
  await touch('touchEnd',[b]);a.x+=15;await touch('touchMove',[a]);await delay(100);
  assert.deepEqual(selector.includes('model')?await modelView():await mapView(),before,'Remaining finger cannot orbit/pan');
  await touch('touchEnd',[]);
 }
 await delay(180);
 if(pin){assert.equal(await evaluate(`!!document.querySelector('.lr-pointer-actions')`),false,'Gesture release cannot select a pin');assert.equal(await evaluate(`!!document.querySelector('.lr-compose')`),false);}
}
try {
 await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Page.bringToFront');await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await cdp('Page.navigate',{url:origin+'/debug?asset=prop/vending'});await wait(`document.querySelector('.lr-model-canvas')?.dataset.ready==='true'`);
 const initial=await modelView();await gesture('.lr-model-stage',{third:true});const moved=await modelView();
 assert(moved.zoom>1.3);assert(Math.abs(moved.pan.x)>0.01&&Math.abs(moved.pan.y)>0.01);assert.equal(moved.yaw,initial.yaw);assert.equal(moved.pitch,initial.pitch);
 await shot('model-two-finger');await clickText('Reset view');await delay(150);assert.deepEqual(await modelView(),initial);
 await clickText('＋ Pin a comment');await drag(await point(.5,.5),await point(.42,.34));await wait(`!!document.querySelector('.lr-pointer-actions')`);
 await gesture('.lr-model-stage',{pin:true});
 const saved=await modelView();
 // Fresh one-finger placement works after both fingers lift, and stores the panned camera.
 let hit=false;for(const [x,y] of [[.5,.5],[.55,.55],[.6,.5],[.45,.4]]){await drag(await point(x,y),await point(x,y));if(await evaluate(`!!document.querySelector('.lr-pointer-actions')`)){hit=true;break;}}
 assert(hit,'Panned model remains ray-pickable');await pinAndPost('Panned view');
 const thread=await evaluate(`JSON.parse(localStorage.getItem('blockplay.asset-review.v1')).threads.find(t=>t.title==='Panned view')`);assert.deepEqual(thread.anchor.surface.view,saved);
 await cdp('Page.reload');await delay(700);await wait(`document.querySelector('.lr-model-canvas')?.dataset.ready==='true'`);
 await click('.lr-panel-switch button:last-child');await evaluate(`(()=>{const e=[...document.querySelectorAll('.lr-thread-list button')].find(e=>e.textContent.includes('Panned view'));e.dataset.savedThread='true'})()`);await click('[data-saved-thread]');await clickText('Model');await clickText('Restore pin view');await delay(200);assert.deepEqual(await modelView(),saved,'Reloaded thread restores pan and zoom');
 await cdp('Page.navigate',{url:origin+'/debug?review=marina-bay'});await wait(`document.querySelector('.lr-map svg')?.getBoundingClientRect().height>200`);
 await delay(400);const mapInitial=await mapView();await gesture('.lr-map-surface');const mapMoved=await mapView();assert.equal(await evaluate('visualViewport.scale'),1,'Map gesture must not zoom the page');assert(mapMoved.zoom>1.3);assert.notDeepEqual(mapMoved.center,mapInitial.center);
 await clickText('Fit');await delay(100);assert.deepEqual(await mapView(),mapInitial);
 await clickText('＋ Pin a comment');await drag(await point(.5,.5),await point(.6,.4));await wait(`!!document.querySelector('.lr-pointer-actions')`);await gesture('.lr-map-surface',{pin:true});await shot('map-two-finger');
 await drag(await point(.5,.5),await point(.6,.4));await wait(`!!document.querySelector('.lr-pointer-actions')`);await pinAndPost('After two-finger map gesture');
 await cdp('Page.navigate',{url:origin+'/debug?asset=prop/vending'});await wait(`document.querySelector('.lr-model-canvas')?.dataset.ready==='true'`);await clickText('＋ Pin a comment');await gesture('.lr-model-stage',{pin:true,cancel:true});
 assert.deepEqual(errors,[]);console.log('PASS gestures: model/map pinch + pan, stable orbit, remaining-finger lock, pin cancellation, fresh placement, saved/reloaded camera framing, reset/fit and touch cancellation.');
} catch(error){console.error('Browser errors:',errors);await shot('failure').catch(()=>{});throw error;}finally{await send('Target.disposeBrowserContext',{browserContextId});ws.close()}
