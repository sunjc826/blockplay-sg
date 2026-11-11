import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ANIMALS = [
  { id: 'javan-myna', name: 'Javan myna', scientific: 'Acridotheres javanicus', detail: 'Charcoal plumage, short crest, ivory iris, yellow bill and feet, small white folded-wing patch.', habitat: 'Urban lawns and estate edges; three ground-foraging birds per selected site.', source: 'https://www.nparks.gov.sg/publications-resources/articles/native-or-not' },
  { id: 'zebra-dove', name: 'Zebra dove', scientific: 'Geopelia striata', detail: 'Small, low-bodied brown dove with a long tapered tail, blue-grey face and barred neck and flanks.', habitat: 'Quiet open lawns; two birds per selected site.', source: 'https://www.nparks.gov.sg/publications-resources/articles/dove-vs-pigeon--what-s-the-difference' },
  { id: 'community-cat', name: 'Community cat', scientific: 'Felis catus', detail: 'Seated domestic shorthair tabby with triangular ears, pale muzzle, striped back and curved tail.', habitat: 'Sheltered residential margins; one resting cat, away from doors and foot traffic.', source: 'https://avs.nparks.gov.sg/community-animals/population-management/community-cats/' },
  { id: 'plantain-squirrel', name: 'Plantain squirrel', scientific: 'Callosciurus notatus', detail: 'Olive-brown body, rusty belly, paired dark and cream flank stripes, pale eye rings and large bushy tail.', habitat: 'Wooded ground beneath existing trees; one animal per selected pocket.', source: 'https://www.nparks.gov.sg/florafaunaweb/fauna/4/8/488' },
  { id: 'water-monitor', name: 'Malayan water monitor', scientific: 'Varanus salvator', detail: 'Low elongated body, angular snout, splayed clawed feet, pale spots and a long banded tapering tail.', habitat: 'Vegetated freshwater bank; a solitary basking animal.', source: 'https://biodiversitysg.nparks.gov.sg/our-biodiversity/reptiles/lizards/malayan-water-monitor/' },
  { id: 'smooth-coated-otter', name: 'Smooth-coated otter', scientific: 'Lutrogale perspicillata', detail: 'Sleek brown body, broad rounded head, small ears, pale throat, webbed feet and flattened tapering tail.', habitat: 'One small family swimming in a checked river pocket; not a universal waterfront decoration.', source: 'https://m.singapore.biodiversity.online/taxo4254/mainSpace/Lutrogale%20perspicillata.html' },
] as const;
export type AnimalKind = typeof ANIMALS[number]['id'];
export const animalSpec = (kind: AnimalKind) => ANIMALS.find(a => a.id === kind)!;

/** Original metre-scale geometry. +Z is the face; origin is the feet.
 * Parts are merged by material inside each joint, then templates share GPU
 * resources across copies. No downloaded textures, models or paid generation. */
