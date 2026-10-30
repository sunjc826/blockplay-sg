// Builds promo/encik.mp4: two 1080x1920 recordings back to back, the Marina
// target range (the shooter actually hits targets) and then the Solo arena
// (the shooter gets shot), with the game's own Encik recordings muxed in as
// the soundtrack. Playwright cannot capture audio, so the lines are laid onto
// the timeline from public/audio/encik/ (the exact files the game plays).
//
//   node promo/encik.mjs            record both takes and build encik.mp4
//   node promo/encik.mjs --audio    rebuild only the audio from existing recordings
//
// Then run promo/assemble.mjs. The reel keeps this audio for its full length,
// so line times below are effectively reel times.

import { spawn, spawnSync } from 'node:child_process';
import { Agent, get } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const manifest = (await import(join(root, 'src/audio/encik/manifest.json'), { with: { type: 'json' } })).default;

// ---------------------------------------------------------------------------
// Config. `lines` are matched against the text in src/audio/encik/manifest.json,
// so they must be quoted exactly. `at` is seconds into the finished clip.
// ---------------------------------------------------------------------------
export const CONFIG = {
  output: 'encik.mp4',
  width: 1080,
  height: 1920,
  headless: false,
  port: 5199,
  health: 10,           // Debug survival multiplier from the ready menu: 1, 5 or 10
  gain: 1.0,
  takes: [
    // Marina field range: the practice targets are static, so the script aims
    // at them from src/game/fps-rules.ts coordinates and lands hits.
    { id: 'range', mode: 'practice', seconds: 4, burst: 0.55, settle: 0.25 },
    // Solo arena, taking fire. `moves`: keys held for `seconds`, `turn` is a
    // touch drag in px, `fire` holds the touch fire button for that many seconds.
    { id: 'arena', mode: 'arena', seconds: 16, bots: 2, squad: 'assault', moves: [
      { at: 0, keys: ['w'], seconds: 2.5 },
      { at: 2, turn: 260 },
      { at: 3, fire: 0.8 },
      { at: 4.5, keys: ['a'], seconds: 2 },
      { at: 6, turn: -380 },
      { at: 7.5, fire: 1.2 },
      { at: 9, keys: ['w', 'd'], seconds: 3 },
      { at: 11, turn: 200 },
      { at: 12.5, fire: 1.4 },
      { at: 14, keys: ['s'], seconds: 1.5 },
      { at: 14.5, turn: -180 },
      { at: 15, fire: 0.8 },
    ] },
  ],
  lines: [
    { at: 0.3, text: 'Solid lah! Eyes up, still got work.' },
    { at: 4.1, text: 'Oi, front! This one not sightseeing tour!' },
    { at: 7.5, text: 'Move, move! Don’t stand there like Merlion!' },
    { at: 10.7, text: 'Find cover lah! You think your ILBV is magic?' },
    { at: 14.8, text: 'Reloading, ah! Nobody say can take tea break.' },
    { at: 17.8, text: 'You clearing the whole parade square or what?' },
  ],
};

const args = process.argv.slice(2);
const audioOnly = args.includes('--audio');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const responds = url => new Promise(resolve => get(url, { agent: new Agent() }, response => { response.resume(); resolve(response.statusCode === 200); }).on('error', () => resolve(false)));
const total = CONFIG.takes.reduce((sum, take) => sum + take.seconds, 0);

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) return 'ffmpeg';
  const out = spawnSync(process.execPath, ['-p', 'require("ffmpeg-static")'], { cwd: here, encoding: 'utf8' }).stdout.trim();
  if (out && existsSync(out)) return out;
  throw new Error('ffmpeg not found. Install it, set FFMPEG=/path/to/ffmpeg, or run pnpm install inside promo/.');
}

function probeSeconds(ffmpeg, file) {
  const out = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr;
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
}

