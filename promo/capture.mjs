// Records a 1080x1920 WebM per neighbourhood by flying a scripted camera through
// the real game scenes, plus one still PNG per level in promo/shots/.
//
//   node promo/capture.mjs              record all three levels
//   node promo/capture.mjs --stills     stills only, no video (fast way to tune keyframes)
//   node promo/capture.mjs --level queenstown
//
// Boots the Vite dev server itself (set PROMO_APP_ORIGIN to reuse one you already
// have running). Playwright video has no audio; the Encik clip carries the sound.

import { spawn, spawnSync } from 'node:child_process';
import { Agent, get } from 'node:http';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// ---------------------------------------------------------------------------
// Camera config. Keyframes are game units, the same space the region games use:
// y is height (players walk at 1.75), yaw turns left when it increases, pitch
// tilts up when it increases. Time t is seconds from the start of the clip.
// ---------------------------------------------------------------------------
export const CONFIG = {
  width: 1080,
  height: 1920,
  fov: 72,            // vertical field of view; the game uses 65 in landscape
  seconds: 6,         // clip length; the last keyframe's t should match
  headless: false,    // headed Chromium gets the GPU, which keeps the dolly smooth
  port: 5199,         // dev server port used for capture
  levels: {
    'marina-bay': {
      // Spawn on the promenade, drift toward the bay while turning to the towers.
      still: { x: -34, y: 2.4, z: 58, yaw: -0.98, pitch: 0.16 },
      keyframes: [
        { t: 0, x: -44, y: 2.0, z: 67, yaw: -0.82, pitch: 0.16 },
        { t: 6, x: -30, y: 2.6, z: 54, yaw: -1.08, pitch: 0.14 },
      ],
    },
    'queenstown': {
      // Still: the station sign. Video: the lane between two blocks, void decks either side.
      still: { x: -12, y: 2.2, z: 70, yaw: -0.35, pitch: 0.14 },
      keyframes: [
        { t: 0, x: -28, y: 1.9, z: -61, yaw: 1.62, pitch: 0.2 },
        { t: 6, x: -46, y: 2.4, z: -62, yaw: 1.42, pitch: 0.16 },
      ],
    },
    'raffles-place': {
      // Across the plaza toward One Raffles and the red MRT pavilion canopy.
      still: { x: -50, y: 2.2, z: 30, yaw: 0.9, pitch: 0.3 },
      keyframes: [
        { t: 0, x: -30, y: 1.9, z: 46, yaw: 0.72, pitch: 0.3 },
        { t: 6, x: -50, y: 2.5, z: 28, yaw: 0.98, pitch: 0.26 },
      ],
    },
  },
};

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const stillsOnly = args.includes('--stills');
const only = args.includes('--level') ? args[args.indexOf('--level') + 1] : null;
const levels = Object.keys(CONFIG.levels).filter(id => !only || id === only);
if (!levels.length) throw new Error(`Unknown level "${only}". Known: ${Object.keys(CONFIG.levels).join(', ')}`);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Explicit agent: fetch and the default agent honour HTTP_PROXY, and a proxy cannot reach loopback.
const responds = url => new Promise(resolve => get(url, { agent: new Agent() }, response => { response.resume(); resolve(response.statusCode === 200); }).on('error', () => resolve(false)));

async function startDevServer() {
  if (process.env.PROMO_APP_ORIGIN) return { origin: process.env.PROMO_APP_ORIGIN, stop() {} };
  const origin = `http://127.0.0.1:${CONFIG.port}`;
  if (await responds(`${origin}/`)) throw new Error(`Something already answers on ${origin}. Stop it, or set PROMO_APP_ORIGIN to reuse it.`);
  // Run vite directly in its own process group so stop() takes the whole tree down.
  const vite = join(root, 'node_modules', '.bin', 'vite');
  const child = spawn(vite, ['--port', String(CONFIG.port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  const stop = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} };
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Dev server exited early:\n${log}`);
    if (await responds(`${origin}/promo/capture-page.html`)) return { origin, stop };
    await sleep(200);
  }
  stop();
  throw new Error(`Dev server did not answer on ${origin}:\n${log}`);
}

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) return 'ffmpeg';
  try { return spawnSync(process.execPath, ['-p', 'require("ffmpeg-static")'], { cwd: here, encoding: 'utf8' }).stdout.trim() || null; } catch { return null; }
}

function probeSeconds(ffmpeg, file) {
  const out = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr;
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

// Playwright records from the moment the context opens, so the raw file carries
// the page load and scene build. The scripted path is always the tail: keep it.
function trimTail(ffmpeg, input, output, seconds) {
  const total = probeSeconds(ffmpeg, input);
  const start = total === null ? 0 : Math.max(0, total - seconds);
  const result = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', start.toFixed(3), '-i', input, '-t', String(seconds), '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '24', '-row-mt', '1', '-pix_fmt', 'yuv420p', output], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`ffmpeg failed trimming ${input}`);
}

async function main() {
  const shots = join(here, 'shots'), clips = join(here, 'clips');
  await mkdir(shots, { recursive: true });
  await mkdir(clips, { recursive: true });
  const ffmpeg = stillsOnly ? null : findFfmpeg();
  if (!stillsOnly && !ffmpeg) console.warn('ffmpeg not found: raw recordings will be left untrimmed (assemble.mjs still takes the last 6 seconds).');

  const server = await startDevServer();
  const browser = await chromium.launch({ headless: CONFIG.headless, args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
  try {
    for (const id of levels) {
      const level = CONFIG.levels[id];
      const context = await browser.newContext({
        viewport: { width: CONFIG.width, height: CONFIG.height },
        deviceScaleFactor: 1,
        ...(stillsOnly ? {} : { recordVideo: { dir: clips, size: { width: CONFIG.width, height: CONFIG.height } } }),
      });
      const page = await context.newPage();
      page.on('pageerror', error => console.error(`[${id}] page error:`, error.message));
      await page.goto(`${server.origin}/promo/capture-page.html?level=${id}`);
      await page.waitForFunction(() => window.__promoReady === true, null, { timeout: 60000 });
      await page.evaluate(fov => window.__promo.setFov(fov), CONFIG.fov);

      await page.evaluate(pose => window.__promo.hold(pose), level.still);
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(shots, `${id}.png`), type: 'png' });
      console.log(`[${id}] still saved to promo/shots/${id}.png`);

      if (!stillsOnly) {
        await page.evaluate(pose => window.__promo.hold(pose), level.keyframes[0]);
        await page.waitForTimeout(300);
        const started = Date.now();
        const frames = await page.evaluate(keyframes => window.__promo.run(keyframes), level.keyframes);
        const elapsed = (Date.now() - started) / 1000;
        console.log(`[${id}] path played: ${frames} frames in ${elapsed.toFixed(2)}s (${(frames / elapsed).toFixed(1)} fps)`);
      }
      const video = page.video();
      await context.close();
      if (video) {
        const raw = join(clips, `${id}.raw.webm`), final = join(clips, `${id}.webm`);
        await rename(await video.path(), raw);
        if (ffmpeg) { trimTail(ffmpeg, raw, final, CONFIG.seconds); await rm(raw); }
        else await rename(raw, final);
        console.log(`[${id}] clip saved to promo/clips/${id}.webm (${((await stat(final)).size / 1e6).toFixed(1)} MB)`);
      }
    }
  } finally {
    await browser.close();
    server.stop();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
