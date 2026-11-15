import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeStaticParts } from './weapon-part-merge';
import { buildMachineGun } from './machine-gun-models';
import { buildProxyWeapon } from './proxy-weapon-models';
import { buildEnemyWeapon } from './enemy-weapon-models';

type Pt = readonly [number, number];
/** Authored low-poly silhouettes, not dimensional replicas. Local -Z is forward. */
export function buildServiceWeapon(id: string): THREE.Group | undefined {
  if (id === 'ff-oicw-launcher') return buildProxyWeapon('ff-oicw', true, 'launcher').root;
  if (id === 'cc-qts11-launcher') return buildProxyWeapon('cc-qts11', true, 'launcher').root;
  if (id === 'ff-scar-l' || id === 'ff-scar-h' || id === 'ff-longwatch' || id === 'ff-oicw' || id === 'ff-intervention' || id === 'cc-gatekeeper' || id === 'cc-network' || id === 'cc-qts11') return buildProxyWeapon(id, true).root;
  if (id === 'mag-inspired' || id === 'cis50-inspired') return buildMachineGun(id);
  const enemy = buildEnemyWeapon(id); if (enemy) return enemy;
  if (id !== 'p30-inspired') return undefined;
  const root = new THREE.Group(); root.name = id;
  // Material names matter: armory-visuals paints skins onto "Polymer".
  const steel = new THREE.MeshStandardMaterial({ color: '#343d41', roughness: .48, metalness: .65 });
  const polymer = new THREE.MeshStandardMaterial({ color: '#394334', roughness: .85 });
  const dark = new THREE.MeshStandardMaterial({ color: '#141a1c', roughness: .75 });
  const texture = new THREE.MeshStandardMaterial({ color: '#232a21', roughness: .96 });
  const dot = new THREE.MeshStandardMaterial({ color: '#e9ece4', roughness: .6, emissive: '#e9ece4', emissiveIntensity: .35 });
  steel.name = 'Metal anodised'; polymer.name = 'Polymer'; dark.name = 'Dark metal'; texture.name = 'Grip texture'; dot.name = 'Sight dot';
  const mesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root) => {
    const part = new THREE.Mesh(geometry, material); part.name = `${id}__${name}`; part.position.set(x, y, z); parent.add(part); return part;
  };
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material = steel, parent: THREE.Object3D = root) =>
    mesh(name, new RoundedBoxGeometry(w, h, d, 1, Math.min(.0015, w / 5, h / 5, d / 5)), material, x, y, z, parent);
  /**
   * A side profile, given as [z, y] points, extruded across the gun with rounded edges that
   * stand half of `round` outside the points. A hole is a real opening. (A negative
   * bevelOffset would hold the outline to the points, but ExtrudeGeometry then caps over holes.)
   */
  const side = (name: string, points: readonly Pt[], width: number, material: THREE.Material, hole?: readonly Pt[], round = Math.min(.004, width / 6)) => {
    const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y))); shape.closePath();
    if (hole) { const path = new THREE.Path(hole.map(([z, y]) => new THREE.Vector2(z, y))); path.closePath(); shape.holes.push(path); }
    const depth = width - round * 2;
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: round * .5, bevelThickness: round, bevelSegments: 2, steps: 1 });
    geometry.rotateY(-Math.PI / 2); geometry.translate(depth / 2, 0, 0);
    // Extrusions are mapped in metres; a skin's pattern is drawn for a part-sized square.
    const uv = geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 5);
    return mesh(name, geometry, material, 0, 0, 0);
  };
  const socket = (name: string, x: number, y: number, z: number) => {
    const node = new THREE.Object3D(); node.name = `${id}__socket_${name}`; node.position.set(x, y, z); root.add(node);
  };
  // The slide, its serrations and both sights travel together when it is racked;
  // the hand clasps the slide by its bounds, so its width and top stay where they are.
  const section = new THREE.Shape([[-.0235, -.0225], [.0235, -.0225], [.0235, -.011], [.0231, -.0105], [.0231, .012], [.0165, .0225], [-.0165, .0225], [-.0231, .012], [-.0231, -.0105], [-.0235, -.011]].map(([x, y]) => new THREE.Vector2(x, y)));
  const slideGeometry = new THREE.ExtrudeGeometry(section, { depth: .205, bevelEnabled: false, steps: 1 }); slideGeometry.translate(0, 0, -.1025);
  const slide = mesh('slide', slideGeometry, steel, 0, .202, -.015);
  box('ejection-port', .0006, .0105, .034, .0232, .0062, .012, dark, slide);
  box('extractor', .0005, .004, .016, .02325, .002, .039, dark, slide);
  for (let i = 0; i < 6; i++) box('slide-serration', .0472, .02, .002, 0, .201, .042 + i * .006, dark);
  for (let i = 0; i < 4; i++) box('slide-serration', .0472, .02, .002, 0, .201, -.086 - i * .006, dark);
  box('rear-sight', .04, .005, .018, 0, .227, .07, dark);
  for (const x of [-.015, .015]) {
    const post = box('rear-sight', .008, .012, .016, x, .231, .07, dark);
    mesh('sight-dot', new THREE.CircleGeometry(.0018, 10), dot, 0, .002, .0081, post);
  }
  box('front-sight', .012, .004, .02, 0, .2265, -.095, dark);
  mesh('sight-dot', new THREE.CircleGeometry(.0018, 10), dot, 0, .002, .0061, box('front-sight', .006, .012, .012, 0, .231, -.095, dark));
  // Annular muzzle with a recessed bore, standing just proud of the slide's face.
  const muzzle = mesh('muzzle', new THREE.LatheGeometry([[.0055, -.007], [.011, -.007], [.012, -.006], [.012, .007], [.0055, .007], [.0055, -.007]].map(([r, v]) => new THREE.Vector2(r, v)), 20), steel, 0, .197, -.1225);
  muzzle.rotation.x = Math.PI / 2;
  mesh('bore', new THREE.CircleGeometry(.0055, 16), dark, 0, .197, -.119).rotation.y = Math.PI;

  // One outline for frame, dust cover, beavertail and raked grip, with finger
  // scallops down the front strap and a palm swell behind.
  const strap = (y: number) => .030 + (.153 - y) * .193;
  side('frame', [[-.098, .1795], [.097, .1795], [.102, .176], [.1015, .169], [.096, .158], [.097, .146], [.1035, .122], [.1085, .098], [.113, .068], [.1125, .0635],
    [.0505, .0515], [strap(.058), .058], [strap(.066) + .0025, .066], [strap(.075), .075], [strap(.084) + .0025, .084], [strap(.093), .093], [strap(.101) + .0025, .101], [strap(.110), .110],
    [.031, .1545], [-.094, .1545], [-.098, .1585]], .044, polymer);
  side('grip-panel', [[.052, .068], [.104, .078], [.093, .137], [.040, .131]], .0452, texture);
  side('trigger-guard', [[-.030, .156], [-.032, .150], [-.030, .128], [-.024, .117], [-.014, .112], [.030, .110], [.040, .113], [.040, .156]], .02, polymer,
    [[-.024, .152], [-.023, .130], [-.018, .121], [-.010, .118], [.028, .117], [.034, .120], [.030, .152]]);
  side('trigger', [[.012, .153], [.019, .153], [.0175, .140], [.0135, .128], [.0105, .124], [.0125, .136], [.0115, .146]], .009, dark, undefined, .001);
  side('hammer', [[.088, .195], [.094, .196], [.101, .212], [.0985, .2165], [.094, .213], [.089, .208]], .016, dark, undefined, .0015);
  box('slide-release', .0465, .005, .03, 0, .1735, .045, dark);
  box('takedown-lever', .0465, .006, .01, 0, .171, -.01, dark);
  box('magazine-release', .026, .005, .012, 0, .121, .034, dark);
  for (const z of [-.05, -.065, -.08]) box('rail-slot', .0455, .004, .005, 0, .1575, z, dark);
  // Base plate and a steel body hidden up the grip, on the grip's rake, so what leaves the well is a whole magazine.
  const magazine = mesh('magazine', new RoundedBoxGeometry(.041, .012, .057, 2, .003), dark, 0, .05, .077); magazine.rotation.x = -.19;
  mesh('magazine-body', new THREE.BoxGeometry(.03, .104, .044), steel, 0, .058, 0, magazine);
  mergeStaticParts(root);
  socket('muzzle', 0, .197, -.13); socket('eject', .03, .214, -.007);
  return root;
}
