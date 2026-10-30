import { describe, expect, it } from 'vitest';
import { createFacilities, FACILITY_RULES, facilityOperational, facilityRayDistance, validFacilitySnapshot, type FacilitySite, type FacilityActor } from './facilities';

const site: FacilitySite = { id: 'depot', name: 'Depot', kind: 'garage', x: 0, y: 0, z: 0, initialOwner: 'mercenaries', deployment: { x: 12, z: 0, yaw: 0 } };
const soldier = (id: string, faction = 'armed-forces', x = 2): FacilityActor => ({ id, faction, x, y: 1.75, feet: 0, z: 0, alive: true });
const tick = (f: ReturnType<typeof createFacilities>, seconds: number, actors: FacilityActor[]) => { for (let t = 0; t < seconds - .001; t += .25) f.step(.25, actors); };

describe('local infrastructure control', () => {
  it('captures intact equipment with a sustained advantage even while a defender remains', () => {
    const f = createFacilities([site]);
    f.damage('depot', 100, 'armed-forces');
    const present = [soldier('p'), soldier('ally', 'armed-forces', 5), soldier('defender', 'mercenaries', 10)];
    f.step(.1, present); expect(f.request('depot', 'p')).toBe(true);
    tick(f, 25, present);
    expect(f.sites[0].owner).toBe('armed-forces'); expect(f.sites[0].health).toBe(550);
    expect(f.sites[0].contested).toBe(true); expect(facilityOperational(f.sites[0], 'armed-forces')).toBe(true);
  });
  it('stalls an evenly matched capture and resumes when help arrives', () => {
    const f = createFacilities([site]), present = [soldier('p'), soldier('defender', 'mercenaries', 10)];
    f.step(.1, present); f.request('depot', 'p'); tick(f, 30, present);
    expect(f.sites[0].action?.progress).toBe(0); expect(f.sites[0].action?.stalled).toBe(true);
    tick(f, 25, [...present, soldier('ally', 'armed-forces', 5)]);
    expect(f.sites[0].owner).toBe('armed-forces');
  });
  it('uses local security to suppress deployments without changing ownership', () => {
    const f = createFacilities([site]), attackers = [soldier('p')];
    tick(f, 4, attackers); expect(facilityOperational(f.sites[0])).toBe(true);
    tick(f, 2, attackers); expect(f.sites[0].suppressed).toBe(true); expect(f.sites[0].owner).toBe('mercenaries');
    tick(f, 3, []); expect(facilityOperational(f.sites[0])).toBe(true);
  });
  it('keeps disconnected pockets independent', () => {
    const f = createFacilities([site, { ...site, id: 'opposite-corner', x: 100, z: 100 }]);
    const present = [soldier('p')]; f.step(.1, present); f.request('depot', 'p'); tick(f, 25, present);
    expect(f.sites.map(s => s.owner)).toEqual(['armed-forces', 'mercenaries']);
  });
  it.each(['floor', 'vehicle', 'dead', 'wall', 'paused', 'far'])('does not accept a takeover from an ineligible %s actor', kind => {
    const f = createFacilities([site]), a = soldier('p');
    if (kind === 'floor') { a.feet = 4; a.y = 5.75; }
    if (kind === 'vehicle') a.vehicle = 'car';
    if (kind === 'dead') a.alive = false;
    if (kind === 'paused') a.playing = false;
    if (kind === 'far') a.x = 5;
    f.step(.1, [a], () => kind !== 'wall'); expect(f.request('depot', 'p')).toBe(false);
  });
  it('ignores defenders on a different floor, behind walls, or outside the local radius', () => {
    const f = createFacilities([site]), p = soldier('p');
    const present = [p, { ...soldier('upstairs', 'mercenaries'), feet: 5, y: 6.75 }, soldier('far', 'mercenaries', 50), soldier('hidden', 'mercenaries', -5)];
    for (let t = 0; t < 26; t += .25) { f.step(.25, present, (_, b) => b.x >= 0); if (t === 0) f.request('depot', 'p'); }
    expect(f.sites[0].owner).toBe('armed-forces');
  });
  it('destruction disables deployment, preserves ownership, and requires paid reconstruction', () => {
    const f = createFacilities([site]), present = [soldier('p')];
    expect(f.damage('depot', 1000, 'mercenaries')).toBe(0);
    expect(f.damage('depot', 1000, 'armed-forces')).toBe(650);
    expect(f.sites[0].owner).toBe('mercenaries'); expect(facilityOperational(f.sites[0])).toBe(false);
    f.step(.1, present); const before = f.supplies['armed-forces'];
    expect(f.request('depot', 'p')).toBe(true); expect(f.supplies['armed-forces']).toBe(before - 50);
    expect(f.request('depot', 'p')).toBe(false);
    tick(f, 23, present); expect(f.sites[0].owner).toBe('armed-forces'); expect(f.sites[0].health).toBe(650);
  });
  it('repairs damaged allied equipment instead of charging for a rebuild', () => {
    const f = createFacilities([{ ...site, initialOwner: 'armed-forces' }]), present = [soldier('p')];
    f.damage('depot', 200, 'mercenaries'); f.step(.1, present); f.request('depot', 'p');
    expect(f.sites[0].action?.kind).toBe('repair'); tick(f, 13, present); expect(f.sites[0].health).toBe(650);
  });
  it('cancels and refunds unfinished construction if its worker leaves or the district unloads', () => {
    const f = createFacilities([{ ...site, initialOwner: null }]), present = [soldier('p')];
    f.step(.1, present); f.request('depot', 'p'); tick(f, 5, present);
    const saved = f.snapshot(), back = createFacilities([site], saved);
    expect(back.sites[0].health).toBe(0); expect(back.sites[0].owner).toBe(null); expect(back.sites[0].action).toBe(null);
    expect(back.supplies['armed-forces']).toBeCloseTo(saved.supplies['armed-forces'] + 50);
    f.step(.1, []); expect(f.sites[0].action).toBe(null); expect(f.supplies['armed-forces']).toBeGreaterThan(100);
  });
  it('persists damage, ownership, supplies and deployment cooldowns without aliasing snapshots', () => {
    const f = createFacilities([site]); f.damage('depot', 123, 'armed-forces'); f.spend('mercenaries', 80);
    const saved = f.snapshot(), back = createFacilities([site], saved);
    expect(back.snapshot()).toEqual(saved); saved.sites[0].health = 0; expect(back.sites[0].health).toBe(527);
  });
  it('enforces resource limits and rejects malformed network state', () => {
    const f = createFacilities([site]); expect(f.spend('mercenaries', 1000)).toBe(false); expect(f.spend('mercenaries', -10)).toBe(false);
    tick(f, 200, []); expect(f.supplies.mercenaries).toBe(FACILITY_RULES.supplyCap);
    expect(validFacilitySnapshot(f.snapshot())).toBe(true);
    const bad = f.snapshot(); bad.sites.push(bad.sites[0]); expect(validFacilitySnapshot(bad)).toBe(false);
    const poison = f.snapshot(); poison.sites[0].health = NaN; expect(validFacilitySnapshot(poison)).toBe(false);
    expect(validFacilitySnapshot({ sites: [null], supplies: f.supplies })).toBe(false);
  });
  it('hits the cabinet volume and stops hitting destroyed equipment', () => {
    const f = createFacilities([site]);
    expect(facilityRayDistance(f.sites[0], { x: -10, y: 1, z: 0 }, { x: 1, y: 0, z: 0 })).toBeCloseTo(9.15);
    expect(facilityRayDistance(f.sites[0], { x: -10, y: 4, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(Infinity);
    f.damage('depot', 1000); expect(facilityRayDistance(f.sites[0], { x: -10, y: 1, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(Infinity);
  });
});
