import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createArenaRuntime } from './arena-runtime';
import { createArena } from './arena-rules';
import { getArenaFaction, listArenaFactions, PLAYER_FACTION } from './arena-factions';
import { getArenaRole, registerArenaRole } from './arena-roles';
import { arenaCharacterLook, arenaFaction, arenaRoleColor, npcCharacterLook, npcIdleGesture } from './character-looks';
import { CHARACTER_DIMENSIONS, CHARACTER_EYE, createCharacterRig, solveLimb, type CharacterDrive, type CharacterRig } from './character-rig';
import { expeditionNpcs } from './expedition-npcs';
import type { LanSession } from './lan-peer';
import { WORLD_ZONES } from './world-zones';
import { zoneSectors } from './zone-sectors';

const soldier = () => createCharacterRig(arenaCharacterLook({ bot: true, role: 'rifle', id: 'bot-1' }), 'test-soldier');
const worldOf = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3());
function run(rig: CharacterRig, drive: CharacterDrive, seconds: number, each?: () => void) {
  for (let t = 0; t < seconds; t += 1 / 60) { rig.update(1 / 60, drive); rig.root.updateMatrixWorld(true); each?.(); }
}
/** World height of the lowest point of a boot sole. */
const sole = (rig: CharacterRig, side: 'L' | 'R') => worldOf(rig.joints[`foot${side}`]).y - CHARACTER_DIMENSIONS.ankle;

describe('two-bone limb solver', () => {
  it('places the end joint on reachable targets with the middle joint on the pole side', () => {
    const parent = new THREE.Group(), upper = new THREE.Group(), lower = new THREE.Group(), end = new THREE.Group();
    parent.add(upper); upper.add(lower); lower.add(end); upper.position.set(.1, .4, 0); lower.position.y = -.3; end.position.y = -.27
    for (const [target, pole] of [
      [new THREE.Vector3(.1, .0, -.3), new THREE.Vector3(0, 0, -1)],
      [new THREE.Vector3(.4, .3, -.2), new THREE.Vector3(1, -1, .3)],
      [new THREE.Vector3(-.2, .1, .1), new THREE.Vector3(0, -1, 1)],
    ] as const) {
      solveLimb(upper, lower, target, pole.clone().normalize(), .3, .27); parent.updateMatrixWorld(true);
      expect(worldOf(end).distanceTo(target)).toBeLessThan(1e-3);
      const middle = worldOf(lower).sub(upper.position), reach = target.clone().sub(upper.position).normalize();
      expect(middle.sub(reach.multiplyScalar(middle.dot(reach))).dot(pole)).toBeGreaterThan(0);
    }
  });
  it('straightens toward a target out of reach instead of producing NaN', () => {
    const upper = new THREE.Group(), lower = new THREE.Group(), end = new THREE.Group();
    upper.add(lower); lower.add(end); lower.position.y = -.3; end.position.y = -.27;
    solveLimb(upper, lower, new THREE.Vector3(0, -2, 0), new THREE.Vector3(0, 0, -1), .3, .27); upper.updateMatrixWorld(true);
    expect(worldOf(end).y).toBeCloseTo(-.57, 2); expect(Number.isFinite(lower.rotation.x)).toBe(true);
  });
});

