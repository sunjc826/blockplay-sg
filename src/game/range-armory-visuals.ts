import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { type ShopItem } from './armory-catalog';
import { createProfile, previewLoadout } from './armory-state';
import { disposeModel, dressWeapon } from './armory-visuals';
import { FPS_WEAPONS } from './fps-rules';
import { LOOT_TIER_COLORS } from './loot-focus';
import { RANGE_WALL_ROWS, TABLE_CELL, TABLE_HEIGHT, WALL_HEIGHT, WALL_THICKNESS, WALL_WIDTH, type RackItem, type RangeArmoryPlan, type RangeArmoryPlot } from './range-armory';
import { buildServiceWeapon } from './service-weapon-models';

const ROW_TOP = WALL_HEIGHT - .46, ROW_HEIGHT = .55, SIGN = 2048 / WALL_WIDTH;

/** Where a focused gun's frame goes, in the bay's frame. */
interface Slot { position: THREE.Vector3; flat: boolean; width: number; height: number }
export interface RangeArmoryEntry extends RackItem { item: ShopItem; slot: Slot; model: THREE.Group | null }

/** Wall positions, spaced so the row's guns share its width by their lengths. */
function spacedAlong(lengths: readonly number[], width: number) {
  const total = lengths.reduce((sum, length) => sum + length, 0), gap = (width - total) / (lengths.length + 1);
  let cursor = -width / 2 + gap;
  return lengths.map(length => { const centre = cursor + length / 2; cursor += length + gap; return centre; });
}

/**
 * One gun as a few merged meshes, by surface. Models are built to be animated in
 * the hands, up to seventy meshes each, and nothing on a rack moves; a wall of
 * them drawn as built would cost several thousand draws.
 */
function bakeWeapon(model: THREE.Object3D, surfaces: Map<string, THREE.Material>, owned: { dispose(): void }[]) {
  model.updateMatrixWorld(true);
  const groups = new Map<string, { material: THREE.Material; pieces: THREE.BufferGeometry[]; uv: boolean }>();
  model.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh) || node.userData.fpsEffect) return;
    const source = (Array.isArray(node.material) ? node.material[0] : node.material) as THREE.MeshStandardMaterial;
    // Live scope glass reads the engine's reflection capture, which a rack gun has no part in.
    if (!source || (source as unknown as THREE.ShaderMaterial).isShaderMaterial) return;
    const uv = !!source.map && !!node.geometry.getAttribute('uv');
    const key = [source.type, source.color?.getHexString(), source.roughness, source.metalness, source.transparent, source.opacity, source.side, uv ? source.map!.uuid : '', source.emissive?.getHexString(), source.emissiveIntensity].join('|');
    let group = groups.get(key);
    if (!group) {
      let material = surfaces.get(key);
      if (!material) { material = source.clone(); surfaces.set(key, material); owned.push(material); }
      group = { material, pieces: [], uv }; groups.set(key, group);
    }
    const flat = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    if (!flat.getAttribute('normal')) flat.computeVertexNormals();
    for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal' && !(group.uv && name === 'uv')) flat.deleteAttribute(name);
    flat.clearGroups(); flat.morphAttributes = {};
    flat.applyMatrix4(node.matrixWorld); group.pieces.push(flat);
  });
  const baked = new THREE.Group();
  for (const { material, pieces } of groups.values()) {
    const merged = mergeGeometries(pieces, false); pieces.forEach(piece => piece.dispose());
    if (!merged) continue;
    owned.push(merged);
    const mesh = new THREE.Mesh(merged, material); mesh.userData.fpsEffect = true; baked.add(mesh);
  }
  return baked;
}

/** The gun's own centre and length along its barrel, before it is hung. */
function modelBounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

