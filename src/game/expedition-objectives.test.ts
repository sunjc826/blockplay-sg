import { expect, it } from 'vitest';
import { PerspectiveCamera, Scene, Mesh, Material } from 'three';
import { createFacilities } from './facilities';
import { enemyObjectives, sectorFacilityControl } from './expedition-objectives';
import { createObjectiveBeacons, objectiveHint } from './objective-beacons';
import { zoneSectors } from './zone-sectors';
import { PLAYER_FACTION } from './arena-factions';

const sector = zoneSectors('marina-bay')[0];
function fixture() {
  const { minX, maxX, minZ, maxZ } = sector.bounds;
  const x = (minX + maxX) / 2, z = (minZ + maxZ) / 2;
  return createFacilities([
    { id: 'a', name: 'Command post', kind: 'command', initialOwner: PLAYER_FACTION, x, y: 0, z, deployment: { x, z, yaw: 0 } },
    { id: 'b', name: 'Garage', kind: 'garage', initialOwner: 'mercenaries', x: x + 1, y: 3, z, deployment: { x, z, yaw: 0 } },
  ]).sites;
}
it('derives control from live infrastructure, including mixed, attacked and ruined sites', () => {
  const sites = fixture();
  expect(sectorFacilityControl(sector, [])).toBe('neutral');
  expect(sectorFacilityControl(sector, sites.slice(0, 1))).toBe('ally');
  expect(sectorFacilityControl(sector, sites.slice(1))).toBe('enemy');
  expect(sectorFacilityControl(sector, sites)).toBe('contested');
  sites[1].health = 0; expect(sectorFacilityControl(sector, sites)).toBe('ally');
  sites[0].contested = true; expect(sectorFacilityControl(sector, sites)).toBe('contested');
  sites[0].contested = false; sites[0].suppressed = true; expect(sectorFacilityControl(sector, sites)).toBe('contested');
  sites[0].health = 0; expect(sectorFacilityControl(sector, sites)).toBe('neutral');
});
it('updates objective selection after capture, destruction and rebuild, ignoring unbuilt sites', () => {
  const sites = fixture();
  expect(enemyObjectives(sites, sites[0]).map(s => s.id)).toEqual(['b']);
  sites[1].owner = PLAYER_FACTION; expect(enemyObjectives(sites, sites[0])).toEqual([]);
  sites[1].owner = 'mercenaries'; sites[1].health = 0; expect(enemyObjectives(sites, sites[0])).toEqual([]);
  sites[1].health = 10; expect(enemyObjectives(sites, sites[0]).map(s => s.id)).toEqual(['b']);
  sites[1].owner = null; expect(enemyObjectives(sites, sites[0])).toEqual([]);
  sites[1].owner = 'mercenaries'; sites[1].x = sector.bounds.maxX + 10;
  expect(sectorFacilityControl(sector, sites)).toBe('ally');
});
it('projects on-screen targets and keeps targets behind and to either side on the screen', () => {
  const camera = new PerspectiveCamera(65, 16 / 9, .08, 800); camera.position.set(0, 7, 0); camera.updateMatrixWorld(true);
  const site = { ...fixture()[1], x: 0, y: 0, z: -50 };
  const hint = objectiveHint(site, camera, { x: 0, z: 0 });
  expect(hint).toMatchObject({ x: 50, y: 50, edge: false, distance: 50 });
  for (const [x, z] of [[0, 50], [-100, -1], [100, -1]]) {
    const edge = objectiveHint({ ...site, x, z }, camera, { x: 0, z: 0 });
    expect(edge.edge).toBe(true); expect(edge.x).toBeGreaterThanOrEqual(12); expect(edge.x).toBeLessThanOrEqual(88);
    expect(edge.y).toBeGreaterThanOrEqual(30); expect(edge.y).toBeLessThanOrEqual(62);
    if (x) expect(Math.sign(edge.x - 50)).toBe(Math.sign(x));
  }
});
it('shows only current enemy beacons, respects elevation, excludes gameplay rays and cleans up', () => {
  const scene = new Scene(), sites = fixture(), beacons = createObjectiveBeacons(scene, sites);
  beacons.update(sites, true);
  expect(beacons.root.visible).toBe(true); expect(beacons.root.children.map(c => c.visible)).toEqual([false, true]);
  expect(beacons.root.children[1].position.y).toBe(3);
  beacons.root.traverse(o => { expect(o.userData.fpsEffect).toBe(true); if (o instanceof Mesh) expect((o.material as Material).depthTest).toBe(false); });
  sites[1].owner = PLAYER_FACTION; beacons.update(sites, true); expect(beacons.root.children.every(c => !c.visible)).toBe(true);
  beacons.update(sites, false); expect(beacons.root.visible).toBe(false);
  beacons.dispose(); expect(scene.children).not.toContain(beacons.root);
});
