import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from '../scripts/elevenlabs-once.mjs';
const request={text:'Test narration'};
async function fixture(t){const directory=await mkdtemp(path.join(tmpdir(),'last-train-once-'));t.after(()=>rm(directory,{recursive:true,force:true}));return {directory,id:'clip',request,endpoint:'https://example.invalid/audio',key:'fake-test-key',binary:true};}
test('completed request is reused without a second paid call',async t=>{
 const args=await fixture(t);let calls=0;
 const fetcher=async()=>{calls++;return new Response(Buffer.alloc(1200),{headers:{'content-type':'audio/mpeg'}});};
 const first=await once({...args,fetcher});const second=await once({...args,fetcher});
 assert.equal(calls,1);assert.equal(first.sha256,second.sha256);
 await assert.rejects(once({...args,request:{text:'Changed'},fetcher}),/request changed/);
 assert.equal(calls,1);
});
test('ambiguous connection never retries automatically',async t=>{
 const args=await fixture(t);let calls=0;
 const fetcher=async()=>{calls++;throw new Error('network interrupted');};
 await assert.rejects(once({...args,fetcher}),/may have consumed credits/);
 await assert.rejects(once({...args,fetcher}),/No automatic retry/);assert.equal(calls,1);
});
test('corrupted cached audio stops without paying for replacement',async t=>{
 const args=await fixture(t);let calls=0;
 const fetcher=async()=>{calls++;return new Response(Buffer.alloc(1200),{headers:{'content-type':'audio/mpeg'}});};
 await once({...args,fetcher});await writeFile(path.join(args.directory,'clip.mp3'),'corrupt');
 await assert.rejects(once({...args,fetcher}),/checksum mismatch/);assert.equal(calls,1);
});
