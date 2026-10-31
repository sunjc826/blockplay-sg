import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { itemById } from './armory-catalog';
import type { ResolvedLoadout } from './armory-state';
import type { WeaponState } from './fps-rules';
import type { RigMagazine } from './magazine-inventory';
import { startingMagazineInventory } from './ammo-pools';
import { arenaCharacterLook } from './character-looks';
import { createCharacterRig, type CharacterDrive } from './character-rig';
import { disposeModel } from './armory-visuals';

/** Extra carry belongs to the rig, independently of the protective inserts. */
export function bodyMagazineSlots(rigId: string) {
  return 6 + Math.ceil((itemById(rigId)?.carry ?? 0) / 30);
}

/** Fixed pouch positions; a reload leaves a hole, never repacks the rig. */
export function bodyMagazines(equipment: ResolvedLoadout, states: readonly WeaponState[], _activeFamily?: number) {
  return (states[equipment.carriedFamilies[0]]?.magazineInventory ?? startingMagazineInventory(equipment.weapons, equipment.carriedFamilies)).slots.map(mag => mag?.family);
}

const PLATE_COLORS: Record<string, string> = {
  'plate-soft': '#697559', 'plate-ceramic': '#454b49', 'plate-elite': '#343d4d',
  'plate-steel': '#60666a', 'plate-composite': '#756b4b', 'plate-pillbox': '#333940',
  'plate-pineapple': '#a58d36', 'plate-durian': '#707c32',
};

type ReserveContainer = 'magazine' | 'pistol-magazine' | 'drum' | 'ammo-box';
interface ReserveSlot {
  root: THREE.Group; sleeve: THREE.Mesh; band: THREE.Mesh;
  models: Partial<Record<ReserveContainer, THREE.Group>>;
}

/** World-space lower body: it follows yaw and feet, never the camera's pitch.
 * Existing weapon/supply hands remain responsible for first person handling. */