async function startDevServer() {
  if (process.env.PROMO_APP_ORIGIN) return { origin: process.env.PROMO_APP_ORIGIN, stop() {} };
  const origin = `http://127.0.0.1:${CONFIG.port}`;
  if (await responds(`${origin}/`)) throw new Error(`Something already answers on ${origin}. Stop it, or set PROMO_APP_ORIGIN to reuse it.`);
  const child = spawn(join(root, 'node_modules', '.bin', 'vite'), ['--port', String(CONFIG.port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  const stop = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} };
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Dev server exited early:\n${log}`);
    if (await responds(`${origin}/`)) return { origin, stop };
    await sleep(200);
  }
  stop();
  throw new Error(`Dev server did not answer on ${origin}:\n${log}`);
}

const byText = name => `[...document.querySelectorAll('button')].find(b => b.textContent.trim().includes(${JSON.stringify(name)}))`;
const rawFile = take => join(here, 'clips', `encik-${take.id}.raw.webm`);

// The engine reads these from src/game (fps-rules.ts, fps-pointer.ts, fps-engine.ts);
// keep them in sync if the range moves.
const RANGE = { spawn: { x: -44, z: 68, yaw: 0, pitch: -0.03 }, eye: 1.75, hitZoneY: 0.13 + 1.3, sensitivity: 0.0023,
  targets: [{ x: -44, z: 56 }, { x: -50, z: 57 }, { x: -38, z: 57 }, { x: -56, z: 62 }, { x: -32, z: 62 }, { x: -60, z: 55 }, { x: -26, z: 55 }, { x: -14, z: 64 }] };

async function recordTake(browser, server, take) {
  // hasTouch: the engine plays in touch mode without pointer lock, which automation cannot hold.
  const context = await browser.newContext({ viewport: { width: CONFIG.width, height: CONFIG.height }, deviceScaleFactor: 1, hasTouch: true, recordVideo: { dir: join(here, 'clips'), size: { width: CONFIG.width, height: CONFIG.height } } });
  const page = await context.newPage();
  // The engine pauses the moment it sees a mouse-type pointer event (it wants
  // pointer lock for mouse play). Report every pointer as touch so a stray
  // physical mouse over the recording window cannot stop the match.
  await page.addInitScript(() => { Object.defineProperty(PointerEvent.prototype, 'pointerType', { get: () => 'touch' }); });
  page.on('pageerror', error => console.error(`[${take.id}] page error:`, error.message));
  await page.goto(server.origin);
  await page.waitForSelector('.mode-card');
  if (take.mode === 'arena') {
    // Labelled "LAN arena" in local dev and "Solo arena" on the static build.
    await page.evaluate(`[...document.querySelectorAll('.mode-card')].find(b => /arena/i.test(b.textContent)).click()`);
    await page.waitForSelector('.lan-lobby');
    await page.evaluate(`${byText('Solo vs bots')}.click()`);
    await page.evaluate(({ bots, squad }) => {
      const select = document.querySelector('#lan-squad'); select.value = squad; select.dispatchEvent(new Event('change', { bubbles: true }));
      const range = document.querySelector('#lan-bot-count');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(range, String(bots));
      range.dispatchEvent(new Event('input', { bubbles: true }));
    }, { bots: take.bots, squad: take.squad });
    await page.evaluate(`${byText('Deploy against bots')}.click()`);
  } else {
    await page.evaluate(`[...document.querySelectorAll('.mode-card')].find(b => /FPS/.test(b.textContent)).click()`);
  }
  await page.waitForFunction(() => document.querySelector('.fps-game')?.dataset.phase === 'ready', null, { timeout: 60000 });
  await page.waitForTimeout(800);
  // Debug survival lives in the ready menu; pick the health multiplier so the take is not all respawns.
  await page.evaluate(multiplier => {
    const panel = [...document.querySelectorAll('details')].find(d => d.textContent.includes('Debug survival'));
    if (!panel) throw new Error('Debug survival panel not found in the ready menu');
    panel.open = true;
    const button = [...panel.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(`${multiplier}×`));
    if (!button) throw new Error(`No ${multiplier}× health button`);
    button.click(); panel.open = false;
  }, CONFIG.health);
  await page.waitForFunction(multiplier => Number(document.querySelector('.fps-game')?.dataset.health) === 100 * multiplier, CONFIG.health, { timeout: 5000 }).catch(() => console.warn(`[${take.id}] could not confirm the health multiplier from the HUD; continuing.`));

  const cdp = await context.newCDPSession(page);
  const centre = async selector => { const box = await page.locator(selector).first().boundingBox(); if (!box) throw new Error(`Cannot find ${selector}`); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
  const touch = async (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const tap = async selector => { const p = await centre(selector); await touch('touchStart', [p]); await sleep(60); await touch('touchEnd', []); };
  const drag = async (dx, dy, ms = 220) => {
    const c = await centre('.fps-viewport canvas'), steps = Math.max(6, Math.round(ms / 16));
    await touch('touchStart', [c]);
    for (let i = 1; i <= steps; i++) { await touch('touchMove', [{ x: c.x + dx * i / steps, y: c.y + dy * i / steps }]); await sleep(16); }
    await touch('touchEnd', []);
  };
  const fire = async seconds => { const p = await centre('.fps-fire-button'); await touch('touchStart', [p]); await sleep(seconds * 1000); await touch('touchEnd', []); };

  // Fill the viewport (native fullscreen, or the game's expanded-view fallback), then start by touch.
  await tap('[aria-label="Fullscreen range"]');
  await page.waitForTimeout(600);
  await tap(take.mode === 'arena' ? 'button:has-text("Start match")' : 'button:has-text("Enter range")');
  await page.waitForFunction(() => document.querySelector('.fps-game')?.dataset.phase === 'playing', null, { timeout: 30000 });
  await page.waitForTimeout(300);

  const started = Date.now();
  const clock = () => (Date.now() - started) / 1000;
  if (take.mode === 'practice') {
    // Open-loop aim: the shooter stays on the spawn point, so every target's
    // bearing is known. Turn by the same pixel maths the engine uses, then fire.
    let yaw = RANGE.spawn.yaw, pitch = RANGE.spawn.pitch;
    const eye = { x: RANGE.spawn.x, y: RANGE.eye, z: RANGE.spawn.z };
    const order = RANGE.targets.map(t => ({ ...t, d: Math.hypot(t.x - eye.x, t.z - eye.z) })).sort((a, b) => a.d - b.d);
    for (const target of order) {
      if (clock() > take.seconds - take.burst) break;
      const wantYaw = Math.atan2(-(target.x - eye.x), -(target.z - eye.z));
      const wantPitch = Math.atan2(RANGE.hitZoneY - eye.y, target.d);
      let dYaw = wantYaw - yaw; dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      const dx = -dYaw / RANGE.sensitivity, dy = -(wantPitch - pitch) / RANGE.sensitivity;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) await drag(dx, dy, 200);
      yaw = wantYaw; pitch = wantPitch;
      await sleep(take.settle * 1000);
      await fire(take.burst);
    }
    console.log(`[${take.id}] score panel: ${await page.evaluate(() => document.querySelector('.fps-score')?.textContent.trim() ?? '?')}`);
  } else {
    const queue = [...take.moves].sort((a, b) => a.at - b.at);
    const held = new Set(), tasks = [];
    let touchChain = Promise.resolve();   // touch actions share one finger, so they run in order
    while (queue.length && clock() < take.seconds) {
      const move = queue[0];
      if (clock() < move.at) { await sleep(Math.min(50, (move.at - clock()) * 1000)); continue; }
      queue.shift();
      if (move.keys) tasks.push((async () => {
        for (const key of move.keys) { await page.keyboard.down(key); held.add(key); }
        await sleep(move.seconds * 1000);
        for (const key of move.keys) { await page.keyboard.up(key); held.delete(key); }
      })());
      if (move.turn) touchChain = touchChain.then(() => drag(move.turn, 0, 320)).catch(error => console.warn(`[${take.id}] turn skipped:`, error.message));
      if (move.fire) touchChain = touchChain.then(() => fire(move.fire)).catch(error => console.warn(`[${take.id}] fire skipped:`, error.message));
    }
    await Promise.allSettled([...tasks, touchChain]);
    for (const key of held) await page.keyboard.up(key);
  }
  while (clock() < take.seconds + 0.3) await sleep(50);
  const video = page.video();
  await context.close();
  await rename(await video.path(), rawFile(take));
  console.log(`[${take.id}] raw recording saved to promo/clips/encik-${take.id}.raw.webm`);
}

async function recordAll() {
  await mkdir(join(here, 'clips'), { recursive: true });
  const server = await startDevServer();
  const browser = await chromium.launch({ headless: CONFIG.headless, args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
  try { for (const take of CONFIG.takes) await recordTake(browser, server, take); }
  finally { await browser.close(); server.stop(); }
}

function buildClip(ffmpeg, output) {
  const inputs = [], filters = [], video = [];
  CONFIG.takes.forEach((take, i) => {
    const file = rawFile(take), length = probeSeconds(ffmpeg, file);
    // Playwright records from context creation, so the take is the tail of the raw file.
    const start = length === null ? 0 : Math.max(0, length - take.seconds);
    inputs.push('-ss', start.toFixed(3), '-i', file);
    filters.push(`[${i}:v]trim=duration=${take.seconds},setpts=PTS-STARTPTS,fps=30,format=yuv420p[v${i}]`);
    video.push(`[v${i}]`);
  });
  filters.push(`${video.join('')}concat=n=${CONFIG.takes.length}:v=1:a=0[v]`);
  const mixed = [];
  console.log('Encik lines on the timeline:');
  CONFIG.lines.forEach((line, i) => {
    const clip = manifest.clips.find(c => c.text === line.text);
    if (!clip) throw new Error(`No Encik recording matches "${line.text}". Check src/audio/encik/manifest.json for the exact wording.`);
    const file = join(root, 'public', 'audio', 'encik', clip.file), seconds = probeSeconds(ffmpeg, file) ?? 0;
    if (line.at + seconds > total) console.warn(`"${line.text}" ends at ${(line.at + seconds).toFixed(1)}s, past the ${total}s clip.`);
    console.log(`  ${line.at.toFixed(1).padStart(5)}s  ${clip.event.padEnd(8)} ${line.text}`);
    const index = CONFIG.takes.length + i;
    inputs.push('-i', file);
    filters.push(`[${index}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${Math.round(line.at * 1000)}:all=1,volume=${CONFIG.gain}[l${i}]`);
    mixed.push(`[l${i}]`);
  });
  filters.push(`${mixed.join('')}amix=inputs=${mixed.length}:normalize=0,apad,atrim=duration=${total}[a]`);
  const result = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]', '-t', String(total), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('ffmpeg failed building encik.mp4');
}

async function main() {
  const ffmpeg = findFfmpeg();
  if (!audioOnly) await recordAll();
  for (const take of CONFIG.takes) if (!existsSync(rawFile(take))) throw new Error(`No promo/clips/encik-${take.id}.raw.webm to reuse. Run without --audio first.`);
  const output = join(here, CONFIG.output);
  buildClip(ffmpeg, output);
  console.log(`Encik clip written to ${output} (${total}s: ${CONFIG.takes.map(t => `${t.id} ${t.seconds}s`).join(', ')})`);
}

main().catch(error => { console.error(error); process.exit(1); });
