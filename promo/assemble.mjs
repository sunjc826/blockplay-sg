// Cuts the 20-second 1080x1920 reel: the two Encik takes first (range, then
// arena), then the three neighbourhood clips, hard cuts, text burned in at each cut point. The audio
// track is encik.mp4's audio, running under the whole reel.
//
//   node promo/assemble.mjs
//
// If promo/encik.mp4 is missing (build it with promo/encik.mjs or record it by
// hand), its slots become plain slates so the cuts and overlays can still be checked. Uses ffmpeg from PATH, or FFMPEG=...,
// or the ffmpeg-static binary installed with promo/package.json.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Edit config. All times are seconds on the finished reel's timeline. Each
// segment's `from` is where the cut starts inside its source file.
// ---------------------------------------------------------------------------
export const CONFIG = {
  output: 'render/blockplay-reel.mp4',
  width: 1080,
  height: 1920,
  fps: 30,
  total: 20,
  segments: [
    { id: 'range', file: 'encik.mp4', from: 0, seconds: 4 },     // target range take
    { id: 'arena', file: 'encik.mp4', from: 4, seconds: 4 },     // getting shot in the arena
    { id: 'marina-bay', file: 'clips/marina-bay.webm', from: 0, seconds: 4 },
    { id: 'queenstown', file: 'clips/queenstown.webm', from: 0, seconds: 4 },
    { id: 'raffles-place', file: 'clips/raffles-place.webm', from: 0, seconds: 4 },
  ],
  audio: { file: 'encik.mp4', from: 0 },   // plays under the entire reel, padded with silence if short
  // Overlays appear at the cut points. `at` and `until` are reel seconds.
  overlays: [
    { at: 0, until: 4, eyebrow: 'FIELD RANGE', title: 'Encik is\nwatching.', body: 'Real callouts. Real kancheong.' },
    { at: 4, until: 8, eyebrow: 'SOLO ARENA', title: 'Encik is\nnot impressed.', body: 'Find cover lah.' },
    { at: 8, until: 12, eyebrow: 'LEVEL 01', title: 'Marina Bay', body: 'Walk the promenade, collect stamps.' },
    { at: 12, until: 16, eyebrow: 'LEVEL 02', title: 'Queenstown', body: 'Void decks, the station, the kopi shop.' },
    { at: 16, until: 20, eyebrow: 'LEVEL 03', title: 'Raffles Place', body: 'Towers, plazas, the river.' },
  ],
  // Site plate that stays on for the whole reel.
  plate: { text: 'blockplaysg.fun', at: 0, until: 20 },
  style: {
    // Palette and fonts from src/styles.css.
    titleFont: 'fonts/Manrope-800.ttf',
    bodyFont: 'fonts/DMSans-500.ttf',
    eyebrowFont: 'fonts/DMSans-500.ttf',
    ink: '#fbfcf6',          // page cream, used for text on the dark panel
    panel: '#17231e',        // theme-color green
    panelAlpha: 0.82,
    accent: '#f0a34a',       // favicon orange
    titleSize: 104,
    bodySize: 46,
    eyebrowSize: 40,
    marginX: 72,
    baseline: 1500,          // top of the eyebrow, measured from the top of the frame
    fadeSeconds: 0.35,
  },
};

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) return 'ffmpeg';
  try {
    const out = spawnSync(process.execPath, ['-p', 'require("ffmpeg-static")'], { cwd: here, encoding: 'utf8' }).stdout.trim();
    if (out && existsSync(out)) return out;
  } catch {}
  throw new Error('ffmpeg not found. Install it, set FFMPEG=/path/to/ffmpeg, or run pnpm install inside promo/.');
}

function probe(ffmpeg, file) {
  const err = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr;
  const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
  return {
    seconds: duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : null,
    hasAudio: /Stream #\d+:\d+.*Audio/.test(err),
  };
}

// drawtext needs a few characters escaped inside the filter graph.
const text = value => value.replace(/\\/g, '\\\\\\\\').replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:').replace(/%/g, '\\%').replace(/,/g, '\\,');
const fontfile = file => join(here, file).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/,/g, '\\,');
const hex = value => value.replace('#', '0x');

function draw({ font, size, color, x, y, at, until, value, box, fade }) {
  const fadeIn = `if(lt(t-${at},${fade}),(t-${at})/${fade},1)`;
  const fadeOut = `if(lt(${until}-t,${fade}),(${until}-t)/${fade},1)`;
  const parts = [
    `fontfile='${fontfile(font)}'`, `text='${text(value)}'`, `fontsize=${size}`, `fontcolor=${hex(color)}`,
    `x=${x}`, `y=${y}`, `line_spacing=${Math.round(size * 0.08)}`,
    `enable='between(t,${at},${until})'`, `alpha='min(${fadeIn},${fadeOut})'`,
  ];
  if (box) parts.push('box=1', `boxcolor=${hex(box.color)}@${box.alpha}`, `boxborderw=${box.pad}`);
  return `drawtext=${parts.join(':')}`;
}