export function createAnimalKit() {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Map<string, THREE.MeshStandardMaterial>();
  const templates = new Map<AnimalKind, THREE.Group>();
  const detailShapes: THREE.BufferGeometry[] = [];
  const sphere = new THREE.SphereGeometry(1, 8, 6), cube = new THREE.BoxGeometry(1, 1, 1), cone = new THREE.ConeGeometry(1, 1, 4);
  function material(color: string) {
    let m = materials.get(color);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: .94, flatShading: true }); m.name = color; materials.set(color, m); }
    return m;
  }
  function build(kind: AnimalKind) {
    const root = new THREE.Group(); root.name = animalSpec(kind).name; root.userData.animal = kind;
    const head = new THREE.Group(), tail = new THREE.Group(); head.name = 'Head'; tail.name = 'Tail'; root.add(head, tail);
    function part(parent: THREE.Group, name: string, color: string, p: number[], s: number[], shape: THREE.BufferGeometry = sphere, tilt = 0) {
      const mesh = new THREE.Mesh(shape, material(color)); mesh.name = name; mesh.position.fromArray(p); mesh.scale.fromArray(s); mesh.rotation.x = tilt; parent.add(mesh); return mesh;
    }
    const ell = (p: THREE.Group, c: string, xyz: number[], size: number[], tilt = 0) => part(p, 'Form', c, xyz, size, sphere, tilt);
    const box = (p: THREE.Group, c: string, xyz: number[], size: number[], tilt = 0) => part(p, 'Marking', c, xyz, size, cube, tilt);
    const band = (p: THREE.Group, c: string, xyz: number[], size: number[], start: number, tilt = 0) => {
      const shape = new THREE.SphereGeometry(1, 12, 2, 0, Math.PI * 2, start, .065); detailShapes.push(shape);
      part(p, 'Coat band', c, xyz, size, shape, tilt);
    };
    function eyes(width: number, y: number, z: number, radius: number, ring = '#151719') {
      for (const side of [-1, 1]) {
        ell(head, ring, [side * width, y, z], [radius * .48, radius, radius]);
        ell(head, '#111715', [side * (width + radius * .3), y, z + radius * .15], [radius * .25, radius * .65, radius * .65]);
      }
    }
    if (kind === 'javan-myna' || kind === 'zebra-dove') {
      const myna = kind === 'javan-myna', coat = myna ? '#30343a' : '#9a8871', wing = myna ? '#222830' : '#786c5e', feet = myna ? '#dba83d' : '#9b776f';
      ell(root, coat, [0, .12, 0], myna ? [.055, .073, .10] : [.05, .060, .105], -.38);
      for (const s of [-1, 1]) {
        ell(root, wing, [s * .046, .128, -.018], [.022, .051, .087], -.35);
        box(root, feet, [s * .025, .033, .025], [.009, .06, .009], -.15);
        for (const toe of [-1, 0, 1]) box(root, feet, [s * .025 + toe * .009, .004, .041], [.005, .008, .039]);
        if (myna) box(root, '#e7e6d6', [s * .063, .114, -.027], [.006, .014, .032], -.35);
      }
      if (!myna) for (let i = 0; i < 5; i++) band(root, '#55564f', [0,.12,0], [.051,.061,.106], .65+i*.25, -.38);
      head.position.set(0, myna ? .207 : .18, .062);
      ell(head, coat, [0, 0, 0], [myna ? .041 : .033, .041, .04]);
      ell(head, myna ? '#d5a62e' : '#69848a', [0, -.007, .047], [.018, .012, myna ? .036 : .024]);
      eyes(myna ? .034 : .029, .01, .016, .007, myna ? '#e6e4cf' : '#a9c9cc');
      if (myna) part(head, 'Short forehead crest', coat, [0, .042, .018], [.018, .022, .018], cone, -.4);
      else {
        ell(head, '#9aafb0', [0, -.012, .025], [.031, .025, .022]);
        for (let i = 0; i < 4; i++) band(head, '#51554f', [0,0,0], [.034,.042,.041], 1.55+i*.22);
      }
      tail.position.set(0, .11, -.075); ell(tail, wing, [0, -.014, -.055], [.026, .011, myna ? .068 : .082], -.16);
      if (!myna) for (const s of [-1, 1]) box(tail, '#d2ccba', [s * .02, -.021, -.10], [.008, .005, .025]);
    } else if (kind === 'community-cat') {
      const fur = '#9a8670', stripe = '#514d45';
      ell(root, fur, [0, .23, -.045], [.13, .23, .16], -.15);
      for (const s of [-1, 1]) {
        ell(root, fur, [s * .105, .085, -.045], [.075, .085, .10]);
        ell(root, fur, [s * .06, .14, .09], [.035, .14, .038]);
        ell(root, '#d3c9b4', [s * .06, .025, .12], [.038, .025, .065]);
      }
      head.position.set(0, .44, .07); ell(head, fur, [0, 0, 0], [.103, .095, .091]);
      for (const s of [-1, 1]) {
        part(head, 'Triangular ear', fur, [s * .068, .098, -.008], [.052, .12, .04], cone);
        part(head, 'Inner ear', '#be9992', [s * .068, .099, .013], [.027, .065, .007], cone);
        ell(head, '#ded5c0', [s * .027, -.028, .083], [.035, .028, .032]);
        ell(head, '#acc38c', [s * .064, .02, .065], [.024, .017, .016]);
        ell(head, '#182420', [s * .064, .02, .078], [.006, .013, .004]);
        for (let i = 0; i < 2; i++) box(head, stripe, [s * .087, -.005 - i * .023, .03], [.015, .009, .061]);
      }
      ell(head, '#715953', [0, -.018, .112], [.016, .012, .009]);
      for (let i = 0; i < 5; i++) band(root, stripe, [0,.23,-.045], [.131,.231,.161], .5+i*.36, -.15);
      tail.position.set(.1, .035, -.17);
      ell(tail, fur, [.025,0,-.025], [.04,.033,.07], -.1);
      ell(tail, fur, [.07, 0, -.08], [.035, .033, .13], -.1);
      ell(tail, fur, [.11, 0, -.005], [.035, .033, .08]);
      for (let i = 0; i < 3; i++) ell(tail, stripe, [.07, 0, -.13 + i * .045], [.036, .034, .012]);
    } else if (kind === 'plantain-squirrel') {
      const fur = '#73694f';
      ell(root, fur, [0, .105, 0], [.065, .09, .12]);
      ell(root, '#ba7542', [0, .10, .055], [.049, .065, .075]);
      for (const s of [-1, 1]) {
        box(root, '#312f28', [s * .062, .103, -.009], [.009, .017, .15]);
        box(root, '#ded6b0', [s * .063, .123, -.009], [.009, .014, .15]);
        ell(root, fur, [s * .05, .035, -.035], [.033, .035, .06]);
        ell(root, fur, [s * .038, .078, .091], [.015, .051, .022], -.6);
      }
      head.position.set(0, .18, .091); ell(head, fur, [0, 0, 0], [.05, .045, .054]);
      ell(head, fur, [0, -.015, .052], [.027, .021, .035]); ell(head, '#34322c', [0, -.014, .079], [.014, .01, .009]);
      for (const s of [-1, 1]) ell(head, fur, [s * .037, .039, -.018], [.021, .026, .012]);
      eyes(.044, .008, .023, .014, '#d9c8a4');
      tail.position.set(0, .07, -.095);
      ell(tail, fur, [0, .15, -.055], [.073, .20, .075], .12);
    } else if (kind === 'water-monitor') {
      const skin = '#484b3c', spots = '#b9ae7a';
      ell(root, skin, [0, .14, -.03], [.15, .105, .34]);
      ell(root, skin, [0, .18, .29], [.075, .065, .18], -.15);
      head.position.set(0, .22, .43); ell(head, skin, [0, 0, .028], [.069, .047, .12]);
      ell(head, '#a69d77', [0, -.028, .056], [.059, .018, .085]); eyes(.061, .021, .014, .012, '#b7a971');
      for (const side of [-1, 1]) for (const end of [-1, 1]) {
        ell(root, skin, [side * .16, .094, end * .20], [.13, .045, .06]);
        ell(root, skin, [side * .23, .055, end * .24], [.043, .049, .075]);
        for (let toe = 0; toe < 4; toe++) ell(root, '#9a967e', [side * (.20 + toe * .025), .012, end * .29], [.012, .012, .055]);
      }
      for (let i = 0; i < 7; i++) for (const s of [-1, 1]) ell(root, spots, [s * .105, .215, -.25 + i * .075], [.021, .008, .016]);
      tail.position.set(0, .10, -.32);
      for (let i = 0; i < 7; i++) {
        const r = .072 * (1 - i / 8); ell(tail, skin, [Math.sin(i * .3) * .10, -.009 * i, -.055 - i * .105], [r, r * .65, .09]);
        ell(tail, spots, [Math.sin(i * .3) * .10, -.009 * i, -.09 - i * .105], [r * 1.01, r * .66, .013]);
      }
    } else {
      const fur = '#655343';
      ell(root, fur, [0, .18, -.04], [.145, .135, .31]);
      for (const s of [-1, 1]) for (const z of [-.23, .16]) {
        ell(root, fur, [s * .115, .085, z], [.06, .075, .09]);
        ell(root, '#493f35', [s * .14, .022, z + .035], [.065, .022, .071]);
      }
      head.position.set(0, .27, .26); ell(head, fur, [0, 0, 0], [.124, .097, .115]);
      ell(head, '#c6baa0', [0, -.047, .05], [.105, .049, .08]);
      for (const s of [-1, 1]) {
        ell(head, fur, [s * .101, .062, -.03], [.029, .032, .021]);
        ell(head, '#b9ae96', [s * .036, -.011, .099], [.045, .031, .035]);
      }
      eyes(.09, .025, .066, .012); ell(head, '#262924', [0, .002, .128], [.03, .021, .015]);
      tail.position.set(0, .13, -.29);
      ell(tail, fur, [0, -.025, -.14], [.09, .037, .21]); ell(tail, fur, [0, -.055, -.33], [.04, .022, .10]);
    }
    // Preserve joints, merge only direct mesh children. Picking still anchors to
    // stable material surfaces; resources belong to this kit, not individual copies.
    for (const group of [root, head, tail]) {
      const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
      for (const child of [...group.children]) if (child instanceof THREE.Mesh) {
        child.updateMatrix(); const g = child.geometry.clone().applyMatrix4(child.matrix);
        const m = child.material as THREE.Material; const list = buckets.get(m) ?? []; list.push(g); buckets.set(m, list); group.remove(child);
      }
      for (const [m, parts] of buckets) {
        const geometry = mergeGeometries(parts); parts.forEach(g => g.dispose());
        if (!geometry) throw new Error('Animal geometry merge failed'); geometries.add(geometry);
        const mesh = new THREE.Mesh(geometry, m); mesh.name = `${group.name} · ${m.name}`; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
      }
    }
    root.scale.setScalar(kind === 'javan-myna' ? .75 : kind === 'zebra-dove' ? .64 : kind === 'community-cat' ? .8 : 1);
    return root;
  }
  return {
    create(kind: AnimalKind) { let template = templates.get(kind); if (!template) { template = build(kind); templates.set(kind, template); } return template.clone(true); },
    dispose() { geometries.forEach(g => g.dispose()); detailShapes.forEach(g=>g.dispose()); materials.forEach(m => m.dispose()); sphere.dispose(); cube.dispose(); cone.dispose(); },
  };
}

/** Absolute-time, bounded idle poses: no accumulated drift or per-frame allocation. */
export function animateAnimal(root: THREE.Object3D, kind: AnimalKind, time: number) {
  const head = root.getObjectByName('Head')!, tail = root.getObjectByName('Tail')!;
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  const bird = kind === 'javan-myna' || kind === 'zebra-dove';
  head.rotation.y = Math.sin(t * .75) * (bird ? .18 : .10);
  head.rotation.x = bird ? Math.max(0, Math.sin(t * 1.5)) ** 8 * .38 : Math.sin(t * 1.3) * .035;
  tail.rotation.y = Math.sin(t * (kind === 'smooth-coated-otter' ? 2 : .9)) * .08;
}