describe('articulated characters', () => {
  it('stands on the ground at the gameplay eye height within a small draw-call budget', () => {
    const rig = soldier(); run(rig, { aim: 1 }, 1);
    expect(CHARACTER_EYE).toBeGreaterThan(1.68); expect(CHARACTER_EYE).toBeLessThan(1.78);
    for (const side of ['L', 'R'] as const) expect(Math.abs(sole(rig, side))).toBeLessThan(.02);
    expect(worldOf(rig.root.getObjectByName('avatar-aim-head')!).y).toBeGreaterThan(1.6);
    expect(worldOf(rig.root.getObjectByName('avatar-aim-chest')!).y).toBeGreaterThan(1.2);
    let meshes = 0; rig.root.traverse(node => { if (node instanceof THREE.Mesh) meshes++; });
    expect(meshes).toBeLessThanOrEqual(20);
  });
  it('walks with alternating planted feet and swings them forward and back', () => {
    const rig = soldier(); let lowest = Infinity, highest = 0, minZ = Infinity, maxZ = -Infinity;
    run(rig, { velocity: { x: 0, z: -1.8 }, aim: .2 }, 1);
    run(rig, { velocity: { x: 0, z: -1.8 }, aim: .2 }, 2, () => {
      const left = sole(rig, 'L'), right = sole(rig, 'R');
      lowest = Math.min(lowest, Math.max(Math.min(left, right), 0)); highest = Math.max(highest, left, right);
      // One foot is always (nearly) on the ground.
      expect(Math.min(left, right)).toBeLessThan(.05);
      const z = worldOf(rig.joints.footL).z; minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    });
    expect(highest).toBeGreaterThan(.06); expect(maxZ - minZ).toBeGreaterThan(.4);
  });
  it('sidesteps without crossing the feet', () => {
    const rig = soldier();
    run(rig, { velocity: { x: 2.6, z: 0 }, aim: 1 }, 2.5, () => {
      const left = rig.root.worldToLocal(worldOf(rig.joints.footL)).x, right = rig.root.worldToLocal(worldOf(rig.joints.footR)).x;
      expect(left).toBeLessThan(right - .08);
    });
  });
  it('keeps both hands on the weapon whether aiming, walking, crouched or prone', () => {
    for (const drive of [{ aim: 1 }, { aim: .1, velocity: { x: 0, z: -3 } }, { aim: 1, crouch: 1, pitch: .3 }, { aim: 1, prone: true }] as CharacterDrive[]) {
      const rig = soldier(); run(rig, drive, 1.5);
      const grips = rig.weapon!.children.filter(child => !(child instanceof THREE.Mesh) && child !== rig.muzzle);
      expect(grips).toHaveLength(2);
      expect(worldOf(rig.joints.handR).distanceTo(worldOf(grips[0]))).toBeLessThan(.03);
      expect(worldOf(rig.joints.handL).distanceTo(worldOf(grips[1]))).toBeLessThan(.03);
    }
  });
  it('crouches, lies prone and falls with the feet kept on the ground', () => {
    const crouched = soldier(); run(crouched, { crouch: 1 }, 1);
    expect(worldOf(crouched.joints.head).y).toBeLessThan(CHARACTER_EYE - .3);
    for (const side of ['L', 'R'] as const) expect(sole(crouched, side)).toBeLessThan(.1);
    const prone = soldier(); run(prone, { prone: true }, 2);
    const head = worldOf(prone.joints.head), hips = worldOf(prone.joints.hips);
    expect(head.y).toBeLessThan(.5); expect(hips.y).toBeLessThan(.4);
    // Lying ahead of the feet with the head over the eye column (forward is -z).
    expect(Math.abs(head.z)).toBeLessThan(.35); expect(worldOf(prone.joints.footL).z).toBeGreaterThan(1.2);
    expect(worldOf(prone.muzzle!).z).toBeLessThan(head.z);
    const fallen = soldier(); fallen.setDown(true); run(fallen, {}, 1.4);
    expect(fallen.down).toBe(true); expect(fallen.downTime).toBeGreaterThan(1.3);
    expect(worldOf(fallen.joints.head).y).toBeLessThan(.45);
    fallen.setDown(false); run(fallen, {}, 1.5); expect(worldOf(fallen.joints.head).y).toBeGreaterThan(1.55);
  });
  it('sits for vehicles with the hands forward on the controls', () => {
    const rig = soldier(); run(rig, { seated: true, driving: true }, 1);
    expect(worldOf(rig.joints.hips).y).toBeCloseTo(CHARACTER_DIMENSIONS.seatedHips, 1);
    expect(rig.weapon!.visible).toBe(false);
    expect(worldOf(rig.joints.handR).z).toBeLessThan(-.3);
  });
  it('raises the right hand to wave and tracks a viewer with the head', () => {
    const rig = createCharacterRig(npcCharacterLook({ id: 'npc-test-vendor', role: 'Hawker', interaction: { kind: 'vendor' } }));
    expect(rig.weapon).toBeNull();
    run(rig, { gesture: 'wave' }, 1);
    expect(worldOf(rig.joints.handR).y).toBeGreaterThan(worldOf(rig.joints.head).y);
    run(rig, {}, 1.5);
    expect(worldOf(rig.joints.handR).y).toBeLessThan(1.1);
    run(rig, { lookAt: new THREE.Vector3(3, 1.7, -1) }, 1.5);
    const facing = new THREE.Vector3(0, 0, -1).applyQuaternion(rig.joints.head.getWorldQuaternion(new THREE.Quaternion()));
    expect(facing.x).toBeGreaterThan(.4);
  });
  it('releases every geometry and material it created', () => {
    const rig = soldier(), scene = new THREE.Scene(); scene.add(rig.root);
    const spies = rig.resources.map(resource => vi.spyOn(resource, 'dispose'));
    expect(spies.length).toBeGreaterThan(10);
    rig.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
  });
});

