import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { isEnemyIssue, itemById } from './armory-catalog';
import { createProfile, fittedVariantSpec, previewLoadout, restoreProfile } from './armory-state';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { getArenaRole, listArenaRoles } from './arena-roles';
import { arenaCharacterLook, arenaRoleColor } from './character-looks';
import { ENEMY_ULTRA_CATALOG } from './enemy-ultra-catalog';
import { ELITE_SQUAD, eliteRoster, eliteSquadPoints, isEliteEvent } from './elite-squads';
import { COMBAT_TABLES, createCombatDirector } from './combat-director';
import { combatRandom, combatTimeline, getCombatEvent } from './combat-events';
import { createExpeditionLoot, createFieldEquipment, equipFieldLoot, rollZoneWeapon } from './expedition-loot';
import { buildServiceWeapon } from './service-weapon-models';
import { dressWeapon } from './armory-visuals';
import { muzzleSocket, LASER_EMITTER, LIGHT_EMITTER } from './weapon-accessory-models';
import { shootAndLand } from './arena-test-shots';

const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
const environment: ArenaEnvironment = { bounds, spawns: [{ x: 0, z: 0 }, { x: 80, z: 0 }], playerSpawn: { x: 0, z: 0 }, endless: true,
  move: (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }) };
function arena() {
  const sim = createArena([], 0, 'mixed', environment);
  sim.addPlayer('one', 'Alpha', 0, 0, [{ damage: 200, interval: .06, capacity: 200, reload: .5 }], undefined, true);
  return sim;
}
function advance(sim: ArenaSimulation, seconds: number) { for (let left = seconds; left > 1e-8; left -= .1) sim.step(Math.min(.1, left)); }
const eliteActors = (sim: ArenaSimulation) => sim.snapshot().actors.filter(a => a.id.includes('-elite-'));
const start = (sim: ArenaSimulation, kind = 'elite-sweep') => sim.triggerEvent(kind, { x: 80, z: 0 }, 0)!;
const view = (now: number, enemyHeat = 0) => ({ now, enemyHeat, active: [], humans: [{ x: 0, z: 0 }], bounds });

describe('rare enemy firearms', () => {
  it('resolves distinct supported Ultra/Legendary configurations with real accessories', () => {
    expect(ENEMY_ULTRA_CATALOG.filter(i => i.tier === 'Ultra')).toHaveLength(3);
    expect(ENEMY_ULTRA_CATALOG.filter(i => i.tier === 'Legendary')).toHaveLength(2);
    const damage = [40, 46, 43, 58, 51];
    ENEMY_ULTRA_CATALOG.forEach((item, index) => {
      expect(isEnemyIssue(item)).toBe(true);
      const spec = fittedVariantSpec(item)!;
      expect(spec.damage).toBe(damage[index]);
      const model = buildServiceWeapon(spec.id)!;
      const weapon = previewLoadout(createProfile(), item, item.family!).weapons[item.family!];
      expect(spec.accessories).toEqual(weapon.accessories);
      expect(spec.ballistics).toEqual(weapon.ballistics);
      expect(spec.recoil).toBe(weapon.recoil);
      const restore = dressWeapon(model, weapon);
      expect(muzzleSocket(model, spec.id)?.name).toBe('fps-muzzle-exit');
      if (item.id !== 'mg4-bastion') {
        expect(model.getObjectByName(LASER_EMITTER)).toBeTruthy(); expect(model.getObjectByName(LIGHT_EMITTER)).toBeTruthy();
      }
      model.updateMatrixWorld(true);
      expect(Number.isFinite(muzzleSocket(model, spec.id)!.getWorldPosition(new THREE.Vector3()).z)).toBe(true);
      restore(); expect(model.getObjectByName('equipped-accessories')).toBeUndefined();
    });
  });
  it('keeps all five out of ordinary patrols, crates and persistent ownership', () => {
    for (const role of listArenaRoles()) expect(role.armament.some(c => ENEMY_ULTRA_CATALOG.some(i => i.id === c.variant))).toBe(false);
    const random = combatRandom(42);
    for (let i = 0; i < 400; i++) expect(isEnemyIssue(rollZoneWeapon('raffles-place', random, 1))).toBe(false);
    const profile = createProfile();
    const restored = restoreProfile(JSON.stringify({ ...profile, owned: [...profile.owned, ...ENEMY_ULTRA_CATALOG.map(i => i.id)] }));
    for (const item of ENEMY_ULTRA_CATALOG) expect(restored.owned).not.toContain(item.id);
  });
  it('drops the actual Ultra and Legendary weapon and equips it for this expedition', () => {
    for (const item of ENEMY_ULTRA_CATALOG) {
      const loot = createExpeditionLoot(item.id), at = { x: 3, z: 4, y: 0 };
      const drop = loot.drop('marina-bay', item.id, at)!;
      expect(drop.loot).toMatchObject({ tier: item.tier, catalogId: item.id, dropped: true });
      const taken = loot.collect('marina-bay', drop.loot.id, at)!;
      expect(equipFieldLoot(createFieldEquipment(), taken).weapons[item.family!]).toBe(item.id);
    }
  });
});

