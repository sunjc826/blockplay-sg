// Records every shader program a range load links, for the menu's warm-up
// (`src/game/shader-warm.ts`) to compile before the player picks a district.
//
// Run after a build: it serves `dist` itself, starts its own headless Chrome on
// the software renderer, loads the range in a few districts, and writes
// `dist/shader-warm.json`. The deploy workflow runs it between the build and
// the upload, so the list always matches the code it ships with; nothing is
// committed. A missing or stale list costs speed, never correctness: a program
// the list lacks is compiled during the load as it always was.
//
//   node --experimental-strip-types scripts/capture-shader-manifest.mjs
//
// SHADER_DISTRICTS  comma-separated district ids (default below)
// SHADER_OUT        output file (default dist/shader-warm.json)
// CHROME_BIN        Chrome or Chromium binary
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packShaders } from '../src/game/shader-manifest.ts';

// The city core links the most programs; a heartland and a heritage district add what it lacks.
const districts = (process.env.SHADER_DISTRICTS || 'marina-bay,bishan,chinatown').split(',').map(id => id.trim()).filter(Boolean);
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const out = process.env.SHADER_OUT || `${dist}shader-warm.json`;
const LOAD_TIMEOUT_MS = Number(process.env.SHADER_LOAD_TIMEOUT_MS) || 300_000;
if (!existsSync(`${dist}index.html`)) { console.error('capture-shader-manifest: no dist/index.html. Build first.'); process.exit(1); }

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
};
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (path.startsWith('/api/')) { response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}'); return; }
  // No worker: it would cache this build under an origin the next run reuses.
  if (path === '/sw.js') { response.writeHead(404).end(); return; }
  let file = dist + path.replace(/^\/+/, '');
  try { if ((await stat(file)).isDirectory()) file += 'index.html'; } catch { file = `${dist}index.html`; }
  try { response.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const binary = process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
if (!binary) { console.error('capture-shader-manifest: no Chrome found. Set CHROME_BIN.'); process.exit(1); }
const profile = await mkdtemp(join(tmpdir(), 'shader-capture-'));
const chrome = spawn(binary, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-proxy-server', '--no-sandbox',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,760', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
const cleanup = async () => { chrome.kill(); server.closeAllConnections(); server.close(); await rm(profile, { recursive: true, force: true }).catch(() => {}); };
const fail = async message => { console.error(`capture-shader-manifest: ${message}`); await cleanup(); process.exit(1); };

// Port 0 has Chrome pick a free one and print it, so two captures never collide.
const endpoint = await new Promise((resolve, reject) => {
  let log = '';
  chrome.stderr.on('data', chunk => { log += chunk; const match = log.match(/DevTools listening on (ws:\/\/\S+)/); if (match) resolve(match[1]); });
  chrome.on('exit', code => reject(new Error(`Chrome exited (${code}) before listening:\n${log.slice(-600)}`)));
  setTimeout(() => reject(new Error('Chrome did not start within 30 s')), 30_000);
}).catch(error => fail(error.message));

const socket = new WebSocket(endpoint);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error('DevTools socket failed')); }).catch(error => fail(error.message));
let nextId = 0; const pending = new Map();
socket.onmessage = event => { const message = JSON.parse(event.data); pending.get(message.id)?.(message); pending.delete(message.id); };
const send = (method, params = {}, sessionId) => new Promise(resolve => { const id = ++nextId; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params, sessionId })); });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Runs before the page's own scripts. Records each program at link time, when
// both of its shaders are attached, and the extensions the renderer enabled.
const HOOK = `(() => {
  window.__noShaderWarm = true;
  const P = WebGL2RenderingContext.prototype, link = P.linkProgram, extension = P.getExtension;
  const seen = new Set(); window.__shaderPairs = []; window.__shaderExtensions = [];
  P.getExtension = function (name) { const got = extension.call(this, name); if (got && !window.__shaderExtensions.includes(name)) window.__shaderExtensions.push(name); return got; };
  P.linkProgram = function (program) {
    const pair = {};
    for (const shader of this.getAttachedShaders(program) || []) pair[this.getShaderParameter(shader, this.SHADER_TYPE) === this.VERTEX_SHADER ? 'vertex' : 'fragment'] = this.getShaderSource(shader);
    const key = pair.vertex + '\\u0000' + pair.fragment;
    if (pair.vertex && pair.fragment && !seen.has(key)) { seen.add(key); window.__shaderPairs.push(pair); }
    return link.call(this, program);
  };
})()`;

const pairs = [], extensions = new Set();
for (const district of districts) {
  const started = Date.now();
  const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
  const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
  const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result?.result?.value;
  await send('Page.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK }, sessionId);
  await send('Page.navigate', { url: `${origin}/debug?tool=fps&district=${encodeURIComponent(district)}` }, sessionId);
  let state = '';
  while (Date.now() - started < LOAD_TIMEOUT_MS) {
    await delay(500);
    // The page blocks for seconds at a time while it builds the world; an answer that does not come is not a failure.
    state = await Promise.race([evaluate(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 3000)`), delay(400).then(() => state)]) ?? state;
    if (/Enter range|Range unavailable/.test(state)) break;
  }
  if (!/Enter range/.test(state)) await fail(`${district} did not reach the range within ${LOAD_TIMEOUT_MS / 1000} s: ${state.slice(0, 200) || '(no page text)'}`);
  await delay(2000); // Passes that link on their first frame after the load.
  const count = await evaluate('window.__shaderPairs.length');
  // One at a time: a single message with every source is tens of megabytes.
  for (let index = 0; index < count; index++) pairs.push(JSON.parse(await evaluate(`JSON.stringify(window.__shaderPairs[${index}])`)));
  for (const name of JSON.parse(await evaluate('JSON.stringify(window.__shaderExtensions)'))) extensions.add(name);
  await send('Target.closeTarget', { targetId });
  console.log(`${district}: ${count} programs in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}

const manifest = packShaders(pairs, [...extensions]);
if (!manifest.programs.length) await fail('no programs were recorded');
const body = JSON.stringify(manifest);
await writeFile(out, body);
console.log(`${manifest.programs.length} distinct programs, ${manifest.lines.length} distinct lines, ${(body.length / 1e6).toFixed(2)} MB -> ${out} (id ${manifest.id})`);
await cleanup();
