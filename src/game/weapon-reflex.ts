import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { createOpticGlass } from './weapon-glass';

/** Receiver-mounted reflex sight; dimensions are in the authored GLB's space. */
export function buildReflexHousing(group: THREE.Group, height: number, rear: number, sar: boolean) {
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const steel = new THREE.MeshStandardMaterial({ color: '#252b2d', roughness: .36, metalness: .7 });
  const interior = new THREE.MeshStandardMaterial({ color: '#101618', roughness: .78, metalness: .15 });
  const edge = new THREE.MeshStandardMaterial({ color: '#647074', roughness: .3, metalness: .8 });
  materials.push(steel, interior, edge);
  const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(x, y, z); group.add(mesh); return mesh;
  };
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material = steel) =>
    add(name, new RoundedBoxGeometry(w, h, d, 2, .002), material, x, y, z);
  const mid = rear - .037;
  // The Ultimax top cover ends at y=.2435. This short rail sits directly on it,
  // between the existing rear aperture and carry handle, without bridging air.
  const railY = sar ? .273 : .252, railLength = sar ? .30 : .126, railZ = sar ? .015 : .108;
  box('optic-receiver-rail', .046, .018, railLength, 0, railY, railZ);
  for (let i = 0; i < (sar ? 12 : 6); i++)
    box('optic-rail-tooth', .051, .006, .007, 0, railY + .010, railZ - railLength / 2 + .01 + i * (sar ? .024 : .021));
  const base = railY + .010, top = height - .039;
  box('optic-mount', .042, top - base, .063, 0, (base + top) / 2, mid);
  for (const side of [-1, 1]) {
    box('optic-clamp', .010, .018, .066, side * .024, base + .006, mid);
    for (const z of [mid - .022, mid + .022]) {
      const bolt = add('optic-clamp-bolt', new THREE.CylinderGeometry(.005, .005, .004, 6), edge, side * .030, base + .006, z);
      bolt.rotation.z = Math.PI / 2;
    }
  }
  // A closed annular section includes the inner wall and bevels, so oblique
  // views show a real tunnel rather than the back of a single-sided cylinder.
  const profile = [[.043, 0], [.050, 0], [.053, -.004], [.051, -.069], [.049, -.074], [.043, -.074], [.043, 0]];
  const tube = add('optic-housing', new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), 40), steel, 0, height, rear);
  tube.rotation.x = Math.PI / 2;
  const liner = add('optic-inner-wall', new THREE.CylinderGeometry(.0428, .0428, .059, 40, 1, true), interior, 0, height, mid);
  liner.rotation.x = Math.PI / 2; interior.side = THREE.DoubleSide;
  for (const z of [rear - .004, rear - .014, rear - .066])
    add('optic-lens-retainer', new THREE.TorusGeometry(.043, .0015, 6, 40), interior, 0, height, z);
  const dial = add('optic-windage-dial', new THREE.CylinderGeometry(.016, .016, .022, 24), steel, .057, height, mid);
  dial.rotation.z = Math.PI / 2;
  const cap = add('optic-dial-cap', new THREE.CylinderGeometry(.013, .013, .003, 24), edge, .069, height, mid);
  cap.rotation.z = Math.PI / 2;
  box('optic-dial-slot', .002, .003, .015, .071, height, mid, interior);
  add('optic-elevation-dial', new THREE.CylinderGeometry(.010, .010, .011, 20), steel, 0, height + .053, mid);
  // Cut grips and index marks make the adjustment controls readable close up.
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    const rib = box('optic-dial-knurl', .014, .002, .003, .058, height + Math.sin(angle) * .016, mid + Math.cos(angle) * .016, interior);
    rib.rotation.x = -angle;
  }
  box('optic-adjustment-index', .002, .007, .001, .071, height + .006, mid + .005, edge);
  for (const z of [rear - .008, rear - .064]) {
    add('optic-bezel-edge', new THREE.TorusGeometry(.049, .001, 6, 48), edge, 0, height, z);
    for (const angle of [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4]) {
      const screw = add('optic-bezel-screw', new THREE.CylinderGeometry(.0016, .0016, .002, 6), interior, Math.cos(angle) * .047, height + Math.sin(angle) * .047, z + .006);
      screw.rotation.x = Math.PI / 2;
    }
  }
  box('optic-emitter-shroud', .012, .005, .014, 0, height - .039, rear - .023, interior);

  const glass = createOpticGlass(.0425, .005, 'reflex');
  glass.reflection.surface.position.set(0, height, rear - .047);
  group.add(glass.reflection.surface);
  return { reflection: glass.reflection, dispose: () => {
    glass.dispose(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  } };
}
