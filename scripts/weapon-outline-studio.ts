// Imported by weapon-outlines.mjs through Vite, never by the shipped app.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createProfile, resolveLoadout } from '../src/game/armory-state';
import { disposeModel, dressWeapon } from '../src/game/armory-visuals';
import { FPS_WEAPONS } from '../src/game/fps-rules';
import { buildServiceWeapon } from '../src/game/service-weapon-models';
import { isLauncherMode } from '../src/game/weapon-modes';

const OUTPUT_W = 240, OUTPUT_H = 96, SCALE = 4, W = OUTPUT_W * SCALE, H = OUTPUT_H * SCALE;
/** In working pixels: about 3 output pixels, which is 1 CSS pixel where the HUD draws it. */
const STROKE = 12;

export const families = FPS_WEAPONS.flatMap((weapon, family) => isLauncherMode(family) ? [] : [{ family, id: weapon.id }]);

/** Keeps only the rim of a silhouette: filled pixels within STROKE of an empty one. */
function rim(alpha: Uint8Array) {
  const far = 1e6, distance = new Float32Array(W * H);
  for (let i = 0; i < distance.length; i++) distance[i] = alpha[i] > 127 ? far : 0;
  const relax = (i: number, from: number, cost: number) => { if (distance[from] + cost < distance[i]) distance[i] = distance[from] + cost; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { distance[i] = Math.min(distance[i], 1); continue; }
    relax(i, i - 1, 1); relax(i, i - W, 1); relax(i, i - W - 1, 1.414); relax(i, i - W + 1, 1.414);
  }
  for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) {
    const i = y * W + x;
    relax(i, i + 1, 1); relax(i, i + W, 1); relax(i, i + W + 1, 1.414); relax(i, i + W - 1, 1.414);
  }
  return distance;
}

export function createStudio() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false); renderer.setPixelRatio(1); renderer.setClearColor(0, 0);
  const scene = new THREE.Scene(); scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: '#fff', side: THREE.DoubleSide });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .001, 100);
  const weapons = resolveLoadout(createProfile()).weapons, loader = new GLTFLoader();
  const output = document.createElement('canvas'); output.width = OUTPUT_W; output.height = OUTPUT_H;
  const working = document.createElement('canvas'); working.width = W; working.height = H;
  return {
    async render(family: number) {
      const weapon = weapons[family] ?? FPS_WEAPONS[family];
      const root = buildServiceWeapon(weapon.id) ?? (await loader.loadAsync(`/models/field-kit/${weapon.id}.glb`)).scene;
      const undress = weapons[family] ? dressWeapon(root, weapons[family]) : undefined;
      try {
        root.updateMatrixWorld(true);
        root.position.sub(new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3()));
        scene.add(root); root.updateMatrixWorld(true);
        const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
        // The barrel runs down -z, so a camera on +x sees the muzzle on the right.
        const half = Math.max(size.y / 2, size.z / 2 * OUTPUT_H / OUTPUT_W) * 1.08;
        camera.top = half; camera.bottom = -half; camera.left = -half * OUTPUT_W / OUTPUT_H; camera.right = half * OUTPUT_W / OUTPUT_H;
        camera.position.set(size.x + 5, 0, 0); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        const gl = renderer.getContext(), pixels = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const alpha = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) alpha[y * W + x] = pixels[(H - 1 - y) * W * 4 + x * 4 + 3];
        const distance = rim(alpha), image = new ImageData(W, H);
        for (let i = 0; i < alpha.length; i++) {
          const inside = alpha[i] > 127 && distance[i] <= STROKE;
          image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 255; image.data[i * 4 + 3] = inside ? 255 : 0;
        }
        working.getContext('2d')!.putImageData(image, 0, 0);
        const context = output.getContext('2d')!; context.clearRect(0, 0, OUTPUT_W, OUTPUT_H); context.imageSmoothingQuality = 'high';
        context.drawImage(working, 0, 0, OUTPUT_W, OUTPUT_H);
        return output.toDataURL('image/webp', .9).split(',')[1];
      } finally { root.removeFromParent(); undress?.(); disposeModel(root); }
    },
    dispose() { (scene.overrideMaterial as THREE.Material).dispose(); renderer.dispose(); renderer.forceContextLoss(); },
  };
}
