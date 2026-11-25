import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
const digest = (value: string) => createHash('sha256').update(value).digest();
export const matches = (a: string, b: string) => timingSafeEqual(digest(a),digest(b));
const signature = (expiry: string, secret: string) => createHmac('sha256',digest('blockplay/cast/session/'+secret)).update(expiry).digest('hex');
export function adminCookie(secret: string, local: boolean, logout = false, now = Date.now()) {
  const age = logout ? 0 : 30*86400, expiry = String(now + age*1000);
  return 'cast_admin='+(logout ? '' : expiry+'.'+signature(expiry,secret))+'; Path=/api/; HttpOnly; SameSite=Strict; Max-Age='+age+(local ? '' : '; Secure');
}
export function caller(req: IncomingMessage, cloud: boolean, secret?: string, now = Date.now()) {
  const token = /(?:^|;\s*)cast_admin=(\d{13})\.([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '');
  const admin = !!(secret && token && +token[1] > now && matches(signature(token[1],secret),token[2]));
  const ip = cloud ? req.headers['cf-connecting-ip'] : req.socket?.remoteAddress;
  return { ip: typeof ip === 'string' ? ip : 'unknown', admin };
}
