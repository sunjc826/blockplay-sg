import * as THREE from 'three';
import type { ArenaActor, ArenaPoint } from './arena-rules';
import { STREAKS, type StreakId, type StreakSnapshot } from './match-streaks';
import type { MinimapMarker } from './minimap';

export function streakFriendly(owner: ArenaActor | undefined, self: ArenaActor | null) {
  return !!owner && !!self && (owner.id === self.id || !!self.team && self.team === owner.team);
}
/** The authority's next scan time identifies each completed three-second pulse. */
export function streakReconPulse(snapshot: StreakSnapshot | undefined, actors: readonly ArenaActor[], self: ArenaActor | null, now: number) {
  if (!snapshot || !self?.alive) return undefined;
  const friendly = (id: string) => streakFriendly(actors.find(a => a.id === id), self);
  const live = snapshot.effects.filter(e => e.health > 0 && e.until > now);
  if (live.some(e => e.kind === 'jammer' && !friendly(e.owner) && Math.hypot(e.x - self.x, e.z - self.z) <= 20)) return undefined;
  const recon = live.filter(e => e.kind === 'recon' && friendly(e.owner) && e.pulse > now).sort((a, b) => b.pulse - a.pulse || a.id.localeCompare(b.id))[0];
  return recon ? { id: recon.id, at: recon.pulse - 3, age: Math.max(0, now - (recon.pulse - 3)) } : undefined;
}
export function streakReconMarkers(snapshot: StreakSnapshot | undefined, actors: readonly ArenaActor[], self: ArenaActor | null): MinimapMarker[] {
  if (!snapshot || !self?.alive) return [];
  const friendly = (id: string) => streakFriendly(actors.find(a => a.id === id), self);
  if (snapshot.effects.some(e => e.kind === 'jammer' && !friendly(e.owner) && Math.hypot(e.x - self.x, e.z - self.z) <= 20)) return [];
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
  function create(kind: StreakId, tint: THREE.Material) {
    const group = new THREE.Group(); group.name = STREAKS[kind].name;
    if (kind === 'strike') {
      const danger = mesh(group, ring, tint, [5, 5, 1]); danger.rotation.x = -Math.PI / 2;
      const cross = mesh(group, box, tint, [1.6, .04, .08]); cross.position.y = .02;
      mesh(group, box, tint, [.08, .04, 1.6], [0, .02, 0]);
      mesh(group, cylinder, tint, [.035, 5, .035], [0, 2.5, 0]);
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
  const reset = () => { for (const entry of entries.values()) root.remove(entry.group); entries.clear(); preview.visible = false; };
  return {
    preview(at: ArenaPoint | null, kind: StreakId | null, valid: boolean) {
      preview.visible = !!at && !!kind;
      if (at && kind) { preview.position.set(at.x, at.y + .06, at.z); const radius = kind === 'strike' ? 5 : kind === 'jammer' ? 20 : kind === 'interceptor' ? 6 : 1; preview.scale.set(radius, radius, 1); preview.material = valid ? friendly : invalid; }
    },
    update(snapshot: StreakSnapshot | undefined, actors: readonly ArenaActor[], self: ArenaActor | null, now: number) {
      const alive = new Set<string>();
      for (const e of snapshot?.effects ?? []) {
        if (e.kind === 'hunter') continue;
        alive.add(e.id); let entry = entries.get(e.id);
        if (!entry) { entry = { group: create(e.kind, streakFriendly(actors.find(a => a.id === e.owner), self) ? friendly : enemy), kind: e.kind, until: e.until, shots: e.shots }; entries.set(e.id, entry); }
        entry.group.position.set(e.x, e.y - (e.kind === 'strike' ? .32 : 0), e.z); entry.group.rotation.y = e.yaw;
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
