// Encik's match announcer pack (TDM, FFA, Hardpoint, killstreaks). Dry run by default.
// Every paid attempt is cached once; completed clips are reused and ambiguous attempts never retry.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MATCH_LINES } from '../src/game/match-callout-lines.ts';
import { once, settings, selection, usage } from './encik-batch.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const keyFor = line => `${line.event}\n${line.text}`;
export const plan = () => Object.entries(MATCH_LINES).flatMap(([event, texts]) =>
  texts.map((text, index) => ({ id: `match-${event}-${index + 1}-${hash(text).slice(0, 8)}`, event, index, text })));
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const manifestFile = path.join(root, 'src/audio/encik/match-manifest.json');
const publicDirectory = path.join(root, 'public/audio/encik');
const directory = path.join(root, '.cache/encik-match', hash(JSON.stringify({ selection, settings })).slice(0, 12));
const writeJson = (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

export async function generate(key) {
  if (!key?.trim()) throw Error('ELEVENLABS_API_KEY is required.');
  const voice = await readJson(path.join(root, '.cache/encik-batch/voice-round4-candidate3.json'));
  if (voice.status !== 'complete' || voice.request.generated_voice_id !== selection.generatedVoiceId) throw Error('Saved Encik voice does not match the selected candidate.');
  const base = await readJson(path.join(root, 'src/audio/encik/manifest.json'));
  const ranks = await readJson(path.join(root, 'src/audio/encik/rank-manifest.json'));
  let saved;
  try { saved = await readJson(manifestFile); } catch (e) { if (e.code !== 'ENOENT') throw e; saved = { clips: [] }; }
  const existing = new Map(saved.clips.map(c => [keyFor(c), c]));
  const lines = plan(), clips = [], pending = [];
  for (const line of lines) {
    const clip = existing.get(keyFor(line));
    const data = clip && await fs.readFile(path.join(publicDirectory, clip.file)).catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
    if (data && hash(data) === clip.sha256) clips.push(clip); else pending.push(line);
  }
  const before = await usage(key);
  const characters = pending.reduce((sum, line) => sum + line.text.length, 0);
  // Eleven v3 bills at most one credit per character; keep a 2x reserve as the base batch does.
  if (before.limit - before.used < characters * 2) throw Error(`Need up to ${characters * 2} included credits in reserve; only ${before.limit - before.used} remain.`);
  await fs.mkdir(directory, { recursive: true });
  await fs.mkdir(publicDirectory, { recursive: true });
  await writeJson(path.join(directory, `usage-before-${Date.now()}.json`), before);
  console.log(JSON.stringify({ planned: lines.length, missing: pending.length, characters, before }));
  const publish = async () => {
    clips.sort((a, b) => a.id.localeCompare(b.id));
    const manifest = { version: 1, provider: 'ElevenLabs', model: settings.model_id, voice: base.voice, clips };
    await writeJson(manifestFile + '.tmp', manifest);
    await fs.rename(manifestFile + '.tmp', manifestFile);
  };
  for (let offset = 0; offset < pending.length; offset += 2) {
    const results = await Promise.allSettled(pending.slice(offset, offset + 2).map(async line => {
      const generated = await once({ directory, id: line.id, request: { ...settings, text: line.text }, endpoint: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice.voiceId)}?output_format=mp3_44100_128`, key, binary: true });
      const file = `${line.id}-${generated.sha256.slice(0, 10)}.mp3`;
      await fs.copyFile(path.join(directory, line.id + '.mp3'), path.join(publicDirectory, file));
      return { ...line, file, bytes: generated.bytes, sha256: generated.sha256 };
    }));
    for (const result of results) if (result.status === 'fulfilled') clips.push(result.value);
    await publish();
    console.log(`[${clips.length}/${lines.length}] saved`);
    const failure = results.find(r => r.status === 'rejected');
    if (failure) throw failure.reason;
  }
  await publish();
  const card = c => `<section><h2>${escape(c.id)}</h2><p>${escape(c.text)}</p><audio controls preload="none" src="${escape(c.file)}"></audio></section>`;
  const total = base.clips.length + ranks.clips.length + clips.length;
  await fs.writeFile(path.join(publicDirectory, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Encik callout pack</title><style>body{max-width:760px;margin:30px auto;padding:20px;background:#15251f;color:#f3e7c8;font:16px/1.6 system-ui}section{padding:10px 0;border-top:1px solid #647b66}audio{width:100%}h2{font-size:18px}</style><h1>Encik · ${total} callouts</h1><p>Match announcer (${clips.length}) · Recruit, Noticed, Respect and Defers · all shipped rank titles</p>${clips.map(card).join('')}${[...base.clips, ...ranks.clips].map(card).join('')}`);
  const after = await usage(key);
  await writeJson(path.join(directory, 'usage-after.json'), after);
  console.log(JSON.stringify({ complete: clips.length, after, observedCreditChange: after.used - before.used }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--generate')) {
    try { await generate(process.env.ELEVENLABS_API_KEY); } catch (error) { console.error(error.message); process.exitCode = 1; }
  } else console.log(JSON.stringify({ mode: 'dry-run; no requests', clips: plan().length, characters: plan().reduce((n, l) => n + l.text.length, 0) }, null, 2));
}
