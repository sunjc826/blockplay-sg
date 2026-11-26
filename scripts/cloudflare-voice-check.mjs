// Uses the real Worker entry, fresh local Durable Objects and disposable test
// credentials. Run pnpm build:cloudflare first to supply the production assets.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { voiceTickets } from '../server/tts/tickets.ts';

const root = resolve(import.meta.dirname,'..');
const temp = await mkdtemp(join(tmpdir(),'blockplay-voice-'));
const key = 'local-voice-check', line = 'Testing the cast stream.', personaId = 'coach';
let upstreamCalls = 0, lastSent = 0;
const disconnected = Promise.withResolvers();
const provider = createServer(async (req,res) => {
  upstreamCalls++;
  if (req.method !== 'POST' || !req.url.endsWith('/stream?output_format=pcm_24000') || req.headers['xi-api-key'] !== key) {
    res.writeHead(400).end(); return;
  }
  for await (const _ of req) { /* Drain the request before trickling the line. */ }
  res.writeHead(200,{'Content-Type':'application/octet-stream'});
  if (upstreamCalls === 2) {
    res.once('close',disconnected.resolve);
    res.write(Buffer.alloc(4800,1));
    return;
  }
  for (let i=1;i<=3;i++) {
    if (i>1) await delay(300);
    if (i===3) lastSent = performance.now();
    res.write(Buffer.alloc(4800,i));
  }
  res.end();
});
async function listen(server) {
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  return server.address().port;
}
let child;
try {
  const providerPort = await listen(provider);
  const reserve = createServer(), port = await listen(reserve);
  await new Promise(resolve => reserve.close(resolve));
  const origin = 'http://127.0.0.1:'+port;
  const config = JSON.parse(await readFile(join(root,'wrangler.jsonc'),'utf8'));
  const assets = join(root,config.assets.directory);
  const files = await readdir(join(assets,'assets'));
  const worklet = files.find(name => /^cast-pcm-worklet-.*\.js$/.test(name));
  assert(worklet,'Build the assets with pnpm build:cloudflare first.');
  // A config and cwd outside the checkout keep Wrangler away from private
  // dotfiles, remote bindings and existing preview/development usage counters.
  config.main = resolve(root,config.main);
  config.assets.directory = assets;
  config.vars = {ELEVENLABS_API_KEY:key,ELEVENLABS_BASE_URL:'http://127.0.0.1:'+providerPort};
  delete config.account_id;
  await writeFile(join(temp,'wrangler.json'),JSON.stringify(config));
  child = spawn(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'dev','--local','--ip','127.0.0.1',
    '--port',String(port),'--config',join(temp,'wrangler.json'),'--persist-to',join(temp,'state')],{
    cwd:temp, stdio:['ignore','pipe','pipe'], env:{PATH:process.env.PATH,HOME:temp,CI:'1',NO_PROXY:'127.0.0.1,localhost',
      WRANGLER_SEND_METRICS:'false',CLOUDFLARE_CF_FETCH_ENABLED:'false',CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'false'},
  });
  let diagnostics='';
  const record = chunk => { diagnostics=(diagnostics+chunk).slice(-3000); };
  child.stdout.on('data',record); child.stderr.on('data',record);
  const get = (path,init) => fetch(origin+path,{signal:AbortSignal.timeout(10000),...init});
  let ready = false;
  for (let i=0;i<150 && child.exitCode===null;i++) {
    if (await get('/api/health').then(async r => r.ok && (await r.json()).service==='blockplay-cloudflare',()=>false)) {
      ready = true; break;
    }
    await delay(200);
  }
  assert(ready,'Local Wrangler did not start. '+diagnostics);
  const asset = await get('/assets/'+worklet);
  assert.equal(asset.status,200);
  assert.match(asset.headers.get('Content-Type'),/javascript/);
  assert.match(await asset.text(),/registerProcessor\(/);

  const ticket = voiceTickets(key).issue(personaId,line);
  const post = (redemption=ticket,signal=AbortSignal.timeout(10000)) => get('/api/ai/voice',{
    method:'POST',signal,headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify({line,personaId,ticket:redemption}),
  });
  const start = performance.now(), res = await post();
  assert.equal(res.status,200); assert.equal(res.headers.get('content-type'),'audio/pcm');
  assert.equal(res.headers.get('x-cast-pcm'),'s16le;rate=24000;channels=1');
  assert.equal(JSON.parse(res.headers.get('x-cast-voice')).quota.used,line.length);
  const reader = res.body.getReader(), first = await reader.read(), firstAt = performance.now();
  assert(first.value?.length && !lastSent,'The Worker buffered the response.');
  const chunks = [first.value];
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    chunks.push(chunk.value);
  }
  assert(lastSent-firstAt>=200,'First bytes should precede the final send by at least 200 ms.');
  assert.deepEqual(Buffer.concat(chunks),Buffer.concat([1,2,3].map(i=>Buffer.alloc(4800,i))));
  const replay = await post(), denial = await replay.json();
  assert.equal(replay.status,429); assert.equal(denial.error,'Voice ticket expired or used');
  assert.equal(denial.voice.quota.used,line.length); assert.equal(upstreamCalls,1);
  // A fresh accepted stream remains open until the HTTP client hangs up.
  const abort = new AbortController();
  const pending = await post(voiceTickets(key).issue(personaId,line),AbortSignal.any([abort.signal,AbortSignal.timeout(10000)]));
  assert.equal(pending.status,200);
  assert((await pending.body.getReader().read()).value?.length);
  abort.abort();
  // Reported, not required. Under `wrangler dev` a client hang-up does not reach the Node
  // response's 'close' event through handleAsNodeRequest (seen 2026-11-26: not within 12 s), so the
  // provider call runs on until it ends or the adapter's own timeout. A real line is delivered in
  // under a second, so the cost is small; whether the deployed runtime behaves the same is unknown.
  const hangUp = await Promise.race([disconnected.promise.then(()=>'propagated'), delay(2000).then(()=>'NOT propagated within 2 s')]);
  console.log(`PASS Worker PCM. First bytes at ${Math.round(firstAt-start)} ms, last sent at ${Math.round(lastSent-start)} ms, one charge for the replayed line, replay refused, worklet served. Client hang-up: ${hangUp}.`);
} finally {
  if (child && child.exitCode===null && child.signalCode===null) {
    const exit = once(child,'exit');
    child.kill('SIGTERM');
    const force = setTimeout(()=>child.kill('SIGKILL'),5000);
    try { await exit; } finally { clearTimeout(force); }
  }
  provider.closeAllConnections();
  if (provider.listening) await new Promise(resolve => provider.close(resolve));
  await rm(temp,{recursive:true,force:true});
}
