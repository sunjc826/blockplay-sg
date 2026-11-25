import { modelEndpoints } from './ai-endpoints.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { selectModel, type Env } from './llm/index.ts';
import { ProviderError } from './llm/types.ts';
import { adminCookie, caller, matches } from './ai-admin.ts';
import { memoryLimits, type LimitStore, type Action } from './ai-limits.ts';

export function createAiHandler(env: Env, fetcher = fetch, store: LimitStore = memoryLimits(env), cloud = false) {
  const models = { CAST:selectModel(env,'CAST',fetcher), PILOT:selectModel(env,'PILOT',fetcher) };
  return async (req: IncomingMessage, res: ServerResponse, originAllowed: (req: IncomingMessage) => boolean) => {
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
    const id = caller(req,cloud,env.AI_ADMIN_TOKEN), lease = randomUUID();
    const check = (action: Action) => store({...id,action,lease});
    try {
      let { quota } = await check('status');
      const reply = (code: number,data: object,headers = {}) => send(code,{...data,quota},headers);
      const status = { available: !!model.complete, provider:model.provider, model:model.model, admin:id.admin };
      if (req.method === 'GET' && req.url === '/api/ai/status') return reply(200,status);
      if (req.method !== 'POST') return reply(405,{error:'POST required'});
      const localHosts = ['localhost','127.0.0.1','[::1]'];
      const origin = new URL(req.headers.origin!);
      const host = req.headers.host ? new URL('http://'+req.headers.host).hostname : origin.hostname;
      const local = localHosts.includes(host) && localHosts.includes(origin.hostname);
      const cookie = (logout = false) => ({'Set-Cookie':adminCookie(env.AI_ADMIN_TOKEN ?? '',local,logout)});
      if (req.url === '/api/ai/admin/logout') {
        quota = (await store({...id,admin:false,action:'status'})).quota;
        return reply(200,{...status,admin:false},cookie(true));
      }
      const login = req.url === '/api/ai/admin/login';
      if (!login && !endpoint) return reply(404,{error:'Unknown AI endpoint'});
      if (planning && env.ADVENTURE_ENABLED === 'false') return reply(503,{error:'Pilot is disabled.'});
      if (login ? !env.AI_ADMIN_TOKEN : !model.complete) return reply(503,{error:login ? 'Admin sign-in is unavailable.' : 'Model provider is unavailable.'});
      if (req.headers['content-type']?.split(';')[0] !== 'application/json' || (req.headers['content-encoding'] ?? 'identity') !== 'identity') return reply(415,{error:'JSON required'});
      const cap = endpoint?.bodyLimit ?? 4096;
      if (Number(req.headers['content-length']) > cap) return reply(413,{error:'Request too large'});
      let bytes = 0;
      const chunks: Buffer[] = [], timer = setTimeout(() => req.destroy(),10000);
      try {
        for await (const chunk of req) {
          const buf = Buffer.from(chunk); bytes += buf.length;
          if (bytes > cap) return reply(413,{error:'Request too large'});
          chunks.push(buf);
        }
      } finally { clearTimeout(timer); }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return reply(400,{error:'Invalid JSON'}); }
      const valid = login && typeof body?.passphrase === 'string' && Object.keys(body).length === 1 && matches(body.passphrase,env.AI_ADMIN_TOKEN!);
      const run = endpoint?.prepare(body);
      if (endpoint && !run) return reply(400,{error:'Invalid game observation'});
      const decision = await check(login ? valid ? 'login-good' : 'login-bad' : 'accept');
      quota = decision.quota;
      if (decision.reason) return reply(429,{error:decision.reason,resetsAt:decision.resetsAt},{'Retry-After':String(Math.max(1,Math.ceil((decision.resetsAt!-Date.now())/1000)))});
      if (login) {
        if (!valid) return reply(401,{error:'Incorrect passphrase'});
        quota = (await store({...id,admin:true,action:'status'})).quota;
        return reply(200,{...status,admin:true},cookie());
      }
      let data, code = 200;
      try { data = await run!(model.complete!,model.model,model.pilotBudget); }
      catch (e) {
        code = e instanceof ProviderError ? e.status : 502;
        data = {error:code === 429 ? 'Provider rate limit' : 'Model provider unavailable', ...(code === 429 && {resetsAt:Date.now()+60000})};
      } finally { quota = (await check('release')).quota; }
      // Existing pilot clients expect exactly { plan }. Carry accounting in the header.
      if (planning && code === 200) return send(code,data,{'X-AI-Quota':JSON.stringify(quota)});
      return reply(code,data);
    } catch { return send(503,{error:'AI usage service unavailable'}); }
  };
}
