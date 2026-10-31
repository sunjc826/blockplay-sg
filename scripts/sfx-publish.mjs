// Turns cached ElevenLabs takes into the game's sound pack: trimmed, peak-normalised mono MP3s plus a manifest.
// Free and offline: it only reads .cache/sfx-batch. Usage: pnpm sfx:publish [--analyse] [group…]
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cacheDirectory, takes } from './sfx-batch.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);
/** Every take's loudest 50 ms sits at LOUDNESS RMS, so a gun's level in game comes from its calibre, not from its take; peaks are capped at PEAK. */
const RATE = 44100, LOUDNESS = .25, PEAK = .98;
const publicDirectory = path.join(root, 'public/audio/sfx');
const manifestFile = path.join(root, 'src/audio/sfx/manifest.json');
const ffmpeg = process.env.FFMPEG ?? path.join(root, 'promo/node_modules/ffmpeg-static/ffmpeg');

/**
 * Which takes become which in-game group. Shots and handling are one sound per take; footstep takes are
 * sequences the publisher slices into single footfalls. Pruned by ear on the audition page.
 */
export const PICKS = {
  // v3 shots have the sharper onset. Near-silent v2 takes and v3 takes that fire a burst instead of one round are left out.
  'pistol-9': ['pistol-9-2', 'pistol-9-v3-2', 'pistol-9-v3-3'],
  // A shot whose peak comes more than ~10 ms after its onset is heard as late (rifle-556-2 at 83 ms, rifle-556-v3-1
  // and pistol-9-v3-1 at 30-36 ms), so those are left out; rifle-556-v3-5 came out dull.
  'rifle-556': ['rifle-556-v3-2', 'rifle-556-v3-3', 'rifle-556-v3-4'],
  'mg-762': ['mg-762-1', 'mg-762-v3-1', 'mg-762-v3-2'],
  'hmg-127': ['hmg-127-1', 'hmg-127-2', 'hmg-127-4'],
  suppressed: ['suppressed-v3-1', 'suppressed-v3-3'],
  'distant-rifle': ['distant-rifle-1', 'distant-rifle-3', 'distant-rifle-v3-1'],
  'distant-heavy': ['distant-heavy-2', 'distant-heavy-v3-1'],
  walk: ['walk-concrete-1', 'walk-concrete-2'],
  run: ['run-concrete-1', 'run-concrete-2'],
  'mag-out': ['mag-out-1', 'mag-out-2'],
  'mag-in': ['mag-in-2'],
  'mag-seat': ['mag-seat-1', 'mag-seat-2'],
  'bolt-back': ['bolt-back-1', 'bolt-back-2'],
  'bolt-release': ['bolt-release-1', 'bolt-release-2'],
  ...Object.fromEntries(['concrete', 'metal', 'wood', 'glass', 'foliage', 'dirt', 'flesh', 'water']
    .map(surface => [`impact-${surface}`, [`impact-${surface}-1`, `impact-${surface}-2`]])),
};
const STEPS = new Set(['walk', 'run']);

