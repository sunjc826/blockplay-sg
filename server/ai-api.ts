import { aiEndpoints } from './ai-endpoints.ts';
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
  const speech = selectSpeech(env,fetcher);
  const models = { STREAMER:selectModel(env,'STREAMER',fetcher), CAST:selectModel(env,'CAST',fetcher), PILOT:selectModel(env,'PILOT',fetcher) };
  return async (req: IncomingMessage, res: ServerResponse, originAllowed: (req: IncomingMessage) => boolean, clientSignal?: AbortSignal) => {
    const endpoint = aiEndpoints.get(req.url ?? ''), planning = endpoint?.feature === 'PILOT';
    const model = models[endpoint && endpoint.feature !== 'VOICE' ? endpoint.feature : 'CAST'];
    const send = (status: number, data: object, headers = {}) => {
      res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers}); res.end(JSON.stringify(data));
    };
    // Same-origin GET fetches omit Origin. Derive it from the browser's Referer only for this read.
    if (req.method === 'GET' && !req.headers.origin && req.headers.referer) {
      try { req.headers.origin = new URL(req.headers.referer).origin; } catch { /* denied below */ }
    }
    if (!originAllowed(req)) return send(403,{error:'Unexpected origin'});
    const id = caller(req,cloud,env.AI_ADMIN_TOKEN), lease = randomUUID();
    const check = (action: Action) => store({...id,action,lease});
    try {
      let decision: Decision;
      const voiceStatus = (characters = 1) => {
        const {voiceQuota:quota, voiceRemaining:remaining, voiceBlockedUntil} = decision;
        const reason = !speech || voiceBlockedUntil > Date.now() ? 'Voice provider unavailable' : remaining < characters ? 'Voice character limit reached' : undefined;
        return {available: !reason, quota, remaining, reason};
      };
      const reply = async (code: number,data: object,headers = {}, characters = 1) => {
        // Early validation errors and status requests still carry accounting.
        decision ??= await check('status');
        send(code,{...data,quota:decision.quota,voice:voiceStatus(characters)},headers);
      };
      const status = { available: !!model.complete, provider:model.provider, model:model.model, admin:id.admin };
      if (req.method === 'GET' && req.url === '/api/ai/status') return await reply(200,{...status, streamer:{available:!!models.STREAMER.complete, provider:models.STREAMER.provider, model:models.STREAMER.model}});
      if (req.method !== 'POST') return await reply(405,{error:'POST required'});
      const localHosts = ['localhost','127.0.0.1','[::1]'];
      const origin = new URL(req.headers.origin!);
      const host = req.headers.host ? new URL('http://'+req.headers.host).hostname : origin.hostname;
      const local = localHosts.includes(host) && localHosts.includes(origin.hostname);
      const cookie = (logout = false) => ({'Set-Cookie':adminCookie(env.AI_ADMIN_TOKEN ?? '',local,logout)});
      if (req.url === '/api/ai/admin/logout') {
        decision = await store({...id,admin:false,action:'status'});
        return await reply(200,{...status,admin:false},cookie(true));
      }
      const login = req.url === '/api/ai/admin/login';
      if (!login && !endpoint) return await reply(404,{error:'Unknown AI endpoint'});
      if (planning && env.ADVENTURE_ENABLED === 'false') return await reply(503,{error:'Pilot is disabled.'});
      if (endpoint?.feature === 'VOICE' && !speech) return await reply(503,{error:'Voice provider unavailable'});
      if (login ? !env.AI_ADMIN_TOKEN : endpoint?.feature !== 'VOICE' && !model.complete) return await reply(503,{error:login ? 'Admin sign-in is unavailable.' : 'Model provider is unavailable.'});
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
      const valid = login && typeof body?.passphrase === 'string' && Object.keys(body).length === 1 && matches(body.passphrase,env.AI_ADMIN_TOKEN!);
      if (endpoint?.feature === 'VOICE' && speech) {
        const {personaId,line,ticket} = body ?? {};
        const voiceId = speech.ids.get(personaId);
        const expiry = voiceId && typeof line === 'string' && line.length > 0 && line.length <= 240 && typeof ticket === 'string'
          && speech.tickets.verify(personaId,line,ticket);
        if (!voiceId || !expiry) return await reply(403,{error:'Invalid voice ticket'});
        decision = await store({...id,lease,action:'voice-accept',characters:line.length,ticket,expiresAt:expiry});
        if (decision.reason) return await reply(decision.reason === 'Voice provider unavailable' ? 503 : 429,
          {error:decision.reason,resetsAt:decision.resetsAt},{},line.length);
        const cancel = new AbortController();
        const signal = clientSignal ? AbortSignal.any([clientSignal,cancel.signal]) : cancel.signal;
        const closed = () => cancel.abort();
        if (!clientSignal) res.once('close',closed);
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        const cancelBody = () => { void reader?.cancel().catch(() => {}); };
        signal.addEventListener('abort',cancelBody,{once:true});
        let sent = false;
        try {
          if (res.destroyed || signal.aborted) return;
          const stream = await speech.speak({voiceId,model:speech.model,text:line,signal});
          reader = stream.getReader();
          if (signal.aborted) { cancelBody(); return; }
          for (;;) {
            const chunk = await reader.read();
            if (signal.aborted) return;
            if (chunk.done) break;
            if (!chunk.value.length) continue;
            if (!sent) {
              // Commit the head with the first bytes. Until then a failed body is still a JSON 502.
              res.writeHead(200,{'Content-Type':'audio/pcm','X-Cast-PCM':'s16le;rate=24000;channels=1',
                'Cache-Control':'no-store, no-transform','X-Cast-Voice':JSON.stringify(voiceStatus())});
              sent = true;
            }
            if (!res.write(chunk.value)) await once(res,'drain',{signal});
          }
          if (!sent) throw new SpeechError('upstream');
          res.end();
        } catch (error) {
          if (signal.aborted || res.destroyed) return;
          if (sent) res.end();
          else {
            let failure = 502;
            if (error instanceof SpeechError) {
              if (error.kind === 'busy') failure = 429;
              if (error.kind === 'credits' || error.kind === 'forbidden') {
                decision = await check('voice-unavailable');
                failure = 503;
              }
            }
            await reply(failure,{error:'Voice provider unavailable'},failure === 429 ? {'Retry-After':'60'} : {});
          }
        } finally {
          res.off('close',closed);
          signal.removeEventListener('abort',cancelBody);
          cancel.abort();
          reader?.releaseLock();
          await check('voice-release');
        }
        return;
      }
      const run = endpoint && 'prepare' in endpoint ? endpoint.prepare(body) : null;
      if (endpoint && !run) return await reply(400,{error:'Invalid game observation'});
      decision = await check(login ? valid ? 'login-good' : 'login-bad' : 'accept');
      if (decision.reason) return await reply(429,{error:decision.reason,resetsAt:decision.resetsAt,...(TRANSIENT_REASONS.includes(decision.reason) && {transient:true})},{'Retry-After':String(Math.max(1,Math.ceil((decision.resetsAt!-Date.now())/1000)))});
      if (login) {
        if (!valid) return await reply(401,{error:'Incorrect passphrase'});
        decision = await store({...id,admin:true,action:'status'});
        return await reply(200,{...status,admin:true},cookie());
      }
      let data, code = 200;
      // A client that gave up (a stale line, a replan, a closed tab) should not hold its lease for the rest of the model call.
      const gone = new AbortController(), hangUp = () => { if (!res.writableEnded) gone.abort(); };
      res.on?.('close',hangUp);
      const complete: NonNullable<typeof model.complete> = request => model.complete!({...request,signal:request.signal ? AbortSignal.any([request.signal,gone.signal]) : gone.signal});
      try { data = await run!(complete,model.model,model.pilotBudget); }
      catch (e) {
        code = e instanceof ProviderError ? e.status : 502;
        data = {error:code === 429 ? 'Provider rate limit' : 'Model provider unavailable', ...(code === 429 && {resetsAt:Date.now()+60000})};
      } finally { res.off?.('close',hangUp); decision = await check('release'); }
      if (gone.signal.aborted) return;
      // Existing pilot clients expect exactly { plan }. Carry accounting in the header.
      if (planning && code === 200) return send(code,data,{'X-AI-Quota':JSON.stringify(decision.quota)});
      if (code === 200 && speech && 'line' in data && typeof data.line === 'string') {
        const ticket = voiceStatus(data.line.length).available ? speech.tickets.issue(body.personaId,data.line) : undefined;
        return await reply(code,{...data,ticket},{},data.line.length);
      }
      return await reply(code,data);
    } catch { if (!res.headersSent && !res.destroyed) send(503,{error:'AI usage service unavailable'}); }
  };
}
