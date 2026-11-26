import { CAST_LINE_MAX } from '../src/game/cast-wire.ts';
import type { Env } from './llm/index.ts';
const minute = 60_000, hour = 60 * minute, day = 24 * hour;
/** Calls one caller may have running at once. An IP is often several tabs or devices, and a
 * client that drops a request and asks again holds the old lease until the model returns. */
export const MAX_IN_FLIGHT = 4;
/** A lease nobody released (a crashed isolate) stops counting after this long. */
const LEASE_MS = minute;
/** Refusals that clear on their own within a minute; clients wait and retry instead of stopping. */
export const TRANSIENT_REASONS: readonly string[] = ['Concurrent calls', 'Minute limit'];
export type Action = 'status' | 'accept' | 'release' | 'login-good' | 'login-bad';
export interface Operation { action: Action; ip: string; admin: boolean; lease?: string; reserveVoice?: boolean; pauseVoice?: boolean; characters?: number }
export interface Quota { used: number; limit: number; resetsAt: number }
export interface Decision { quota: Quota; voiceQuota: Quota; voiceRemaining: number; voiceBlockedUntil: number; voiceReserved?: boolean; reason?: string; resetsAt?: number }
export type LimitStore = (op: Operation) => Promise<Decision>;
export interface Counters { read(key: string): number[]; write(key: string, values: number[], expiry: number): void }
function limit(value: string | undefined, fallback: number) {
  return value?.trim() && /^\d+$/.test(value) && Number.isSafeInteger(+value) ? +value : fallback;
}
// All reads/checks/writes for an operation run synchronously in one transaction.
export function decide(db: Counters, env: Env, op: Operation, now: number): Decision {
  const resetsAt = (Math.floor((now + 8 * hour) / day) + 1) * day - 8 * hour;
  const id = op.admin ? 'admin' : 'ip/' + op.ip, key = resetsAt + '/' + id, total = resetsAt + '/total';
  const quota = { used: db.read(key)[0] ?? 0, limit: op.admin ? limit(env.AI_DAILY_CALLS_ADMIN,5000) : limit(env.AI_DAILY_CALLS_PER_IP,1000), resetsAt };
  const voiceKey = 'voice/'+key, voiceTotalKey = 'voice/'+total;
  // Holds are lease expiries, kept separately from settled daily totals. Even if an
  // isolate dies, filtering by time makes its characters available to every caller.
  const expiry = now + LEASE_MS;
  const leaseKey = 'lease/'+op.lease;
  const flightKey = 'flight/'+id;
  const active = (bucket: string) => db.read(bucket).filter(t => t > now);
  const remove = (bucket: string, until: number) => {
    const values = active(bucket), index = values.indexOf(until);
    if (index >= 0) values.splice(index,1);
    db.write(bucket,values,Math.max(now,...values));
  };
  if (op.action === 'release') {
    const [until, dayEnd, reserved] = db.read(leaseKey);
    if (until > now) {
      remove(flightKey,until);
      if (reserved && dayEnd === resetsAt) {
        const length = op.characters ?? 0;
        if (!Number.isInteger(length) || length < 0 || length > CAST_LINE_MAX) throw new Error('Invalid voice settlement');
        for (const bucket of op.admin ? [voiceKey] : [voiceKey,voiceTotalKey]) {
          remove('hold/'+bucket,until);
          if (length) db.write(bucket,[(db.read(bucket)[0] ?? 0)+length],resetsAt);
        }
      }
      db.write(leaseKey,[],now);
    }
    if (op.pauseVoice) db.write('voice/unavailable',[now+10*minute],now+10*minute);
  }
  const usage = (bucket: string) => (db.read(bucket)[0] ?? 0) + active('hold/'+bucket).length * CAST_LINE_MAX;
  const voiceQuota = { used: usage(voiceKey), limit: op.admin ? limit(env.VOICE_DAILY_CHARS_ADMIN,20000) : limit(env.VOICE_DAILY_CHARS_PER_IP,4000), resetsAt };
  const sharedRemaining = op.admin ? Infinity : limit(env.VOICE_DAILY_CHARS_ANON_TOTAL,8000) - usage(voiceTotalKey);
  const result: Decision = { quota, voiceQuota, voiceRemaining: Math.max(0,Math.min(voiceQuota.limit-voiceQuota.used,sharedRemaining)), voiceBlockedUntil: db.read('voice/unavailable')[0] ?? 0 };
  const denied = (reason: string, until: number) => ({ ...result, reason, resetsAt: until });
  if (op.action === 'status' || op.action === 'release') return result;
  if (op.action === 'login-good' || op.action === 'login-bad') {
    const bucket = 'login/' + op.ip, times = db.read(bucket).filter(t => t > now-hour);
    if (times.length >= 5) return denied('Sign-in attempts', times[0]+hour);
    if (op.action === 'login-bad') db.write(bucket,[...times,now],now+hour);
    return result;
  }
  if (op.action !== 'accept') throw new Error('Unknown AI usage operation');
  if (quota.used >= quota.limit) return denied(op.admin ? 'Admin daily limit' : 'IP daily limit', resetsAt);
  const anonymous = db.read(total)[0] ?? 0;
  if (!op.admin && anonymous >= limit(env.AI_DAILY_CALLS_ANON_TOTAL,10000)) return denied('Anonymous daily limit', resetsAt);
  const times = db.read('burst/'+id).filter(t => t > now-minute);
  if (times.length >= 20) return denied('Minute limit', times[0]+minute);
  const leases = active(flightKey);
  if (leases.length >= MAX_IN_FLIGHT) return denied('Concurrent calls', Math.min(...leases));
  // Every speech call occupies its parent model slot through the last byte, so
  // the same concurrency and burst guards bound both providers.
  if (op.reserveVoice && result.voiceBlockedUntil <= now && result.voiceRemaining >= CAST_LINE_MAX) {
    result.voiceReserved = true;
    for (const bucket of op.admin ? [voiceKey] : [voiceKey,voiceTotalKey]) {
      db.write('hold/'+bucket,[...active('hold/'+bucket),expiry],expiry);
    }
    voiceQuota.used += CAST_LINE_MAX;
    result.voiceRemaining -= CAST_LINE_MAX;
  }
  db.write(leaseKey,[expiry,resetsAt,Number(!!result.voiceReserved)],expiry);
  db.write(flightKey,[...leases,expiry],expiry);
  db.write('burst/'+id,[...times,now],now+minute);
  db.write(key,[++quota.used],resetsAt);
  if (!op.admin) db.write(total,[anonymous+1],resetsAt);
  return result;
}
export function memoryLimits(env: Env, clock = Date.now): LimitStore {
  const rows = new Map<string,{values: number[]; expiry: number}>();
  let sweep = 0;
  return async op => {
    const now = clock();
    if (now >= sweep) { for (const [k,v] of rows) if (v.expiry <= now) rows.delete(k); sweep = now+minute; }
    return decide({ read: k => rows.get(k)?.values ?? [], write: (k,values,expiry) => { if (values.length) rows.set(k,{values,expiry}); else rows.delete(k); } },env,op,now);
  };
}
