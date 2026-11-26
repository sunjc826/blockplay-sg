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
import { CAST_CONTENT_TYPE, CAST_PCM, CAST_STALE_MS } from '../src/game/cast-wire.ts';
import { exampleHud } from '../src/game/cast-test-fixture.ts';

const root = resolve(import.meta.dirname,'..');
const temp = await mkdtemp(join(tmpdir(),'blockplay-voice-'));
const key = 'local-voice-check', line = 'Testing the cast stream.', personaId = 'coach';
let upstreamCalls = 0, modelCalls = 0, mode = 'line';
const disconnected = Promise.withResolvers(), sendAudio = Promise.withResolvers(), sendTail = Promise.withResolvers();
const provider = createServer(async (req,res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks));
  if (req.url === '/v1/responses' && req.headers.authorization === 'Bearer local-model') {
    modelCalls++;
    if (mode === 'slow') await delay(CAST_STALE_MS + 100);
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({say:mode !== 'silent',line})}]}]}));
    return;
  }
  if (req.method !== 'POST' || !req.url.endsWith('/stream?output_format=pcm_24000') ||
      req.headers['xi-api-key'] !== key || body.text !== line) {
    res.writeHead(400).end(); return;
  }
  upstreamCalls++;
  res.writeHead(200,{'Content-Type':'application/octet-stream'});
  if (mode === 'disconnect') {
    res.once('close',disconnected.resolve);
    res.write(Buffer.alloc(4800,1));
    return;
  }
  await sendAudio.promise;
  res.write(Buffer.alloc(4800,1));
  await sendTail.promise;
  res.end(Buffer.alloc(4800,2));
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
  const base = 'http://127.0.0.1:'+providerPort;
  config.vars = {ELEVENLABS_API_KEY:key,ELEVENLABS_BASE_URL:base,CAST_PROVIDER:'openai',OPENAI_API_KEY:'local-model',OPENAI_BASE_URL:base+'/v1'};
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

  const post = (signal=AbortSignal.timeout(12000)) => get('/api/ai/commentary',{
    method:'POST',signal,headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify({spoken:true,personaId,clean:true,mode:'range',regionId:'changi',memory:[],events:[],snapshot:exampleHud}),
  });
  const status = async () => (await get('/api/ai/status',{headers:{Origin:origin}})).json();
  async function header(response) {
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),CAST_CONTENT_TYPE);
    const reader = response.body.getReader();
    let prefix = Buffer.alloc(0);
    while (prefix.length < 4 || prefix.length < 4+prefix.readUInt32BE()) {
      const chunk = await reader.read();
      assert(!chunk.done,'Incomplete cast header');
      prefix = Buffer.concat([prefix,chunk.value]);
    }
    const end = 4+prefix.readUInt32BE();
    const reply = JSON.parse(prefix.subarray(4,end));
    assert.equal(reply.line,line);
    assert.equal(reply.pcm,CAST_PCM);
    return {reader,tail:prefix.subarray(end)};
  }
  const first = await header(await post());
  assert.equal(first.tail.length,0);
  sendAudio.resolve();
  const chunk = await first.reader.read();
  assert(chunk.value?.length);
  sendTail.resolve();
  const pcm = [chunk.value];
  for (;;) {
    const next = await first.reader.read();
    if (next.done) break;
    pcm.push(next.value);
  }
  assert.deepEqual(Buffer.concat(pcm),Buffer.concat([1,2].map(i=>Buffer.alloc(4800,i))));
  for (mode of ['silent','slow']) {
    const response = await post();
    assert.equal(response.headers.get('content-type'),'application/json');
    assert.equal((await response.json()).line,mode === 'silent' ? null : line);
    const usage = await status();
    assert.equal(usage.voice.quota.used,line.length);
    assert.equal(usage.quota.used,modelCalls);
    assert.equal(upstreamCalls,1);
  }
  mode = 'disconnect';
  const abort = new AbortController();
  const hanging = await header(await post(AbortSignal.any([abort.signal,AbortSignal.timeout(10000)])));
  if (!hanging.tail.length) assert((await hanging.reader.read()).value?.length);
  abort.abort();
  const hangUp = await Promise.race([disconnected.promise.then(()=>'propagated'), delay(2000).then(()=>'not propagated within 2 s')]);
  console.log(`PASS Worker: caption before speech, incremental PCM intact, one real-length charge, silent and slow turns caption-only, worklet served. Client hang-up ${hangUp}.`);
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
