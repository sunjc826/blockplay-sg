import * as THREE from 'three';
import type { SceneKit } from './scene-kit';

/** Authored terrace vocabulary for the two later heritage districts. The
 * rear rooms collide, while the continuous covered five-foot way stays open.
 * It does not certify a specific building's dimensions or ornament. */
export function heritageTerraces(kit: SceneKit, options: {
  x: number; z: number; count: number; colors: readonly string[];
  ornate?: boolean; facing?: 1 | -1; raised?: number; label?: string;
}) {
  const { box, mat, solid, scene, geo } = kit;
  const facing = options.facing ?? 1, base = options.raised ?? 0;
  const cream = mat('#f0e5ce'), shutters = mat('#416c69'), roof = mat('#a8674c'), dark = mat('#39464a');
  const palette = options.colors.map(c => mat(c));
  if (!base) box(options.x, .04, options.z + facing * 15, options.count * 12, .12, 6, mat('#d7cdb9'));
  const arch = geo(new THREE.TorusGeometry(1.45, .14, 4, 12, Math.PI));
  for (let i = 0; i < options.count; i++) {
    const x = options.x + (i - (options.count - 1) / 2) * 12, z = options.z, front = z + facing * 12;
    const color = palette[i % palette.length], height = options.ornate ? 10.5 : 9;
    box(x, base + height / 2, z, 11.8, height, 24, color, scene, true); solid(x, z, 11.8, 24);
    for (const side of [-1, 1]) {
      box(x + side * 5.6, base + height / 2, front + facing * .15, .55, height, .65, cream);
      box(x + side * 5.5, base + 1.8, front + facing * 5.7, .5, 3.6, .5, cream);
      solid(x + side * 5.5, front + facing * 5.7, .55, .55);
    }
    // Shopfronts and a shallow soffit above an unobstructed 5 m arcade.
    box(x, base + 1.55, front + facing * .2, 8.8, 3.1, .3, dark);
    box(x, base + 3.6, front + facing * 3, 12, .3, 6.5, cream);
    box(x, base + 4.1, front + facing * .4, 11.4, .45, .5, cream);
    for (const dx of [-2.8, 2.8]) {
      box(x + dx, base + 6.7, front + facing * .35, 3.6, 3.2, .35, shutters);
      for (let y = 5.5; y < 8.2; y += .42) box(x + dx, base + y, front + facing * .6, 3.3, .13, .12, cream);
      if (options.ornate) {
        const moulding = new THREE.Mesh(arch, cream); moulding.position.set(x + dx, base + 7.9, front + facing * .7); scene.add(moulding);
        box(x + dx, base + 9.7, front + facing * .5, 1.4, .55, .45, cream);
      }
    }
    for (const side of [-1, 1]) {
      const slope = box(x, base + height + 1.15, z + side * 6.4, 12, .45, 13.5, roof, scene, true);
      slope.rotation.x = side * .16;
    }
    box(x, base + height + .8, front, 11.5, .5, 1.2, cream);
    if (options.ornate) for (const dx of [-4.6, 0, 4.6]) {
      box(x + dx, base + 2.7, front + facing * .45, .8, .8, .4, palette[(i + 1) % palette.length]);
      box(x + dx, base + height + 1.3, front, .65, .65, .65, cream);
    }
  }
  if (options.label) {
    const panel = kit.sign(options.label, options.x, base + 3, options.z + facing * 18.2, Math.min(options.count * 12, 38), 1.5, '#526e65');
    if (panel && facing === -1) panel.rotation.y = Math.PI;
  }
}
