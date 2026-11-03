import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5258', chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9418';
const output = '.cache/navigation-implementation';
await fs.mkdir(output, { recursive: true });
const delay = ms => new Promise(r => setTimeout(r, ms)), reports = [];
const trials = process.env.NAVIGATION_SMOKE_DISTRICT ? [[process.env.NAVIGATION_SMOKE_DISTRICT, false]] : [['queenstown', false], ['marina-bay', false], ['orchard', false], ['queenstown', true]];
for (const [district, blocked] of trials) {
  const tab = await (await fetch(chrome + '/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let sequence = 0; const pending = new Map(), errors = [], requests = [], navigationRequests = new Set(), downloads = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Network.requestWillBeSent' && /\/assets\/navigation-/.test(m.params.request.url)) { requests.push(m.params.request.url); navigationRequests.add(m.params.requestId); }
    if (navigationRequests.has(m.params?.requestId) && ['Network.loadingFailed', 'Network.loadingFinished', 'Network.responseReceived'].includes(m.method)) downloads.push({ event: m.method, status: m.params.response?.status, error: m.params.errorText, bytes: m.params.encodedDataLength });
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('Timeout ' + method)); }, 60000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const wait = async expression => { const start = Date.now(); while (!await ev(expression)) { if (Date.now() - start > 90000) throw Error('Timeout ' + expression); await delay(250); } };
  const click = async expression => {
    const point = await ev(`(()=>{const e=${expression}; e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{...point,id:1}]});
    await delay(80); await send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]}); await delay(250);
  };
  try {
    await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
    await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Network.setBlockedURLs', { urls: ['*maps.googleapis.com*', '*api.elevenlabs.io*', '*/api/adventure/*', ...(blocked ? ['*/assets/navigation-*.json'] : [])] });
    await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Page.bringToFront');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear();localStorage.setItem('blockplay.menu.world',${JSON.stringify(district)});` });
    await send('Page.navigate', { url: origin + '/world' });
    await wait(`!!document.querySelector('.starting-deploy')`); await click(`document.querySelector('.starting-deploy')`);
    await wait(`document.querySelector('.expedition-game')?.dataset.phase==='ready'`);
    const graph = await ev(`JSON.parse(document.querySelector('.expedition-game canvas').dataset.navigationGraph)`);
    console.log(JSON.stringify({ event: 'loaded', district, blocked, graph, requests, downloads, errors }));
    assert.equal(graph.source, blocked ? 'lazy' : 'baked'); assert.equal(graph.rejectedBake, false);
    if (!blocked) { assert.equal(graph.cachedNodes, graph.nodes); assert.equal(graph.validatedConnections, 0); }
    assert.equal(new Set(requests).size, 1); assert(requests.every(url => url.includes('/navigation-' + district + '-')));
    await wait(`!document.querySelector('.play-loading')`);
    await click(`document.querySelector('[data-deployment-id="entry"]')`);
    await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Enter district')`);
    await wait(`document.querySelector('.expedition-game')?.dataset.phase==='playing'`);
    await delay(2000);
    assert.deepEqual(errors, []);
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(`${output}/${district}-${blocked ? 'fallback' : 'baked'}.png`, Buffer.from(screenshot.data, 'base64'));
    const row = { district, blocked, graph, requests, downloads, errors }; reports.push(row); console.log(JSON.stringify(row));
  } finally { ws.close(); await fetch(chrome + '/json/close/' + tab.id).catch(() => {}); }
}
await fs.writeFile(`${output}/browser.json`, JSON.stringify({ passed: true, reports }, null, 2));
