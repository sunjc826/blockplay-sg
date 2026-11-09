import { expect, it } from 'vitest';
import { createArena, type ArenaEnvironment } from './arena-rules';
import { TDM_AREAS } from './arena-match';
import { SMITH_CONTROL_SITES } from './hardpoint';
import { createProfile, resolveLoadout } from './armory-state';
import { validArenaSnapshot } from './arena-runtime';
import { MAX_MATCH_DROPS, MATCH_DROP_LIFETIME, matchPickupCarry } from './match-weapon-drops';
import { OICW_RIFLE, OICW_LAUNCHER } from './weapon-modes';

function setup(mode: 'tdm' | 'hardpoint' | 'ffa' | 'expedition' = 'tdm') {
  const bounds = { minX: -150, maxX: 150, minZ: -150, maxZ: 150 };
  const area = { ...TDM_AREAS[0], bounds, spawns: { alpha: [-80,-40,0,40,80].map(z => ({ x: -60, z })), bravo: [-80,-40,0,40,80].map(z => ({ x: 60, z })) } };
  const environment: ArenaEnvironment = { bounds, spawns: [...area.spawns.alpha,...area.spawns.bravo],
    move: (p, dx, dz) => ({ x: p.x+dx, z: p.z+dz }),
    ...(mode === 'tdm' ? { teamDeathmatch: area } : mode === 'hardpoint' ? { hardpoint: { area, sites: SMITH_CONTROL_SITES } } : mode === 'expedition' ? { endless: true } : {}) };
  let clear = false;
  const arena = createArena([], 0, 'mixed', environment, undefined, undefined, () => clear ? Infinity : 0);
  const profile = createProfile(); profile.owned.push('g36-rifle'); profile.guns[6].variant = 'g36-rifle'; profile.carry.main = 6;
  // Resolve family from the catalog through the loadout; G36 is family 6.
  const kit = resolveLoadout(profile);
  const normal = resolveLoadout(createProfile());
  for (const id of ['one','two','three']) arena.addPlayer(id, id, 0, 0, id === 'three' ? kit.weapons : normal.weapons, undefined, false, id === 'three' ? kit.carriedFamilies : normal.carriedFamilies);
  const actor = (id: string) => arena.snapshot().actors.find(a => a.id === id)!;
  function walk(id: string, x: number, z: number) {
    for (let i = 0; i < 400 && Math.hypot(actor(id).x-x, actor(id).z-z) > .1; i++) {
      arena.setInput(id, { ...actor(id), x, z, playing: true }); arena.step(.05);
    }
  }
  const pickup = (id: string, drop: string, blocked = false) => { clear = !blocked; const ok = arena.pickupWeapon(id, drop); clear = false; return ok; };
  return { arena, actor, walk, pickup, environment, normal };
}
it.each(['tdm','hardpoint','ffa'] as const)('%s lets a player claim an allied/human weapon once and restores the spawn kit', mode => {
  const { arena, actor, walk, pickup, environment } = setup(mode);
  expect(mode === 'ffa' || actor('one').team === actor('three').team).toBe(true);
  walk('one', actor('three').x, actor('three').z);
  arena.setPlayerVitals('three', { health: 0 });
  const drop = arena.snapshot().weaponDrops!.at(-1)!;
  expect(drop.catalogId).toBe('g36-rifle');
  expect(pickup('one', drop.id, true)).toBe(false);
  expect(pickup('one', drop.id)).toBe(true);
  const receipt = actor('one').weaponPickup!;
  expect(receipt.catalogId).toBe('g36-rifle');
  expect(receipt.carried).toEqual([6,2]);
  expect(actor('one').weapon).toBe(6);
  expect(pickup('three', drop.id)).toBe(false);
  expect(pickup('one', drop.id)).toBe(false);
  expect(validArenaSnapshot(arena.snapshot(), environment)).toBe(true);
  receipt.variants[6] = 'invalid';
  expect(actor('one').weaponPickup!.variants[6]).toBe('g36-rifle');
  arena.setPlayerVitals('one', { health: 0 });
  expect(arena.snapshot().weaponDrops!.at(-1)!.catalogId).toBe('g36-rifle');
  for (let i = 0; i < 130; i++) arena.step(.05);
  expect(actor('one').alive).toBe(true);
  expect(actor('one').weaponPickup).toBeUndefined();
  expect(actor('one').weapon).toBe(0);
});
it('rejects distant, dead, paused, missing and expired claims; bounds drops and clears rematches', () => {
  const { arena, actor, walk, pickup } = setup('ffa');
  arena.setPlayerVitals('three', { health: 0 });
  const first = arena.snapshot().weaponDrops![0];
  expect(pickup('one', first.id)).toBe(false);
  expect(pickup('three', first.id)).toBe(false);
  walk('one', first.x, first.z);
  arena.setInput('one', { ...actor('one'), playing: false });
  expect(pickup('one', first.id)).toBe(false);
  arena.setInput('one', { ...actor('one'), playing: true });
  expect(pickup('one', 'missing')).toBe(false);
  for (let i = 0; i < MAX_MATCH_DROPS + 3; i++) { arena.setPlayerVitals('three', { health: 100 }); arena.setPlayerVitals('three', { health: 0 }); }
  expect(arena.snapshot().weaponDrops).toHaveLength(MAX_MATCH_DROPS);
  expect(pickup('one', first.id)).toBe(false);
  for (let i = 0; i < MATCH_DROP_LIFETIME * 4 + 1; i++) arena.step(.25);
  expect(arena.snapshot().weaponDrops).toEqual([]);
  arena.setPlayerVitals('three', { health: 0 }); arena.reset();
  expect(arena.snapshot().weaponDrops).toEqual([]);
});
it('leaves expedition loot separate and rejects malformed network drops/receipts', () => {
  const e = setup('expedition'); e.arena.setPlayerVitals('three', { health: 0 });
  expect(e.arena.snapshot().weaponDrops).toBeUndefined();
  const { arena, environment } = setup(); arena.setPlayerVitals('three', { health: 0 });
  for (const bad of [NaN, Infinity, -1]) { const s = arena.snapshot(); s.weaponDrops![0].expires = bad; expect(validArenaSnapshot(s, environment)).toBe(false); }
  const s = arena.snapshot(); s.weaponDrops!.push({ ...s.weaponDrops![0] }); expect(validArenaSnapshot(s, environment)).toBe(false);
  const invalid = arena.snapshot(); invalid.actors[0].weaponPickup = { serial: 1, catalogId: 'bad', carried: [0,2], variants: [] };
  expect(validArenaSnapshot(invalid, environment)).toBe(false);
});
it('replaces the held main, preserves the extra/pistol, and carries integral launcher modes', () => {
  expect(matchPickupCarry([0,3,2],5,3)).toEqual([0,5,2]);
  expect(matchPickupCarry([0,3,2],5,2)).toEqual([5,3,2]);
  expect(matchPickupCarry([0,3,2],2,0)).toEqual([0,3,2]);
  expect(matchPickupCarry([0,3,2],3,0)).toEqual([0,3,2]);
  expect(matchPickupCarry([0,2],OICW_RIFLE,0)).toEqual([OICW_RIFLE,2,OICW_LAUNCHER]);
  expect(matchPickupCarry([OICW_RIFLE,2,OICW_LAUNCHER],5,OICW_LAUNCHER)).toEqual([5,2]);
});
it('keeps queued respawn choices and clears borrowed weapons on a rematch', () => {
  const { arena, actor, walk, pickup, normal } = setup('ffa');
  walk('one',actor('three').x,actor('three').z);arena.setPlayerVitals('three',{health:0});
  expect(pickup('one',arena.snapshot().weaponDrops![0].id)).toBe(true);
  arena.queuePlayerWeapons('one',normal.weapons,[1,2]);arena.setPlayerVitals('one',{health:0});
  for(let i=0;i<130;i++)arena.step(.05);
  expect(actor('one').weapon).toBe(1);expect(actor('one').weaponPickup).toBeUndefined();
  walk('one',actor('three').x,actor('three').z);arena.setPlayerVitals('three',{health:0});
  expect(pickup('one',arena.snapshot().weaponDrops!.at(-1)!.id)).toBe(true);
  arena.reset();expect(actor('one').weapon).toBe(1);expect(actor('one').weaponPickup).toBeUndefined();
  expect(arena.snapshot().weaponDrops).toEqual([]);
});
