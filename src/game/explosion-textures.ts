import * as THREE from 'three';

const hash = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), u),
    THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u), v);
}

/** Soft, irregular billows with baked volume shading; generated once per renderer. */
export function createExplosionTexture(fire: boolean, size = 128) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
    const broad = noise(u * 3 + 12, v * 3 + 9), fine = noise(u * 11 + 3, v * 11 + 17);
    const radius = Math.hypot(u, v), edge = .72 + broad * .24;
    const cover = 1 - THREE.MathUtils.smoothstep(radius, edge * .55, edge);
    const density = cover * (.55 + broad * .3 + fine * .15);
    const shade = fire ? .65 + density * .35 : .55 + broad * .24 + (1 - v) * .08 + fine * .05;
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = Math.round(shade * 255);
    data[i + 3] = Math.round(density * 255);
  }
  const map = new THREE.DataTexture(data, size, size);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true; map.needsUpdate = true;
  return map;
}
