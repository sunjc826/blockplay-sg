import { CAST_CONTENT_TYPE, CAST_LINE_MAX, CAST_PCM, CAST_STALE_MS } from '../src/game/cast-wire.ts';
import { modelEndpoints } from './ai-endpoints.ts';
import { selectSpeech } from './tts/index.ts';
import { SpeechError } from './tts/types.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { selectModel, type Env } from './llm/index.ts';
import { ProviderError } from './llm/types.ts';
import { adminCookie, caller, matches } from './ai-admin.ts';
import { memoryLimits, TRANSIENT_REASONS, type LimitStore, type Action, type Decision } from './ai-limits.ts';

export function createAiHandler(env: Env, fetcher = fetch, store: LimitStore = memoryLimits(env), cloud = false) {
  const adminToken = env.AI_ADMIN_TOKEN || env.AI_ADMIN_KEY;
  const speech = selectSpeech(env,fetcher);
  const models = { STREAMER:selectModel(env,'STREAMER',fetcher), CAST:selectModel(env,'CAST',fetcher), PILOT:selectModel(env,'PILOT',fetcher) };
  return async (req: IncomingMessage, res: ServerResponse, originAllowed: (req: IncomingMessage) => boolean, clientSignal?: AbortSignal) => {
    const endpoint = modelEndpoints.get(req.url ?? ''), planning = endpoint?.feature === 'PILOT';
    const model = models[endpoint?.feature ?? 'CAST'];
    const send = (status: number, data: object, headers = {}) => {
      res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers}); res.end(JSON.stringify(data));
    };
    // Same-origin GET fetches omit Origin. Derive it from the browser's Referer only for this read.
    if (req.method === 'GET' && !req.headers.origin && req.headers.referer) {
      try { req.headers.origin = new URL(req.headers.referer).origin; } catch { /* denied below */ }
    }
    if (!originAllowed(req)) return send(403,{error:'Unexpected origin'});
    const id = caller(req,cloud,adminToken), lease = randomUUID();
    const check = (action: Action) => store({...id,action,lease});
    try {
      let decision: Decision;
      const voiceStatus = (characters = 1) => {
        const {voiceQuota:quota, voiceRemaining:remaining, voiceBlockedUntil} = decision;
        const reason = !speech || voiceBlockedUntil > Date.now() ? 'Voice provider unavailable' : remaining < characters ? 'Voice character limit reached' : undefined;
        return {available: !reason, quota, remaining, reason};
      };
      const reply = async (code: number,data: object,headers = {}) => {
        // Early validation errors and status requests still carry accounting.
        decision ??= await check('status');
        send(code,{...data,quota:decision.quota,voice:voiceStatus()},headers);
      };
      const status = { available: !!model.complete, provider:model.provider, model:model.model, admin:id.admin,
        streamer:{available:!!models.STREAMER.complete, provider:models.STREAMER.provider, model:models.STREAMER.model} };
      if (req.method === 'GET' && req.url === '/api/ai/status') return await reply(200,status);
      if (req.method !== 'POST') return await reply(405,{error:'POST required'});
      const localHosts = ['localhost','127.0.0.1','[::1]'];
      const origin = new URL(req.headers.origin!);
      const host = req.headers.host ? new URL('http://'+req.headers.host).hostname : origin.hostname;
      const local = localHosts.includes(host) && localHosts.includes(origin.hostname);
      const cookie = (logout = false) => ({'Set-Cookie':adminCookie(adminToken ?? '',local,logout)});
      if (req.url === '/api/ai/admin/logout') {
        decision = await store({...id,admin:false,action:'status'});
        return await reply(200,{...status,admin:false},cookie(true));
      }
      const login = req.url === '/api/ai/admin/login';
      if (!login && !endpoint) return await reply(404,{error:'Unknown AI endpoint'});
      if (planning && env.ADVENTURE_ENABLED === 'false') return await reply(503,{error:'Pilot is disabled.'});
      if (login ? !adminToken : !model.complete) return await reply(503,{error:login ? 'Admin sign-in is unavailable.' : 'Model provider is unavailable.'});
      if (req.headers['content-type']?.split(';')[0] !== 'application/json' || (req.headers['content-encoding'] ?? 'identity') !== 'identity') return await reply(415,{error:'JSON required'});
      const cap = endpoint?.bodyLimit ?? 4096;
      if (Number(req.headers['content-length']) > cap) return await reply(413,{error:'Request too large'});
      let bytes = 0;
      const chunks: Buffer[] = [], timer = setTimeout(() => req.destroy(),10000);
      try {
        for await (const chunk of req) {
          const buf = Buffer.from(chunk); bytes += buf.length;
          if (bytes > cap) return await reply(413,{error:'Request too large'});
          chunks.push(buf);
        }
      } finally { clearTimeout(timer); }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return await reply(400,{error:'Invalid JSON'}); }
      const valid = login && typeof body?.passphrase === 'string' && Object.keys(body).length === 1 && matches(body.passphrase,adminToken!);
      // Speech is transport metadata: it never reaches the model as data. It only selects the spoken-line rule.
      const wantsVoice = !planning && !login && body?.spoken === true;
      if (endpoint && !planning && body && typeof body === 'object' && 'spoken' in body) {
        if (typeof body.spoken !== 'boolean') return await reply(400,{error:'Invalid game observation'});
        delete body.spoken;
      }
      const run = endpoint?.prepare(body,wantsVoice && !!speech);
      if (endpoint && !run) return await reply(400,{error:'Invalid game observation'});
      const started = Date.now();
      decision = login ? await check(valid ? 'login-good' : 'login-bad')
        : await store({...id,lease,action:'accept',reserveVoice:wantsVoice && !!speech});
      if (decision.reason) return await reply(429,{error:decision.reason,resetsAt:decision.resetsAt,...(TRANSIENT_REASONS.includes(decision.reason) && {transient:true})},{'Retry-After':String(Math.max(1,Math.ceil((decision.resetsAt!-Date.now())/1000)))});
      if (login) {
        if (!valid) return await reply(401,{error:'Incorrect passphrase'});
        decision = await store({...id,admin:true,action:'status'});
        return await reply(200,{...status,admin:true},cookie());
      }
      const gone = new AbortController();
      const hangUp = () => { if (!res.writableEnded) gone.abort(); };
      // The Worker bridge can close the Node response when publishing headers.
      // Its original Fetch request owns cancellation for the entire stream.
      if (!clientSignal) res.on?.('close',hangUp);
      const signal = clientSignal ?? gone.signal;
      const complete: NonNullable<typeof model.complete> = request => model.complete!({...request,
        signal:request.signal ? AbortSignal.any([request.signal,signal]) : signal});
      let data: object = {}, code = 200, charged = 0, pauseVoice = false, combined = false;
      let characters = 1;
      const reserved = decision.voiceReserved;
      // Keep the admission reason even if another caller releases a hold meanwhile.
      const refusal = wantsVoice && !reserved ? voiceStatus(CAST_LINE_MAX).reason : undefined;
      try {
        if (signal.aborted || res.destroyed) return;
        try { data = await run!(complete,model.model,model.pilotBudget); }
        catch (error) {
          code = error instanceof ProviderError ? error.status : 502;
          data = {error:code === 429 ? 'Provider rate limit' : 'Model provider unavailable',
            ...(code === 429 && {resetsAt:Date.now()+60000})};
        }
        if (signal.aborted || res.destroyed) return;
        const line = 'line' in data && typeof data.line === 'string' ? data.line : '';
        characters = line.length || 1;
        const voiceId = reserved && speech?.ids.get(body.personaId);
        if (voiceId && speech && line && Date.now()-started <= CAST_STALE_MS) {
          combined = true;
          const header = Buffer.from(JSON.stringify({...data,quota:decision.quota,
            voice:voiceStatus(0),pcm:CAST_PCM}));
          const size = Buffer.alloc(4);
          size.writeUInt32BE(header.length);
          res.writeHead(200,{'Content-Type':CAST_CONTENT_TYPE,'Cache-Control':'no-store, no-transform'});
          if (!res.write(Buffer.concat([size,header]))) await once(res,'drain',{signal});
          if (signal.aborted) return;
          let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
          const cancel = () => { void reader?.cancel().catch(() => {}); };
          try {
            const stream = await speech.speak({voiceId,model:speech.model,text:line,signal});
            reader = stream.getReader();
            signal.addEventListener('abort',cancel,{once:true});
            if (signal.aborted) { cancel(); return; }
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done || signal.aborted) break;
              if (!chunk.value.length) continue;
              const writable = res.write(chunk.value);
              charged = line.length;
              if (!writable) await once(res,'drain',{signal});
            }
          } catch (error) {
            pauseVoice = error instanceof SpeechError && (error.kind === 'credits' || error.kind === 'forbidden');
          } finally {
            signal.removeEventListener('abort',cancel);
            reader?.releaseLock();
          }
        }
      } finally {
        try { decision = await store({...id,lease,action:'release',characters:charged,pauseVoice}); }
        finally {
          res.off?.('close',hangUp);
          if (combined && !signal.aborted) res.end();
        }
      }
      if (signal.aborted || combined || res.destroyed) return;
      if (planning && code === 200) return send(code,data,{'X-AI-Quota':JSON.stringify(decision.quota)});
      const voice = voiceStatus(characters);
      if (refusal) Object.assign(voice,{available:false,reason:refusal});
      send(code,{...data,quota:decision.quota,voice});
    } catch { if (!res.headersSent && !res.destroyed) send(503,{error:'AI usage service unavailable'}); }
  };
}
