// Paid generation is explicit. Each take is generated once and cached; ambiguous attempts never auto-retry.
// Usage: pnpm sfx:batch                      dry run, lists every take and nothing is sent
//        pnpm sfx:batch --generate [ids…]    generates (or reuses) the takes of those sounds, or of all
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once, usage } from './encik-batch.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const cacheDirectory = path.join(root, '.cache/sfx-batch');
const ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128';
const DRY = 'recorded dry, no music, no voices, no background ambience';
/** One prompt per sound; `takes` generations of each give the game variants to rotate through. */
export const SOUNDS = [
  { id: 'rifle-556', takes: 4, seconds: 1, prompt: `A single 5.56mm assault rifle gunshot fired outdoors, close perspective beside the shooter: a sharp supersonic crack, a hard punchy blast and a short slap back off nearby concrete buildings. ${DRY}` },
  { id: 'pistol-9', takes: 4, seconds: 1, prompt: `A single 9mm handgun gunshot fired outdoors, close perspective: a sharp snappy pop with a tight punch and a short slap back off nearby concrete walls. ${DRY}` },
  { id: 'mg-762', takes: 4, seconds: 1, prompt: `A single 7.62mm general purpose machine gun shot fired outdoors, close perspective: a deep heavy blast with a loud crack and a rolling echo off nearby buildings. ${DRY}` },
  { id: 'hmg-127', takes: 4, seconds: 1.2, prompt: `A single .50 calibre heavy machine gun shot fired outdoors, close perspective: an enormous deep concussive boom with a booming low end and a long rolling echo off buildings. ${DRY}` },
  { id: 'suppressed', takes: 3, seconds: 0.6, prompt: `A single suppressed rifle gunshot, close perspective: a muffled thudding cough with the metallic clack of the bolt cycling, no loud crack. ${DRY}` },
  { id: 'distant-rifle', takes: 3, seconds: 2, prompt: `A single rifle gunshot heard from far away across a city, a dull distant pop followed by a long rolling echo off tall buildings. ${DRY}` },
  { id: 'distant-heavy', takes: 2, seconds: 2.5, prompt: `A single heavy machine gun shot heard from far away across a city, a deep distant boom followed by a long rumbling echo off tall buildings. ${DRY}` },
  // Sequences, not single steps: the game slices each into individual footfalls, so one take yields many variants.
  { id: 'walk-concrete', takes: 2, seconds: 6, prompt: `Footsteps of one soldier in rubber-soled combat boots walking at a steady pace on concrete pavement, close perspective, soft and natural, each step clearly separated. ${DRY}` },
  { id: 'run-concrete', takes: 2, seconds: 5, prompt: `Footsteps of one soldier in rubber-soled combat boots jogging on concrete pavement, close perspective, light gear rustle, each footfall clearly separated. ${DRY}` },
  // Reload stages, as the weapon motion names them.
  { id: 'mag-out', takes: 2, seconds: 0.6, prompt: `A rifle magazine release button pressed and an empty metal magazine sliding out of the magazine well, close perspective. ${DRY}` },
  { id: 'mag-in', takes: 2, seconds: 0.6, prompt: `A loaded metal rifle magazine sliding into the magazine well, close perspective. ${DRY}` },
  { id: 'mag-seat', takes: 2, seconds: 0.5, prompt: `A rifle magazine slapped firmly home and locking with a solid metallic click, close perspective. ${DRY}` },
  { id: 'bolt-back', takes: 2, seconds: 0.6, prompt: `A rifle charging handle pulled sharply back against its spring, a metallic scrape, close perspective. ${DRY}` },
  { id: 'bolt-release', takes: 2, seconds: 0.5, prompt: `A rifle bolt released and slamming forward to chamber a round, a sharp loud metallic clack, close perspective. ${DRY}` },
];
/** The newer model gets its own takes of every gunshot, so the two can be compared by ear. */
const V3 = SOUNDS.filter(s => /^(rifle|pistol|mg|hmg|suppressed|distant)/.test(s.id)).map(s => ({ ...s, id: s.id + '-v3', takes: Math.min(3, s.takes), model: 'eleven_text_to_sound_v3' }));
SOUNDS.push(...V3);
export const settings = { model_id: 'eleven_text_to_sound_v2', prompt_influence: 0.5 };
export const takes = SOUNDS.flatMap(sound => Array.from({ length: sound.takes }, (_, i) => ({ id: `${sound.id}-${i + 1}`, sound: sound.id, request: { ...settings, ...sound.model && { model_id: sound.model }, text: sound.prompt, duration_seconds: sound.seconds } })));
const writeJson = (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');

async function generate(key, only) {
  if (!key?.trim()) throw Error('ELEVENLABS_API_KEY is required in the private environment.');
  const chosen = takes.filter(take => !only.length || only.includes(take.sound) || only.includes(take.id));
  if (!chosen.length) throw Error(`No sound matches ${only.join(', ')}.`);
  await fs.mkdir(cacheDirectory, { recursive: true });
  const before = await usage(key);
  console.log(JSON.stringify({ takes: chosen.length, before }));
  const log = [];
  for (const [i, take] of chosen.entries()) {
    // The subscription endpoint rate-limits, so credits are only read before and after the whole run.
    const result = await once({ directory: cacheDirectory, id: take.id, request: take.request, endpoint: ENDPOINT, key, binary: true });
    log.push({ id: take.id, bytes: result.bytes });
    console.log(`[${i + 1}/${chosen.length}] ${take.id}: ${result.bytes} bytes`);
  }
  const after = await usage(key).catch(() => null);
  await writeJson(path.join(cacheDirectory, `run-${Date.now()}.json`), { before, after, log });
  console.log(JSON.stringify({ after, observedCreditChange: after ? after.used - before.used : null }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--generate')) {
    try { await generate(process.env.ELEVENLABS_API_KEY, args.filter(a => !a.startsWith('--'))); } catch (error) { console.error(error.message); process.exitCode = 1; }
  } else console.log(JSON.stringify({ mode: 'dry-run; no requests', settings, takes: takes.map(t => ({ id: t.id, seconds: t.request.duration_seconds })) }, null, 2));
}
