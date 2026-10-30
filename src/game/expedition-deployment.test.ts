import { expect, it, vi } from 'vitest';
import { deploymentOrder, districtDeploymentPoints, type DeploymentPoint } from './expedition-deployment';
import { createArena, type ArenaEnvironment } from './arena-rules';
import { createArenaRuntime } from './arena-runtime';
import { createSoloSession } from './lan-peer';
import { moveInMarina } from './marina-collision';
import * as THREE from 'three';

const points: DeploymentPoint[] = [
  { id: 'entry', name: 'District entry', x: 0, z: 0, yaw: 0, pitch: 0 },
  { id: 'park', name: 'Park', x: 60, z: 40, yaw: 1.5, pitch: -.1 },
  { id: 'market', name: 'Market', x: -60, z: 20, yaw: -.5, pitch: 0 },
];
const environment = (): ArenaEnvironment => ({ endless: true, bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, move: moveInMarina,
  spawns: [{ x: 150, z: 150 }], playerSpawn: points[0], deployments: points });

it('selects a named point exactly and rejects unknown ids', () => {
  expect(deploymentOrder(points, 'park')).toEqual([points[1]]);
  expect(deploymentOrder(points, 'made-up')).toEqual([]);
});
it('can randomly select every approved point and retains approved fallbacks', () => {
  for (let i = 0; i < points.length; i++) {
    const order = deploymentOrder(points, 'random', () => (i + .5) / points.length);
    expect(order[0]).toEqual(points[i]); expect(new Set(order)).toEqual(new Set(points));
  }
  expect(deploymentOrder([], 'random')).toEqual([]);
  expect(deploymentOrder(points, 'random', () => NaN)[0]).toEqual(points[0]);
  expect(deploymentOrder(points, 'random', () => 1)[0]).toEqual(points[2]);
});
it('generates stable, named, spaced points and respects geometry rejection', () => {
  const first = districtDeploymentPoints('queenstown', () => true);
  expect(first.length).toBe(6); expect(first[0].id).toBe('entry');
  expect(districtDeploymentPoints('queenstown', () => true)).toEqual(first);
  const blocked = first[1];
  expect(districtDeploymentPoints('queenstown', (x, z) => x !== blocked.x || z !== blocked.z).some(p => p.x === blocked.x && p.z === blocked.z)).toBe(false);
  expect(districtDeploymentPoints('queenstown', () => false)).toEqual([]);
});
it('retains the authored district entry when it is physically clear', () => {
  expect(districtDeploymentPoints('queenstown', () => false, () => true)).toEqual([
    expect.objectContaining({ id: 'entry', name: 'District entry', x: -18, z: 83 }),
  ]);
});
it('changes only the player deployment and preserves the fixed district reference', () => {
  const env = environment(), a = createArena([], 0, 'mixed', env);
  a.addPlayer('p', 'Player', 0, 0, []);
  expect(a.setPlayerDeployment('p', 'park')).toBe(true);
  expect(a.snapshot().actors.find(p => p.id === 'p')).toMatchObject({ x: 60, z: 40, y: 1.75, yaw: 1.5, pitch: -.1 });
  expect(env.playerSpawn).toEqual(points[0]);
  expect(a.setPlayerDeployment('p', 'made-up')).toBe(false);
  expect(a.setPlayerDeployment('unknown-player', 'park')).toBe(false);
  a.step(.05); expect(a.setPlayerDeployment('p', 'market')).toBe(false);
});
it('rejects blocked, occupied and hostile-adjacent entries at the authority', () => {
  const env = environment(), a = createArena([{ minX: 59, maxX: 61, minZ: 39, maxZ: 41 }], 0, 'mixed', env);
  a.addPlayer('p', 'Player', 0, 0, []); expect(a.setPlayerDeployment('p', 'park')).toBe(false);
  a.addPlayer('other', 'Other', 0, 0, []); expect(a.setPlayerDeployment('other', 'market')).toBe(true);
  expect(a.setPlayerDeployment('p', 'market')).toBe(false);
  const hostileEnv = { ...environment(), spawns: [{ x: -60, z: 20 }] };
  const enemies = createArena([], 1, 'mixed', hostileEnv); enemies.addPlayer('p', 'Player', 0, 0, []);
  expect(enemies.setPlayerDeployment('p', 'market')).toBe(false);
});
it('adopts the selected point without movement reconciliation pulling the player back', () => {
  vi.useFakeTimers();
  const session = createSoloSession('Explorer'), runtime = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], session, botCount: 0, environment: environment() });
  const input = { x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0, weapon: 0, playing: false };
  try {
    runtime.update(.01, input);
    expect(runtime.selectDeployment('park')).toBe(true);
    const frame = runtime.update(.01, input);
    expect(frame.spawn).toBe(true); expect(frame.self).toMatchObject({ x: 60, z: 40 });
    runtime.update(.01, { ...input, x: 60, z: 40, playing: true });
    expect(runtime.selectDeployment('market')).toBe(false);
    runtime.update(.01, { ...input, x: 60, z: 40, playing: false });
    expect(runtime.selectDeployment('market')).toBe(false);
  } finally { runtime.dispose(); session.close(); vi.useRealTimers(); }
});
