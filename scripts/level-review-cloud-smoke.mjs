// Two isolated browsers, one private verification board. Never writes real discussions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5178';
const apiOrigin = process.env.LEVEL_REVIEW_API_ORIGIN || origin;
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9226';
const root = new URL('../', import.meta.url), output = new URL('.cache/level-review-cloud/', root); await fs.mkdir(output, { recursive: true });
const token = process.env.LEVEL_REVIEW_TOKEN || (await fs.readFile(new URL('.env.level-review', root), 'utf8')).match(/^LEVEL_REVIEW_TOKEN=([a-f0-9]{64})$/m)?.[1];
assert(token && /^[a-f0-9]{64}$/.test(token), 'Private verification access is configured');
const assets = process.argv.includes('--assets');
const collection = assets ? 'asset' : 'level';
const endpoint = apiOrigin + `/api/${collection}-review/verification`;
async function api(body, access = token) {
  const response = await fetch(endpoint, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${access}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
assert.equal((await api(undefined, 'b'.repeat(64))).status, 401);
assert.equal((await fetch(endpoint)).status, 401);
const base = await api(); assert.equal(base.status, 200);
const id = 'smoke-' + crypto.randomUUID();
const template = base.data.document.threads.find(t => t.id === (assets ? 'vending-surface-intent' : 'marina-islet-access')); assert(template);
const thread = { ...template, id, title: 'Cloud verification ' + id.slice(-8), kind: 'discussion', anchor: { ...template.anchor, x: assets ? 0 : 45 }, events: [{ id: crypto.randomUUID(), at: new Date().toISOString(), author: 'ai', body: 'Verification board only: test shared comments and offline recovery.' }] };
const payload = events => ({ format: `blockplay-${collection}-review`, version: 1, threads: [{ ...thread, events }] });
assert.equal((await api(payload(thread.events))).status, 200);
const concurrent = ['one', 'two'].map(name => ({ id: `${id}-${name}`, at: new Date().toISOString(), author: 'ai', body: `Concurrent ${name}` }));
await Promise.all(concurrent.map(event => api(payload([...thread.events, event]))));
const after = await api(); assert.equal(after.data.document.threads.find(t => t.id === id).events.length, 3);
const replay = await api(payload([...thread.events, concurrent[0]])); assert.equal(replay.data.revision, after.data.revision);
const corrupt = payload(thread.events); corrupt.threads[0].title = 'Conflicting immutable title';
assert.equal((await api(corrupt)).status, 409);

const browser = await (await fetch(`${chrome}/json/version`)).json();
const ws = new WebSocket(browser.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let serial = 0; const pending = new Map(), contexts = [], errors = [];
ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
function send(method, params = {}, sessionId) { return new Promise((resolve, reject) => { const id = ++serial; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params, sessionId })); }); }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function client() {
  const { browserContextId } = await send('Target.createBrowserContext'); contexts.push(browserContextId);
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = async expression => { const until = Date.now() + 30000; while (Date.now() < until) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); };
  const click = async selector => { await cdp('Page.bringToFront'); const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing element');e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); await delay(100); };
  const button = async text => { await evaluate(`(()=>{document.querySelector('[data-cloud-smoke]')?.removeAttribute('data-cloud-smoke');const e=[...document.querySelectorAll('.level-review button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing button');e.dataset.cloudSmoke='target'})()`); await click('[data-cloud-smoke="target"]'); };
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `${origin}/debug?${assets ? 'asset=prop/vending' : 'review=marina-bay'}&reviewCloudTest=1&thread=${id}#review-key=${token}` });
  await wait(`document.querySelector('[data-cloud-status]')?.textContent.includes('Cloud saved')`);
  assert.equal(await evaluate('location.hash'), '', 'Private fragment removed after connecting');
  await wait(`document.querySelector('.lr-thread h3')?.textContent===${JSON.stringify(thread.title)}`);
  return { cdp, evaluate, wait, click, button };
}
try {
  const a = await client(), b = await client();
  const reply = async (client, body) => { await client.click('.lr-thread textarea'); await client.cdp('Input.insertText', { text: body }); await client.button('Reply'); };
  await reply(a, 'Device A shared response');
  await a.wait(`document.querySelector('[data-cloud-status]')?.textContent.includes('Cloud saved')`);
  await b.click('.lr-cloud summary'); await b.button('Sync now');
  await b.wait(`document.querySelector('.lr-messages')?.textContent.includes('Device A shared response')`);
  // Drop the network on A, save a reply, and independently append from B.
  await a.cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await reply(a, 'Device A offline response');
  await a.wait(`document.querySelector('[data-cloud-status]')?.textContent.includes('Offline')`);
  assert((await a.evaluate(`localStorage.getItem('blockplay.${collection}-review.v1.verification')`)).includes('Device A offline response'));
  await reply(b, 'Device B concurrent response');
  await b.wait(`document.querySelector('[data-cloud-status]')?.textContent.includes('Cloud saved')`);
  await a.cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await a.click('.lr-cloud summary'); await a.button('Sync now');
  await a.wait(`document.querySelector('[data-cloud-status]')?.textContent.includes('Cloud saved') && document.querySelector('.lr-messages')?.textContent.includes('Device B concurrent response')`);
  await b.button('Sync now'); await b.wait(`document.querySelector('.lr-messages')?.textContent.includes('Device A offline response')`);
  const saved = (await api()).data.document.threads.find(t => t.id === id);
  assert.equal(saved.events.length, 6); // original + two concurrent API replies + three UI replies
  await b.cdp('Page.reload'); await b.wait(`document.querySelector('[data-cloud-status]')?.textContent.includes('Cloud saved')`);
  await b.wait(`document.querySelector('.lr-messages')?.textContent.includes('Device A offline response')`);
  await b.evaluate(`document.querySelector('.level-review').scrollIntoView({block:'start',behavior:'instant'})`); await delay(200);
  const shot = await b.cdp('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${collection}-cloud-synced.png`, output), Buffer.from(shot.data, 'base64'));
  await b.click('.lr-cloud summary'); await b.button('Disconnect');
  await b.wait(`document.querySelector('[data-cloud-status]')?.textContent==='Browser only'`);
  assert.equal(await b.evaluate(`localStorage.getItem('blockplay.level-review.access.v1')`), null);
  assert.equal((await api()).data.document.threads.find(t => t.id === id).events.length, 6, 'Disconnect retains cloud history');
  assert.deepEqual(errors, []);
  console.log('PASS cloud review: private auth, bounded atomic merges, idempotent retries, isolated verification board, two browsers, offline outbox, concurrent replies, reload and disconnect.');
} finally { for (const browserContextId of contexts) await send('Target.disposeBrowserContext', { browserContextId }); ws.close(); }
