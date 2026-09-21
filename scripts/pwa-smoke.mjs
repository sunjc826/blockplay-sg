// Installable-app check: manifest, icons, and whether the built game actually
// runs with no server behind it.
//
// This one serves `dist` itself rather than using `pnpm preview`, because the
// only honest way to test offline play is to stop the server and reload. Run
// `pnpm build` first and start an isolated Chrome with --remote-debugging-port=9226.
// It makes no map, model or companion requests.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const chrome = process.env.PWA_CHROME_ORIGIN || 'http://127.0.0.1:9226';
const port = Number(process.env.PWA_PORT) || 4178;
const origin = `http://127.0.0.1:${port}`;
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
};
let served = 0;
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, origin).pathname);
  if (path.startsWith('/api/')) { // Mirrors the Worker: JSON, never a cached answer.
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ service: 'blockplay-pwa-smoke' })); return;
  }
  let file = dist + path.replace(/^\/+/, '');
  try {
    if ((await stat(file)).isDirectory()) file += 'index.html';
  } catch {
    file = `${dist}index.html`; // SPA fallback, as Cloudflare does.
  }
  try {
    const body = await readFile(file);
    served++;
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('not found');
  }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const stopServer = () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });

const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const task = pending.get(message.id);
    if (task) { pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const next = ++id;
  const timer = setTimeout(() => { pending.delete(next); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
  pending.set(next, { resolve, reject, timer }); ws.send(JSON.stringify({ id: next, method, params }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const wait = async (expression, timeout = 20000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(150); }
  throw new Error(`Timed out waiting for ${expression}`);
};
const reload = async () => {
  await send('Page.navigate', { url: origin });
  await wait(`document.readyState==='complete'`);
};

try {
  await send('Page.enable'); await send('Runtime.enable');
  await wait(`document.readyState==='complete'`);

  // The registration happens on load; claiming the page needs no reload.
  await wait(`!!navigator.serviceWorker.controller`, 30000);
  const scriptUrl = await evaluate(`navigator.serviceWorker.controller.scriptURL`);
  assert.equal(scriptUrl, `${origin}/sw.js`);

  const manifest = await evaluate(`fetch('/manifest.webmanifest').then(r=>r.json())`);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert(manifest.name && manifest.short_name.length <= 12, 'a short name that fits under a home-screen icon');
  assert(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'), 'a maskable icon');
  assert(manifest.icons.some(icon => icon.sizes === '192x192'), 'a 192px icon');
  assert(await evaluate(`!!document.querySelector('link[rel=manifest]') && !!document.querySelector('link[rel=apple-touch-icon]')`), 'linked from the page');

  // Decode every declared icon: a manifest that points at a broken PNG still
  // validates, and installs with a blank tile.
  for (const icon of [...manifest.icons, { src: '/icons/apple-touch-icon.png', sizes: '180x180' }]) {
    const measured = await evaluate(`(async()=>{const i=new Image();i.src=${JSON.stringify(icon.src)};await i.decode();return i.naturalWidth+'x'+i.naturalHeight})()`);
    assert.equal(measured, icon.sizes, `${icon.src} decodes at its declared size`);
  }

  const shellCache = (await evaluate(`caches.keys()`)).find(name => name.startsWith('blockplay-shell-'));
  assert(shellCache, 'the build was precached under a versioned cache name');
  const shell = await evaluate(`caches.open(${JSON.stringify(shellCache)}).then(c=>c.keys()).then(k=>k.map(r=>new URL(r.url).pathname))`);
  assert(shell.includes('/index.html'), 'the app shell document');
  assert(shell.some(path => path.endsWith('.js')) && shell.some(path => path.endsWith('.css')), 'the build output');

  // Media is cached on use, not on install: open the model the FPS range loads.
  await evaluate(`fetch('/models/field-kit/sar21-inspired.glb').then(r=>r.arrayBuffer())`);
  await wait(`caches.open('blockplay-media').then(c=>c.match('/models/field-kit/sar21-inspired.glb')).then(Boolean)`);

  const before = served;
  await stopServer();
  assert.equal((await evaluate(`fetch('/api/health').then(()=>'reached',()=>'offline')`)), 'offline', 'the server is really gone');

  errors.length = 0;
  await reload();
  await wait(`document.querySelector('.brand')?.textContent.includes('blockplaySG')`);
  await wait(`document.querySelectorAll('.mode-card').length>0`);
  assert(await evaluate(`document.querySelectorAll('.location-card').length>=19`), 'every district listed offline');
  // The renderer reached the point of asking for a context, so the 700 kB
  // Three.js chunk was served from the cache. A machine with no WebGL at all
  // shows the same message it would online.
  await wait(`!!document.querySelector('.viewport canvas, .viewport .viewer-message')`);
  const loaded = await evaluate(`performance.getEntriesByType('resource').map(entry=>new URL(entry.name).pathname)`);
  assert(loaded.some(path => /^\/assets\/three-.*\.js$/.test(path)), 'the Three.js chunk loaded offline');

  // A client-side route offline still gets the app shell, and a warmed model
  // still loads, while the companion API correctly reads as unreachable.
  await send('Page.navigate', { url: `${origin}/play/queenstown` });
  await wait(`document.querySelector('.brand')?.textContent.includes('blockplaySG')`);
  assert.equal(await evaluate(`fetch('/models/field-kit/sar21-inspired.glb').then(r=>r.ok?'cached':'error',()=>'error')`), 'cached');
  assert.equal(await evaluate(`fetch('/api/health').then(()=>'reached',()=>'offline')`), 'offline', 'the companion API is never answered from cache');
  assert.deepEqual(errors, [], 'no uncaught errors offline');
  assert.equal(served, before, 'nothing was requested from the server after it stopped');

  console.log('PASS PWA: manifest and icons install-ready, build precached, media cached on use, and the game runs with the server stopped. No map or companion requests.');
} finally {
  ws.close();
  await fetch(`${chrome}/json/close/${tab.id}`).catch(() => {});
  await stopServer().catch(() => {});
}