async function decode(file) {
  const { stdout } = await run(ffmpeg, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 1 << 28 });
  return new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 4).slice();
}
async function encode(samples, file) {
  const raw = file + '.f32';
  await fs.writeFile(raw, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  await run(ffmpeg, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', raw, '-c:a', 'libmp3lame', '-b:a', '96k', file]);
  await fs.rm(raw);
}
const peakOf = s => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
/** RMS over 5 ms windows. */
function envelope(s, window = Math.round(RATE * .005)) {
  const out = new Float32Array(Math.ceil(s.length / window));
  for (let w = 0; w < out.length; w++) { let sum = 0, n = 0; for (let i = w * window; i < Math.min(s.length, (w + 1) * window); i++, n++) sum += s[i] * s[i]; out[w] = Math.sqrt(sum / Math.max(1, n)); }
  return { out, window };
}
/**
 * Starts 1 ms before the main transient (the first sample at 30% of peak), so a quiet lead-in never makes a shot
 * or a reload stage land late; ends once it has died 50 dB below its peak, fades the last 15 ms, and is set to LOUDNESS.
 */
function shape(s, impact = false) {
  const peak = peakOf(s) || 1, { out, window } = envelope(s);
  const loudest = out.reduce((m, v) => Math.max(m, v), 0);
  // Generated impacts can contain a soft preliminary tap before the main strike.
  // Start on the strong strike so alternating takes don't feel out of sync.
  let start = s.findIndex(v => Math.abs(v) >= peak * (impact ? .9 : .3)); start = Math.max(0, start - Math.round(RATE * .001));
  let end = out.length - 1; while (end > 0 && out[end] < loudest * .003) end--;
  const clip = s.slice(start, Math.min(s.length, (end + 1) * window));
  const fade = Math.min(clip.length, Math.round(RATE * .015));
  for (let i = 0; i < fade; i++) clip[clip.length - 1 - i] *= i / fade;
  const loudest50 = envelope(clip, Math.round(RATE * .05)).out.reduce((m, v) => Math.max(m, v), 0) || 1;
  const gain = Math.min(LOUDNESS / loudest50, PEAK / (peakOf(clip) || 1)); for (let i = 0; i < clip.length; i++) clip[i] *= gain;
  return clip;
}
/** Single footfalls: an onset is the envelope jumping above a quarter of the loudest step after a quiet stretch. */
function footfalls(s) {
  const { out, window } = envelope(s), loudest = out.reduce((m, v) => Math.max(m, v), 0), onsets = [];
  let quiet = 0;
  for (let w = 0; w < out.length; w++) {
    if (out[w] > loudest * .25 && quiet >= 16) { onsets.push(w); quiet = 0; } else if (out[w] < loudest * .08) quiet++;
  }
  const steps = onsets.map((w, i) => {
    const from = Math.max(0, w * window - Math.round(RATE * .01)), to = Math.min(s.length, from + Math.round(RATE * .32), onsets[i + 1] != null ? onsets[i + 1] * window - Math.round(RATE * .01) : s.length);
    return s.slice(from, to);
  }).filter(step => step.length > RATE * .06);
  // The six steps nearest the take's typical loudness: a scuffed or stamped outlier repeats noticeably.
  const median = steps.map(peakOf).sort((a, b) => a - b)[steps.length >> 1];
  return steps.map(step => [step, Math.abs(Math.log(peakOf(step) / median))]).sort((a, b) => a[1] - b[1]).slice(0, 6).map(([step]) => shape(step));
}
/** Crest factor, share of energy above 4 kHz and attack time, for comparing takes without ears. */
function analyse(s) {
  const peak = peakOf(s); let sum = 0, hi = 0, prev = 0; for (const v of s) { sum += v * v; const d = v - prev; hi += d * d; prev = v; }
  const rms = Math.sqrt(sum / s.length), attack = s.findIndex(v => Math.abs(v) > peak * .9) / RATE * 1000;
  return { seconds: +(s.length / RATE).toFixed(3), peakDb: +(20 * Math.log10(peak)).toFixed(1), crestDb: +(20 * Math.log10(peak / rms)).toFixed(1), brightness: +(hi / sum).toFixed(3), attackMs: +attack.toFixed(1) };
}

if (process.argv.includes('--analyse')) {
  for (const take of takes) {
    const file = path.join(cacheDirectory, take.id + '.mp3');
    try { await fs.access(file); } catch { continue; }
    console.log(take.id.padEnd(22), JSON.stringify(analyse(await decode(file))));
  }
} else {
  const only = process.argv.slice(2);
  for (const group of only) if (!(group in PICKS)) throw Error(`Unknown group: ${group}`);
  // Incremental publishing preserves existing, auditioned clips byte for byte.
  const previous = only.length ? JSON.parse(await fs.readFile(manifestFile, 'utf8')).groups : {};
  if (!only.length) await fs.rm(publicDirectory, { recursive: true, force: true });
  await fs.mkdir(publicDirectory, { recursive: true });
  const groups = { ...previous };
  for (const [group, ids] of Object.entries(PICKS)) {
    if (only.length && !only.includes(group)) continue;
    groups[group] = [];
    for (const id of ids) {
      const take = takes.find(t => t.id === id); if (!take) throw Error(`${group}: unknown take ${id}`);
      const source = await decode(path.join(cacheDirectory, id + '.mp3'));
      for (const clip of STEPS.has(group) ? footfalls(source) : [shape(source, group.startsWith('impact-'))]) {
        const n = groups[group].length + 1, digest = createHash('sha256').update(Buffer.from(clip.buffer)).digest('hex').slice(0, 10);
        const file = `${group}-${n}-${digest}.mp3`;
        await encode(clip, path.join(publicDirectory, file));
        groups[group].push({ file, take: id, seconds: +(clip.length / RATE).toFixed(3) });
        const peakMs = clip.findIndex(v => Math.abs(v) >= peakOf(clip) * .999) / RATE * 1000;
        if (!STEPS.has(group) && !group.startsWith('distant') && peakMs > 40) console.warn(`${group}: ${id} peaks ${peakMs.toFixed(0)} ms in and may sound late`);
      }
    }
    console.log(`${group}: ${groups[group].length} clips`);
  }
  await fs.mkdir(path.dirname(manifestFile), { recursive: true });
  await fs.writeFile(manifestFile, JSON.stringify({ version: 1, provider: 'ElevenLabs', groups }, null, 2) + '\n');
  const retained = new Set(Object.values(groups).flat().map(clip => clip.file));
  for (const group of only) for (const clip of previous[group] ?? [])
    if (!retained.has(clip.file)) await fs.rm(path.join(publicDirectory, clip.file), { force: true });
  // A local listening page (not deployed): every raw take, the ones in use marked, then what the game plays.
  const picked = new Set(Object.values(PICKS).flat()), audio = src => `<audio controls preload="none" src="${src}"></audio>`;
  const raw = [...new Set(takes.map(t => t.sound))].map(sound => `<h2>${sound}</h2><p>${takes.find(t => t.sound === sound).request.text}</p>` +
    takes.filter(t => t.sound === sound).map(t => `<div class="${picked.has(t.id) ? 'in' : ''}"><b>${t.id}</b>${picked.has(t.id) ? ' · in use' : ''}${audio(t.id + '.mp3')}</div>`).join('')).join('');
  const played = Object.entries(groups).map(([group, clips]) => `<h2>${group}</h2>` + clips.map(c => `<div><b>${c.file}</b> from ${c.take}${audio('../../public/audio/sfx/' + c.file)}</div>`).join('')).join('');
  await fs.writeFile(path.join(cacheDirectory, 'audition.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sound effects audition</title><style>body{max-width:820px;margin:30px auto;padding:0 16px;background:#15251f;color:#f3e7c8;font:15px/1.5 system-ui}h1,h2{font-weight:600}h2{margin-top:28px;border-top:1px solid #647b66;padding-top:12px}p{color:#b8c4a8}div{display:flex;align-items:center;gap:12px;padding:4px 0}div.in b{color:#f0a35e}audio{height:32px;flex:1}</style><h1>Sound effects</h1><p>Raw ElevenLabs takes first (orange are in use; edit PICKS in scripts/sfx-publish.mjs and run pnpm sfx:publish), then the trimmed clips the game plays.</p><h1>Raw takes</h1>${raw}<h1>In game</h1>${played}`);
}