describe('character looks', () => {
  it('keeps arena role colours readable and gives each role its kit', () => {
    expect(arenaRoleColor({ bot: false, role: 'rifle' })).toBe(getArenaFaction(PLAYER_FACTION)!.accent);
    expect(arenaCharacterLook({ bot: true, role: 'tank' })).toMatchObject({ plates: true, weapon: 'lmg', accent: getArenaFaction('mercenaries')!.roleAccents.tank });
    expect(arenaCharacterLook({ bot: true, role: 'sniper' })).toMatchObject({ headwear: 'boonie', weapon: 'marksman' });
    expect(arenaCharacterLook({ bot: true, role: 'overwatch' })).toMatchObject({ headwear: 'boonie', weapon: 'marksman' });
    expect(arenaCharacterLook({ bot: true, role: 'rifle' }).weapon).toBe('rifle');
  });
  it('dresses each faction in its own palette', () => {
    expect(arenaFaction({ bot: false, role: 'player' }).id).toBe('armed-forces');
    expect(arenaFaction({ bot: true, role: 'assault' }).id).toBe('mercenaries');
    expect(arenaFaction({ bot: true, role: 'mortar-crew' }).id).toBe('militia');
    expect(arenaFaction({ bot: true, role: 'unknown-role' }).id).toBe('mercenaries');
    const looks = [{ bot: false, role: 'player' }, { bot: true, role: 'assault' }, { bot: true, role: 'mortar-crew' }].map(actor => arenaCharacterLook({ ...actor, id: 'same-seed' }));
    for (const key of ['top', 'bottom', 'vest', 'headwearColor'] as const) expect(new Set(looks.map(look => look[key])).size).toBe(3);
    // Every role band stands off its own uniform: at least a 2:1 luminance ratio against the shirt.
    const luminance = (hex: string) => { const c = new THREE.Color(hex); return .2126 * c.r + .7152 * c.g + .0722 * c.b; };
    for (const faction of listArenaFactions()) for (const band of [faction.accent, ...Object.values(faction.roleAccents)]) {
      const [a, b] = [luminance(band), luminance(faction.palette.top)].sort((x, y) => y - x);
      expect((a + .05) / (b + .05)).toBeGreaterThan(2);
    }
  });
  it('rejects a role that names an unknown faction', () => {
    expect(() => registerArenaRole({ ...getArenaRole('assault')!, id: 'factionless', faction: 'nobody' })).toThrow(/faction/);
  });
  it('dresses every shipped NPC deterministically, with aprons on vendors', () => {
    const npcs = WORLD_ZONES.flatMap(zone => expeditionNpcs(zone.id, zoneSectors(zone.id)));
    for (const npc of npcs) {
      const look = npcCharacterLook(npc);
      expect(npcCharacterLook(npc)).toEqual(look);
      expect(look.weapon).toBeUndefined();
      if (npc.interaction.kind === 'vendor') expect(look.apron).toBeTruthy();
      expect(['idle', 'clasp', 'behind', 'wipe']).toContain(npcIdleGesture(npc, 3));
    }
  });
});

describe('arena avatars', () => {
  function guestRuntime() {
    const handlers = new Set<(from: string, packet: unknown) => void>();
    const session: LanSession = { id: 'guest', role: 'guest', name: 'Guest', send() {}, subscribe(callback) { handlers.add(callback); return () => { handlers.delete(callback); }; },
      getPeers: () => [{ id: 'host', name: 'Host' }], onPeers: () => () => {}, close() {} };
    const scene = new THREE.Scene(), runtime = createArenaRuntime({ scene, session, obstacles: [], botCount: 0 });
    const base = createArena([], 1).snapshot(); let tick = base.tick;
    const send = (alive: boolean, health = 100) => {
      const bot = { ...base.actors.find(actor => actor.bot)!, x: 0, y: 1.75, z: 0, yaw: 0, alive, health };
      for (const callback of handlers) callback('host', { type: 'arena-state', started: true, snapshot: { ...base, tick: ++tick, actors: [bot] } });
    };
    const input = { x: 10, y: 1.75, z: 10, yaw: 0, pitch: 0, weapon: 0, playing: true };
    return { scene, runtime, send, step: (seconds: number) => { for (let t = 0; t < seconds; t += 1 / 30) runtime.update(1 / 30, input); scene.updateMatrixWorld(true); } };
  }
  const hits = (scene: THREE.Scene) => new THREE.Raycaster(new THREE.Vector3(0, 1.3, 5), new THREE.Vector3(0, 0, -1)).intersectObjects(scene.children.filter(child => child.userData.arenaActorId), true).filter(hit => hit.object instanceof THREE.Mesh);

  it('renders bots as articulated, shootable figures with published aim points', () => {
    const { scene, runtime, send, step } = guestRuntime();
    try {
      send(true); step(.5);
      const avatar = scene.children.find(child => child.userData.arenaActorId)!;
      expect(avatar.visible).toBe(true);
      expect(avatar.getObjectByName('rig-hips')).toBeTruthy();
      expect(worldOf(avatar.getObjectByName('avatar-aim-head')!).y).toBeGreaterThan(1.55);
      expect(hits(scene).length).toBeGreaterThan(0);
    } finally { runtime.dispose(); }
  });
  it('lets a killed bot fall without blocking shots, then hides it until respawn', () => {
    const { scene, runtime, send, step } = guestRuntime();
    try {
      send(true); step(.3);
      const avatar = scene.children.find(child => child.userData.arenaActorId)!;
      send(false, 0); step(.4);
      expect(avatar.visible).toBe(true); expect(avatar.userData.arenaDown).toBe(true);
      expect(hits(scene)).toHaveLength(0);
      step(1.6); expect(avatar.visible).toBe(false);
      send(true); step(.3);
      expect(avatar.visible).toBe(true); expect(avatar.userData.arenaDown).toBe(false);
      expect(hits(scene).length).toBeGreaterThan(0);
    } finally { runtime.dispose(); }
  });
});
