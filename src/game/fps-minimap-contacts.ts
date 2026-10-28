import * as THREE from 'three';
import { hostile } from './arena-factions';
import type { ArenaActor } from './arena-rules';
import { visiblePilotContacts, type PilotSubject } from './fps-pilot-perception';
import { MINIMAP_CONTACT_RANGE, type MinimapMarker } from './minimap';

type MapActor = Pick<ArenaActor, 'id' | 'name' | 'bot' | 'faction' | 'alive' | 'x' | 'y' | 'z' | 'scent' | 'markedBy'>;
export interface MinimapCloud { x: number; z: number; radius: number; ground: number }

/** Current visual contacts only; scent remains an independent equipment reveal. */
export function combatMinimapMarkers(camera: THREE.PerspectiveCamera, scene: THREE.Scene, self: MapActor | null,
  actors: readonly MapActor[], subjects: readonly PilotSubject[], clouds: readonly MinimapCloud[] = [], contactRange = MINIMAP_CONTACT_RANGE): MinimapMarker[] {
  if (!self?.alive) return [];
  const others = actors.filter(actor => actor.alive && actor.id !== self.id);
  const nearby = new Set(others.filter(actor => Math.hypot(actor.x - camera.position.x, actor.y - camera.position.y, actor.z - camera.position.z) <= contactRange).map(actor => actor.id));
  const clear = (subject: PilotSubject) => ({ ...subject, points: subject.points.filter(point => !clouds.some(cloud => {
    const dx = point.x - camera.position.x, dz = point.z - camera.position.z;
    const length = dx * dx + dz * dz;
    const t = length ? THREE.MathUtils.clamp(((cloud.x - camera.position.x) * dx + (cloud.z - camera.position.z) * dz) / length, 0, 1) : 0;
    const y = camera.position.y + (point.y - camera.position.y) * t;
    return y >= cloud.ground && y < cloud.ground + 6 && Math.hypot(camera.position.x + dx * t - cloud.x, camera.position.z + dz * t - cloud.z) < cloud.radius * .85;
  })) });
  const candidates = subjects.filter(subject => nearby.has(subject.id)).map(clear).filter(subject => subject.points.length > 0);
  const visible = new Set((candidates.length ? visiblePilotContacts(camera, scene, candidates) : [])
    .filter(contact => contact.distance <= contactRange).map(contact => contact.id));
  return others.flatMap((actor): MinimapMarker[] => {
    const enemy = hostile(self, actor);
    const marked = actor.markedBy?.some(id => id === self.id || actors.some(a => a.id === id && !hostile(self, a)));
    if (visible.has(actor.id) || marked) return [{ id: `actor-${actor.id}`, kind: enemy ? 'enemy' : 'ally', label: `${actor.name} · ${enemy ? 'Enemy' : 'Ally'}`, x: actor.x, z: actor.z }];
    if (enemy && actor.scent) return [{ id: `scent-${actor.id}`, kind: 'scent', label: `${actor.name} · you can smell them`, x: actor.x, z: actor.z }];
    return [];
  });
}
