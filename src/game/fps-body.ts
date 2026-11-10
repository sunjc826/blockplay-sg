import { createTenPack } from './carrier-models';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { itemById, tierRank } from './armory-catalog';
import type { ResolvedLoadout } from './armory-state';
import type { WeaponState } from './fps-rules';
import { doubleStackMagazine, magazinePouch, frontMagazineSlot, rearMagazineSlot, isRearMagazineSlot, type RigMagazine } from './magazine-inventory';
import { startingMagazineInventory } from './ammo-pools';
import { arenaCharacterLook } from './character-looks';
import { createCharacterRig, type CharacterDrive } from './character-rig';
import { disposeModel } from './armory-visuals';
import { weaponCarryPose } from './fps-weapon-carry';
import { physicalWeaponFamilies, primaryWeaponFamily } from './weapon-modes';

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
  'plate-strider': '#406a73', 'plate-guardian': '#655a80',
};

type ReserveContainer = 'magazine' | 'sniper-magazine' | 'pistol-magazine' | 'drum' | 'ammo-box';
const SNIPER_POUCH_DEPTH = 1.25;
const containerKind = (mag: RigMagazine): ReserveContainer => doubleStackMagazine(mag) ? 'sniper-magazine' : mag.feed === 'belt' ? 'ammo-box' : mag.feed === 'drum' ? 'drum' : mag.caliberMm === 9 ? 'pistol-magazine' : 'magazine';
function positionMagazine(model: THREE.Group, kind: ReserveContainer, mag: RigMagazine, rear: boolean) {
  // Grow the pouch outward: its second magazine must not sink into the vest.
  model.position.set(0, rear ? .012 : 0, kind === 'sniper-magazine' ? (rear ? -.03 : -.062) : 0);
  model.scale.y = kind === 'sniper-magazine' ? 1 : (kind === 'pistol-magazine' ? .75 : 1) * Math.min(1.35, Math.max(.8, mag.capacity / (kind === 'pistol-magazine' ? 15 : kind === 'magazine' ? 30 : 100)));
}
interface ReserveSlot {
  root: THREE.Group; sleeve: THREE.Mesh; band: THREE.Mesh;
  models: Partial<Record<ReserveContainer, THREE.Group>>;
  rearModels: Partial<Record<ReserveContainer, THREE.Group>>;
  fullness?: number; fullDepth: number;
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