function main() {
  const ffmpeg = findFfmpeg();
  const s = CONFIG.style;
  const inputs = [], filters = [], concat = [];
  const encikPath = join(here, CONFIG.audio.file);
  const hasEncik = existsSync(encikPath);
  const planned = CONFIG.segments.reduce((sum, seg) => sum + seg.seconds, 0);
  if (planned !== CONFIG.total) console.warn(`Segments add up to ${planned}s, config total is ${CONFIG.total}s.`);

  CONFIG.segments.forEach((seg, i) => {
    const file = join(here, seg.file);
    const label = `v${i}`;
    if (!existsSync(file)) {
      if (seg.file !== CONFIG.audio.file) throw new Error(`Missing ${seg.file}. Run promo/capture.mjs first.`);
      console.warn(`No ${seg.file} yet: using a slate for the ${seg.id} slot (silent version).`);
      inputs.push('-f', 'lavfi', '-t', String(seg.seconds), '-i', `color=c=${hex(s.panel)}:s=${CONFIG.width}x${CONFIG.height}:r=${CONFIG.fps}`);
      filters.push(`[${i}:v]${draw({ font: s.bodyFont, size: 44, color: s.accent, x: '(w-text_w)/2', y: '(h-text_h)/2', at: 0, until: seg.seconds, value: 'encik.mp4 goes here', fade: 0 })},format=yuv420p[${label}]`);
    } else {
      const info = probe(ffmpeg, file);
      if (info.seconds !== null && info.seconds < seg.from + seg.seconds) console.warn(`${seg.file} is ${info.seconds.toFixed(2)}s, shorter than the ${seg.from + seg.seconds}s the cut needs; ffmpeg will hold its last frame.`);
      inputs.push('-i', file);
      // Scale to cover, crop to portrait, lock the frame rate, so every cut is the same shape.
      filters.push(`[${i}:v]trim=start=${seg.from}:duration=${seg.seconds},setpts=PTS-STARTPTS,scale=${CONFIG.width}:${CONFIG.height}:force_original_aspect_ratio=increase,crop=${CONFIG.width}:${CONFIG.height},fps=${CONFIG.fps},tpad=stop_mode=clone:stop_duration=${seg.seconds},trim=duration=${seg.seconds},setpts=PTS-STARTPTS,format=yuv420p[${label}]`);
    }
    concat.push(`[${label}]`);
  });
  filters.push(`${concat.join('')}concat=n=${CONFIG.segments.length}:v=1:a=0[cut]`);

  const overlays = [];
  for (const o of CONFIG.overlays) {
    const fade = s.fadeSeconds;
    const box = { color: s.panel, alpha: s.panelAlpha, pad: 22 };
    overlays.push(draw({ font: s.eyebrowFont, size: s.eyebrowSize, color: s.accent, x: s.marginX, y: s.baseline, at: o.at, until: o.until, value: o.eyebrow, box, fade }));
    overlays.push(draw({ font: s.titleFont, size: s.titleSize, color: s.ink, x: s.marginX, y: s.baseline + s.eyebrowSize + 58, at: o.at, until: o.until, value: o.title, box, fade }));
    const lines = o.title.split('\n').length;
    overlays.push(draw({ font: s.bodyFont, size: s.bodySize, color: s.ink, x: s.marginX, y: s.baseline + s.eyebrowSize + 58 + lines * s.titleSize * 1.08 + 52, at: o.at, until: o.until, value: o.body, box, fade }));
  }
  if (CONFIG.plate) overlays.push(draw({ font: s.bodyFont, size: s.eyebrowSize, color: s.ink, x: `w-text_w-${s.marginX}`, y: 96, at: CONFIG.plate.at, until: CONFIG.plate.until, value: CONFIG.plate.text, box: { color: s.panel, alpha: s.panelAlpha, pad: 18 }, fade: 0 }));
  filters.push(`[cut]${overlays.join(',')}[out]`);

  let audioMap;
  if (hasEncik && probe(ffmpeg, encikPath).hasAudio) {
    const index = CONFIG.segments.length;
    inputs.push('-i', encikPath);
    filters.push(`[${index}:a]atrim=start=${CONFIG.audio.from},asetpts=PTS-STARTPTS,apad,atrim=duration=${CONFIG.total}[aud]`);
    audioMap = ['-map', '[aud]', '-c:a', 'aac', '-b:a', '192k'];
  } else {
    if (hasEncik) console.warn('encik.mp4 has no audio stream; building the silent version.');
    audioMap = ['-an'];
  }

  const output = join(here, CONFIG.output);
  mkdirSync(dirname(output), { recursive: true });
  const args = ['-y', '-hide_banner', '-loglevel', 'warning', '-stats', ...inputs,
    '-filter_complex', filters.join(';'), '-map', '[out]', ...audioMap,
    '-t', String(CONFIG.total), '-r', String(CONFIG.fps),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', output];
  if (process.env.PROMO_DEBUG) console.log(['ffmpeg', ...args].join(' '));
  const result = spawnSync(ffmpeg, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('ffmpeg failed');
  console.log(`\nReel written to ${output}${audioMap[0] === '-an' ? ' (silent version)' : ''}`);
}

main();
