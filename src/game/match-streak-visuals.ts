import { PRECISION_STRIKE } from './precision-strike';
import * as THREE from 'three';
import type { ArenaActor, ArenaPoint, ArenaRaider } from './arena-rules';
import { BARRAGE, STREAKS, SUPPLY_DROP, barragePoints, type StreakId, type StreakSnapshot } from './match-streaks';
import type { MinimapMarker } from './minimap';

export function streakFriendly(owner: ArenaActor | undefined, self: ArenaActor | null) {
  return !!owner && !!self && (owner.id === self.id || !!self.team && self.team === owner.team);
}
/** Friendly drone telemetry follows the live aircraft, not its launch point. */
export function streakHunterMarkers(snapshot: StreakSnapshot | undefined, raiders: readonly ArenaRaider[], actors: readonly ArenaActor[], self: ArenaActor | null, now: number): MinimapMarker[] {
  if (!snapshot || !self?.alive) return [];
  return snapshot.effects.flatMap<MinimapMarker>(effect => {
    if (effect.kind !== 'hunter' || effect.until <= now || effect.health <= 0) return [];
    const owner = actors.find(a => a.id === effect.owner);
    if (!owner || !streakFriendly(owner, self)) return [];
    const drone = raiders.find(r => r.event === effect.event && r.kind === 'drone');
    if (!drone || drone.health <= 0 || ['down', 'wreck', 'exploded', 'landing', 'landed'].includes(drone.state)) return [];
    return [{ id: `hunter-${drone.event}`, kind: 'hunter', side: 'ally', x: drone.x, z: drone.z,
      label: owner.id === self.id ? 'Your Hunter Drone' : `Friendly Hunter Drone · ${owner.name}` }];
  });
}
/** An enemy Blackout leaves no recon picture anywhere. */
const blackedOut = (snapshot: StreakSnapshot, friendly: (id: string) => boolean) => snapshot.effects.some(e => e.kind === 'blackout' && !friendly(e.owner));
/** The authority's next scan time identifies each completed three-second pulse. */
export function streakReconPulse(snapshot: StreakSnapshot | undefined, actors: readonly ArenaActor[], self: ArenaActor | null, now: number) {
  if (!snapshot || !self?.alive) return undefined;
  const friendly = (id: string) => streakFriendly(actors.find(a => a.id === id), self);
  if (blackedOut(snapshot, friendly)) return undefined;
  const live = snapshot.effects.filter(e => e.health > 0 && e.until > now);
  if (live.some(e => e.kind === 'jammer' && !friendly(e.owner) && Math.hypot(e.x - self.x, e.z - self.z) <= 20)) return undefined;
  const recon = live.filter(e => e.kind === 'recon' && friendly(e.owner) && e.pulse > now).sort((a, b) => b.pulse - a.pulse || a.id.localeCompare(b.id))[0];
  return recon ? { id: recon.id, at: recon.pulse - 3, age: Math.max(0, now - (recon.pulse - 3)) } : undefined;
}
export function streakReconMarkers(snapshot: StreakSnapshot | undefined, actors: readonly ArenaActor[], self: ArenaActor | null): MinimapMarker[] {
  if (!snapshot || !self?.alive) return [];
  const friendly = (id: string) => streakFriendly(actors.find(a => a.id === id), self);
  if (blackedOut(snapshot, friendly) || snapshot.effects.some(e => e.kind === 'jammer' && !friendly(e.owner) && Math.hypot(e.x - self.x, e.z - self.z) <= 20)) return [];
  const contacts = new Map<string, MinimapMarker>();
  for (const e of snapshot.effects) if (e.kind === 'recon' && friendly(e.owner)) for (const c of e.contacts) {
    const actor = actors.find(a => a.id === c.id);
    if (!actor?.alive || actor.shield || streakFriendly(actor, self)) continue;
    if (snapshot.effects.some(j => j.kind === 'jammer' && !friendly(j.owner) && Math.hypot(j.x - c.x, j.z - c.z) <= 20)) continue;
    contacts.set(c.id, { id: `recon-${c.id}`, x: c.x, z: c.z, kind: 'enemy', side: 'enemy', label: 'Recon · last known position' });
  }
  return [...contacts.values()];
}

