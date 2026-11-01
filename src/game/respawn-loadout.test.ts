import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyRespawnLoadout, selectedRespawnLoadout } from './respawn-loadout';
import { spendRentalTime, createProfile, equip, purchase, resolveLoadout } from './armory-state';
import { ARMORY_CATALOG } from './armory-catalog';
import { createArena, type ArenaSimulation } from './arena-rules';
import { respawnEquipment } from './respawn-equipment';
import { FPS_WEAPONS } from './fps-rules';
import { shootAndLand } from './arena-test-shots';

const self = (arena: ArenaSimulation) => arena.snapshot().actors.find(actor => actor.id === 'p')!;
const advance = (arena: ArenaSimulation, seconds: number) => { for (let t = 0; t < seconds; t += .1) arena.step(.1); };
const buyer = () => ({ ...createProfile(), xp: 100000, credits: 100000, tokens: 10000 });
afterEach(() => vi.restoreAllMocks());

describe('respawn loadout selection', () => {
  it('chooses owned variants without changing wallet, armour, supplies or the saved profile', () => {
    const profile = purchase(purchase(buyer(), 'sar-vanguard').profile, 'slot-extra').profile;
    const selection = selectedRespawnLoadout(profile); selection.variants[0] = 'sar-vanguard'; selection.carry = { main: 1, extra: 0 };
    const next = applyRespawnLoadout(profile, selection)!;
    expect(next.guns[0].variant).toBe('sar-vanguard'); expect(next.carry).toEqual({ main: 1, extra: 0 });
    expect(profile.guns[0].variant).toBe('sar-issued'); expect(profile.carry).toEqual({ main: 0, extra: null });
    expect(next).toMatchObject({ credits: profile.credits, tokens: profile.tokens, plate: profile.plate, consumables: profile.consumables, owned: profile.owned });
  });

  it('rejects unavailable weapons, duplicate mains, locked slots, enemy platforms and malformed payloads', () => {
    const p = buyer(), selection = selectedRespawnLoadout(p);
    expect(applyRespawnLoadout(p, { ...selection, variants: ['sar-vanguard', ...selection.variants.slice(1)] })).toBeNull();
    for (const carry of [{ main: 0, extra: 1 }, { main: 0, extra: 0 }, { main: 2, extra: null }, { main: 5, extra: null }, { main: 1.1, extra: null }]) expect(applyRespawnLoadout(p, { ...selection, carry })).toBeNull();
    for (const bad of [null, {}, { variants: [] }, { ...selection, carry: null }]) expect(applyRespawnLoadout(p, bad)).toBeNull();
    const wrongFamily = selectedRespawnLoadout(p); wrongFamily.variants[0] = 'p30-issued';
    expect(applyRespawnLoadout(p, wrongFamily)).toBeNull();
  });

  it('allows a live rental and rejects it once expired at confirmation', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(100000);
    const profile = purchase(buyer(), 'sar-vanguard', '1h').profile, selection = selectedRespawnLoadout(profile);
    selection.variants[0] = 'sar-vanguard';
    expect(applyRespawnLoadout(profile, selection)?.guns[0].variant).toBe('sar-vanguard');
    clock.mockReturnValue(9999999999999);
    expect(applyRespawnLoadout(spendRentalTime(profile, 3600000), selection)).toBeNull();
  });

  it('changes the authority only on respawn, including a new main and sidearm', () => {
    const a = createArena([], 0), issued = resolveLoadout(createProfile());
    a.addPlayer('p', 'Player', 35, .45, issued.weapons, undefined, false, issued.carriedFamilies);
    const sidearm = ARMORY_CATALOG.find(item => item.category === 'weapon' && item.family === 2 && item.price > 0)!;
    let profile = equip(purchase(buyer(), sidearm.id).profile, sidearm.id, 2);
    profile = { ...profile, carry: { main: 1, extra: null } };
    const next = resolveLoadout(profile);
    expect(a.queuePlayerWeapons('p', next.weapons, next.carriedFamilies)).toBe(true);
    expect(self(a).weapon).toBe(0); expect(self(a).armor).toBe(35);
    a.setPlayerVitals('p', { health: 0 }); advance(a, 3.2);
    expect(self(a)).toMatchObject({ alive: true, weapon: 1, armor: 35 });
    a.setInput('p', { ...self(a), weapon: 0, playing: true });
    expect(self(a).weapon).toBe(1); // The old main is no longer carried.
    a.setInput('p', { ...self(a), weapon: 2, playing: true });
    expect(self(a).weapon).toBe(2);
  });

  it('lets a dead player replace the queued selection before the spawn timer ends', () => {
    const a = createArena([], 0); a.addPlayer('p', 'Player');
    a.setPlayerVitals('p', { health: 0 });
    expect(a.queuePlayerWeapons('p', FPS_WEAPONS, [1, 2])).toBe(true);
    expect(a.queuePlayerWeapons('p', FPS_WEAPONS, [3, 2])).toBe(true);
    advance(a, 2); expect(self(a).alive).toBe(false);
    advance(a, 1.2); expect(self(a)).toMatchObject({ alive: true, weapon: 3 });
  });

  it('falls back to issued damage when a queued rental expires before spawn', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(100000);
    const p = equip(purchase(buyer(), 'sar-vanguard', '1h').profile, 'sar-vanguard', 0);
    const loadout = resolveLoadout(p), a = createArena([], 0);
    a.addPlayer('p', 'Player'); a.addPlayer('target', 'Target');
    a.queuePlayerWeapons('p', loadout.weapons, loadout.carriedFamilies);
    a.setInput('p', { ...self(a), playing: true });
    // The queued lease spends the same active time as the current life.
    for (const weapon of loadout.weapons) if (weapon.rentalRemainingMs !== undefined) weapon.rentalRemainingMs = 100;
    a.queuePlayerWeapons('p', loadout.weapons, loadout.carriedFamilies); a.step(.2);
    a.setPlayerVitals('p', { health: 0 }); clock.mockReturnValue(9999999999999); advance(a, 3.2);
    const shooter = self(a), target = a.snapshot().actors.find(actor => actor.id === 'target')!;
    const dx = target.x - shooter.x, dy = target.y - .6 - shooter.y, dz = target.z - shooter.z, distance = Math.hypot(dx, dy, dz);
    expect(shootAndLand(a, 'p', shooter, { x: dx / distance, y: dy / distance, z: dz / distance }, 0).damage).toBe(FPS_WEAPONS[0].damage);
  });
});

it('does not let ownership from a fallen life keep an expired rented variant on respawn', () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(100000);
  const selected = equip(purchase(buyer(), 'sar-vanguard', '1h').profile, 'sar-vanguard', 0);
  const field = { ...selected, owned: [...selected.owned, 'sar-vanguard', 'xm8-carbine'] };
  clock.mockReturnValue(9999999999999);
  const respawned = respawnEquipment(field, spendRentalTime(selected, 3600000));
  expect(respawned.owned).not.toContain('sar-vanguard');
  expect(respawned.owned).not.toContain('xm8-carbine');
  expect(respawned.guns[0].variant).toBe('sar-issued');
  expect(respawned.rentals['sar-vanguard']).toBeUndefined();
  expect(resolveLoadout(respawned).weapons[0].equipment.variant).toBe('sar-issued');
});
