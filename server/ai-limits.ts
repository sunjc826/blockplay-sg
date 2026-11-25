import type { Env } from './llm/index.ts';
const minute = 60_000, hour = 60 * minute, day = 24 * hour;
export type Action = 'status' | 'accept' | 'release' | 'login-good' | 'login-bad';
export interface Operation { action: Action; ip: string; admin: boolean; lease?: string }
export interface Quota { used: number; limit: number; resetsAt: number }
export interface Decision { quota: Quota; reason?: string; resetsAt?: number }
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
  const denied = (reason: string, until: number) => ({ quota, reason, resetsAt: until });
  if (op.action === 'status') return { quota };
  if (op.action.startsWith('login-')) {
    const bucket = 'login/' + op.ip, times = db.read(bucket).filter(t => t > now-hour);
    if (times.length >= 5) return denied('Sign-in attempts', times[0]+hour);
    if (op.action === 'login-bad') db.write(bucket,[...times,now],now+hour);
    return { quota };
  }
  // Unique expiring leases recover from isolate termination without releasing another call's slot.
  const leases = db.read('flight/'+id).filter(t => t > now);
  const leaseKey = 'lease/'+op.lease;
  if (op.action === 'release') {
    const expiry = db.read(leaseKey)[0], index = leases.indexOf(expiry);
    if (index >= 0) leases.splice(index,1);
    db.write('flight/'+id,leases,Math.max(now,...leases)); db.write(leaseKey,[],now);
    return { quota };
  }
  if (quota.used >= quota.limit) return denied(op.admin ? 'Admin daily limit' : 'IP daily limit', resetsAt);
  const anonymous = db.read(total)[0] ?? 0;
  if (!op.admin && anonymous >= limit(env.AI_DAILY_CALLS_ANON_TOTAL,10000)) return denied('Anonymous daily limit', resetsAt);
  const times = db.read('burst/'+id).filter(t => t > now-minute);
  if (times.length >= 20) return denied('Minute limit', times[0]+minute);
  if (leases.length >= 2) return denied('Concurrent calls', Math.min(...leases));
  db.write(leaseKey,[now+120000],now+120000); db.write('flight/'+id,[...leases,now+120000],now+120000);
  db.write('burst/'+id,[...times,now],now+minute); db.write(key,[++quota.used],resetsAt);
  if (!op.admin) db.write(total,[anonymous+1],resetsAt);
  return { quota };
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
