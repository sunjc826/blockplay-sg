import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type ProxyWeaponId = 'ff-oicw' | 'ff-scar-l' | 'ff-scar-h' | 'ff-longwatch' | 'ff-intervention' | 'cc-gatekeeper' | 'cc-network' | 'cc-qts11';
export interface ProxyWeaponStudy {
  id: ProxyWeaponId; faction: 'freedom-force' | 'collective-cops'; name: string; operator: string;
  /** Family and signature labels shared by the gallery and cargo rewards. */
  familyLabel?: string; variantLabel?: string;
  reference: string; referenceUrl: string; silhouette: string; interpretation: string;
}
/** Design-gallery metadata. All five Freedom Force weapons have live cargo variants. */
export const PROXY_WEAPONS: readonly ProxyWeaponStudy[] = [
  { id: 'ff-oicw', faction: 'freedom-force', name: 'Peace Offering · Escalation Clause', familyLabel: 'Peace Offering', variantLabel: 'Escalation Clause', operator: 'Lancer · experimental option', reference: 'XM29 OICW · Block 3', referenceUrl: 'https://commons.wikimedia.org/wiki/File:XM29_Block3.jpg', silhouette: 'Stacked rifle and launcher muzzles, a bulky integrated upper body, a large sight housing and separate forward/rear feed silhouettes.', interpretation: 'Peace Offering is the family label; Escalation Clause is its signature variant. An original exterior interpretation of the XM29 OICW reference, in Freedom Force sand, bone and steel blue. The cargo version has a Mythic rifle and a separately fed impact launcher, selected with U or the mode button. The gallery shows its exterior.' },
  { id: 'ff-scar-l', faction: 'freedom-force', name: 'Soft Power · Foreign Aid', familyLabel: 'Soft Power', variantLabel: 'Foreign Aid', operator: 'Lancer · option', reference: 'FN SCAR-L', referenceUrl: 'https://fnherstal.com/en/defence/portable-weapons/fn-scar-l-mk2/', silhouette: 'Compact SCAR-family upper, curved narrow magazine, folding-style cheek-rest stock and a small reflex sight.', interpretation: 'Soft Power is the family label; Foreign Aid is its signature variant. Sand and bone furniture, a single amber marker and an open lower stock notch identify the smaller member of the pair.' },
  { id: 'ff-scar-h', faction: 'freedom-force', name: 'Hard Power · Strings Attached', familyLabel: 'Hard Power', variantLabel: 'Strings Attached', operator: 'Wayfinder · option', reference: 'FN SCAR-H', referenceUrl: 'https://fnherstal.com/en/defence/portable-weapons/fn-scar-h-mk2/', silhouette: 'Broader and longer SCAR-family receiver, deeper magazine well, wider straight magazine and a compact prism optic.', interpretation: 'Hard Power is the family label; Strings Attached is its signature variant. Twin amber markers and the same folding-style stock connect it to Soft Power. Smart Power remains the separate precision study with its long scope and bipod.' },
  { id: 'ff-longwatch', faction: 'freedom-force', name: 'Smart Power · Targeted Assistance', familyLabel: 'Smart Power', variantLabel: 'Targeted Assistance', operator: 'Wayfinder', reference: 'FN Mk 20 / SCAR 20S', referenceUrl: 'https://fnamerica.com/press-releases/fn-announces-release-fn-scar-20s-precision-rifle/', silhouette: 'Long monolithic upper, adjustable precision stock, short box magazine, large scope and folded bipod.', interpretation: 'Smart Power is the family label; Targeted Assistance is its signature variant. A heavier, angular precision silhouette in bone and sand, with restrained blue hardware. Scope and bipod are static art.' },
  { id: 'ff-intervention', faction: 'freedom-force', name: 'M200 Intervention', operator: 'Wayfinder · precision option', reference: 'CheyTac M200 Intervention', referenceUrl: 'https://cheytac.com/precision-firearms/m200-intervention-sniper-rifle/', silhouette: 'Long exposed barrel, round fore-end, open under-barrel carry handle, twin stock rods, large scope, bipod and rear monopod.', interpretation: 'An original M200-inspired exterior in Freedom Force sand, bone and steel blue. The exposed barrel, tubular fore-end and open stock distinguish it from Smart Power in grayscale. The Mythic cargo version uses a manual bolt cycle, a variable 3–12× scope and separate .408 magazines. The display name retains the reference name.' },
  { id: 'cc-gatekeeper', faction: 'collective-cops', name: 'Strong Objection No. 496 · Final Warning No. 497', familyLabel: 'Strong Objection No. 496', variantLabel: 'Final Warning No. 497', operator: 'Bastion', reference: 'QBZ-95 family', referenceUrl: 'https://date.army.gov.au/equipment/qbz-95', silhouette: 'Bullpup action and curved magazine behind the grip, open raised carry bridge and compact pointed fore-end.', interpretation: 'Strong Objection No. 496 is the family label; Final Warning No. 497 is its signature variant. Graphite, jade and cinnabar frame the numbered-notice joke. The open carry bridge distinguishes the silhouette from the SAR 21’s integrated scope housing.' },
  { id: 'cc-network', faction: 'collective-cops', name: 'Consensus Builder · Unanimous Vote', familyLabel: 'Consensus Builder', variantLabel: 'Unanimous Vote', operator: 'Conductor', reference: 'QBZ-191 family', referenceUrl: 'https://eng.chinamil.com.cn/CHINA_209163/WeaponryEquipment/News_209182/15962288.html', silhouette: 'Conventional forward magazine, long flat upper rail, stepped telescoping stock and angular observation optic.', interpretation: 'Consensus Builder is the family label; Unanimous Vote is its signature variant. Slate metal, graphite furniture and a jade observation-optic casing suit Conductor’s coordination role.' },
  { id: 'cc-qts11', faction: 'collective-cops', name: 'QTS-11 study', operator: 'Conductor · experimental option', reference: 'QTS-11 integrated combat system', referenceUrl: 'https://news.cctv.com/2018/05/17/ARTImlq4JrQyBg9bmY4Lh44O180517.shtml', silhouette: 'Two projecting barrels, a slim upper launcher shell, open triangular stock and an offset sensor housing beside the sight.', interpretation: 'Collective Corps’ counterpart to the XM29 study, in slate, graphite and jade with cinnabar identification. The open stock, slimmer body and offset sight equipment distinguish it in grayscale. Exterior art only; no launcher, targeting or airburst behavior is attached.' },
];