const fitted = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, weight = 600) => {
  ctx.font = `${weight} ${size}px sans-serif`;
  const scale = Math.min(1, width / Math.max(1, ctx.measureText(text).width));
  ctx.font = `${weight} ${Math.max(11, Math.floor(size * scale))}px sans-serif`;
  ctx.fillText(text, x, y, width);
};
/** A dark plate under a gun with its name in its tier's colour. */
function plaque(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, tier: ShopItem['tier']) {
  ctx.font = '600 17px sans-serif';
  const plate = Math.min(width, ctx.measureText(text).width + 16);
  ctx.fillStyle = '#1c241f'; ctx.fillRect(x - plate / 2, y - 12, plate, 24);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = LOOT_TIER_COLORS[tier] ?? '#e4e9df';
  fitted(ctx, text, x, y + 1, plate - 8, 17);
  ctx.textBaseline = 'alphabetic';
}
const shortName = (name: string) => name.replace(/^SAR 21 · /, 'SAR · ');

/**
 * The bay's wall and table. The frame goes up with the world; the guns follow
 * once the two field-kit models have loaded, and `fill` hangs them before the
 * engine dresses those same models for the hands.
 */
export function createRangeArmory(scene: THREE.Scene, plot: RangeArmoryPlot, plan: RangeArmoryPlan, floor: number, tableItems: readonly ShopItem[]) {
  const root = new THREE.Group(); root.name = 'range-armory'; root.position.set(plot.x, floor, plot.z); root.rotation.y = plot.yaw; scene.add(root); root.updateMatrixWorld(true);
  const owned: { dispose(): void }[] = [], entries: RangeArmoryEntry[] = [];
  const material = (color: string, roughness = .85, metalness = 0) => { const made = new THREE.MeshStandardMaterial({ color, roughness, metalness }); owned.push(made); return made; };
  const board = material('#9aa08f'), frame = material('#1c241f', .7, .2), wood = material('#6d5236', .8);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, surface: THREE.Material) => {
    const geometry = new THREE.BoxGeometry(w, h, d); owned.push(geometry);
    const mesh = new THREE.Mesh(geometry, surface); mesh.position.set(x, y, z); root.add(mesh); mesh.receiveShadow = true; return mesh;
  };
  // Footings run below the floor so a slight slope shows no gap.
  box(WALL_WIDTH, WALL_HEIGHT + .3, WALL_THICKNESS, 0, (WALL_HEIGHT - .3) / 2, 0, board).castShadow = true;
  for (const x of [-WALL_WIDTH / 2, WALL_WIDTH / 2]) box(.14, WALL_HEIGHT + .42, WALL_THICKNESS + .1, x, (WALL_HEIGHT - .18) / 2, 0, frame).castShadow = true;
  box(WALL_WIDTH + .14, .12, WALL_THICKNESS + .12, 0, WALL_HEIGHT + .06, 0, frame);

  const paint = (width: number, height: number) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!, texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; owned.push(texture);
    return { ctx, texture };
  };
  const wallFace = paint(2048, Math.round(WALL_HEIGHT * SIGN));
  const toPixelY = (y: number) => (WALL_HEIGHT - y) * SIGN, toPixelX = (x: number) => (x + WALL_WIDTH / 2) * SIGN;
  // Pale board, so dark guns stand out even on the side away from the sun.
  wallFace.ctx.fillStyle = '#a9ae9c'; wallFace.ctx.fillRect(0, 0, 2048, wallFace.ctx.canvas.height);
  wallFace.ctx.fillStyle = '#1c241f'; wallFace.ctx.fillRect(0, 0, 2048, 58);
  wallFace.ctx.fillStyle = '#f0d591'; wallFace.ctx.textAlign = 'center';
  fitted(wallFace.ctx, 'GALLERY WALL · ISSUED & CAPTURED WEAPONS', 1024, 42, 1500, 34, 700);
  const faceGeometry = new THREE.PlaneGeometry(WALL_WIDTH, WALL_HEIGHT), faceMaterial = new THREE.MeshStandardMaterial({ map: wallFace.texture, roughness: .9, emissive: '#ffffff', emissiveMap: wallFace.texture, emissiveIntensity: .32 });
  owned.push(faceGeometry, faceMaterial);
  const face = new THREE.Mesh(faceGeometry, faceMaterial); face.position.set(0, WALL_HEIGHT / 2, WALL_THICKNESS / 2 + .004); root.add(face);

  const tableFace = plan.table ? paint(1024, Math.max(128, Math.round(1024 * plan.table.depth / plan.table.width))) : null;
  if (plan.table) {
    const { width, depth, z } = plan.table;
    box(width, .06, depth, 0, TABLE_HEIGHT - .03, z, wood).castShadow = true;
    for (const x of [-width / 2 + .08, width / 2 - .08]) for (const dz of [-depth / 2 + .08, depth / 2 - .08]) box(.08, TABLE_HEIGHT + .3, .08, x, (TABLE_HEIGHT - .36) / 2, z + dz, wood);
    const { ctx, texture } = tableFace!;
    ctx.fillStyle = '#2f3f35'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const topGeometry = new THREE.PlaneGeometry(width - .06, depth - .06), topMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: .95 });
    owned.push(topGeometry, topMaterial);
    const top = new THREE.Mesh(topGeometry, topMaterial); top.rotation.x = -Math.PI / 2; top.position.set(0, TABLE_HEIGHT + .002, z); root.add(top);
    const apron = paint(512, 48);
    apron.ctx.fillStyle = '#1c241f'; apron.ctx.fillRect(0, 0, 512, 48); apron.ctx.fillStyle = '#f0d591'; apron.ctx.textAlign = 'center';
    fitted(apron.ctx, 'YOUR WEAPONS · SWAP ANY TIME', 256, 33, 480, 26, 700);
    const apronGeometry = new THREE.PlaneGeometry(1.8, .17), apronMaterial = new THREE.MeshStandardMaterial({ map: apron.texture, roughness: .9, emissive: '#ffffff', emissiveMap: apron.texture, emissiveIntensity: .3 });
    owned.push(apronGeometry, apronMaterial);
    const sign = new THREE.Mesh(apronGeometry, apronMaterial); sign.position.set(0, TABLE_HEIGHT - .14, z + depth / 2 + .002); root.add(sign);
    box(width - .1, .2, .03, 0, TABLE_HEIGHT - .14, z + depth / 2 - .02, wood);
  }

  const highlightGeometry = new THREE.PlaneGeometry(1, 1), highlightMaterial = new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: .22, depthWrite: false, toneMapped: false });
  owned.push(highlightGeometry, highlightMaterial);
  const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial); highlight.visible = false; highlight.userData.fpsEffect = true; root.add(highlight);

  /** Builds one gun exactly as the Armory dresses it, then keeps only its baked shape. */
  function buildGun(item: ShopItem, field: readonly [THREE.Group, THREE.Group], surfaces: Map<string, THREE.Material>) {
    const family = item.family!, weapon = previewLoadout(createProfile(), item, family).weapons[family];
    // Racked guns stay in service olive: a camouflage skin would need a texture per gun.
    const display = { ...weapon, equipment: { ...weapon.equipment, skin: '' } };
    const template = family < 2 ? field[family].clone(true) : buildServiceWeapon(FPS_WEAPONS[family].id);
    if (!template) return null;
    const undress = dressWeapon(template, display), baked = bakeWeapon(template, surfaces, owned);
    undress(); if (family >= 2) disposeModel(template);
    return baked;
  }

  function hang(baked: THREE.Group, entry: RangeArmoryEntry) { root.add(baked); baked.position.copy(entry.slot.position); baked.updateMatrixWorld(true); entry.model = baked; }
  const worldOf = (point: THREE.Vector3) => point.clone().applyMatrix4(root.matrixWorld);

  function fill(field: readonly [THREE.Group, THREE.Group]) {
    const surfaces = new Map<string, THREE.Material>();
    RANGE_WALL_ROWS.forEach((row, rowIndex) => {
      const y = ROW_TOP - rowIndex * ROW_HEIGHT;
      const built = row.items.map(item => {
        const gun = buildGun(item, field, surfaces); if (!gun) return null;
        // Muzzle to the left, its side to the room.
        gun.rotation.y = Math.PI / 2; const bounds = modelBounds(gun);
        const length = bounds.max.x - bounds.min.x;
        const holder = new THREE.Group(); holder.add(gun); gun.position.set(-(bounds.min.x + bounds.max.x) / 2, -(bounds.min.y + bounds.max.y) / 2, -bounds.min.z);
        return { item, holder, length };
      }).filter(gun => gun !== null);
      const centres = spacedAlong(built.map(gun => gun.length), WALL_WIDTH - .3);
      const ctx = wallFace.ctx;
      ctx.fillStyle = '#7f8574'; ctx.fillRect(0, toPixelY(y + .275), 2048, 2);
      ctx.textAlign = 'left'; ctx.fillStyle = '#1c241f'; fitted(ctx, row.label, 14, toPixelY(y + .275) + 17, 300, 14, 700);
      built.forEach((gun, index) => {
        const x = centres[index], position = new THREE.Vector3(x, y, WALL_THICKNESS / 2 + .025);
        const entry: RangeArmoryEntry = { id: gun.item.id, item: gun.item, x: 0, y: 0, z: 0, model: null, slot: { position, flat: false, width: gun.length + .12, height: ROW_HEIGHT - .08 } };
        const at = worldOf(position); entry.x = at.x; entry.y = at.y; entry.z = at.z;
        hang(gun.holder, entry); entries.push(entry);
        plaque(ctx, shortName(gun.item.name), toPixelX(x), toPixelY(y - .235), Math.min(gun.length + .1, 1.34) * SIGN, gun.item.tier);
      });
    });
    wallFace.texture.needsUpdate = true;
    if (plan.table) {
      const { width, depth, z, columns } = plan.table, ctx = tableFace!.ctx;
      const scaleX = ctx.canvas.width / (width - .06), scaleZ = ctx.canvas.height / (depth - .06);
      tableItems.forEach((item, index) => {
        const gun = buildGun(item, field, surfaces); if (!gun) return;
        const column = index % columns, row = Math.floor(index / columns);
        const x = -width / 2 + .1 + TABLE_CELL.width * (column + .5), cellZ = z - depth / 2 + .1 + TABLE_CELL.depth * (row + .5);
        // On its left side, so the magazine and the sight read from above.
        gun.rotation.set(0, Math.PI / 2, Math.PI / 2, 'YXZ'); const bounds = modelBounds(gun);
        const holder = new THREE.Group(); holder.add(gun);
        gun.position.set(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
        const position = new THREE.Vector3(x, TABLE_HEIGHT + .004, cellZ - .03), entry: RangeArmoryEntry = { id: item.id, item, x: 0, y: 0, z: 0, model: null, slot: { position, flat: true, width: TABLE_CELL.width - .06, height: TABLE_CELL.depth - .04 } };
        const at = worldOf(position.clone().setY(TABLE_HEIGHT + .1)); entry.x = at.x; entry.y = at.y; entry.z = at.z;
        hang(holder, entry); entries.push(entry);
        plaque(ctx, shortName(item.name), (x + (width - .06) / 2) * scaleX, (cellZ + TABLE_CELL.depth / 2 - .03 - (z - (depth - .06) / 2)) * scaleZ, (TABLE_CELL.width - .1) * scaleX, item.tier);
      });
      tableFace!.texture.needsUpdate = true;
    }
  }

  return {
    root, plot, entries,
    fill,
    /** Guns carried are off the rack: what the player puts down goes back to its place. */
    setCarried(carried: ReadonlySet<string>) { for (const entry of entries) if (entry.model) entry.model.visible = !carried.has(entry.id); },
    available(carried: ReadonlySet<string>) { return entries.filter(entry => entry.model && !carried.has(entry.id)); },
    focus(entry: RangeArmoryEntry | null) {
      highlight.visible = !!entry; if (!entry) return;
      const { position, flat, width, height } = entry.slot;
      highlight.scale.set(width, height, 1); highlight.position.copy(position);
      if (flat) { highlight.rotation.set(-Math.PI / 2, 0, 0); highlight.position.y = TABLE_HEIGHT + .006; highlight.position.z += .02; }
      else { highlight.rotation.set(0, 0, 0); highlight.position.z = WALL_THICKNESS / 2 + .008; }
    },
    dispose() { root.removeFromParent(); owned.forEach(resource => resource.dispose()); },
  };
}
export type RangeArmory = ReturnType<typeof createRangeArmory>;