/** Small original meshes; gameplay hit volumes remain owned by the match simulation. */
export function createStreakVisuals(scene: THREE.Scene, boom: (at: THREE.Vector3) => void) {
  const root = new THREE.Group(); root.name = 'match-streaks';
  // Preview rings and device meshes must not become placement surfaces or cover.
  // The authority owns device hit volumes and interception line-of-sight.
  root.userData.fpsEffect = true; scene.add(root);
  const entries = new Map<string, { group: THREE.Group; kind: StreakId; until: number; shots: number }>();
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 12), ring = new THREE.RingGeometry(.96, 1, 64), sphere = new THREE.SphereGeometry(1, 10, 8);
  geometries.push(box, cylinder, ring, sphere);
  const metal = new THREE.MeshStandardMaterial({ color: '#27363b', roughness: .65, metalness: .35 }); materials.push(metal);
  const friendly = new THREE.MeshBasicMaterial({ color: '#51d9c4', transparent: true, opacity: .85, side: THREE.DoubleSide });
  const enemy = new THREE.MeshBasicMaterial({ color: '#ff715b', transparent: true, opacity: .9, side: THREE.DoubleSide });
  const invalid = new THREE.MeshBasicMaterial({ color: '#ffbb55', transparent: true, opacity: .9, side: THREE.DoubleSide }); materials.push(friendly, enemy, invalid);
  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, scale: number[], at = [0, 0, 0]) {
    const m = new THREE.Mesh(geometry, material); m.scale.set(scale[0], scale[1], scale[2]); m.position.set(at[0], at[1], at[2]); parent.add(m); return m;
  }
  const preview = mesh(root, ring, friendly, [5, 5, 1]); preview.rotation.x = -Math.PI / 2; preview.visible = false;
  // A barrage previews every zone of its line, not only the first.
  const previewLine = Array.from({ length: BARRAGE.shells - 1 }, () => { const zone = mesh(root, ring, friendly, [BARRAGE.radius, BARRAGE.radius, 1]); zone.rotation.x = -Math.PI / 2; zone.visible = false; return zone; });
  function create(kind: StreakId, tint: THREE.Material) {
    const group = new THREE.Group(); group.name = STREAKS[kind].name;
    if (kind === 'strike') {
      const danger = mesh(group, ring, tint, [PRECISION_STRIKE.radius, PRECISION_STRIKE.radius, 1]); danger.rotation.x = -Math.PI / 2;
      const cross = mesh(group, box, tint, [1.6, .04, .08]); cross.position.y = .02;
      mesh(group, box, tint, [.08, .04, 1.6], [0, .02, 0]);
      mesh(group, cylinder, tint, [.035, 5, .035], [0, 2.5, 0]);
    } else if (kind === 'barrage') {
      // Built facing the caller's aim: the group's yaw turns the row of zones onto the line the shells walk.
      for (let i = 0; i < BARRAGE.shells; i++) {
        const zone = mesh(group, ring, tint, [BARRAGE.radius, BARRAGE.radius, 1], [0, 0, -BARRAGE.spacing * i]); zone.rotation.x = -Math.PI / 2; zone.name = `zone-${i}`;
      }
      mesh(group, box, tint, [.08, .04, BARRAGE.spacing * (BARRAGE.shells - 1)], [0, .02, -BARRAGE.spacing * (BARRAGE.shells - 1) / 2]);
      mesh(group, cylinder, tint, [.035, 5, .035], [0, 2.5, 0]);
    } else if (kind === 'supply') {
      const reach = mesh(group, ring, tint, [SUPPLY_DROP.reach, SUPPLY_DROP.reach, 1], [0, -.64, 0]); reach.rotation.x = -Math.PI / 2;
      const crate = new THREE.Group(); crate.name = 'crate'; group.add(crate);
      mesh(crate, box, metal, [1.1, .7, .8], [0, -.3, 0]);
      mesh(crate, box, tint, [1.14, .08, .84], [0, -.3, 0]); mesh(crate, box, tint, [.08, .74, .84], [0, -.3, 0]);
      const canopy = mesh(crate, sphere, tint, [1.3, .7, 1.3], [0, 2.4, 0]); canopy.name = 'canopy';
    } else if (kind === 'blackout') {
      const pulse = mesh(group, ring, tint, [1, 1, 1], [0, -1.6, 0]); pulse.rotation.x = -Math.PI / 2; pulse.name = 'pulse';
    } else if (kind === 'gunship') {
      mesh(group, box, metal, [1.5, .5, 2.4]);
      mesh(group, box, metal, [.4, .3, 1.6], [0, .1, 1.9]);
      mesh(group, box, tint, [.14, .14, 1.1], [0, -.3, -1.5]);
      mesh(group, sphere, tint, [.2, .2, .2], [0, -.35, -.8]);
      for (const x of [-1.5, 1.5]) for (const z of [-1.2, 1.2]) {
        mesh(group, box, metal, [.14, .12, 1.6], [x * .6, .15, z * .5]);
        const rotor = mesh(group, cylinder, tint, [.85, .04, .85], [x, .3, z]); rotor.name = 'rotor';
      }
    } else if (kind === 'recon') {
      mesh(group, box, metal, [.6, .22, .5]);
      mesh(group, sphere, tint, [.12, .12, .12], [0, -.18, -.2]);
      for (const x of [-.55, .55]) for (const z of [-.55, .55]) {
        mesh(group, box, metal, [.1, .1, 1.2], [x, 0, 0]);
        const rotor = mesh(group, cylinder, tint, [.32, .035, .32], [x, .1, z]); rotor.name = 'rotor';
      }
    } else {
      mesh(group, box, metal, [.7, .45, .65], [0, -.35, 0]);
      mesh(group, sphere, tint, [.09, .09, .09], [0, .05, -.3]);
      if (kind === 'jammer') { mesh(group, cylinder, metal, [.035, 1.4, .035], [0, .3, 0]); mesh(group, sphere, tint, [.12, .12, .12], [0, 1, 0]); }
      if (kind === 'interceptor') for (const x of [-.22, 0, .22]) mesh(group, cylinder, tint, [.07, .6, .07], [x, .12, 0]);
      if (kind === 'sentry') {
        mesh(group, cylinder, metal, [.15, .5, .15], [0, -.05, 0]);
        mesh(group, box, metal, [.5, .32, .7], [0, .2, -.1]);
        mesh(group, box, tint, [.09, .09, .65], [0, .2, -.7]);
        for (const x of [-.5, .5]) mesh(group, box, metal, [.12, .12, 1], [x, -.6, 0]);
      }
    }
    root.add(group); return group;
  }
  const reset = () => { for (const entry of entries.values()) root.remove(entry.group); entries.clear(); preview.visible = false; previewLine.forEach(zone => zone.visible = false); };
  return {
    preview(at: ArenaPoint | null, kind: StreakId | null, valid: boolean, yaw = 0) {
      preview.visible = !!at && !!kind;
      if (at && kind) { preview.position.set(at.x, at.y + .06, at.z); const radius = kind === 'strike' ? PRECISION_STRIKE.radius : kind === 'barrage' ? BARRAGE.radius : kind === 'jammer' ? 20 : kind === 'interceptor' ? 6 : kind === 'supply' ? SUPPLY_DROP.reach : 1; preview.scale.set(radius, radius, 1); preview.material = valid ? friendly : invalid; }
      const line = at && kind === 'barrage' ? barragePoints({ ...at, yaw }).slice(1) : [];
      previewLine.forEach((zone, i) => { zone.visible = !!line[i]; if (line[i]) { zone.position.set(line[i].x, at!.y + .06, line[i].z); zone.material = valid ? friendly : invalid; } });
    },
    update(snapshot: StreakSnapshot | undefined, actors: readonly ArenaActor[], self: ArenaActor | null, now: number) {
      const alive = new Set<string>();
      for (const e of snapshot?.effects ?? []) {
        if (e.kind === 'hunter') continue;
        alive.add(e.id); let entry = entries.get(e.id);
        if (!entry) { entry = { group: create(e.kind, streakFriendly(actors.find(a => a.id === e.owner), self) ? friendly : enemy), kind: e.kind, until: e.until, shots: e.shots }; entries.set(e.id, entry); }
        entry.group.position.set(e.x, e.y - (e.kind === 'strike' || e.kind === 'barrage' ? .32 : 0), e.z); entry.group.rotation.y = e.yaw;
        if (e.kind === 'gunship') entry.group.position.y += Math.sin(now * 1.3) * .25;
        if (e.kind === 'supply') {
          // The crate rides its canopy down for the landing seconds, then sits waiting.
          const fall = Math.max(0, e.start + SUPPLY_DROP.landing - now), crate = entry.group.getObjectByName('crate')!;
          crate.position.y = fall * 9; crate.getObjectByName('canopy')!.visible = fall > 0;
        }
        if (e.kind === 'blackout') { const pulse = entry.group.getObjectByName('pulse')!, r = 2 + (now - e.start) % 2 * 20; pulse.scale.set(r, r, 1); }
        if (e.kind === 'barrage' && e.shots > entry.shots) {
          const points = barragePoints(e);
          for (let i = entry.shots; i < e.shots; i++) { boom(new THREE.Vector3(points[i].x, e.y, points[i].z)); const zone = entry.group.getObjectByName(`zone-${i}`); if (zone) zone.visible = false; }
        }
        if (e.kind === 'recon') entry.group.position.y += Math.sin(now * 2) * .08;
        entry.group.children.forEach(child => { if (child.name === 'rotor') child.rotation.y = now * 40; });
        if (e.shots > entry.shots && e.aim) {
          const direction = new THREE.Vector3(e.aim.x - e.x, e.aim.y - e.y, e.aim.z - e.z);
          const tracer = mesh(root, box, friendly, [.025, .025, direction.length()], [e.x + direction.x / 2, e.y + direction.y / 2, e.z + direction.z / 2]);
          tracer.lookAt(e.aim.x, e.aim.y, e.aim.z); tracer.userData.until = now + .12;
        }
        entry.shots = e.shots;
      }
      for (const [id, entry] of entries) if (!alive.has(id)) {
        if (entry.kind === 'strike' && now >= entry.until && now - entry.until < .75) boom(entry.group.position.clone());
        root.remove(entry.group); entries.delete(id);
      }
      for (const child of [...root.children]) if (child.userData.until !== undefined && now >= child.userData.until) root.remove(child);
    },
    reset,
    dispose() { reset(); scene.remove(root); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
