import { describe, expect, it } from 'vitest';
import { FPS_WEAPONS } from './fps-rules';
import { gunfireReports, MAX_REPORTS_PER_ACTOR, MAX_REPORTS_PER_SNAPSHOT } from './gunfire-reports';

const listener = { x: 0, y: 1.7, z: 0 };
const figure = (id: string, shots: number, x = 0, extra: { weapon?: number; vehicle?: 'car' } = {}) => ({ id, x, y: 1.7, z: 0, shots, weapon: extra.weapon ?? 0, ...(extra.vehicle ? { vehicle: extra.vehicle } : {}) });

describe('gunfire reports', () => {
  it('sets a baseline on first sight rather than firing', () => {
    const last = new Map<string, number>();
    expect(gunfireReports([figure('bot', 40, 20)], last, 'me', listener)).toEqual([]);
    expect(last.get('bot')).toBe(40);
  });
  it('hears each new shot, a cycle apart, with the gun it came from', () => {
    const last = new Map([['bot', 4]]), mg = FPS_WEAPONS.findIndex(w => w.caliberMm === 7.62);
    const reports = gunfireReports([figure('bot', 6, 30, { weapon: mg })], last, 'me', listener);
    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({ emitter: 'actor:bot', distance: 30, calibre: 7.62, power: FPS_WEAPONS[mg].damage, after: 0 });
    expect(reports[1].after).toBeCloseTo(FPS_WEAPONS[mg].interval);
  });
  it('leaves out our own shots and mounted gunners, whose guns sound elsewhere', () => {
    const last = new Map([['me', 0], ['gunner', 0]]);
    expect(gunfireReports([figure('me', 3), figure('gunner', 3, 10, { vehicle: 'car' })], last, 'me', listener)).toEqual([]);
  });
  it('takes a count that went back as a new baseline', () => {
    const last = new Map([['bot', 90]]);
    expect(gunfireReports([figure('bot', 2)], last, 'me', listener)).toEqual([]);
    expect(gunfireReports([figure('bot', 3)], last, 'me', listener)).toHaveLength(1);
  });
  it('caps a burst per figure and keeps the nearest when the field is loud', () => {
    const many = Array.from({ length: 5 }, (_, i) => figure(`bot${i}`, 0, 100 - i * 10));
    const last = new Map(many.map(f => [f.id, 0] as const));
    const reports = gunfireReports(many.map(f => ({ ...f, shots: 10 })), last, 'me', listener);
    expect(reports).toHaveLength(MAX_REPORTS_PER_SNAPSHOT);
    expect(reports.filter(r => r.distance === 60)).toHaveLength(MAX_REPORTS_PER_ACTOR);
    expect(reports.every((r, i) => i === 0 || r.distance >= reports[i - 1].distance)).toBe(true);
  });
  it('forgets figures that have left', () => {
    const last = new Map([['gone', 5]]);
    gunfireReports([], last, 'me', listener);
    expect(last.has('gone')).toBe(false);
  });
});

 it('hears passengers firing their equipped weapons from either rear seat', () => {
   const last = new Map([['left', 0], ['right', 0]]);
   const reports = gunfireReports([{ ...figure('left', 1, 10, { vehicle: 'car' }), seat: 2 }, { ...figure('right', 1, 12, { vehicle: 'car' }), seat: 3 }], last, 'me', listener);
   expect(reports).toHaveLength(2); expect(reports[0].calibre).toBe(FPS_WEAPONS[0].caliberMm);
 });
