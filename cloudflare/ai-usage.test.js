import { expect,it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { AiUsage } from './ai-usage.js';

it('serializes competing admissions and keeps quota across object recreation',async()=>{
  const db = new DatabaseSync(':memory:');
  const ctx = {storage:{sql:{exec(query,...params) {
    const rows = db.prepare(query).all(...params);
    return {toArray:()=>rows};
  }},transactionSync(fn) {
    db.exec('BEGIN');try {const result = fn();db.exec('COMMIT');return result;} catch(e){db.exec('ROLLBACK');throw e;}
  }}};
  try {
    const env = {AI_DAILY_CALLS_ANON_TOTAL:'1'};
    let instance = new AiUsage(ctx,env);
    const call = async (action,ip) => (await instance.fetch(
      new Request('https://usage/check',{method:'POST',body:JSON.stringify({action,ip,admin:false,lease:ip})}))).json();
    const results = await Promise.all([call('accept','a'),call('accept','b')]);
    expect(results.filter(r=>r.reason)).toHaveLength(1);
    instance = new AiUsage(ctx,env);
    expect((await call('status','a')).quota.used).toBe(1);
    await call('release','a');
    expect((await call('accept','c')).reason).toBe('Anonymous daily limit');
  } finally {db.close();}
});
