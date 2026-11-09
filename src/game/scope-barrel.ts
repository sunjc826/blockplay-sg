import * as THREE from 'three';

/** A short, baffled eyepiece in front of the existing image plane. Keeping that
 * plane fixed preserves the PiP projection, reticle and IFF coordinates. */
export function createScopeBarrel(radius: number) {
  // Radius and eye-ward depth, in lens radii. The two narrow steps catch light;
  // the bore stays dark and leaves the central sight picture entirely open.
  const profile = [
    [.985, .006], [1.025, .14], [1.045, .14],
    [1.045, .24], [1.065, .24], [1.095, .40],
    [1.145, .40], [1.145, .30],
  ];
  const geometry = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r * radius, z * radius)), 64);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: '#252b30', roughness: .82, metalness: .15, side: THREE.DoubleSide });
  const surface = new THREE.Mesh(geometry, material);
  surface.name = 'scope-inner-barrel';
  return { surface, dispose() { geometry.dispose(); material.dispose(); } };
}
