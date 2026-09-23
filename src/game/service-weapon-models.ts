import * as THREE from 'three';

/** Authored low-poly silhouettes, not dimensional replicas. Local -Z is forward. */
export function buildServiceWeapon(id: string): THREE.Group | undefined {
  if (!['p30-inspired', 'mag-inspired', 'cis50-inspired'].includes(id)) return undefined;
  const root = new THREE.Group(); root.name = id;
  const steel = new THREE.MeshStandardMaterial({ color: '#343d41', roughness: .48, metalness: .65 });
  const polymer = new THREE.MeshStandardMaterial({ color: '#394334', roughness: .85 });
  const dark = new THREE.MeshStandardMaterial({ color: '#141a1c', roughness: .75 });
  const brass = new THREE.MeshStandardMaterial({ color: '#b59650', roughness: .42, metalness: .7 });
  steel.name = 'Metal anodised'; polymer.name = 'Polymer'; dark.name = 'Dark metal';
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material = steel) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.name = `${id}__${name}`; mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  const barrel = (name: string, radius: number, length: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), steel);
    mesh.rotation.x = Math.PI / 2; mesh.position.set(0, y, z); mesh.name = `${id}__${name}`; root.add(mesh);
  };
  const socket = (name: string, x: number, y: number, z: number) => {
    const node = new THREE.Object3D(); node.name = `${id}__socket_${name}`; node.position.set(x, y, z); root.add(node);
  };
  if (id === 'p30-inspired') {
    box('slide', .047, .045, .205, 0, .202, -.015);
    box('frame', .045, .027, .17, 0, .168, -.006, polymer);
    box('grip', .044, .103, .056, 0, .108, .067, polymer).rotation.x = -.19;
    box('hammer', .021, .025, .024, 0, .205, .099, dark).rotation.x = -.3;
    box('backstrap', .047, .085, .018, 0, .105, .098, polymer).rotation.x = -.19;
    for (let i = 0; i < 3; i++) box('grip-groove', .046, .014, .013, 0, .08 + i * .025, .035, dark);
    box('magazine', .041, .012, .057, 0, .05, .077, dark);
    box('guard-bottom', .035, .01, .064, 0, .115, .01, polymer);
    box('guard-front', .035, .038, .01, 0, .137, -.023, polymer);
    box('trigger', .012, .026, .01, 0, .14, .017, dark).rotation.x = -.25;
    for (const x of [-.015, .015]) box('rear-sight', .008, .012, .016, x, .231, .07, dark);
    box('front-sight', .006, .012, .012, 0, .231, -.095, dark);
    for (let i = 0; i < 6; i++) box('slide-serration', .049, .024, .002, 0, .203, .042 + i * .006, dark);
    barrel('muzzle', .012, .012, .197, -.123);
    socket('muzzle', 0, .197, -.13); socket('eject', .03, .214, -.007);
  } else {
    const heavy = id === 'cis50-inspired';
    const y = heavy ? .25 : .22, front = heavy ? -.92 : -.68;
    box('receiver', heavy ? .16 : .105, .12, heavy ? .44 : .35, 0, y, .02);
    box('feed-cover', heavy ? .175 : .12, .025, .24, 0, y + .074, .015, dark);
    barrel('barrel', heavy ? .026 : .016, heavy ? .7 : .5, y, heavy ? -.57 : -.43);
    barrel('flash-hider', heavy ? .039 : .024, .055, y, front);
    box('magazine', heavy ? .18 : .13, .16, .18, heavy ? -.18 : -.12, .13, .015, polymer);
    for (let i = 0; i < 7; i++) {
      const round = new THREE.Mesh(new THREE.CylinderGeometry(heavy ? .008 : .006, heavy ? .008 : .006, .07, 8), brass);
      round.rotation.x = Math.PI / 2; round.position.set(-.18 + i * .021, y + .02, -.02); root.add(round);
    }
    box('rear-sight-base', .055, .012, .025, 0, heavy ? .322 : .287, .14, dark);
    for (const x of [-.019, .019]) box('rear-sight', .007, .025, .012, x, heavy ? .34 : .305, .14, dark);
    box('front-sight-base', .035, .075, .027, 0, y + .035, front + .1, dark);
    box('front-sight', .007, .043, .012, 0, heavy ? .327 : .292, front + .1, dark);
    if (heavy) {
      box('spade-crossbar', .28, .024, .03, 0, .21, .265);
      for (const x of [-.125, .125]) box('spade-grip', .035, .15, .045, x, .14, .27, polymer);
      box('mount-lug', .09, .09, .12, 0, .14, -.11, dark);
      const mount = new THREE.Group(); mount.name = `${id}__deployed-mount`; mount.visible = false; root.add(mount);
      for (const [x, z] of [[-.22, -.3], [.22, -.3], [0, .2]]) {
        const leg = box('mount-leg', .028, .32, .028, x / 2, -.02, z, dark);
        leg.rotation.z = -x; mount.attach(leg);
      }
    } else {
      box('stock', .066, .105, .24, 0, .205, .29, polymer);
      box('buttplate', .075, .13, .025, 0, .2, .418, dark);
      box('grip', .05, .115, .065, 0, .094, .135, polymer).rotation.x = -.2;
      box('handguard', .07, .055, .17, 0, .175, -.26, polymer);
      for (const x of [-.035, .035]) {
        const leg = box('bipod', .018, .23, .022, x * 2, .1, -.43); leg.rotation.z = x < 0 ? -.3 : .3;
      }
      box('carry-handle', .018, .07, .11, .063, .285, -.14, polymer);
    }
    socket('muzzle', 0, y, front - .03); socket('eject', .095, y, -.05);
  }
  return root;
}