  const mounts = new Map<number, THREE.Group>();
  let weaponModels: readonly THREE.Group[] = [], weaponIdentity = '';
  function clearWeapons() {
    for (const mount of mounts.values()) {
      // Texture snapshots share image pixels with their source. Release GPU
      // resources without closing source-owned ImageBitmaps.
      const resources = new Set<{ dispose(): void }>();
      mount.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        resources.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          resources.add(material);
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
        }
      });
      resources.forEach(resource => resource.dispose()); mount.removeFromParent();
    }
    mounts.clear();
  }
  function rebuildWeapons(equipment: ResolvedLoadout, key: string) {
    clearWeapons();
    const geometry = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
    const materials = new Map<THREE.Material, THREE.Material>();
    const textures = new Map<THREE.Texture, THREE.Texture>();
    const copyMaterial = (source: THREE.Material) => {
      if (materials.has(source)) return materials.get(source)!;
      const copy = source.clone(); materials.set(source, copy);
      for (const [name, value] of Object.entries(copy)) if (value instanceof THREE.Texture) {
        if (!textures.has(value)) textures.set(value, value.clone());
        (copy as unknown as Record<string, unknown>)[name] = textures.get(value);
      }
      return copy;
    };
    // Snapshot the dressed silhouette without viewmodel hands or circular
    // optic metadata. Every mesh resource is owned by the body snapshot.
    const copyModel = (source: THREE.Object3D): THREE.Object3D => {
      let copy: THREE.Object3D;
      if (source instanceof THREE.Mesh) {
        if (!geometry.has(source.geometry)) geometry.set(source.geometry, source.geometry.clone());
        const shape = geometry.get(source.geometry)!;
        const material = Array.isArray(source.material) ? source.material.map(copyMaterial) : copyMaterial(source.material);
        if (source instanceof THREE.InstancedMesh) {
          const instances = new THREE.InstancedMesh(shape, material, source.count);
          instances.instanceMatrix.copy(source.instanceMatrix);
          if (source.instanceColor) instances.instanceColor = source.instanceColor.clone() as THREE.InstancedBufferAttribute;
          copy = instances;
        } else copy = new THREE.Mesh(shape, material);
      } else copy = new THREE.Group();
      copy.name = source.name; copy.position.copy(source.position); copy.quaternion.copy(source.quaternion); copy.scale.copy(source.scale); copy.visible = source.visible;
      for (const child of source.children) if (child.name !== 'fps-handling') copy.add(copyModel(child));
      return copy;
    };
    let longGun = 0;
    for (const family of physicalWeaponFamilies(equipment.carriedFamilies)) {
      const source = weaponModels[family]; if (!source) continue;
      const spec = equipment.weapons[family], pose = weaponCarryPose(spec, spec.id === 'p30-inspired' ? 0 : longGun++);
      const mount = new THREE.Group(); mount.name = `carried-weapon-${family}`;
      mount.userData.family = family; mount.userData.carryClass = pose.kind;
      mount.position.fromArray(pose.position); mount.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2]);
      character.joints[pose.joint].add(mount);
      geometry.clear(); materials.clear(); textures.clear();
      const model = copyModel(source); model.position.set(0, 0, 0); model.quaternion.identity(); model.scale.set(1, 1, 1); model.visible = true; mount.add(model);
      const cloth = new THREE.MeshStandardMaterial({ color: '#30382c', roughness: .93 });
      const strap = (name: string, size: number[], at: number[]) => {
        const part = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 1, .004), cloth);
        part.name = name; part.position.fromArray(at); mount.add(part);
      };
      // Open holster retains the frame, leaving the slide and grip readable.
      if (pose.kind === 'holster') {
        strap('holster-shell', [.067, .065, .11], [0, .158, -.018]);
        strap('holster-belt-loop', [.035, .12, .025], [-.035, .10, .09]);
      } else {
        strap('weapon-sling', [.026, .018, .48], [.065, .13, .04]);
        strap('sling-retainer', [.11, .022, .04], [0, .12, .20]);
      }
      mounts.set(family, mount);
    }
    weaponIdentity = key;
  }

  function rebuild(equipment: ResolvedLoadout) {
    disposeModel(gear); gear.removeFromParent();
    gear = new THREE.Group(); gear.name = 'worn-equipment'; character.joints.chest.add(gear);
    const tier = itemById(equipment.rigId)?.tier ?? 'Issued', elite = tierRank(tier) >= tierRank('Elite');
    const cloth = new THREE.MeshStandardMaterial({ color: elite ? '#384136' : '#626b47', roughness: .95 });
    const trim = new THREE.MeshStandardMaterial({ color: tier === 'Mythic' ? '#de967c' : tier === 'Legendary' ? '#b2a0d3' : tier === 'Ultra' ? '#77bcc8' : elite ? '#ac945b' : '#303b2c', roughness: .8 });
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
          box(model, 'handle-post', .008, .023, .009, side * .027, .098, -.005, metal).userData.pouchDecoration = true;
          box(model, 'lid-latch', .014, .03, .009, side * .029, .065, -.055, trim);
        }
        box(model, 'carry-handle', .062, .009, .011, 0, .113, -.005, metal).userData.pouchDecoration = true;
        brass ??= new THREE.MeshStandardMaterial({ color: '#bd9746', metalness: .65, roughness: .4 });
        // A short linked belt folded across the lid makes the feed type legible
        // from the downward first person angle, even when the box is in a pouch.
        for (let round = 0; round < 5; round++) {
          const cartridge = new THREE.Mesh(new THREE.CylinderGeometry(.0035, .0035, .031, 6), brass);
          cartridge.userData.pouchDecoration = true;
          cartridge.rotation.x = Math.PI / 2; cartridge.position.set((round - 2) * .012, .092, -.032); model.add(cartridge);
          box(model, 'belt-link', .009, .006, .007, (round - 2) * .012, .092, -.025, metal).userData.pouchDecoration = true;
        }
      } else if (kind === 'drum') {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(.043, .043, .058, 20), metal);
        drum.name = 'drum-body'; drum.rotation.x = Math.PI / 2; drum.position.set(0, .04, -.012); model.add(drum);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(.039, .003, 5, 20), trim);
        rim.position.set(0, .04, -.043); model.add(rim);
        box(model, 'drum-feed-tower', .033, .039, .031, 0, .095, -.012, metal);
      } else if (kind === 'sniper-magazine') {
        box(model, 'sniper-magazine-body', .045, .11, .024, 0, .035, 0, metal);
        box(model, 'sniper-floorplate', .049, .007, .028, 0, -.024, 0, trim);
        box(model, 'sniper-feed-lips', .041, .01, .026, 0, .095, 0, trim);
        for (const x of [-.014, .014]) box(model, 'sniper-magazine-rib', .003, .075, .002, x, .035, -.013, trim);
      } else {
        box(model, 'magazine-body', .065, .14, .038, 0, .035, 0, metal);
        box(model, 'feed-lips', .06, .013, .04, 0, .11, 0, trim);
        if (kind === 'pistol-magazine') model.scale.set(.55, .75, 1);
      }
      return model;
    };
    box(gear, equipment.rigId, .37, .39, .25, 0, .06, 0);
    if (itemById(equipment.rigId)?.reserveCarrier === 'pack') { const pack = createTenPack(); pack.position.set(0, 0, .26); gear.add(pack); }
    for (const x of [-.125, .125]) box(gear, 'shoulder-strap', .055, .13, .24, x, .28, 0, trim);
    const plate = itemById(equipment.plateId);
    if (plate?.protection) {
      const material = new THREE.MeshStandardMaterial({ color: PLATE_COLORS[plate.id] ?? '#454b49', roughness: .7, metalness: plate.id === 'plate-steel' ? .7 : .1 });
      const depth = plate.id === 'plate-soft' ? .015 : plate.id === 'plate-strider' ? .025 : plate.id === 'plate-pillbox' ? .07 : .035;
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
      else { pouch.position.set(index % 2 ? .235 : -.235, index < 8 ? -.065 : index < 10 ? .1 : -.23, -.065); pouch.rotation.y = index % 2 ? -.65 : .65; }
      gear.add(pouch);
      const sleeve = box(pouch, 'pouch', .094, .105, .06, 0, -.025, 0);
      const band = box(pouch, 'retention-band', .098, .018, .066, 0, .015, -.003, trim);
      const magazine = buildContainer('magazine'); pouch.add(magazine); magazine.visible = false;
      magazines.push({ root: pouch, sleeve, band, models: { magazine }, rearModels: {}, fullDepth: 1 });
    }
    identity = `${equipment.rigId}|${equipment.plateId}`;
  }
  return {
    root,
    setWeaponModels(models: readonly THREE.Group[]) { weaponModels = models; weaponIdentity = ''; },
    weaponMount(family: number) { return mounts.get(primaryWeaponFamily(family)); },
    magazinePosition(slot: number, target = new THREE.Vector3()) {
      const pouch = magazines[magazinePouch(slot)]?.root;
      if (!pouch) return null;
      return pouch.localToWorld(target.set(0, isRearMagazineSlot(slot) ? .052 : .04, 0));
    },
    magazineSource(slot: number, mag: RigMagazine) {
      const pouch = magazines[magazinePouch(slot)]; if (!pouch) return null;
      const rear = isRearMagazineSlot(slot), kind = containerKind(mag), models = rear ? pouch.rearModels : pouch.models;
      let model = models[kind];
      if (!model) { model = buildContainer(kind); model.visible = false; models[kind] = model; pouch.root.add(model); }
      positionMagazine(model, kind, mag, rear);
      return { model, shoulder: character.joints.upperArmL.getWorldPosition(new THREE.Vector3()) };
    },
    update(dt: number, equipment: ResolvedLoadout, states: readonly WeaponState[], pose: CharacterDrive & { x: number; y: number; z: number; yaw: number; visible: boolean; activeFamily?: number }) {
      if (identity !== `${equipment.rigId}|${equipment.plateId}`) rebuild(equipment);
      const key = physicalWeaponFamilies(equipment.carriedFamilies).map(f => `${f}:${equipment.weapons[f].equipment.variant}:${equipment.weapons[f].equipment.skin}`).join('|');
      if (weaponModels.length && key !== weaponIdentity) rebuildWeapons(equipment, key);
      mounts.forEach((mount, family) => {
        // Hardware stays on the body while its weapon is in the hands.
        mount.visible = true;
        mount.children[0].visible = family !== primaryWeaponFamily(pose.activeFamily ?? equipment.carriedFamilies[0]);
        const magazine = mount.children[0].getObjectByName(`${equipment.weapons[family].id}__magazine`);
        if (magazine) magazine.visible = !states[family]?.magazineOut;
      });
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
        [...Object.values(slot.models), ...Object.values(slot.rearModels)].forEach(model => { model.visible = false; });
        const front = inventory.slots[frontMagazineSlot(index)], rear = inventory.slots[rearMagazineSlot(index)], mag = front ?? rear;
        const kind = mag ? containerKind(mag) : 'magazine';
        const bulky = kind === 'ammo-box' || kind === 'drum';
        // Only the fabric collapses. Magazine models and pouch roots stay put,
        // so the hand's source pose remains continuous during extraction.
        if (mag) slot.fullDepth = kind === 'sniper-magazine' ? SNIPER_POUCH_DEPTH : bulky ? 1.4 : 1;
        const target = mag ? 1 : 0;
        slot.fullness = slot.fullness === undefined ? target : THREE.MathUtils.damp(slot.fullness, target, 22, Math.max(0, dt));
        if (Math.abs(slot.fullness - target) < .001) slot.fullness = target;
        const depth = THREE.MathUtils.lerp(.18, slot.fullDepth, slot.fullness);
        const height = THREE.MathUtils.lerp(.82, 1, slot.fullness);
        const width = slot.fullDepth === SNIPER_POUCH_DEPTH ? .76 : 1;
        slot.sleeve.scale.set(width, height, depth);
        // Fold cloth back against the vest while its bottom edge stays anchored.
        slot.sleeve.position.z = THREE.MathUtils.lerp(.06, .03 * slot.fullDepth, slot.fullness) - .03 * depth;
        if (slot.fullDepth === SNIPER_POUCH_DEPTH) slot.sleeve.position.z -= .046 * slot.fullness;
        slot.sleeve.position.y = -.025 - .105 * (1 - height) / 2;
        slot.band.scale.set(width, THREE.MathUtils.lerp(.6, 1, slot.fullness), depth);
        slot.band.position.z = THREE.MathUtils.lerp(.06, -.003 + .033 * slot.fullDepth, slot.fullness) - .033 * depth;
        if (slot.fullDepth === SNIPER_POUCH_DEPTH) slot.band.position.z -= .046 * slot.fullness;
        slot.band.position.y = .015 - .01 * (1 - slot.fullness);
        slot.band.rotation.x = .20 * (1 - slot.fullness);
        slot.root.userData.fullness = slot.fullness;
        slot.root.userData.container = mag ? kind : null;
        slot.root.userData.magazineCount = Number(!!front) + Number(!!rear);
        for (const [magazine, back] of [[front, false], [rear, true]] as const) {
          if (!magazine) continue;
          const models = back ? slot.rearModels : slot.models, kind = containerKind(magazine);
          let model = models[kind];
          if (!model) { model = buildContainer(kind); models[kind] = model; slot.root.add(model); }
          model.visible = true; model.userData.family = magazine.family; model.userData.capacity = magazine.capacity;
          positionMagazine(model, kind, magazine, back);
        }
      });
      root.userData.magazineSlots = magazines.length;
      root.userData.magazines = carried.filter(family => family !== undefined).length;
      root.userData.magazineLayout = inventory.slots.map(mag => mag ? { group: mag.group, capacity: mag.capacity } : null);
    },
    dispose() { clearWeapons(); disposeModel(gear); character.dispose(); },
  };
}
