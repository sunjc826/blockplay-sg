import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type ProxyWeaponId = 'ff-strider' | 'ff-scar-l' | 'ff-scar-h' | 'ff-longwatch' | 'cc-gatekeeper' | 'cc-network';
export interface ProxyWeaponStudy {
  id: ProxyWeaponId; faction: 'freedom-force' | 'collective-cops'; name: string; operator: string;
  /** Display labels for art studies, not entries in the live weapon-family registry. */
  familyLabel?: string; variantLabel?: string;
  reference: string; referenceUrl: string; silhouette: string; interpretation: string;
}
/** Exterior art studies only: no shop IDs, ballistics, ammunition or live role registration. */
export const PROXY_WEAPONS: readonly ProxyWeaponStudy[] = [
  { id: 'ff-strider', faction: 'freedom-force', name: 'Strider', operator: 'Lancer', reference: 'SIG MCX SPEAR LT', referenceUrl: 'https://www.sigsauer.com/mcx-spear-lt.html', silhouette: 'Compact fore-end, open folding-stock triangle, forward curved magazine, low reflex hood.', interpretation: 'Sand receiver, dark skeletal furniture and a small steel-blue identification panel. The short cylindrical muzzle shroud is a visual concept.' },
  { id: 'ff-scar-l', faction: 'freedom-force', name: 'Soft Power · Foreign Aid', familyLabel: 'Soft Power', variantLabel: 'Foreign Aid', operator: 'Lancer · option', reference: 'FN SCAR-L', referenceUrl: 'https://fnherstal.com/en/defence/portable-weapons/fn-scar-l-mk2/', silhouette: 'Compact SCAR-family upper, curved narrow magazine, folding-style cheek-rest stock and a small reflex sight.', interpretation: 'Soft Power is the family label; Foreign Aid is its signature variant. Sand and bone furniture, a single amber marker and an open lower stock notch identify the smaller member of the pair.' },
  { id: 'ff-scar-h', faction: 'freedom-force', name: 'Hard Power · Strings Attached', familyLabel: 'Hard Power', variantLabel: 'Strings Attached', operator: 'Wayfinder · option', reference: 'FN SCAR-H', referenceUrl: 'https://fnherstal.com/en/defence/portable-weapons/fn-scar-h-mk2/', silhouette: 'Broader and longer SCAR-family receiver, deeper magazine well, wider straight magazine and a compact prism optic.', interpretation: 'Hard Power is the family label; Strings Attached is its signature variant. Twin amber markers and the same folding-style stock connect it to Soft Power. Longwatch remains the separate precision study with its long scope and bipod.' },
  { id: 'ff-longwatch', faction: 'freedom-force', name: 'Longwatch', operator: 'Wayfinder', reference: 'FN Mk 20 / SCAR 20S', referenceUrl: 'https://fnamerica.com/press-releases/fn-announces-release-fn-scar-20s-precision-rifle/', silhouette: 'Long monolithic upper, adjustable precision stock, short box magazine, large scope and folded bipod.', interpretation: 'A heavier, angular precision silhouette in bone and sand, with restrained blue hardware. Scope and bipod are static art.' },
  { id: 'cc-gatekeeper', faction: 'collective-cops', name: 'Gatekeeper', operator: 'Bastion', reference: 'QBZ-95 family', referenceUrl: 'https://date.army.gov.au/equipment/qbz-95', silhouette: 'Bullpup action and curved magazine behind the grip, open raised carry bridge and compact pointed fore-end.', interpretation: 'Graphite shell with jade fore-end panels and a small cinnabar marker. The carry bridge keeps it distinct from the SAR 21’s integrated scope housing.' },
  { id: 'cc-network', faction: 'collective-cops', name: 'Network', operator: 'Conductor', reference: 'QBZ-191 family', referenceUrl: 'https://eng.chinamil.com.cn/CHINA_209163/WeaponryEquipment/News_209182/15962288.html', silhouette: 'Conventional forward magazine, long flat upper rail, stepped telescoping stock and angular observation optic.', interpretation: 'Slate metal, graphite furniture and jade optic casing. The optic housing suggests the operator’s sensor role without granting detection mechanics.' },
];

export interface ProxyWeaponModel {
  root: THREE.Group;
  sockets: Readonly<Record<'grip' | 'foregrip' | 'magazine' | 'muzzle', THREE.Object3D>>;
  dispose(): void;
}
type Point = readonly [number, number];

