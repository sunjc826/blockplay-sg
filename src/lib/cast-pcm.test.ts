import { expect, it } from 'vitest';
import { CastPcm } from './cast-pcm';
import { CAST_MIX } from './cast-mix';

it.each([44100,48000])('resamples an oddly split sine sweep continuously at %i Hz',rate => {
  const sourceRate = 24000, samples = 24000;
  const bytes = new Uint8Array(samples*2), data = new DataView(bytes.buffer);
  for (let i=0;i<samples;i++) {
    const t = i/sourceRate;
    data.setInt16(2*i,Math.round(29000*Math.sin(2*Math.PI*(110*t+800*t*t))),true);
  }
  const pcm = new CastPcm(sourceRate,rate,CAST_MIX.bufferLeadMs,CAST_MIX.stallMs);
  const splits = [1,227,18,53,3,1009];
  let offset = 0, reads = 0;
  const feed = () => {
    const chunk = bytes.subarray(offset, offset+splits[reads++ % splits.length]);
    pcm.push(chunk); offset += chunk.length;
    pcm.ended = offset === bytes.length;
  };
  const output = new Float32Array(rate);
  for (let frame=0; frame<rate; frame+=128) {
    // Keep a lead while the audio thread consumes real render quanta. This
    // wraps the ring, crosses half-samples, and splits interpolation pairs.
    while (offset < bytes.length && offset < (frame/rate+.25)*bytes.length) feed();
    pcm.render(output.subarray(frame, Math.min(rate,frame+128)));
  }
  let maxError = 0;
  for (let n=0;n<rate;n++) {
    const position = n*sourceRate/rate, i = Math.floor(position);
    const a = data.getInt16(2*i,true), b = data.getInt16(2*Math.min(samples-1,i+1),true);
    const edge = Math.min(1,(n+1)/(.004*rate),(rate-n)/(.004*rate));
    const expected = (a+(b-a)*(position-i))*edge/32768;
    maxError = Math.max(maxError,Math.abs(expected-output[n]));
  }
  expect(maxError).toBeLessThan(0.0000001);
  expect(pcm.render(new Float32Array(128))).toBe(false);
});

it('fades into silence, re-primes and resumes once, then expires a prolonged underrun',() => {
  const rate=24000, pcm=new CastPcm(rate,rate,CAST_MIX.bufferLeadMs,CAST_MIX.stallMs);
  const tone=(samples:number) => new Uint8Array(samples*2).map((_,i)=>i%2 ? 64 : 0);
  pcm.push(tone(240));
  const first = new Float32Array(300);
  expect(pcm.render(first)).toBe(true);
  expect(first[120]).toBe(.5); expect(first[239]).toBeLessThan(.006);
  expect(first.slice(240).every(x=>x===0)).toBe(true);
  pcm.push(tone(1)); const quiet=new Float32Array(128);
  expect(pcm.render(quiet)).toBe(true); expect(quiet.every(x=>x===0)).toBe(true);
  pcm.push(tone(5999));
  const resumed=new Float32Array(6000); expect(pcm.render(resumed)).toBe(true);
  expect(resumed[0]).toBeLessThan(.006); expect(resumed[120]).toBe(.5);
  expect(pcm.render(new Float32Array(rate*CAST_MIX.stallMs/1000-1))).toBe(true);
  expect(pcm.render(new Float32Array(1))).toBe(false);
});
