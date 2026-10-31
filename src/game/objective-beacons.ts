import * as THREE from 'three';
import type { FacilitySite, FacilityState } from './facilities';
import { enemyObjectives } from './expedition-objectives';

export interface ObjectiveHint { id: string; name: string; distance: number; x: number; y: number; edge: boolean; bearing: number }

/** A bearing stays useful when the objective is behind the camera or outside its frustum. */
export function objectiveHint(site: FacilityState, camera: THREE.PerspectiveCamera, player: { x: number; z: number }): ObjectiveHint {
  const at = new THREE.Vector3(site.x, site.y + 7, site.z);
  const local = at.clone().applyMatrix4(camera.matrixWorldInverse), projected = at.project(camera);
  const bearing = Math.atan2(local.x, -local.z);
  const edge = local.z >= 0 || Math.abs(projected.x) > .8 || Math.abs(projected.y) > .6;
  return { id: site.id, name: site.name, distance: Math.round(Math.hypot(site.x - player.x, site.z - player.z)), edge,
    x: edge ? 50 + Math.sin(bearing) * 38 : 50 + projected.x * 50,
    y: edge ? 46 - Math.cos(bearing) * 16 : Math.max(22, Math.min(80, 50 - projected.y * 50)), bearing: bearing * 180 / Math.PI };
}

/** Decorative navigation only. Every descendant is excluded from gameplay rays. */
export function createObjectiveBeacons(scene: THREE.Scene, sites: readonly FacilitySite[]) {
  const root = new THREE.Group(); root.name = 'enemy-objective-beacons'; root.visible = false;
  const solid = new THREE.MeshBasicMaterial({ color: '#ff8870', depthTest: false, depthWrite: false, toneMapped: false, fog: false, transparent: true, opacity: .9 });
  const glow = new THREE.MeshBasicMaterial({ color: '#ff8870', depthTest: false, depthWrite: false, toneMapped: false, fog: false, transparent: true, opacity: .18, side: THREE.DoubleSide });
  const ringGeo = new THREE.RingGeometry(2.4, 2.6, 32), arrowGeo = new THREE.ConeGeometry(.8, 1.5, 4), beamGeo = new THREE.CylinderGeometry(.12, .5, 12, 8, 1, true);
  const markers = new Map(sites.map(site => {
    const group = new THREE.Group(); group.position.set(site.x, site.y, site.z);
    const ring = new THREE.Mesh(ringGeo, solid); ring.rotation.x = -Math.PI / 2; ring.position.y = .12;
    const arrow = new THREE.Mesh(arrowGeo, solid); arrow.rotation.z = Math.PI; arrow.position.y = 6;
    const beam = new THREE.Mesh(beamGeo, glow); beam.position.y = 6;
    group.add(ring, beam, arrow); root.add(group); return [site.id, group] as const;
  }));
  root.traverse(o => { o.userData.fpsEffect = true; o.renderOrder = 1000; }); scene.add(root);
  return {
    root,
    update(sites: readonly FacilityState[], enabled: boolean) {
      root.visible = enabled;
      const targets = new Set(enabled ? enemyObjectives(sites, { x: 0, z: 0 }).map(s => s.id) : []);
      markers.forEach((marker, id) => { marker.visible = targets.has(id); });
    },
    dispose() { scene.remove(root); ringGeo.dispose(); arrowGeo.dispose(); beamGeo.dispose(); solid.dispose(); glow.dispose(); },
  };
}