export function createFpsBody(scene: THREE.Scene) {
  const look = arenaCharacterLook({ bot: false, role: 'rifleman', id: 'local-player' });
  const character = createCharacterRig({ ...look, vest: undefined, plates: false, backpack: undefined, weapon: null }, 'fps-body');
  const root = character.root;
  root.userData.wetSurface = true;
  // Exclude our own geometry from bullets, interaction and camera obstruction.
  root.userData.fpsEffect = true;
  // Give the eye room above the carrier while leaving the hips and boots
  // under the player. Otherwise the top of the chest fills the downward view.
  character.joints.spine.position.z = .18;
  character.joints.neck.visible = false;
  character.joints.upperArmL.visible = character.joints.upperArmR.visible = false;
  scene.add(root);
  let gear = new THREE.Group(), identity = '', crouchDrop = 0;
  let magazines: ReserveSlot[] = [];
  let buildContainer: (kind: ReserveContainer) => THREE.Group;
  character.joints.chest.add(gear);

  function rebuild(equipment: ResolvedLoadout) {
    disposeModel(gear); gear.removeFromParent();
    gear = new THREE.Group(); gear.name = 'worn-equipment'; character.joints.chest.add(gear);
    const elite = itemById(equipment.rigId)?.tier === 'Elite';
    const cloth = new THREE.MeshStandardMaterial({ color: elite ? '#384136' : '#626b47', roughness: .95 });
    const trim = new THREE.MeshStandardMaterial({ color: elite ? '#ac945b' : '#303b2c', roughness: .8 });
    const metal = new THREE.MeshStandardMaterial({ color: '#424b4d', metalness: .6, roughness: .4 });
    const box = (parent: THREE.Object3D, name: string, w: number, h: number, d: number, x: number, y: number, z: number, material = cloth) => {
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(.008, w / 5, h / 5, d / 5)), material);
      mesh.name = name; mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    };
    let brass: THREE.MeshStandardMaterial | undefined;
    buildContainer = kind => {
      const model = new THREE.Group(); model.name = `reserve-${kind}`;
      if (kind === 'ammo-box') {
        box(model, 'ammo-box-body', .085, .095, .072, 0, .027, -.012, metal);
        box(model, 'ammo-box-lid', .093, .012, .08, 0, .081, -.012, trim);
        for (const side of [-1, 1]) {
          box(model, 'handle-post', .008, .023, .009, side * .027, .098, -.005, metal);
          box(model, 'lid-latch', .014, .03, .009, side * .029, .065, -.055, trim);
        }
        box(model, 'carry-handle', .062, .009, .011, 0, .113, -.005, metal);
        brass ??= new THREE.MeshStandardMaterial({ color: '#bd9746', metalness: .65, roughness: .4 });
        // A short linked belt folded across the lid makes the feed type legible
        // from the downward first person angle, even when the box is in a pouch.
        for (let round = 0; round < 5; round++) {
          const cartridge = new THREE.Mesh(new THREE.CylinderGeometry(.0035, .0035, .031, 6), brass);
          cartridge.rotation.x = Math.PI / 2; cartridge.position.set((round - 2) * .012, .092, -.032); model.add(cartridge);
          box(model, 'belt-link', .009, .006, .007, (round - 2) * .012, .092, -.025, metal);
        }
      } else if (kind === 'drum') {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(.043, .043, .058, 20), metal);
        drum.name = 'drum-body'; drum.rotation.x = Math.PI / 2; drum.position.set(0, .04, -.012); model.add(drum);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(.039, .003, 5, 20), trim);
        rim.position.set(0, .04, -.043); model.add(rim);
        box(model, 'drum-feed-tower', .033, .039, .031, 0, .095, -.012, metal);
      } else {
        box(model, 'magazine-body', .065, .14, .038, 0, .035, 0, metal);
        box(model, 'feed-lips', .06, .013, .04, 0, .11, 0, trim);
        if (kind === 'pistol-magazine') model.scale.set(.55, .75, 1);
      }
      return model;
    };
    box(gear, equipment.rigId, .37, .39, .25, 0, .06, 0);
    for (const x of [-.125, .125]) box(gear, 'shoulder-strap', .055, .13, .24, x, .28, 0, trim);
    const plate = itemById(equipment.plateId);
    if (plate?.protection) {
      const material = new THREE.MeshStandardMaterial({ color: PLATE_COLORS[plate.id] ?? '#454b49', roughness: .7, metalness: plate.id === 'plate-steel' ? .7 : .1 });
      const depth = plate.id === 'plate-soft' ? .015 : plate.id === 'plate-pillbox' ? .07 : .035;
      for (const side of [-1, 1]) {
        const panel = box(gear, plate.id, .29, .32, depth, 0, .08, side * (.13 + depth / 2), material);
        if (plate.id === 'plate-pineapple' || plate.id === 'plate-durian') {
          for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(.018, .035, 4), material);
            spike.rotation.x = side * Math.PI / 2;
            spike.position.set((col - 2) * .052, (row - 2) * .055, side * (depth / 2 + .015)); panel.add(spike);
          }
        }
      }
    }
    magazines = [];
    const count = bodyMagazineSlots(equipment.rigId);
    for (let index = 0; index < count; index++) {
      const pouch = new THREE.Group(); pouch.name = `magazine-slot-${index}`;
      if (index < 6) pouch.position.set((index % 3 - 1) * .108, index < 3 ? .115 : -.065, -.19);
      else { pouch.position.set(index % 2 ? .235 : -.235, index === 8 ? .1 : -.065, -.065); pouch.rotation.y = index % 2 ? -.65 : .65; }
      gear.add(pouch);
      const sleeve = box(pouch, 'pouch', .094, .105, .06, 0, -.025, 0);
      const band = box(pouch, 'retention-band', .098, .018, .066, 0, .015, -.003, trim);
      const magazine = buildContainer('magazine'); pouch.add(magazine); magazine.visible = false;
      magazines.push({ root: pouch, sleeve, band, models: { magazine } });
    }
    identity = `${equipment.rigId}|${equipment.plateId}`;
  }
  return {
    root,
    magazinePosition(slot: number, target = new THREE.Vector3()) {
      const pouch = magazines[slot]?.root;
      if (!pouch) return null;
      return pouch.localToWorld(target.set(0, .04, 0));
    },
    magazineSource(slot: number, mag: RigMagazine) {
      const pouch = magazines[slot]; if (!pouch) return null;
      const kind: ReserveContainer = mag.feed === 'belt' ? 'ammo-box' : mag.feed === 'drum' ? 'drum' : mag.caliberMm === 9 ? 'pistol-magazine' : 'magazine';
      let model = pouch.models[kind];
      if (!model) { model = buildContainer(kind); model.visible = false; pouch.models[kind] = model; pouch.root.add(model); }
      model.scale.y = (kind === 'pistol-magazine' ? .75 : 1) * Math.min(1.35, Math.max(.8, mag.capacity / (kind === 'pistol-magazine' ? 15 : kind === 'magazine' ? 30 : 100)));
      return { model, shoulder: character.joints.upperArmL.getWorldPosition(new THREE.Vector3()) };
    },
    update(dt: number, equipment: ResolvedLoadout, states: readonly WeaponState[], pose: CharacterDrive & { x: number; y: number; z: number; yaw: number; visible: boolean; activeFamily?: number }) {
      if (identity !== `${equipment.rigId}|${equipment.plateId}`) rebuild(equipment);
      root.visible = pose.visible;
      root.position.set(pose.x + Math.sin(pose.yaw) * .06, pose.y, pose.z + Math.cos(pose.yaw) * .06);
      root.rotation.y = pose.yaw;
      // The gameplay crouch eye is lower than the shared third person rig's.
      // Fold the trunk further while retaining the rig's planted feet and IK.
      crouchDrop = THREE.MathUtils.damp(crouchDrop, pose.prone ? 0 : Math.min(1, Math.max(0, pose.crouch ?? 0)) * .17, 12, dt);
      character.joints.spine.position.y = .1 - crouchDrop;
      character.update(dt, { ...pose, pitch: 0, aim: 0 });
      const inventory = states[equipment.carriedFamilies[0]]?.magazineInventory ?? startingMagazineInventory(equipment.weapons, equipment.carriedFamilies);
      const carried = bodyMagazines(equipment, states, pose.activeFamily);
      magazines.forEach((slot, index) => {
        Object.values(slot.models).forEach(model => { model.visible = false; });
        const family = carried[index];
        const spec = family !== undefined ? equipment.weapons[family] : undefined;
        const mag = inventory.slots[index];
        const kind: ReserveContainer = mag?.feed === 'belt' ? 'ammo-box' : mag?.feed === 'drum' ? 'drum' : mag?.caliberMm === 9 ? 'pistol-magazine' : 'magazine';
        const bulky = kind === 'ammo-box' || kind === 'drum';
        slot.sleeve.scale.set(1, 1, bulky ? 1.4 : 1); slot.band.scale.set(1, 1, bulky ? 1.4 : 1);
        slot.root.userData.container = family !== undefined ? kind : null;
        if (!spec) return;
        let model = slot.models[kind];
        if (!model) { model = buildContainer(kind); slot.models[kind] = model; slot.root.add(model); }
        model.visible = true; model.userData.family = family; model.userData.capacity = mag?.capacity;
        model.scale.y = (kind === 'pistol-magazine' ? .75 : 1) * Math.min(1.35, Math.max(.8, (mag?.capacity ?? 30) / (kind === 'pistol-magazine' ? 15 : kind === 'magazine' ? 30 : 100)));
      });
      root.userData.magazineSlots = magazines.length;
      root.userData.magazines = carried.filter(family => family !== undefined).length;
      root.userData.magazineLayout = inventory.slots.map(mag => mag ? { group: mag.group, capacity: mag.capacity } : null);
    },
    dispose() { disposeModel(gear); character.dispose(); },
  };
}
