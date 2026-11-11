// Run against Vite and Chrome CDP; uses a fresh browser context, never user storage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5178';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9226';
const output = new URL('../.cache/debug-ux/', import.meta.url); await fs.mkdir(output, { recursive: true });
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
async function button(text) { await evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing button '+${JSON.stringify(text)});e.dataset.debugClick='yes'})()`);await click('[data-debug-click=yes]');await evaluate(`document.querySelector('[data-debug-click]')?.removeAttribute('data-debug-click')`); }
async function navigate(route) { await cdp('Page.navigate',{url:origin+'/debug'+route});await delay(250);await wait(`!!document.querySelector('.debug-shell')`); }
async function capture(name) {const r=await cdp('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL(name+'.png',output),Buffer.from(r.data,'base64'));}
async function metrics(label) {return {label,...await evaluate(`(()=>{const r=s=>document.querySelector(s)?.getBoundingClientRect().toJSON();return {pageHeight:document.documentElement.scrollHeight,viewport:innerHeight,workspace:r('.experience'),canvas:r('.lr-map svg,.lr-model-stage,.viewport'),modes:r('.mode-list')}})()`)};}
try {
 await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Page.bringToFront');
 const measured=[];
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await navigate('');await wait(`!!document.querySelector('.lr-map svg')`);assert.equal(await evaluate(`document.querySelector('.debug-shell').dataset.debugTool`),'maps');
 measured.push(await metrics('desktop-map'));await capture('after-desktop-map');
 assert(await evaluate(`document.documentElement.scrollHeight<=innerHeight+1`));
 assert(await evaluate(`document.querySelector('.lr-map svg').getBoundingClientRect().height>400`));
 await click('.lr-more summary');assert(await evaluate(`document.querySelector('.lr-more').open`));await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape'});assert.equal(await evaluate(`document.querySelector('.lr-more').open`),false);
 await click('.lr-local');assert(await evaluate(`document.querySelector('.lr-cloud').open`));await click('.lr-local');
 await click('.debug-resources summary');await button('About & controls');assert(await evaluate(`document.querySelector('dialog').contains(document.activeElement)`));await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape'});assert.equal(await evaluate(`!!document.querySelector('dialog')`),false);

 await button('Focus workspace');assert(await evaluate(`getComputedStyle(document.querySelector('.debug-navigation')).display==='none'`));await button('Show tools');
 await evaluate(`(()=>{const e=document.querySelector('.debug-context select');e.value='queenstown';e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(`location.search.includes('queenstown') && document.querySelector('.lr-map-heading').textContent.includes('Queenstown')`);
 await cdp('Page.reload');await delay(400);await wait(`document.querySelector('.debug-context select')?.value==='queenstown'`);
 await click('.debug-district-search summary');await input('.debug-district-search input','Katong');assert.equal(await evaluate(`document.querySelectorAll('.debug-district-results button').length`),1);await click('.debug-district-results button');assert(await evaluate(`location.search.includes('katong-joo-chiat')`));
 await click('[data-debug-tool] .mode-card:nth-child(2)');await wait(`document.querySelector('.lr-model-canvas')?.dataset.ready==='true'`);assert(await evaluate(`location.search.includes('asset=')`));measured.push(await metrics('desktop-model'));await capture('after-desktop-model');
 await navigate('');await wait(`document.querySelector('.debug-shell')?.dataset.debugTool==='models'`);
 // Mobile canvas is visible immediately, then a new pin moves to its editor.
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await delay(250);
 measured.push(await metrics('mobile-model'));await capture('after-mobile-model');
 assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1 && document.documentElement.scrollHeight<=innerHeight+1`));
 assert(await evaluate(`(()=>{const r=document.querySelector('.lr-model-stage').getBoundingClientRect();return r.top<350&&r.bottom<innerHeight&&r.height>180})()`));
 await clickText('＋ Pin a comment');
 const tap=await evaluate(`(()=>{const r=document.querySelector('.lr-model-canvas canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...tap,id:1}]});await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(`!!document.querySelector('.lr-compose') && document.querySelector('.level-review').dataset.reviewPanel==='discussion'`);
 await wait(`document.activeElement===document.querySelector('.lr-compose input')`);
 await input('.lr-compose input','Keep this draft');await capture('after-mobile-draft');await button('Model');await button('Discussion · 1 · Draft');assert.equal(await evaluate(`document.querySelector('.lr-compose input').value`),'Keep this draft');
 await button('Tools');await click('.mode-card:first-child');await wait(`!!document.querySelector('.navigation-confirm')`);await button('Stay here');assert.equal(await evaluate(`document.querySelector('.lr-compose input').value`),'Keep this draft');
 await click('.mode-card:first-child');await button('Discard draft & leave');await wait(`document.querySelector('.debug-shell').dataset.debugTool==='maps'`);assert.equal(await evaluate(`document.querySelector('.debug-mobile-menu').getAttribute('aria-expanded')`),'false');
 measured.push(await metrics('mobile-map'));await capture('after-mobile-map');
 assert(await evaluate(`document.querySelector('.lr-map svg').getBoundingClientRect().bottom<innerHeight`));
 await button('Discussion · 0');assert(await evaluate(`getComputedStyle(document.querySelector('.lr-discussion')).display!=='none'`));await button('Map');
 // Very narrow and short screens retain local scrolling and reachable controls.
 for(const [width,height] of [[320,568],[844,390],[900,700],[1280,720]]){await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});await delay(150);assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1 && document.documentElement.scrollHeight<=innerHeight+1`));}
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
 // Navigation reaches the existing playtest and equipment surfaces.
 for(const [route,selector] of [['?tool=walk&district=queenstown','.marina-game'],['?tool=fps&district=queenstown','.fps-game'],['?tool=armory','.armory.shop'],['?tool=arena','.lan-lobby']]){await navigate(route);await wait(`!!document.querySelector(${JSON.stringify(selector)})`);assert(await evaluate(`document.querySelector('.mode-card[aria-pressed=true]')?.getBoundingClientRect().bottom<innerHeight`));await capture('after-'+route.split('=')[1].split('&')[0]);}
 await fs.writeFile(new URL('after-metrics.json',output),JSON.stringify(measured,null,2));assert.deepEqual(errors,[]);console.log('PASS debug workspace: immediate canvas, zero page scroll, focused layout, persistent URL/district/model, search, mobile panels/touch, guarded drafts, responsive sizes and playtest/equipment access.');
} catch(error){await capture('failure').catch(()=>{});console.error('Browser errors:',errors);throw error;} finally {await send('Target.disposeBrowserContext',{browserContextId});ws.close()}