export function buildProxyWeapon(id: ProxyWeaponId): ProxyWeaponModel {
  const study = PROXY_WEAPONS.find(candidate => candidate.id === id);
  if (!study) throw new Error('Unknown proxy weapon study.');
  const root = new THREE.Group(); root.name = id; root.userData.artStudy = true; root.userData.heat = 'none';
  const western = study.faction === 'freedom-force';
  const material = (name: string, color: string, roughness: number, metalness: number) => {
    const result = new THREE.MeshStandardMaterial({ color, roughness, metalness }); result.name = name; return result;
  };
  const metal = material('Study receiver', western ? '#b5a586' : '#52615f', .55, .45);
  const furniture = material('Study furniture', western ? '#d2c4a3' : '#2d3c3c', .84, .05);
  const dark = material('Study dark hardware', '#20292d', .62, .4);
  const trim = material('Study faction panels', western ? '#526f85' : '#75968a', .66, .22);
  const accent = material('Study identification', western ? '#e7bc68' : '#bf5547', .7, .1);
  const glass = material('Study opaque lens', '#1c414d', .14, .45);
  const materials = [metal, furniture, dark, trim, accent, glass];
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (geometry: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    const list = parts.get(m) ?? []; list.push(geometry); parts.set(m, list);
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m = metal, rx = 0, ry = 0, rz = 0) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry, rz);
  const cylinder = (r: number, length: number, x: number, y: number, z: number, m = dark) => add(new THREE.CylinderGeometry(r, r, length, 16), m, x, y, z, Math.PI / 2);
  const profile = (outline: readonly Point[], holes: readonly (readonly Point[])[] = []) => {
    const shape = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v))); shape.closePath();
    for (const hole of holes) { const path = new THREE.Path(hole.map(([u, v]) => new THREE.Vector2(u, v))); path.closePath(); shape.holes.push(path); }
    return shape;
  };
  // Stylized outside surfaces, authored in game units rather than fabrication dimensions.
  const side = (points: readonly Point[], width: number, m = metal, holes: readonly (readonly Point[])[] = []) => {
    const shape = profile(points.map(([z, y]) => [-z, y]), holes.map(hole => hole.map(([z, y]) => [-z, y])));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelSize: .0015, bevelThickness: .0015, bevelSegments: 1, steps: 1, curveSegments: 4 });
    geometry.translate(0, 0, -width / 2); add(geometry, m, 0, 0, 0, 0, Math.PI / 2);
  };
  const opening = (front: number, rear: number, bottom: number, top: number): Point[] => [[front, bottom], [rear, bottom], [rear, top], [front, top]];
  const vented = (front: number, rear: number, y: number, n: number, m = metal) => {
    const holes = Array.from({ length: n }, (_, index) => { const z = front + .025 + (rear - front - .05) * index / n; return opening(z, z + (rear - front - .05) / n * .65, y + .026, y + .051); });
    side([[front, y], [rear, y], [rear, y + .085], [front + .02, y + .085], [front, y + .065]], .063, m, holes);
  };
  const rail = (front: number, rear: number, y: number) => {
    box(.028, .04, rear - front, 0, y - .012, (front + rear) / 2, dark);
    box(.033, .014, rear - front, 0, y, (front + rear) / 2, dark);
    for (let z = front + .008; z < rear; z += .022) box(.045, .009, .009, 0, y + .01, z, dark);
  };
  const grip = (z: number) => {
    side([[z - .021, .025], [z + .02, .015], [z + .045, -.105], [z + .005, -.11]], .035, furniture);
    side([[z - .075, .025], [z - .075, -.035], [z + .005, -.04], [z + .012, .023]], .025, furniture, [opening(z - .062, z - .005, -.026, .014)]);
    box(.008, .026, .009, 0, -.004, z - .018, dark, -.25);
    for (const x of [-.021, .021]) box(.004, .012, .024, x, .018, z + .004, dark);
  };
  const magazine = (z: number, height: number, curve: number, breadth = 1) => {
    side([[z - .035 * breadth, .035], [z + .03 * breadth, .035], [z + .033 * breadth, -.025], [z + .022 * breadth - curve, -height], [z - .043 * breadth - curve, -height + .008], [z - .04 * breadth, -.02]], .031 * breadth, dark);
    for (const x of [-.017 * breadth, .017 * breadth]) for (let i = 0; i < 3; i++) box(.002, height * .65, .003, x, -height * .43, z + (-.022 + i * .019) * breadth - curve * .35, metal, Math.atan2(curve, height));
  };
  const muzzle = (front: number, start: number, y: number, shroud = false) => {
    cylinder(.012, start - front, 0, y, (front + start) / 2);
    const length = shroud ? .105 : .045, radius = shroud ? .025 : .019;
    const section = [[.008, 0], [radius, 0], [radius, length], [.008, length], [.008, 0]].map(([r, v]) => new THREE.Vector2(r, v - length / 2));
    add(new THREE.LatheGeometry(section, 20), dark, 0, y, front + length / 2, Math.PI / 2);
    for (let i = 0; i < (shroud ? 3 : 1); i++) cylinder(radius + .0015, .008, 0, y, front + .012 + i * .03, metal);
    return front;
  };
  const optic = (kind: 'reflex' | 'scope' | 'prism', z: number) => {
    box(.038, .035, .105, 0, .152, z, dark);
    if (kind === 'scope') {
      cylinder(.024, .26, 0, .22, z, dark); cylinder(.039, .07, 0, .22, z - .135, furniture); cylinder(.03, .035, 0, .22, z + .14, dark);
      cylinder(.033, .003, 0, .22, z - .172, glass); cylinder(.024, .003, 0, .22, z + .159, glass);
      for (const offset of [-.075, .07]) box(.06, .065, .018, 0, .188, z + offset, metal);
      box(.024, .025, .029, 0, .254, z, dark); box(.022, .023, .025, .03, .22, z, trim);
    } else {
      const w = kind === 'prism' ? .075 : .065, h = kind === 'prism' ? .075 : .065, depth = kind === 'prism' ? .12 : .05;
      const outline = opening(-w / 2, w / 2, .17, .17 + h), hole = opening(-w / 2 + .009, w / 2 - .009, .181, .16 + h);
      const geometry = new THREE.ExtrudeGeometry(profile(outline, [hole]), { depth, bevelEnabled: false, steps: 1 });
      add(geometry, kind === 'prism' ? trim : dark, 0, 0, z - depth / 2);
      box(w - .021, h - .024, .003, 0, .17 + h / 2, z - depth / 2 - .002, glass);
      box(.017, .025, .045, w / 2 + .006, .19, z, metal);
    }
  };
  let front = -.6, foreZ = -.28, magZ = -.105, gripZ = .025;
  if (id === 'ff-strider') {
    side([[-.18, .02], [.13, .02], [.14, .10], [.10, .13], [-.18, .13]], .065);
    vented(-.425, -.18, .035, 4); rail(-.42, .12, .14); grip(.025); magazine(-.105, .17, .024);
    side([[.13, .12], [.36, .10], [.38, .015], [.33, -.045], [.15, .015]], .04, furniture, [[[.17, .085], [.32, .078], [.33, .017], [.18, .039]]]);
    box(.055, .16, .025, 0, .025, .38, dark); box(.07, .06, .02, 0, .074, .137, dark);
    box(.005, .042, .125, -.035, .075, -.028, trim); box(.007, .009, .025, -.039, .075, -.025, accent);
    optic('reflex', -.07); front = muzzle(-.61, -.42, .083, true); foreZ = -.29;
  } else if (id === 'ff-scar-l' || id === 'ff-scar-h') {
    // Same visual family, independently authored receiver and magazine envelopes.
    const heavy = id === 'ff-scar-h', receiverFront = heavy ? -.23 : -.19, width = heavy ? .081 : .068;
    side([[receiverFront, .02], [.145, .02], [.15, .10], [.125, .137], [receiverFront + .015, .137], [receiverFront, .11]], width);
    const foreEnd = heavy ? -.47 : -.415;
    vented(foreEnd, receiverFront + .005, .034, heavy ? 5 : 4); rail(foreEnd - .006, .135, .148); grip(.025);
    magZ = heavy ? -.135 : -.105;
    magazine(magZ, heavy ? .128 : .165, heavy ? 0 : .026, heavy ? 1.35 : 1);
    // The H's wider box magazine is supported by a deeper, wider external well.
    box(heavy ? .064 : .048, heavy ? .048 : .025, heavy ? .115 : .084, 0, heavy ? .014 : .026, magZ, metal);
    side([[.15, .105], [.22, .102], [.25, .145], [.355, .145], [.395, .105], [.39, -.066], [.326, -.066], [.302, .015], [.16, .023]], .05, furniture,
      [[[.186, .043], [.285, .043], [.302, .075], [.235, .075]]]);
    box(.064, .027, .115, 0, .148, .302, furniture); box(.062, .163, .024, 0, .025, .40, dark);
    box(.073, .068, .016, 0, .079, .15, dark);
    for (const x of [-1, 1]) {
      box(.004, .027, .125, x * (width / 2 + .003), .075, -.035, trim);
      for (let mark = 0; mark < (heavy ? 2 : 1); mark++) box(.005, .008, .015, x * (width / 2 + .006), .075, -.055 + mark * .027, accent);
    }
    optic(heavy ? 'prism' : 'reflex', -.065);
    front = muzzle(heavy ? -.68 : -.575, foreEnd + .01, .083); foreZ = heavy ? -.32 : -.275;
  } else if (id === 'ff-longwatch') {
    side([[-.195, .035], [.15, .035], [.15, .135], [-.175, .135], [-.195, .11]], .076);
    vented(-.45, -.19, .033, 6); rail(-.46, .13, .148); grip(.025); magazine(-.105, .105, 0);
    side([[.15, .115], [.37, .12], [.405, .085], [.40, -.07], [.32, -.07], [.30, .035], [.15, .035]], .053, furniture);
    box(.065, .045, .145, 0, .133, .294, furniture); box(.058, .15, .027, 0, .018, .41, dark);
    for (const x of [-.025, .025]) box(.012, .014, .20, x, .007, -.39, dark);
    for (const x of [-.025, .025]) box(.018, .047, .02, x, .027, -.295, dark);
    for (const x of [-.04, .04]) box(.008, .025, .12, x, .087, -.06, trim);
    optic('scope', -.12); front = muzzle(-.75, -.43, .083); foreZ = -.32;
  } else if (id === 'cc-gatekeeper') {
    side([[-.28, .018], [.285, .018], [.30, .13], [.24, .17], [-.18, .155], [-.28, .09]], .075, furniture);
    side([[-.17, .145], [.21, .145], [.21, .253], [-.16, .253], [-.20, .21]], .038, dark, [[[ -.145, .17], [.17, .17], [.17, .224], [-.13, .224]]]);
    grip(-.055); magazine(.165, .18, .045); magZ = .165; gripZ = -.055;
    side([[-.32, .06], [-.22, .12], [-.08, .12], [-.09, .005], [-.25, -.008], [-.28, -.065], [-.31, -.045]], .064, trim);
    for (const x of [-.04, .04]) box(.004, .06, .17, x, .075, -.185, trim);
    box(.006, .055, .095, -.04, .07, .18, metal); box(.006, .012, .04, -.044, .105, .17, accent);
    box(.078, .135, .02, 0, .078, .30, dark);
    // A low sight block leaves the carry bridge, rather than a SAR-style scope tube, dominant.
    box(.042, .03, .09, 0, .27, -.04, metal); box(.027, .015, .003, 0, .27, -.087, glass);
    front = muzzle(-.50, -.29, .083); foreZ = -.23;
  } else {
    side([[-.255, .024], [.125, .024], [.14, .09], [.10, .125], [-.255, .125]], .068);
    vented(-.47, -.255, .034, 4, furniture); rail(-.47, .10, .14); grip(.015); magazine(-.12, .165, .025); magZ = -.12; gripZ = .015;
    side([[.13, .09], [.24, .09], [.27, .13], [.355, .13], [.37, -.06], [.305, -.06], [.29, .025], [.13, .025]], .046, furniture);
    box(.058, .045, .12, 0, .14, .30, trim); box(.06, .17, .024, 0, .028, .38, dark);
    for (const x of [-.035, .035]) box(.007, .032, .14, x, .072, -.05, trim);
    box(.008, .009, .032, -.041, .085, -.04, accent);
    optic('prism', -.075); front = muzzle(-.64, -.45, .083); foreZ = -.32;
  }
  for (const x of [-.041, .041]) {
    for (const z of [-.14, .075]) add(new THREE.CylinderGeometry(.005, .005, .004, 8), dark, x, .052, z, 0, 0, Math.PI / 2);
    if (id !== 'cc-gatekeeper') box(.003, .0025, .20, x, .043, -.025, dark);
  }
  // Small receiver features provide depth in oblique views without simulated internals.
  box(.008, .025, .09, .039, .084, id === 'cc-gatekeeper' ? .17 : .014, dark);
  box(.025, .012, .02, .046, .06, id === 'cc-gatekeeper' ? .12 : -.025, metal);
  const geometries: THREE.BufferGeometry[] = [];
  for (const [m, list] of parts) {
    const merged = mergeGeometries(list, false); list.forEach(geometry => geometry.dispose());
    if (!merged) throw new Error('Unable to merge proxy weapon geometry.');
    const mesh = new THREE.Mesh(merged, m); mesh.name = `${id}__${m.name}`; root.add(mesh); geometries.push(merged);
  }
  const socket = (name: string, x: number, y: number, z: number) => { const node = new THREE.Object3D(); node.name = `${id}__study_${name}`; node.position.set(x, y, z); root.add(node); return node; };
  const sockets = { grip: socket('grip', 0, 0, gripZ), foregrip: socket('foregrip', 0, .01, foreZ), magazine: socket('magazine', 0, .02, magZ), muzzle: socket('muzzle', 0, .083, front - .002) };
  let disposed = false;
  return { root, sockets, dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometries.forEach(geometry => geometry.dispose()); materials.forEach(m => m.dispose()); } };
}
