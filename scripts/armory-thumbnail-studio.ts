// Imported by armory-thumbnails.mjs through Vite, never by the shipped app.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { armoryThumbnailShots } from '../src/game/armory-thumbnails';
import { createProfile, previewLoadout } from '../src/game/armory-state';
import { armorModel, disposeModel, dressWeapon, visionModel } from '../src/game/armory-visuals';
import { buildServiceWeapon } from '../src/game/service-weapon-models';
import { buildVehicleModel } from '../src/game/vehicle-models';
import { buildFoodModel } from '../src/game/food-models';
import { buildGrenadeModel } from '../src/game/grenade-models';
import { buildUtilityModel, isUtilityModelId } from '../src/game/utility-models';

export const shots = armoryThumbnailShots();

export function createStudio() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(480, 240); renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#dce8ff', '#4c4b38', 2.3));
  const key = new THREE.DirectionalLight('#fff1d9', 3.8); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight('#88c4e0', 2); rim.position.set(-2, 1, -2); scene.add(rim);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room); scene.environment = environment.texture;
  room.dispose(); pmrem.dispose();
  const camera = new THREE.OrthographicCamera(-1, 1, .5, -.5, .001, 200);
  const profile = createProfile(), loader = new GLTFLoader();
  return {
    async render(index: number) {
      const { item, family, vehicle } = shots[index];
      const weapon = previewLoadout(profile, item, family).weapons[family];
      const armor = item.category === 'rig' || item.category === 'plate';
      const food = item.category === 'consumable' && item.supplyType === 'food';
      const kit = isUtilityModelId(item.id), gear = armor || food || kit || !!item.grenade || item.category === 'vision' || item.category === 'vehicleSkin';
      let root: THREE.Object3D;
      if (item.category === 'vehicleSkin') root = buildVehicleModel(vehicle, item.id);
      else if (armor) root = armorModel(item);
      else if (item.category === 'vision') root = visionModel(item);
      else if (food) root = buildFoodModel(item.id)!.root;
      else if (item.grenade) root = buildGrenadeModel(item.id)!.root;
      else if (kit) root = buildUtilityModel(item.id)!.root;
      else root = buildServiceWeapon(weapon.id) ?? (await loader.loadAsync(`/models/field-kit/${weapon.id}.glb`)).scene;
      const undress = gear ? undefined : dressWeapon(root, weapon);
      try {
        root.updateMatrixWorld(true);
        root.position.sub(new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3()));
        scene.add(root); root.updateMatrixWorld(true);
        const direction = new THREE.Vector3(...(food || kit ? [.5, .9, 1.2] : armor ? [.45, .25, 1.4] : item.category === 'vision' ? [.6, .35, 1.2] : item.category === 'vehicleSkin' ? [1.2, .8, 1.6] : [1.4, .38, .5]) as [number, number, number]).normalize();
        const bounds = new THREE.Box3().setFromObject(root), radius = bounds.getSize(new THREE.Vector3()).length();
        camera.position.copy(direction.multiplyScalar(radius * 2 + 1)); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
        const projected = new THREE.Box3();
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
        const center = projected.getCenter(new THREE.Vector3());
        const halfHeight = Math.max((projected.max.y - projected.min.y) / 2, (projected.max.x - projected.min.x) / 4) * 1.12;
        camera.left = center.x - halfHeight * 2; camera.right = center.x + halfHeight * 2;
        camera.top = center.y + halfHeight; camera.bottom = center.y - halfHeight; camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/webp', .9).split(',')[1];
      } finally { root.removeFromParent(); undress?.(); disposeModel(root); }
    },
    dispose() { environment.dispose(); renderer.dispose(); renderer.forceContextLoss(); },
  };
}