export interface ProxyWeaponModel {
  root: THREE.Group;
  sockets: Readonly<Record<'grip' | 'foregrip' | 'magazine' | 'muzzle', THREE.Object3D> & { launcherMuzzle?: THREE.Object3D; launcherMagazine?: THREE.Object3D }>;
  dispose(): void;
}
type Point = readonly [number, number];

export function buildProxyWeapon(id: ProxyWeaponId, playable = false, mode: 'rifle' | 'launcher' = 'rifle'): ProxyWeaponModel {
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
  const magazineParts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const animatingLauncher = playable && id === 'ff-oicw' && mode === 'launcher';
  let drawingMagazine = false;
  const add = (geometry: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    const target = playable && drawingMagazine ? magazineParts : parts;
    const list = target.get(m) ?? []; list.push(geometry); target.set(m, list);
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
    drawingMagazine = !animatingLauncher;
    side([[z - .035 * breadth, .035], [z + .03 * breadth, .035], [z + .033 * breadth, -.025], [z + .022 * breadth - curve, -height], [z - .043 * breadth - curve, -height + .008], [z - .04 * breadth, -.02]], .031 * breadth, dark);
    for (const x of [-.017 * breadth, .017 * breadth]) for (let i = 0; i < 3; i++) box(.002, height * .65, .003, x, -height * .43, z + (-.022 + i * .019) * breadth - curve * .35, metal, Math.atan2(curve, height));
    drawingMagazine = false;
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
      if (id === 'ff-longwatch' || id === 'ff-intervention') {
        // Continuous outer AND inner walls: the old disconnected open rings
        // exposed the scenery through the objective and eyepiece shoulders.
        const outside = [[.039, -.17], [.039, -.135], [.024, -.10], [.024, .10], [.030, .125], [.030, .166]];
        const inside = [[.0195, .166], [.0195, .125], [.019, .10], [.019, -.10], [.034, -.135], [.034, -.17], [.039, -.17]];
        add(new THREE.LatheGeometry([...outside, ...inside].map(([r, v]) => new THREE.Vector2(r, v)), 40), dark, 0, .22, z, Math.PI / 2);
        const collar = (outer: number, inner: number, length: number, at: number, m = dark) => {
          const h = length / 2;
          add(new THREE.LatheGeometry([[inner, -h], [outer, -h], [outer, h], [inner, h], [inner, -h]].map(([r, v]) => new THREE.Vector2(r, v)), 40), m, 0, .22, z + at, Math.PI / 2);
        };
        collar(.041, .039, .014, -.158, furniture);
        collar(.032, .030, .022, .133);
        collar(.032, .0195, .006, .165);
        for (let i = 0; i < 24; i++) {
          const angle = i * Math.PI / 12;
          box(.0025, .0025, .019, Math.sin(angle) * .032, .22 + Math.cos(angle) * .032, z + .133, dark, 0, 0, -angle);
        }
        // Recess the objective inside its rim; the live image is at the rear.
        cylinder(.034, .003, 0, .22, z - .161, glass);
        if (!playable) cylinder(.019, .003, 0, .22, z + .156, glass);
      } else if (playable) {
        for (const [radius, length, at, m] of [[.024, .26, z, dark], [.039, .07, z - .135, furniture], [.03, .035, z + .14, dark]] as const) {
          const wall = [new THREE.Vector2(radius - .005, -length / 2), new THREE.Vector2(radius, -length / 2), new THREE.Vector2(radius, length / 2), new THREE.Vector2(radius - .005, length / 2)];
          add(new THREE.LatheGeometry(wall, 20), m, 0, .22, at, Math.PI / 2);
        }
      } else {
        cylinder(.024, .26, 0, .22, z, dark); cylinder(.039, .07, 0, .22, z - .135, furniture); cylinder(.03, .035, 0, .22, z + .14, dark);
        cylinder(.033, .003, 0, .22, z - .172, glass); cylinder(.024, .003, 0, .22, z + .159, glass);
      }
      for (const offset of [-.075, .07]) {
        if (playable) {
          const ring = [new THREE.Vector2(.024, -.009), new THREE.Vector2(.03, -.009), new THREE.Vector2(.03, .009), new THREE.Vector2(.024, .009), new THREE.Vector2(.024, -.009)];
          add(new THREE.LatheGeometry(ring, 20), metal, 0, .22, z + offset, Math.PI / 2);
          box(.04, .03, .018, 0, .168, z + offset, metal);
        } else box(.06, .065, .018, 0, .188, z + offset, metal);
      }
      box(.024, .025, .029, 0, .254, z, dark); box(.022, .023, .025, .03, .22, z, trim);
    } else {
      const w = kind === 'prism' ? .075 : .065, h = kind === 'prism' ? .075 : .065, depth = kind === 'prism' ? .12 : .05;
      const outline = opening(-w / 2, w / 2, .17, .17 + h), hole = opening(-w / 2 + .009, w / 2 - .009, .181, .16 + h);
      const geometry = new THREE.ExtrudeGeometry(profile(outline, [hole]), { depth, bevelEnabled: false, steps: 1 });
      add(geometry, kind === 'prism' ? trim : dark, 0, 0, z - depth / 2);
      if (!playable) box(w - .021, h - .024, .003, 0, .17 + h / 2, z - depth / 2 - .002, glass);
      box(.017, .025, .045, w / 2 + .006, .19, z, metal);
    }
  };
  let front = -.6, foreZ = -.28, magZ = -.105, gripZ = .025, muzzleY = .083;
  let launcherFront: number | undefined, launcherMagZ: number | undefined;
  const launcherY = .175;
  if (id === 'ff-oicw') {
    launcherMagZ = .25;
    // OICW exterior: upper bullpup launcher body over a conventional rifle.
    // These are visual shells and art sockets, not simulated weapon internals.
    side([[-.34, .105], [-.18, .07], [.19, .07], [.22, .015], [.37, .015], [.39, .055], [.38, .25], [-.28, .25], [-.34, .19]], .105, furniture);
    side([[-.32, .015], [.095, .015], [.115, .083], [-.275, .12], [-.32, .09]], .065, metal);
    grip(.025); magazine(-.13, .17, .024); magZ = -.13;
    // The upper assembly's rear feed is a separate, broad rectangular exterior box.
    drawingMagazine = animatingLauncher;
    box(.057, .19, .11, 0, .009, launcherMagZ, dark);
    box(.063, .014, .12, 0, -.087, launcherMagZ, metal);
    for (const x of [-.031, .031]) for (const z of [.224, .263]) box(.003, .12, .005, x, .004, z, metal);
    drawingMagazine = false;
    box(.112, .26, .027, 0, .13, .398, dark);
    // Projecting rifle fore-end and palm ledge below the upper launcher's barrel.
    side([[-.435, .005], [-.205, .005], [-.20, .087], [-.40, .087], [-.44, .047]], .073, metal,
      [opening(-.397, -.367, .028, .053), opening(-.347, -.317, .028, .053), opening(-.297, -.267, .028, .053)]);
    box(.068, .024, .12, 0, -.004, -.31, dark);
    // Two visibly different bore heights, with the smaller rifle projecting farther.
    muzzleY = .055; front = muzzle(-.60, -.415, muzzleY); foreZ = -.30;
    launcherFront = -.455;
    // The tube starts behind the rim, avoiding overlapping front/bore surfaces.
    const bore = [[.025, 0], [.039, 0], [.039, .131], [.025, .131], [.025, 0]].map(([r, y]) => new THREE.Vector2(r, y - .0655));
    add(new THREE.LatheGeometry(bore, 24), dark, 0, launcherY, launcherFront + .0795, Math.PI / 2);
    const rim = [[.025, 0], [.043, 0], [.043, .014], [.025, .014], [.025, 0]].map(([r, y]) => new THREE.Vector2(r, y - .007));
    add(new THREE.LatheGeometry(rim, 24), metal, 0, launcherY, launcherFront + .007, Math.PI / 2);
    // Supported, chamfered fire-control housing with distinct front/eyepiece lenses.
    box(.07, .032, .31, 0, .258, -.045, dark);
    if (playable) {
      // Open sight tunnel: no opaque front/rear wall across the aiming ray.
      for (const x of [-.0465, .0465]) box(.01, .083, .365, x, .3135, -.0875, dark);
      for (const y of [.277, .35]) box(.093, .01, .365, 0, y, -.0875, dark);
    } else {
      side([[-.27, .272], [.095, .272], [.095, .335], [.065, .355], [-.22, .355], [-.27, .325]], .103, dark);
      box(.073, .036, .004, 0, .302, -.274, glass);
    }
    box(.085, .018, .006, 0, .343, -.24, trim, -.35);
    if (!playable) box(.066, .042, .005, 0, .307, .099, glass);
    // Side covers and vents stay external; all details merge by material.
    for (const x of [-.055, .055]) {
      box(.005, .06, .19, x, .164, .065, trim);
      box(.007, .009, .032, x, .164, .07, accent);
      for (let i = 0; i < 3; i++) box(.004, .012, .029, x, .211, -.19 + i * .05, dark);
    }
  } else if (id === 'cc-qts11') {
    // Original QTS-11-inspired outside silhouette, kept leaner than the XM29.
    side([[-.30, .025], [.14, .025], [.14, .125], [-.27, .125]], .071);
    side([[-.30, .12], [.13, .12], [.14, .20], [.09, .225], [-.27, .225], [-.30, .205]], .079, furniture);
    vented(-.455, -.285, .022, 3, furniture);
    grip(.02); gripZ = .02; magazine(-.125, .17, .03); magZ = -.125;
    // Skeletal stock is real negative space, not a second launcher-feed box.
    side([[.135, .105], [.34, .14], [.385, .105], [.38, -.055], [.31, -.055], [.27, .014], [.135, .025]], .043, furniture,
      [[[.173, .052], [.29, .04], [.34, .075], [.326, .107], [.174, .082]]]);
    box(.057, .17, .025, 0, .032, .39, dark);
    box(.052, .024, .115, 0, .13, .30, metal);
    muzzleY = .06; front = muzzle(-.69, -.44, muzzleY); foreZ = -.34;
    launcherFront = -.565;
    // One stepped hollow shell avoids coplanar barrel/rim surfaces.
    const tube = [[.022, 0], [.033, 0], [.033, .016], [.029, .016], [.029, .282], [.022, .282], [.022, 0]].map(([r, y]) => new THREE.Vector2(r, y - .141));
    add(new THREE.LatheGeometry(tube, 20), metal, 0, launcherY, launcherFront + .141, Math.PI / 2);
    // Supported optic and offset sensor pod: deliberately asymmetric in front view.
    box(.05, .028, .20, 0, .238, -.055, dark);
    side([[-.20, .25], [.09, .25], [.09, .31], [.06, .329], [-.18, .329], [-.20, .306]], .066, dark);
    box(.049, .045, .004, 0, .286, -.204, glass);
    box(.045, .038, .004, 0, .284, .094, glass);
    box(.05, .06, .17, -.055, .255, -.13, trim);
    box(.035, .04, .004, -.055, .255, -.217, glass);
    for (const x of [-.043, .043]) {
      box(.005, .032, .12, x, .176, .025, trim);
      box(.007, .009, .026, x, .177, .025, accent);
    }
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
  } else if (id === 'ff-intervention') {
    // M200 exterior study: long exposed barrel, round fore-end and open chassis.
    cylinder(.043, .33, 0, .083, -.015, metal);
    side([[-.18, .015], [.15, .015], [.17, .082], [.13, .12], [-.16, .12]], .069, metal);
    grip(.05); gripZ = .05; magazine(-.09, .115, 0, 1.12); magZ = -.09;
    cylinder(.048, .31, 0, .083, -.335, furniture);
    cylinder(.052, .022, 0, .083, -.195, dark);
    cylinder(.052, .023, 0, .083, -.40, metal);
    // Open carry handle is below the fore-end, separate from the trigger guard.
    side([[-.425, .045], [-.40, -.10], [-.17, -.10], [-.15, .035]], .029, metal,
      [[[-.39, .015], [-.37, -.068], [-.20, -.068], [-.18, .015]]]);
    box(.034, .021, .15, 0, -.105, -.285, dark);
    // Collapsing-style twin rods leave daylight below the cheek rest.
    for (const x of [-.024, .024]) cylinder(.007, .29, x, .056, .285, dark);
    box(.058, .027, .16, 0, .128, .345, furniture);
    side([[.275, .055], [.30, .055], [.30, .137], [.275, .137]], .045, furniture);
    side([[.405, .145], [.465, .145], [.475, -.055], [.425, -.055], [.405, -.01]], .052, furniture);
    box(.061, .20, .021, 0, .044, .48, dark);
    // Rear monopod and splayed bipod are static display equipment.
    box(.017, .10, .018, 0, -.10, .435, dark);
    box(.04, .012, .035, 0, -.153, .435, metal);
    for (const sign of playable ? [] : [-1, 1]) {
      box(.018, .18, .024, sign * .067, -.047, -.40, dark, 0, 0, sign * .47);
      box(.041, .018, .044, sign * .109, -.13, -.40, furniture);
      box(.02, .045, .037, sign * .026, .039, -.40, metal);
    }
    // A longer, thicker exposed barrel and banded muzzle device, all exterior.
    cylinder(.018, .42, 0, .083, -.69, dark);
    for (const x of [-.014, .014]) box(.003, .009, .26, x, .091, -.70, metal);
    const brake = [[.009, 0], [.031, 0], [.031, .075], [.018, .075], [.018, .08], [.009, .08], [.009, 0]].map(([r, y]) => new THREE.Vector2(r, y - .04));
    add(new THREE.LatheGeometry(brake, 20), dark, 0, .083, -.935, Math.PI / 2);
    for (const x of [-.031, .031]) for (const z of [-.957, -.937, -.917]) box(.003, .02, .009, x, .083, z, trim);
    front = -.975; foreZ = -.29;
    rail(-.17, .15, .148); optic('scope', -.045);
    // Visible bolt-handle cue, with no moving bolt or internal mechanism.
    if (!playable) {
      box(.045, .013, .016, .053, .09, .105, dark);
      add(new THREE.SphereGeometry(.014, 10, 6), dark, .08, .077, .105);
    }
    for (const x of [-.041, .041]) {
      box(.005, .027, .09, x, .074, .018, trim);
      box(.007, .009, .026, x, .074, .018, accent);
    }
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
  if (animatingLauncher) magZ = .25;
  const geometries: THREE.BufferGeometry[] = [];
  for (const [m, list] of parts) {
    const merged = mergeGeometries(list, false); list.forEach(geometry => geometry.dispose());
    if (!merged) throw new Error('Unable to merge proxy weapon geometry.');
    const mesh = new THREE.Mesh(merged, m); mesh.name = `${id}__${m.name}`; root.add(mesh); geometries.push(merged);
  }
  if (playable) {
    const mag = new THREE.Group(); mag.name = `${id}__magazine`; mag.position.set(0, -.045, magZ);
    for (const [m, list] of magazineParts) {
      const merged = mergeGeometries(list, false)!; list.forEach(geometry => geometry.dispose());
      merged.translate(0, .045, -magZ);
      mag.add(new THREE.Mesh(merged, m)); geometries.push(merged);
    }
    root.add(mag);
    const handle = new THREE.Group(); handle.name = `${id}__charging-handle`;
    handle.position.set(.053, animatingLauncher ? .21 : .09, id === 'ff-intervention' ? .105 : -.035);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(id === 'ff-intervention' ? .045 : .032, .014, .025), dark);
    handle.add(arm); geometries.push(arm.geometry);
    if (id === 'ff-intervention') {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(.014, 10, 6), dark);
      knob.position.set(.027, -.013, 0); handle.add(knob); geometries.push(knob.geometry);
    }
    root.add(handle);
  }
  const socket = (name: string, x: number, y: number, z: number) => { const node = new THREE.Object3D(); node.name = `${id}__study_${name}`; node.position.set(x, y, z); root.add(node); return node; };
  const sockets = { grip: socket('grip', 0, 0, gripZ), foregrip: socket('foregrip', 0, .01, foreZ), magazine: socket('magazine', 0, .02, magZ), muzzle: socket('muzzle', 0, muzzleY, front - .002), ...(launcherFront === undefined ? {} : { launcherMuzzle: socket('launcher_muzzle', 0, launcherY, launcherFront - .002) }), ...(launcherMagZ === undefined ? {} : { launcherMagazine: socket('launcher_magazine', 0, .07, launcherMagZ) }) };
  if (animatingLauncher) sockets.muzzle.position.copy(sockets.launcherMuzzle!.position);
  if (playable) {
    if (!parts.has(glass)) glass.dispose();
    const lift = .14;
    for (const child of root.children) child.position.y += lift;
    for (const [key, socket] of Object.entries(sockets)) socket.name = `${id}__socket_${key}`;
    const eject = new THREE.Object3D(); eject.name = `${id}__socket_eject`; eject.position.set(.045, .224, .014); root.add(eject);
    root.userData.artStudy = false;
    root.userData.proxyHands = { right: [.027, .105, gripZ + .02], support: [-.033, .15, foreZ], magazine: [-.025, .095, magZ] };
    const long = id === 'ff-longwatch' || id === 'ff-intervention', heavy = id === 'ff-scar-h', oicw = id === 'ff-oicw';
    root.userData.proxyOptic = { ...(id === 'ff-longwatch' ? { reticle: 'tmr' } : id === 'ff-intervention' ? { reticle: 'mil-dot' } : {}), kind: long || heavy || oicw ? 'scope' : 'reflex', height: (long ? .22 : oicw ? .302 : heavy ? .2075 : .2025) + lift,
      lens: id === 'ff-intervention' ? .114 : long ? .039 : oicw ? .099 : heavy ? -.004 : -.039, radius: long ? .019 : heavy || oicw ? .024 : .022, aimDepth: -.28 };
  }
  if (animatingLauncher) root.traverse(node => { node.name = node.name.replace(/^ff-oicw/, 'ff-oicw-launcher'); });
  let disposed = false;
  return { root, sockets, dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometries.forEach(geometry => geometry.dispose()); materials.filter(m => !playable || m !== glass || parts.has(glass)).forEach(m => m.dispose()); } };
}
