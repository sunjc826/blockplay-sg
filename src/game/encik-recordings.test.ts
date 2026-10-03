import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import manifest from '../audio/encik/manifest.json';
import rankManifest from '../audio/encik/rank-manifest.json';
import { ENCIK_LINES } from './fps-callouts';
import { encikRecordingUrl } from './encik-recordings';
import { addressLine, encikLines } from './encik-registers';
import { rankSets, rankInsignia } from './rank-insignia';
import { MAX_LEVEL } from './progression';
it('ships one matching audio recording for every subtitle and preserves deployment base paths', () => {
  expect(manifest.clips).toHaveLength(48);
  for (const [event, lines] of Object.entries(ENCIK_LINES)) {
    lines.forEach((text, index) => {
      const clip = manifest.clips.find(c => c.event === event && c.index === index);
      expect(clip?.text).toBe(text);
      const url = encikRecordingUrl({ event: event as keyof typeof ENCIK_LINES, text }, '/demo/');
      expect(url).toBe(`/demo/audio/encik/${clip!.file}`);
      const data = readFileSync(new URL(`../../public/audio/encik/${clip!.file}`, import.meta.url));
      expect(data.length).toBe(clip!.bytes);
      expect(createHash('sha256').update(data).digest('hex')).toBe(clip!.sha256);
    });
  }
});
it('records every reachable callout for every shipped rank set and level', () => {
  for (const set of rankSets()) for (let level = 1; level <= MAX_LEVEL; level++) {
    for (const tone of ['rank', 'recruit'] as const) {
      const address = { level, rank: rankInsignia(level, set.id).title, tone };
      for (const event of Object.keys(ENCIK_LINES) as (keyof typeof ENCIK_LINES)[]) {
        for (const template of encikLines(event, address)) {
          const text = addressLine(template, address.rank);
          expect(encikRecordingUrl({ event, text }, '/demo/'), `${set.id} level ${level}: ${text}`).toMatch(/^\/demo\/audio\/encik\/.+\.mp3$/);
        }
      }
    }
  }
});
it('ships intact rank recordings with unique exact-text lookup keys', () => {
  const keys = new Set(manifest.clips.map(c => `${c.event}\n${c.text}`));
  for (const clip of rankManifest.clips) {
    const key = `${clip.event}\n${clip.text}`;
    expect(keys.has(key)).toBe(false);
    keys.add(key);
    expect(clip.text).not.toContain('{rank}');
    const data = readFileSync(new URL(`../../public/audio/encik/${clip.file}`, import.meta.url));
    expect(data.length).toBe(clip.bytes);
    expect(createHash('sha256').update(data).digest('hex')).toBe(clip.sha256);
  }
});
it('does not play a mismatched recording if a subtitle changes', () => {
  expect(encikRecordingUrl({ event: 'start', text: 'A new line without a recording' })).toBeNull();
});
