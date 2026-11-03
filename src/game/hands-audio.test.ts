import { describe, expect, it } from 'vitest';
import { PLATE_CUES, plateCue } from './hands-audio';
import { supplyMotion, supplyProfile } from './fps-healing';
import { SFX_GROUPS, sfxUrls } from './sfx-bank';
import manifest from '../audio/hands/manifest.json';

describe('armor plate sounds', () => {
  it('plays every cue once at a steady frame rate, in order', () => {
    for (const step of [.005, .013]) {
      const heard: string[] = [];
      for (let p = 0; p < 1; p += step) { const cue = plateCue(p, Math.min(1, p + step)); if (cue) heard.push(`${cue.group}@${cue.at}`); }
      expect(heard).toEqual(PLATE_CUES.map(cue => `${cue.group}@${cue.at}`));
    }
  });
  it('plays only the latest cue when a hitch passes several', () => {
    expect(plateCue(0, 1)).toBe(PLATE_CUES.at(-1));
    expect(plateCue(.4, .78)?.group).toBe('hands-plate-seat');
    expect(plateCue(.5, .6)).toBeNull();
  });
  it('lands the seat on the commit point, where the view takes the hit', () => {
    const commit = supplyProfile({ supplyType: 'field-utility', effect: { armor: 45 } }).commit;
    const seat = PLATE_CUES.find(cue => cue.group === 'hands-plate-seat')!;
    expect(seat.at).toBe(commit);
    expect(plateCue(commit - .01, commit)?.group).toBe('hands-plate-seat');
    const pitch = (p: number) => Math.abs(supplyMotion('plates', p).view.pitch);
    expect(pitch(seat.at)).toBeGreaterThan(pitch(seat.at - .05));
    expect(pitch(seat.at)).toBeGreaterThan(pitch(seat.at + .05));
  });
  it('pats when the palm is pressed against the panel', () => {
    const press = (p: number) => { const m = supplyMotion('plates', p); return m.left.z; };
    for (const cue of PLATE_CUES.filter(c => c.group === 'hands-plate-pat')) expect(press(cue.at)).toBeLessThan(press(.82));
  });
});
describe('handling recordings', () => {
  it('registers every group, with at least one short take from its own folder', () => {
    for (const group of Object.keys(manifest.groups) as (keyof typeof manifest.groups)[]) {
      expect(SFX_GROUPS).toContain(group);
      expect(sfxUrls(group, '/').every(url => url.startsWith('/audio/hands/'))).toBe(true);
      expect(manifest.groups[group].length).toBeGreaterThan(0);
      expect(Math.max(...manifest.groups[group].map(take => take.seconds))).toBeLessThanOrEqual(.6);
    }
  });
  it('leaves out the takes that came back near silent', () => {
    const files = Object.values(manifest.groups).flat().map(take => take.file).join();
    expect(files).not.toContain('hands-grenade-draw-1-');
    expect(files).not.toContain('hands-grenade-spoon-2-');
  });
});
