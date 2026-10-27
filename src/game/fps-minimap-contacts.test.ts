import * as THREE from 'three';
import { afterEach, expect, it } from 'vitest';
import { combatMinimapMarkers, type MinimapCloud } from './fps-minimap-contacts';
import type { ArenaActor } from './arena-rules';
import type { PilotSubject } from './fps-pilot-perception';
import { minimapContactRange } from './minimap';

const geometry = new THREE.BoxGeometry(1, 2, 1), material = new THREE.MeshBasicMaterial();
let scene = new THREE.Scene();
afterEach(() => { scene = new THREE.Scene(); });
const actor = (id: string, extra: Partial<ArenaActor> = {}): ArenaActor => ({
  id, name: id, bot: true, faction: 'mercenaries', x: 0, y: 0, z: -20, yaw: 0, pitch: 0,
  health: 100, armor: 0, kills: 0, deaths: 0, alive: true, respawnIn: 0, weapon: 0, shots: 0, role: 'assault', ...extra,
});
const self = actor('self', { bot: false, faction: 'armed-forces', z: 0 });
const camera = () => new THREE.PerspectiveCamera(65, 1, .08, 200);
function subject(actor: ArenaActor): PilotSubject {
  const mesh = new THREE.Mesh(geometry, material); mesh.position.set(actor.x, actor.y, actor.z); scene.add(mesh);
  return { id: actor.id, root: mesh, points: [mesh.position.clone()], radius: .3 };
}
function observe(actors: ArenaActor[], view = camera(), clouds: MinimapCloud[] = []) {
  return combatMinimapMarkers(view, scene, self, actors, actors.map(subject), clouds);
}

it('shows nearby visible allies and enemies using the combat faction rules', () => {
  const markers = observe([actor('ally', { faction: 'armed-forces', x: -4 }), actor('enemy', { x: 4 })]);
  expect(markers.map(marker => [marker.id, marker.kind])).toEqual([['actor-ally', 'ally'], ['actor-enemy', 'enemy']]);
  // Arena human opponents share the player's faction but still fight each other.
  expect(observe([actor('human', { bot: false, faction: 'armed-forces' })])[0].kind).toBe('enemy');
});

it('includes the 60m boundary and excludes contacts beyond it, including elevation', () => {
  expect(observe([actor('boundary', { z: -60 })])).toHaveLength(1);
  expect(observe([actor('far', { z: -60.1 })])).toEqual([]);
  expect(observe([actor('high', { y: 40, z: -50 })])).toEqual([]);
});

it('hides off-screen contacts and updates when the camera turns', () => {
  const enemy = actor('behind', { z: 20 }), subjects = [subject(enemy)], view = camera();
  expect(combatMinimapMarkers(view, scene, self, [enemy], subjects)).toEqual([]);
  view.rotation.y = Math.PI;
  expect(combatMinimapMarkers(view, scene, self, [enemy], subjects)).toHaveLength(1);
  view.rotation.y = 0;
  expect(combatMinimapMarkers(view, scene, self, [enemy], subjects)).toEqual([]);
});

it('hides allies and enemies behind cover, but detects a visible head above partial cover', () => {
  const actors = [actor('ally', { faction: 'armed-forces', x: -3 }), actor('enemy', { x: 3 })];
  const subjects = actors.map(subject), view = camera();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 4, 1), material); wall.position.z = -10; scene.add(wall);
  expect(combatMinimapMarkers(view, scene, self, actors, subjects)).toEqual([]);
  wall.visible = false;
  expect(combatMinimapMarkers(view, scene, self, actors, subjects)).toHaveLength(2);
  wall.visible = true; wall.scale.y = .1;
  subjects.forEach(entry => entry.points.push(new THREE.Vector3(entry.points[0].x, .8, -20)));
  expect(combatMinimapMarkers(view, scene, self, actors, subjects)).toHaveLength(2);
});

it('omits self, dead actors, hidden avatars and all visual contacts while dead', () => {
  const actors = [self, actor('dead', { alive: false }), actor('hidden')], subjects = actors.map(subject);
  subjects[2].root.visible = false;
  expect(combatMinimapMarkers(camera(), scene, self, actors, subjects)).toEqual([]);
  subjects[2].root.visible = true;
  expect(combatMinimapMarkers(camera(), scene, { ...self, alive: false }, actors, subjects)).toEqual([]);
  expect(combatMinimapMarkers(camera(), scene, null, actors, subjects)).toEqual([]);
});

it('blocks visual contacts through smoke while allowing sight above its top', () => {
  const enemy = actor('smoked'), subjects = [subject(enemy)], view = camera();
  const clouds = [{ x: 0, z: -10, radius: 4, ground: -1 }];
  expect(combatMinimapMarkers(view, scene, self, [enemy], subjects, clouds)).toEqual([]);
  view.position.y = 8; enemy.y = 8; subjects[0].root.position.y = 8; subjects[0].points[0].y = 8;
  expect(combatMinimapMarkers(view, scene, self, [enemy], subjects, clouds)).toHaveLength(1);
});

it('preserves scent reveals beyond sight and range without duplicating a visible enemy', () => {
  const enemy = actor('scented', { scent: true }), subjects = [subject(enemy)], view = camera();
  const read = () => combatMinimapMarkers(view, scene, self, [enemy], subjects);
  expect(read().map(marker => marker.kind)).toEqual(['enemy']);
  view.rotation.y = Math.PI;
  expect(read().map(marker => marker.kind)).toEqual(['scent']);
  enemy.z = -100;
  expect(read().map(marker => marker.kind)).toEqual(['scent']);
  enemy.alive = false;
  expect(read()).toEqual([]);
});

it('removes and restores both sides as conditions change, retaining scent reveals', () => {
  const actors = [actor('ally', { faction: 'armed-forces', x: -3, z: -40 }), actor('enemy', { x: 3, z: -40 }), actor('scented', { scent: true, z: -45 })];
  const subjects = actors.map(subject), view = camera();
  const read = (darkness: number, weather: Parameters<typeof minimapContactRange>[1]) =>
    combatMinimapMarkers(view, scene, self, actors, subjects, [], minimapContactRange(darkness, weather));
  expect(read(0, 'sunny').map(marker => marker.kind)).toEqual(['ally', 'enemy', 'enemy']);
  expect(read(1, 'sunny').map(marker => marker.kind)).toEqual(['scent']);
  expect(read(0, 'thunderstorm').map(marker => marker.kind)).toEqual(['scent']);
  expect(read(0, 'sunny').map(marker => marker.kind)).toEqual(['ally', 'enemy', 'enemy']);
});

it('honours the current weather range boundary for visible contacts', () => {
  const enemy = actor('edge', { z: -30 }), subjects = [subject(enemy)], view = camera();
  expect(combatMinimapMarkers(view, scene, self, [enemy], subjects, [], 30)).toHaveLength(1);
  expect(combatMinimapMarkers(view, scene, self, [enemy], subjects, [], 29)).toEqual([]);
});
