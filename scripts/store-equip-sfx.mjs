// Bounded ElevenLabs batch; offline publishing also reuses the weapon-specific reload recordings.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { once, usage } from './encik-batch.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = path.join(root, '.cache/store-equip');
const endpoint = 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128';
const dry = 'One clear close-up handling sequence over about 1.2 seconds. Warm dry foley, restrained treble. No speech, music, eating, alarms or background ambience.';
const sounds = [
  { id: 'equip-food', text: 'A paper food wrapper rustles, a small takeaway container is opened and settled into a cloth bag. Soft paper crinkle followed by a light lid tap.' },
  { id: 'equip-medical', text: 'A fabric first-aid pouch zipper opens, a sealed sterile dressing wrapper crinkles, then the pouch is fastened with a short soft hook-and-loop closure.' },
  { id: 'equip-grenade', text: 'An inert metal grenade is lifted, its metal safety lever and ring make a restrained clink, then it is seated into a nylon equipment pouch and the pouch snaps closed. Pin stays in place. No ignition or explosion.' },
];
const requests = sounds.map(s => ({ id: s.id, request: { model_id: 'eleven_text_to_sound_v3', duration_seconds: 1.4, prompt_influence: .65, text: `${s.text} ${dry}` } }));
for (const take of requests) if (take.request.text.length > 450) throw Error('Prompt exceeds provider limit.');

