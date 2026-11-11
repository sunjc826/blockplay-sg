// Run against Vite and Chrome CDP; uses a fresh browser context, never user storage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5178';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9226';
const output = new URL('../.cache/review-pointer/', import.meta.url); await fs.mkdir(output, { recursive: true });
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
async function upload(data) {
  const path = new URL('import.json', output); await fs.writeFile(path, JSON.stringify(data));
  const { root } = await cdp('DOM.getDocument'); const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '.level-review input[type=file]' });
  await cdp('DOM.setFileInputFiles', { nodeId, files: [path.pathname] }); await delay(200);
}
async function drag(from,to,{cancel=false}={}) {
 await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
 for(let i=1;i<=8;i++){await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8,id:1}]});await delay(20);}
 assert.equal(await evaluate(`!!document.querySelector('.lr-compose')`),false,'Dragging does not open an editor');
 await cdp('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await delay(150);
}
const point=async(x,y)=>evaluate(`(()=>{const r=document.querySelector('.lr-placement').getBoundingClientRect();return {x:r.x+r.width*${x},y:r.y+r.height*${y}}})()`);
async function pinAndPost(title){assert.equal(await evaluate(`!!document.querySelector('.lr-compose')`),false);await clickText('Pin here');await wait(`!!document.querySelector('.lr-compose') && document.querySelector('.level-review').dataset.reviewPanel==='discussion'`);await input('.lr-compose input',title);await input('.lr-compose textarea','Pointer release verification.');await clickText('Post comment');}
try {
 await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Page.bringToFront');await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await cdp('Page.navigate',{url:origin+'/debug?asset=prop/vending'});await wait(`document.querySelector('.lr-model-canvas')?.dataset.ready==='true'`);
 await clickText('＋ Pin a comment');await wait(`!!document.querySelector('.lr-placement')`);assert.equal(await evaluate(`!!document.querySelector('.lr-pointer-actions')`),false,'Initial center is not preselected');
 const view=await evaluate(`document.querySelector('.lr-model-canvas').dataset.view`);
 const a=await point(.5,.5),b=await point(.42,.34);
 await drag(a,b);await wait(`!!document.querySelector('.lr-pointer-actions')`);
 assert.equal(await evaluate(`document.querySelector('.lr-model-canvas').dataset.view`),view,'Positioning does not rotate the model');
 const position=await evaluate(`(()=>{const r=document.querySelector('.lr-pointer-handle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 assert(Math.abs(position.x-b.x)<2 && Math.abs(position.y-b.y)<2,'Cursor follows off-center release point');
 await shot('model-release');await pinAndPost('Upper surface');
 const first=await evaluate(`JSON.parse(localStorage.getItem('blockplay.asset-review.v1')).threads.find(t=>t.title==='Upper surface')`);assert(first.anchor.surface);assert.deepEqual(first.anchor.surface.view,JSON.parse(view));
 await clickText('＋ Pin a comment');await drag(await point(.5,.5),await point(.59,.64));await wait(`!!document.querySelector('.lr-pointer-actions')`);await pinAndPost('Lower surface');
 const second=await evaluate(`JSON.parse(localStorage.getItem('blockplay.asset-review.v1')).threads.find(t=>t.title==='Lower surface')`);assert.notDeepEqual(second.anchor,first.anchor,'Distinct release points save distinct surface anchors');
 await clickText('＋ Pin a comment');await drag(await point(.5,.5),await point(.42,.34));await wait(`!!document.querySelector('.lr-pointer-actions')`);
 await drag(await point(.42,.34),await point(.03,.8));assert.equal(await evaluate(`!!document.querySelector('.lr-pointer-actions')`),false,'Background release clears previous valid choice');
 await drag(await point(.5,.5),await point(.42,.34),{cancel:true});assert.equal(await evaluate(`!!document.querySelector('.lr-pointer-actions')`),false,'Interrupted touch cannot commit');
 await clickText('Move view');assert.equal(await evaluate(`!!document.querySelector('.lr-placement')`),false);const rect=await evaluate(`document.querySelector('.lr-model-canvas canvas').getBoundingClientRect().toJSON()`);await drag({x:rect.x+rect.width*.5,y:rect.y+rect.height*.5},{x:rect.x+rect.width*.7,y:rect.y+rect.height*.5});assert.notEqual(await evaluate(`document.querySelector('.lr-model-canvas').dataset.view`),view,'Explicit view mode still orbits');
 await clickText('Position pin');assert.equal(await evaluate(`!!document.querySelector('.lr-pointer-actions')`),false,'Changing the view invalidates old placement');await clickText('＋ Cancel pin');
 // The map uses the same release-and-confirm gesture, with actual world coordinates.
 await cdp('Page.navigate',{url:origin+'/debug?review=marina-bay'});await wait(`document.querySelector('.lr-map svg')?.getBoundingClientRect().height>200`);await clickText('＋ Pin a comment');const start=await point(.5,.5),end=await point(.63,.37);await drag(start,end);await wait(`!!document.querySelector('.lr-pointer-actions')`);await shot('map-release');await pinAndPost('Offset map point');
 const mapThread=await evaluate(`JSON.parse(localStorage.getItem('blockplay.level-review.v1')).threads.find(t=>t.title==='Offset map point')`);assert(mapThread.anchor.x!==0 || mapThread.anchor.z!==0);
 // Desktop and keyboard get the same explicit confirmation, without requiring touch.
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});await clickText('＋ Pin a comment');await evaluate(`document.querySelector('.lr-pointer-handle').focus()`);await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight'});await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter'});await wait(`!!document.querySelector('.lr-pointer-actions')`);assert.equal(await evaluate(`!!document.querySelector('.lr-compose')`),false);await clickText('Pin here');await wait(`!!document.querySelector('.lr-compose')`);
 assert.deepEqual(errors,[]);console.log('PASS pointer: off-center touch drag/release, explicit confirmation, two distinct saved 3D surfaces, fixed camera, misses/cancel, view mode, map placement and keyboard confirmation.');
} catch(error){console.error('Browser errors:',errors);await shot('failure').catch(()=>{});throw error;}finally{await send('Target.disposeBrowserContext',{browserContextId});ws.close()}
