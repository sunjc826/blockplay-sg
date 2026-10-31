import * as THREE from 'three';

/** A readable hemispherical canopy and eight lines, attached above the soldier. */
export function createParachute(color: string) {
  const root = new THREE.Group(); root.name = 'infantry-parachute'; root.userData.fpsEffect = true;
  const cloth = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: .95 });
  const geometry = new THREE.SphereGeometry(2.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const canopy = new THREE.Mesh(geometry, cloth); canopy.scale.y = .45; canopy.position.y = 5.5; root.add(canopy);
  const points: number[] = [];
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; points.push(Math.cos(a) * 2.6, 5.5, Math.sin(a) * 2.6, Math.cos(a) * .22, 1.3, Math.sin(a) * .22); }
  const lines = new THREE.BufferGeometry(); lines.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const cord = new THREE.LineBasicMaterial({ color: '#e5dfc9' }); root.add(new THREE.LineSegments(lines, cord));
  root.traverse(o => { o.raycast = () => {}; }); root.visible = false;
  return { root, resources: [cloth, geometry, lines, cord] };
}
