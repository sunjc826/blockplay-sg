// pnpm exec node --experimental-strip-types --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/empty-fire-sfx.mjs --generate
// Without --generate, prepares only cached audio; no paid requests or retries.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once, usage } from './encik-batch.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, '.cache/empty-fire-sfx-v1');
const output = path.join(root, 'public/audio/empty-fire');
const ffmpeg = process.env.FFMPEG ?? path.join(root, 'promo/node_modules/ffmpeg-static/ffmpeg');
const run = promisify(execFile);
const hash = data => createHash('sha256').update(data).digest('hex');
const writeJson = (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
const families = {
  pistol: ['HK P30 compact 9mm pistol with a small polymer grip and light steel slide', .22],
  bullpup: ['SAR 21 bullpup rifle with a hollow polymer stock and rear magazine well', .28],
  carbine: ['XM8 lightweight polymer carbine with a compact plastic receiver', .26],
  rifle: ['G36 polymer assault rifle with a longer receiver and steel bolt carrier', .28],
  drum: ['Ultimax light machine gun with a large hollow metal ammunition drum', .36],
  'light-belt': ['MG4 belt-fed 5.56mm light machine gun with a light steel top feed cover', .38],
  belt: ['FN MAG belt-fed 7.62mm machine gun with a substantial steel receiver and hinged top feed cover', .4],
  'heavy-belt': ['CIS 50MG belt-fed .50 calibre heavy machine gun with a massive heavy steel receiver and top feed cover', .44],
};
const requests = Object.entries(families).map(([family, [description]]) => ({
  id: `empty-fire-${family}`, family,
  request: { model_id: 'eleven_text_to_sound_v3', duration_seconds: .5, prompt_influence: .65,
    text: `${description}. One failed trigger pull on an empty weapon: a tight dry mechanical sear click with a short receiver resonance. Immediate crisp onset, one compact click under 180 ms then silence. No gunshot, ammunition, bolt cycling, reload, repeated clicks, music, voice or ambience.` },
}));
if (requests.some(item => item.request.text.length > 450)) throw Error('Sound prompt exceeds 450 characters.');
await fs.mkdir(directory, { recursive: true });
if (process.argv.includes('--generate')) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key?.trim()) throw Error('ELEVENLABS_API_KEY is not configured.');
  const beforeFile = path.join(directory, 'usage-before.json');
  let before;
  try { before = JSON.parse(await fs.readFile(beforeFile, 'utf8')); }
  catch (e) {
    if (e.code !== 'ENOENT') throw e;
    before = await usage(key);
    if (before.limit - before.used < 100) throw Error('Fewer than 100 included credits remain; stopped before generation.');
    await writeJson(beforeFile, before);
  }
  console.log(JSON.stringify({ requests: requests.length, before }));
  for (const item of requests) {
    const result = await once({ directory, id: item.id, request: item.request,
      endpoint: 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', key, binary: true });
    console.log(JSON.stringify({ id: item.id, bytes: result.bytes, credits: result.characterCost }));
  }
  const after = await usage(key).catch(() => null);
  await writeJson(path.join(directory, 'usage-after.json'), after);
  console.log(JSON.stringify({ after, observedCreditChange: after ? after.used - before.used : null }));
}

// Trim leading silence and keep a compact mechanical click with a soft tail.
// No tempo or pitch change. Preserve receipts and both checksums.
await fs.mkdir(output, { recursive: true });
const groups = {}, receipts = [];
for (const item of requests) {
  const receipt = JSON.parse(await fs.readFile(path.join(directory, item.id + '.json'), 'utf8'));
  if (receipt.status !== 'complete') throw Error(`${item.id}: generation incomplete`);
  const source = await fs.readFile(path.join(directory, item.id + '.mp3'));
  if (hash(source) !== receipt.sha256) throw Error(`${item.id}: source checksum mismatch`);
  const { stdout } = await run(ffmpeg, ['-v', 'error', '-i', path.join(directory, item.id + '.mp3'), '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'], { encoding: 'buffer' });
  const pcm = new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 4);
  let peak = 0;
  for (const v of pcm) peak = Math.max(peak, Math.abs(v));
  if (peak < .005) throw Error(`${item.id}: silent source`);
  const start = Math.max(0, pcm.findIndex(v => Math.abs(v) > peak * .16) - 44);
  let end = pcm.length - 1;
  while (end > start && Math.abs(pcm[end]) < peak * .003) end--;
  const maxSeconds = .2;
  const clip = pcm.slice(start, Math.min(end + 1, start + Math.round(maxSeconds * 44100)));
  let energy = 0, maxRms = 0, clipPeak = 0;
  const window = 2205;
  for (let i = 0; i < clip.length; i++) {
    energy += clip[i] ** 2 - (i >= window ? clip[i - window] ** 2 : 0);
    maxRms = Math.max(maxRms, Math.sqrt(Math.max(0, energy) / Math.min(i + 1, window)));
    clipPeak = Math.max(clipPeak, Math.abs(clip[i]));
  }
  const gain = Math.min(.23 / maxRms, .9 / clipPeak), fade = Math.min(882, clip.length);
  for (let i = 0; i < clip.length; i++) clip[i] *= gain * Math.min(1, i / 22) * Math.min(1, (clip.length - 1 - i) / fade);
  const rawFile = path.join(directory, item.id + '.f32');
  const prepared = path.join(directory, item.id + '-prepared.mp3');
  await fs.writeFile(rawFile, Buffer.from(clip.buffer, clip.byteOffset, clip.byteLength));
  await run(ffmpeg, ['-v', 'error', '-y', '-f', 'f32le', '-ar', '44100', '-ac', '1', '-i', rawFile, '-c:a', 'libmp3lame', '-b:a', '96k', prepared]);
  const bytes = await fs.readFile(prepared), sha256 = hash(bytes), file = `${item.id}-${sha256.slice(0, 10)}.mp3`;
  await fs.writeFile(path.join(output, file), bytes);
  groups[item.id] = [{ file, seconds: clip.length / 44100 }];
  receipts.push({ id: item.id, request: item.request, sourceSha256: receipt.sha256, sha256, requestId: receipt.requestId, credits: Number(receipt.characterCost), sourceStartSeconds: start / 44100 });
}
const manifest = { version: 1, provider: 'ElevenLabs', model: 'eleven_text_to_sound_v3', processing: '44100 Hz mono; silence trimmed; fixed per-mechanism maximum length; 20 ms fade; peak <= .9 and loudest 50 ms RMS <= .23; original pitch and speed', groups, receipts };
await fs.mkdir(path.join(root, 'src/audio/empty-fire'), { recursive: true });
await writeJson(path.join(root, 'src/audio/empty-fire/manifest.json'), manifest);
console.log(`Prepared ${receipts.length} weapon-specific empty-trigger clips.`);