describe('rare squad director', () => {
  it('excludes low-risk districts and gives sweeps a three-minute grace', () => {
    expect(COMBAT_TABLES.low.some(e => isEliteEvent(e.kind))).toBe(false);
    const entry = COMBAT_TABLES.medium.find(e => e.kind === 'elite-sweep')!;
    const director = createCombatDirector({ risk: 'medium', seed: 4, table: [entry] });
    expect(director.step(view(179))).toBeNull();
    expect(director.step(view(184))?.kind).toBe('elite-sweep');
  });
  it('requires six minutes and 45 continuous seconds at .8 heat for a command hunt', () => {
    const entry = COMBAT_TABLES.high.find(e => e.kind === 'command-hunt')!;
    const director = createCombatDirector({ risk: 'high', seed: 5, table: [entry] });
    expect(director.step(view(300, .85))).toBeNull();
    expect(director.step(view(350, .85))).toBeNull();
    expect(director.step(view(360, .79))).toBeNull();
    expect(director.step(view(370, .85))).toBeNull();
    expect(director.step(view(414, .85))).toBeNull();
    expect(director.step(view(419, .85))?.kind).toBe('command-hunt');
    director.reset(); expect(director.step(view(600, .85))).toBeNull();
  });
  it('shares a ten-minute cooldown and never stacks elite events', () => {
    const entries = COMBAT_TABLES.high.filter(e => isEliteEvent(e.kind));
    const director = createCombatDirector({ risk: 'high', seed: 6, table: entries });
    const first = director.step(view(200))!;
    expect(first.kind).toBe('elite-sweep');
    expect(director.step(view(500, .9))).toBeNull();
    expect(director.step({ ...view(810, .9), active: [{ ...first, id: 'existing', kind: 'command-hunt', start: 800 }] })).toBeNull();
    expect(director.step(view(816, .9))).toBeTruthy();
  });
});

