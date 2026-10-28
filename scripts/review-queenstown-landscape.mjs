// Queenstown landscape screenshots. Start Vite and Chrome CDP9223 first.
// Usage: node scripts/review-queenstown-landscape.mjs
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.REGION_APP_ORIGIN || 'http://127.0.0.1:5173';
const chrome = process.env.CHROME_DEBUG_ORIGIN || 'http://127.0.0.1:9223';
const output = '.cache/queenstown-landscape-review';
// Fixed eye-height views compare terrain, pavements and posture-dependent planting.
const detailViews = { queenstown: [
  {view:'overview'},
  {view:'west-path-and-bank',pose:{position:[-214,1.75,-4],target:[-184,2,-26]}},
  {view:'west-garden-footpath',pose:{position:[-218,1.75,84],target:[-185,2.4,110]}},
  {view:'east-residential-bank',pose:{position:[158,1.75,-6],target:[192,2,-32]}},
  {view:'estate-courtyard-relief',pose:{position:[-103,1.75,-63],target:[-67,1.5,-63]}},
  {view:'hdb-pedestrian-links',pose:{position:[-119,1.75,-27],target:[-88,2,-34]}},
  {view:'crouching-shrub-cover',pose:{position:[-196,1.15,-108.5],target:[-196,1,-98]}},
  {view:'standing-shrub-view',pose:{position:[-196,1.75,-108.5],target:[-196,1.75,-98]}},
  {view:'crest-view',pose:{position:[-197,4.55,-26],target:[-149,1.75,-4]}},
] };
async function connect(url) {
  const socket = new WebSocket(url), pending = new Map(), listeners = []; let next = 0;
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.onmessage = event => { const message = JSON.parse(event.data), task = pending.get(message.id);
    if(task) { clearTimeout(task.timer); pending.delete(message.id); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
    else listeners.forEach(fn => fn(message));
  };
  return { listeners, close: () => socket.close(), send: (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  }) };
}
const browser = await connect((await (await fetch(`${chrome}/json/version`)).json()).webSocketDebuggerUrl);
let targetId, page;
const errors = [], captures = []; let googleRequests = 0;
try {
  ({ targetId } = await browser.send('Target.createTarget', { url: 'about:blank' }));
  const targets = await (await fetch(`${chrome}/json`)).json();
  page = await connect(targets.find(t => t.id === targetId).webSocketDebuggerUrl);
  page.listeners.push(message => {
    if(message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if(message.method === 'Network.requestWillBeSent' && /maps\.googleapis\.com|streetviewpixels/.test(message.params.request.url)) googleRequests++;
  });
  await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Network.enable');
  await page.send('Network.setBlockedURLs', { urls: ['*://*.googleapis.com/*', '*://*.google.com/*', '*://streetviewpixels-pa.googleapis.com/*'] });
  // Freeze this review document against Vite hot reload while district files are edited.
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const NativeWebSocket = window.WebSocket; window.WebSocket = class extends NativeWebSocket { constructor(url, protocols) { super(protocols === 'vite-hmr' ? 'ws://127.0.0.1:1/disabled-hmr' : url, protocols); } }; })();` });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url: `${origin}/scripts/pages/district-review.html` });
  const evaluate = async expression => { const result = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if(result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Review evaluation failed'); return result.result.value; };
  let ready = false;
  for(let n=0;n<120;n++) { if(await evaluate('window.reviewReady === true')) { ready=true; break; } if(errors.length) throw new Error(errors.join('; ')); await new Promise(resolve => setTimeout(resolve, 500)); }
  if(!ready) throw new Error('Review page did not become ready');
  const available = await evaluate('window.review.ids'), ids = ['queenstown'];
  if(ids.some(id => !available.includes(id))) throw new Error('Unknown district');
  await mkdir(output, { recursive: true });
  for(const id of ids) {
    const selectedViews = detailViews[id] ?? [];
    for (const { view, pose } of selectedViews) {
    const detail = await evaluate(`window.review.render(${JSON.stringify(id)}, ${JSON.stringify(view)}, ${JSON.stringify(pose)})`);
    const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const file = `${id}-${view.replaceAll(':', '-')}.png`; await writeFile(`${output}/${file}`, Buffer.from(shot.data, 'base64'));
    captures.push({ ...detail, file }); console.log(`${id}: ${view}, ${detail.calls} draw calls`);
  }
    }
  const report = { capturedAt: new Date().toISOString(), googleRequests, errors, captures };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  await writeFile(`${output}/index.html`, `<!doctype html><meta charset="utf-8"><title>District render review</title><style>body{font:16px system-ui;background:#eef2f3;padding:20px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}img{width:100%}figure{margin:0}</style><h1>Queenstown landscape review</h1><p>The overview and eye-height views inspect footpath continuity, terrain and low planting. Street views retain scene fog. These are authored gameplay adaptations, with no live Google imagery.</p><main>${captures.map(c => `<figure><a href="${c.file}"><img src="${c.file}"></a><figcaption>${c.id} · ${c.view}</figcaption></figure>`).join('')}</main>`);
  if(errors.length || googleRequests) throw new Error(`Review failed: ${errors.length} errors, ${googleRequests} Google requests`);
} finally { page?.close(); if(targetId) await browser.send('Target.closeTarget', { targetId }); browser.close(); }
