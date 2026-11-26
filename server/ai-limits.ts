import type { Env } from './llm/index.ts';
const minute = 60_000, hour = 60 * minute, day = 24 * hour;
/** Calls one caller may have running at once. An IP is often several tabs or devices, and a
 * client that drops a request and asks again holds the old lease until the model returns. */
export const MAX_IN_FLIGHT = 4;
/** A lease nobody released (a crashed isolate) stops counting after this long. */
const LEASE_MS = minute;
/** Refusals that clear on their own within a minute; clients wait and retry instead of stopping. */
export const TRANSIENT_REASONS: readonly string[] = ['Concurrent calls', 'Minute limit'];
export type Action = 'status' | 'accept' | 'release' | 'login-good' | 'login-bad' | 'voice-accept' | 'voice-release' | 'voice-unavailable';
export interface Operation { action: Action; ip: string; admin: boolean; lease?: string; ticket?: string; expiresAt?: number; characters?: number }
export interface Quota { used: number; limit: number; resetsAt: number }
export interface Decision { quota: Quota; voiceQuota: Quota; voiceRemaining: number; voiceBlockedUntil: number; reason?: string; resetsAt?: number }
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
  const voiceQuota = { used: db.read(voiceKey)[0] ?? 0, limit: op.admin ? limit(env.VOICE_DAILY_CHARS_ADMIN,20000) : limit(env.VOICE_DAILY_CHARS_PER_IP,4000), resetsAt };
  const voiceTotal = op.admin ? 0 : db.read(voiceTotalKey)[0] ?? 0;
  const sharedRemaining = op.admin ? Infinity : limit(env.VOICE_DAILY_CHARS_ANON_TOTAL,8000) - voiceTotal;
  const result = { quota, voiceQuota, voiceRemaining: Math.max(0,Math.min(voiceQuota.limit-voiceQuota.used,sharedRemaining)), voiceBlockedUntil: db.read('voice/unavailable')[0] ?? 0 };
  const denied = (reason: string, until: number) => ({ ...result, reason, resetsAt: until });
  if (op.action === 'voice-unavailable') {
    result.voiceBlockedUntil = now + 10 * minute;
    db.write('voice/unavailable',[result.voiceBlockedUntil],result.voiceBlockedUntil);
    return result;
  }
  if (op.action === 'status') return result;
  if (op.action.startsWith('login-')) {
    const bucket = 'login/' + op.ip, times = db.read(bucket).filter(t => t > now-hour);
    if (times.length >= 5) return denied('Sign-in attempts', times[0]+hour);
    if (op.action === 'login-bad') db.write(bucket,[...times,now],now+hour);
    return result;
  }
  // Unique expiring leases recover from isolate termination without releasing another call's slot.
  const voice = op.action.startsWith('voice-'), lane = voice ? 'voice/'+id : id;
  const leases = db.read('flight/'+lane).filter(t => t > now);
  const leaseKey = 'lease/'+op.lease;
  if (op.action === 'release' || op.action === 'voice-release') {
    const expiry = db.read(leaseKey)[0], index = leases.indexOf(expiry);
    if (index >= 0) leases.splice(index,1);
    db.write('flight/'+lane,leases,Math.max(now,...leases)); db.write(leaseKey,[],now);
    return result;
  }
  const characters = op.characters ?? 0;
  if (voice) {
    if (result.voiceBlockedUntil > now) return denied('Voice provider unavailable', result.voiceBlockedUntil);
    if (!op.ticket || !op.expiresAt || op.expiresAt <= now || db.read('spoken/'+op.ticket).length) return denied('Voice ticket expired or used', now);
    if (!Number.isSafeInteger(characters) || characters < 1 || characters > result.voiceRemaining) return denied('Voice character limit', resetsAt);
  }
  if (!voice && quota.used >= quota.limit) return denied(op.admin ? 'Admin daily limit' : 'IP daily limit', resetsAt);
  const anonymous = db.read(total)[0] ?? 0;
  if (!voice && !op.admin && anonymous >= limit(env.AI_DAILY_CALLS_ANON_TOTAL,10000)) return denied('Anonymous daily limit', resetsAt);
  const times = db.read('burst/'+lane).filter(t => t > now-minute);
  if (times.length >= 20) return denied('Minute limit', times[0]+minute);
  if (leases.length >= MAX_IN_FLIGHT) return denied('Concurrent calls', Math.min(...leases));
  db.write(leaseKey,[now+LEASE_MS],now+LEASE_MS); db.write('flight/'+lane,[...leases,now+LEASE_MS],now+LEASE_MS);
  db.write('burst/'+lane,[...times,now],now+minute);
  if (voice) {
    voiceQuota.used += characters;
    result.voiceRemaining -= characters;
    db.write(voiceKey,[voiceQuota.used],resetsAt);
    if (!op.admin) db.write(voiceTotalKey,[voiceTotal+characters],resetsAt);
    db.write('spoken/'+op.ticket,[1],op.expiresAt!);
    return result;
  }
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