describe('elite deployment and combat', () => {
  it.each(['elite-sweep', 'command-hunt'])('fields four veterans after the full warning: %s', kind => {
    const sim = arena(), event = start(sim, kind);
    expect(event).toBeTruthy();
    expect(start(sim, 'command-hunt')).toBeNull();
    expect(combatTimeline(event).find(p => p.type === 'marker')).toMatchObject({ center: event.origin });
    advance(sim, ELITE_SQUAD.warning - .1); expect(eliteActors(sim)).toHaveLength(0);
    advance(sim, .2);
    const actors = eliteActors(sim);
    expect(actors).toHaveLength(4);
    expect(actors.map(a => a.role)).toEqual([...eliteRoster(kind)]);
    for (const actor of actors) {
      expect(actor.rank).toBe(3); expect(actor.armor).toBeGreaterThanOrEqual(110);
      expect(actor.health).toBe(getArenaRole(actor.role)!.health);
      expect(Math.hypot(actor.x, actor.z)).toBeGreaterThan(ELITE_SQUAD.minimumDistance - .5);
      expect(actor.faction).toBe('mercenaries');
      expect(itemById(actor.variant!)!.tier).toBe(actor.role === 'elite-commander' ? 'Legendary' : 'Ultra');
    }
    expect(validArenaSnapshot(JSON.parse(JSON.stringify(sim.snapshot())))).toBe(true);
    const positions = actors.map(a => ({ x: a.x, z: a.z }));
    advance(sim, 4);
    expect(eliteActors(sim).some((a, i) => Math.hypot(a.x - positions[i].x, a.z - positions[i].z) > .5)).toBe(true);
    expect(eliteActors(sim).some(a => a.shots > 0)).toBe(true);
  });
  it('uses tighter aim, slower support movement and visible rare-tier markings', () => {
    const context = { distance: 30, visible: true, healthFraction: 1, strafeDirection: 1 };
    expect(getArenaRole('elite-rifleman')!.think(context).spread).toBeLessThan(getArenaRole('assault')!.think(context).spread);
    expect(getArenaRole('elite-gunner')!.speed).toBeLessThan(getArenaRole('elite-breacher')!.speed);
    for (const role of eliteRoster('command-hunt')) {
      const actor = { bot: true, role, faction: 'mercenaries', rank: 3 };
      const look = arenaCharacterLook(actor);
      expect(look.plates).toBe(true); expect(look.backpack).toBeTruthy();
      expect(arenaRoleColor(actor)).toBe(role === 'elite-commander' ? '#d4ad58' : '#8ba7ed');
    }
  });
  it('aborts a compromised insertion instead of spawning on a player', () => {
    const sim = arena(), event = start(sim);
    const at = eliteSquadPoints(event.origin!, event.heading)[0];
    for (let i = 0; i < 60; i++) { sim.setInput('one', { ...at, y: 1.75, yaw: 0, pitch: 0, weapon: 0, playing: true }); sim.step(.1); }
    expect(Math.hypot(sim.snapshot().actors[0].x - at.x, sim.snapshot().actors[0].z - at.z)).toBeLessThan(2);
    advance(sim, 5);
    expect(eliteActors(sim)).toHaveLength(0);
    expect(sim.snapshot().events?.[0].outcome).toBe('withdrawn');
  });
  it('refuses a blocked formation without creating a partial squad', () => {
    const sim = createArena([{ minX: 10, maxX: 200, minZ: -200, maxZ: 200 }, { minX: -200, maxX: -10, minZ: -200, maxZ: 200 }], 0, 'mixed',
      { ...environment, bounds: { minX: -12, maxX: 12, minZ: -12, maxZ: 12 }, spawns: [{ x: 0, z: 0 }] });
    sim.addPlayer('one', 'Alpha', 0, 0, undefined, undefined, true);
    expect(sim.triggerEvent('elite-sweep', { x: 0, z: 0 })).toBeNull();
    expect(eliteActors(sim)).toHaveLength(0);
  });
  it('ends a defeated squad and never respawns its commander', () => {
    const sim = arena(), event = start(sim, 'command-hunt'); sim.setPlayerHealthMultiplier('one', 10); advance(sim, 10.1);
    for (const target of eliteActors(sim).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))) {
      for (let shots = 0; shots < 12; shots++) {
        const victim = sim.snapshot().actors.find(a => a.id === target.id)!; if (!victim?.alive) break;
        const from = sim.snapshot().actors.find(a => a.id === 'one')!;
        const dx = victim.x - from.x, dy = victim.y - .62 - from.y, dz = victim.z - from.z, length = Math.hypot(dx, dy, dz);
        shootAndLand(sim, 'one', from, { x: dx / length, y: dy / length, z: dz / length }, 0); advance(sim, .2);
      }
    }
    advance(sim, .2);
    expect(eliteActors(sim).filter(a => a.alive)).toHaveLength(0);
    expect(sim.snapshot().events?.find(e => e.id === event.id)?.outcome).toBe('silenced');
    advance(sim, 10); expect(eliteActors(sim)).toHaveLength(0);
  });
  it('withdraws survivors at expiry and clears them on reset', () => {
    const sim = arena(), event = start(sim); advance(sim, 10.1);
    sim.setCombatEvents(false);
    advance(sim, getCombatEvent(event.kind)!.duration - 10);
    expect(eliteActors(sim)).toHaveLength(0);
    expect(sim.snapshot().events?.find(e => e.id === event.id)?.outcome).toBe('withdrawn');
    sim.reset(); expect(sim.snapshot().events).toBeUndefined(); expect(eliteActors(sim)).toHaveLength(0);
  });
});
