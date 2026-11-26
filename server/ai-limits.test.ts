import { expect,it } from 'vitest';
import { memoryLimits } from './ai-limits';
it('enforces atomic daily limits independently and rolls over at midnight Singapore',async()=>{
  let now = Date.UTC(2026,1,2,15,59,59);
  const check = memoryLimits({AI_DAILY_CALLS_PER_IP:'1',AI_DAILY_CALLS_ANON_TOTAL:'2',AI_DAILY_CALLS_ADMIN:'1'},()=>now);
  const call = (ip:string,admin=false)=>check({action:'accept',ip,admin,lease:ip});
  expect((await call('a')).quota.used).toBe(1); expect((await call('a')).reason).toBe('IP daily limit');
  await call('b'); expect((await call('c')).reason).toBe('Anonymous daily limit');
  expect((await call('x',true)).quota.used).toBe(1); expect((await call('y',true)).reason).toBe('Admin daily limit');
  now += 1000; expect((await call('a')).reason).toBeUndefined();
});
it('limits active leases and sliding minute admissions',async()=>{
  let now = 0;
  const check = memoryLimits({},()=>now), op = {ip:'one',admin:false};
  const call = (lease:string) => check({...op,action:'accept',lease}), release = (lease:string)=>check({...op,action:'release',lease});
  await call('a'); await call('b'); expect((await call('c')).reason).toBe('Concurrent calls'); await release('a'); await release('b');
  for(let i=2;i<20;i++) {await call(String(i));await release(String(i));}
  expect(await call('x')).toMatchObject({reason:'Minute limit',resetsAt:60000,quota:{used:20}});
  now += 60000; expect((await call('x')).quota.used).toBe(21);
});
it('expires burst and sign-in state without forgiving daily calls',async()=>{
  let now=0;
  const store=memoryLimits({},()=>now), id={ip:'a',admin:false};
  for(let i=0;i<5;i++) await store({...id,action:'login-bad'});
  expect((await store({...id,action:'login-good'})).reason).toBe('Sign-in attempts');
  now=3600000; expect((await store({...id,action:'login-good'})).reason).toBeUndefined();
});

it('charges voice characters atomically by IP, shared pool or admin independently of model calls',async () => {
  let now = Date.UTC(2026,1,2,15,59,59), n = 0;
  const store = memoryLimits({VOICE_DAILY_CHARS_PER_IP:'4',VOICE_DAILY_CHARS_ANON_TOTAL:'6',VOICE_DAILY_CHARS_ADMIN:'3',AI_DAILY_CALLS_PER_IP:'1'},()=>now);
  const speak = (ip:string,characters:number,admin=false) => store({action:'voice-accept',ip,characters,admin,lease:String(++n),ticket:'t'+n,expiresAt:now+120000});
  await store({action:'accept',ip:'a',admin:false,lease:'model'});
  expect(await speak('a',4)).toMatchObject({voiceQuota:{used:4},quota:{used:1}});
  expect((await speak('a',1)).reason).toBe('Voice character limit');
  expect((await speak('b',3)).reason).toBe('Voice character limit');
  expect(await speak('b',2)).toMatchObject({voiceQuota:{used:2},quota:{used:0}});
  expect((await speak('c',1)).reason).toBe('Voice character limit');
  expect(await speak('a',3,true)).toMatchObject({voiceQuota:{used:3,limit:3},voiceRemaining:0});
  expect((await speak('elsewhere',1,true)).reason).toBe('Voice character limit');
  now += 1000;
  expect(await speak('a',1)).toMatchObject({voiceQuota:{used:1},quota:{used:0},voiceRemaining:3});
});