async function generate() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key?.trim()) throw Error('ELEVENLABS_API_KEY is required.');
  await fs.mkdir(cache, { recursive: true });
  const before = await usage(key);
  if (before.limit - before.used < 100) throw Error('Fewer than 100 included credits remain.');
  await fs.writeFile(path.join(cache, 'usage-before.json'), JSON.stringify(before, null, 2) + '\n', { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  for (const take of requests) {
    const result = await once({ directory: cache, id: take.id, request: take.request, endpoint, key, binary: true });
    console.log(JSON.stringify({ id: take.id, bytes: result.bytes, credits: result.characterCost }));
  }
  const after = await usage(key).catch(() => null);
  await fs.writeFile(path.join(cache, 'usage-after.json'), JSON.stringify(after, null, 2) + '\n');
  console.log(JSON.stringify({ before, after }));
}

async function publish() {
  const run = promisify(execFile), rate = 44100;
  const ffmpeg = process.env.FFMPEG ?? path.join(root, 'promo/node_modules/ffmpeg-static/ffmpeg');
  const directory = path.join(root, 'public/audio/store');
  const manifestPath = path.join(root, 'src/audio/store/manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.processing = 'Legacy equip/purchase/blocked retain their original shaping; equipment sequences preserve natural pitch/speed and specify processing per clip.';
  const reload = JSON.parse(await fs.readFile(path.join(root, 'src/audio/reload/manifest.json'), 'utf8'));
  const checksum = b => createHash('sha256').update(b).digest('hex');
  async function decode(file) {
    const { stdout } = await run(ffmpeg, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { encoding: 'buffer' });
    return new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 4).slice();
  }
  function shape(data) {
    const peak = data.reduce((p, v) => Math.max(p, Math.abs(v)), 0);
    if (!Number.isFinite(peak) || peak < .0001) throw Error('Silent or invalid audio.');
    let start = Math.max(0, data.findIndex(v => Math.abs(v) >= peak * .02) - Math.round(rate * .005));
    let end = data.length - 1;
    while (end > start && Math.abs(data[end]) < peak * .004) end--;
    const out = data.slice(start, Math.min(data.length, end + Math.round(rate * .03)));
    const window = Math.round(rate * .05); let rms = 0;
    for (let i = 0; i < out.length; i += Math.round(window / 2)) { let sum = 0; for (let j = i; j < Math.min(out.length, i + window); j++) sum += out[j] ** 2; rms = Math.max(rms, Math.sqrt(sum / window)); }
    const gain = Math.min(.105 / rms, .65 / peak);
    for (let i = 0; i < out.length; i++) out[i] *= gain * Math.min(1, i / (rate * .001), (out.length - 1 - i) / (rate * .02));
    return out;
  }
  async function write(id, data, sources) {
    const raw = path.join(cache, id + '.f32'), temp = path.join(cache, id + '-published.mp3');
    await fs.writeFile(raw, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    await run(ffmpeg, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(rate), '-ac', '1', '-i', raw, '-af', 'treble=g=-5:f=2800:w=0.7,lowpass=f=5200:p=2', '-c:a', 'libmp3lame', '-b:a', '128k', temp]);
    await fs.rm(raw);
    const bytes = await fs.readFile(temp), sha256 = checksum(bytes), file = `${id}-${sha256.slice(0, 10)}.mp3`;
    await fs.writeFile(path.join(directory, file), bytes);
    manifest.clips[id] = { file, sha256, seconds: +(data.length / rate).toFixed(3), sources, processing: 'Natural pitch/speed; onset/tail trimmed; 20 ms fade; loudest 50 ms RMS <= .105; peak <= .65; -5 dB treble shelf / 5.2 kHz lowpass' };
    console.log(JSON.stringify({ id, file, seconds: manifest.clips[id].seconds }));
  }
  await fs.mkdir(cache, { recursive: true });
  for (const { id } of sounds) {
    const receipt = JSON.parse(await fs.readFile(path.join(cache, id + '.json'), 'utf8'));
    const file = path.join(cache, id + '.mp3');
    if (receipt.status !== 'complete' || checksum(await fs.readFile(file)) !== receipt.sha256) throw Error('Source receipt mismatch: ' + id);
    await write(id, shape(await decode(file)), [{ source: id, sha256: receipt.sha256 }]);
  }
  for (const mechanism of ['pistol', 'bullpup', 'carbine', 'rifle', 'drum', 'light-belt', 'belt', 'heavy-belt', 'drum-box']) {
    const parts = [], sources = []; let at = .02;
    for (const stage of ['in', 'seat', 'back', 'release']) {
      const sourceMechanism = mechanism === 'drum-box' ? (stage === 'in' || stage === 'seat' ? 'rifle' : 'drum') : mechanism;
      const group = `reload-${sourceMechanism}-${stage}`, clip = reload.groups[group][0];
      const file = path.join(root, 'public/audio/reload', clip.file);
      const data = await decode(file);
      parts.push({ at, data }); sources.push({ group, file: clip.file, sha256: checksum(await fs.readFile(file)), at: +at.toFixed(3) });
      at += data.length / rate + (stage === 'seat' ? .17 : .1);
    }
    const sequence = new Float32Array(Math.ceil((at + .04) * rate));
    for (const part of parts) sequence.set(part.data, Math.round(part.at * rate));
    await write(`equip-gun-${mechanism}`, shape(sequence), sources);
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  // Four examples in request order; these use the exact encoded files the UI plays.
  let at = .15; const parts = [];
  for (const id of ['equip-gun-bullpup', 'equip-food', 'equip-medical', 'equip-grenade']) {
    const data = await decode(path.join(directory, manifest.clips[id].file));
    parts.push({ at, data }); at += data.length / rate + .6;
  }
  const preview = new Float32Array(Math.ceil(at * rate));
  for (const part of parts) preview.set(part.data, Math.round(part.at * rate));
  const raw = path.join(cache, 'preview.f32'); await fs.writeFile(raw, Buffer.from(preview.buffer));
  await run(ffmpeg, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(rate), '-ac', '1', '-i', raw, '-c:a', 'libmp3lame', '-b:a', '128k', path.join(cache, 'equipment-preview.mp3')]); await fs.rm(raw);
}

if (process.argv.includes('--generate')) await generate();
else if (process.argv.includes('--publish')) await publish();
else console.log(JSON.stringify({ mode: 'dry run; no requests', requests }, null, 2));
