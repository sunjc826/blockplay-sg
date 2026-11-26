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
  const call = (lease:string) => check({...op,action:'accept',lease,reserveVoice:true}), release = (lease:string)=>check({...op,action:'release',lease});
  for (const l of 'abcd') await call(l); expect(await call('e')).toMatchObject({reason:'Concurrent calls',voiceQuota:{used:960},quota:{used:4}}); for (const l of 'abcd') await release(l);
  for(let i=4;i<20;i++) {await call(String(i));await release(String(i));}
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

it('reserves the maximum atomically, settles exactly once, and keeps model admission independent',async () => {
  let now = Date.UTC(2026,1,2,15,59,59);
  const store = memoryLimits({VOICE_DAILY_CHARS_PER_IP:'300',VOICE_DAILY_CHARS_ANON_TOTAL:'520',VOICE_DAILY_CHARS_ADMIN:'240'},()=>now);
  const accept = (lease:string,ip:string,admin=false) => store({action:'accept',ip,admin,lease,reserveVoice:true});
  const release = (lease:string,ip:string,characters:number) => store({action:'release',ip,admin:false,lease,characters});
  expect(await accept('1','a')).toMatchObject({voiceReserved:true,voiceQuota:{used:240},quota:{used:1}});
  expect(await accept('2','a')).toMatchObject({voiceRemaining:60,quota:{used:2}});
  expect(await accept('3','b')).toMatchObject({voiceReserved:true,voiceRemaining:40});
  expect(await accept('4','c')).toMatchObject({voiceRemaining:40,quota:{used:1}});
  expect(await accept('5','c',true)).toMatchObject({voiceReserved:true,voiceRemaining:0});
  expect((await accept('6','a',true)).voiceReserved).toBeUndefined();
  for (let i=0;i<2;i++) expect(await release('1','a',17)).toMatchObject({voiceQuota:{used:17},quota:{used:2}});
  expect(await release('3','b',0)).toMatchObject({voiceQuota:{used:0},voiceRemaining:300});
  expect(await accept('7','a')).toMatchObject({voiceReserved:true});
  now += 1000;
  expect(await accept('8','a')).toMatchObject({voiceReserved:true,quota:{used:1}});
  expect(await release('7','a',100)).toMatchObject({voiceQuota:{used:240}});
});
it('returns abandoned holds to both pools at lease expiry without rolling back model usage',async()=>{
  let now=0;
  const store=memoryLimits({VOICE_DAILY_CHARS_ANON_TOTAL:'240'},()=>now);
  const accept=(ip:string)=>store({ip,admin:false,lease:ip,action:'accept',reserveVoice:true});
  await accept('a'); expect((await accept('b')).voiceReserved).toBeUndefined();
  now=60001;
  expect(await accept('c')).toMatchObject({voiceReserved:true});
  expect(await store({ip:'a',admin:false,action:'status'})).toMatchObject({voiceQuota:{used:0},quota:{used:1}});
});
