import * as THREE from 'three';
import { GRENADE_CATALOG } from './grenade-catalog';
/** Hand-sized physical props. No insignia or national event imagery. */
export function buildGrenadeModel(id: string) {
  if (!GRENADE_CATALOG.some(i => i.id === id)) return null;
  const root = new THREE.Group(); root.name = id; root.userData.fpsEffect = true;
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const mat = (color: string, metalness = 0) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .65, metalness }); materials.push(m); return m; };
  const olive = mat('#526044'), steel = mat('#77807b', .65), red = mat('#b34226'), gold = mat('#d7ac58'), paper = mat('#eee3c5');
  const mesh = (geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => { geometries.push(geo); const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); root.add(m); return m; };
  const box = (x: number, y: number, z: number, m: THREE.Material, px = 0, py = 0, pz = 0) => mesh(new THREE.BoxGeometry(x, y, z), m, px, py, pz);
  const ball = (r: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.SphereGeometry(r, 16, 12), m, x, y, z);
  const cylinder = (r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.CylinderGeometry(r, r, h, 16), m, x, y, z);
  const ring = (r: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.TorusGeometry(r, .003, 5, 18), m, x, y, z);
  const pin = () => { box(.025, .025, .028, steel, 0, .065); box(.013, .09, .008, steel, .035, .025).rotation.z = -.2; ring(.015, steel, -.022, .07); };
  if (id === 'grenade-durian') {
    const husk = mat('#6c793c'); ball(.13, husk).scale.y = 1.15;
    for (let row = 0; row < 8; row++) for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + row * .2, b = (row + 1) / 9 * Math.PI, n = new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a));
      const thorn = mesh(new THREE.ConeGeometry(.017, .035, 5), husk, n.x * .13, n.y * .15, n.z * .13); thorn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    }
    for (let i = 0; i < 6; i++) { const net = ring(.144, paper); net.rotation.y = i / 6 * Math.PI; net.scale.y = 1.1; }
    cylinder(.009, .055, olive, 0, .18); ring(.04, paper, 0, .21);
  } else if (id === 'grenade-oranges') {
    const orange = mat('#ec8a22');
    for (const x of [-.047, .047]) { ball(.05, orange, x); cylinder(.007, .007, olive, x, .051); box(.021, .025, .002, red, x, 0, .049); }
  } else if (id === 'grenade-chope') {
    box(.105, .025, .065, mat('#4b9999')); box(.08, .002, .045, paper, 0, .014); box(.04, .004, .02, paper, 0, .018);
  } else if (id === 'grenade-firecrackers') {
    box(.16, .006, .008, gold);
    for (let i = 0; i < 8; i++) { const c = cylinder(.008, .044, red, (i - 3.5) * .02, 0, i % 2 ? .02 : -.02); c.rotation.x = Math.PI / 2; ring(.008, gold, (i - 3.5) * .02, 0, i % 2 ? .041 : -.041); }
  } else if (id === 'grenade-finale') {
    box(.2, .018, .17, olive, 0, -.08);
    for (const x of [-.075, .075]) box(.018, .16, .018, olive, x);
    cylinder(.065, .18, mat('#373746')); cylinder(.066, .018, gold, 0, .08); box(.05, .04, .003, gold, 0, 0, .065);
  } else if (id === 'grenade-whistle') {
    cylinder(.023, .1, olive); box(.035, .024, .045, steel, .025, .045); cylinder(.017, .03, steel, .008, .055).rotation.z = Math.PI / 2; pin();
  } else if (id === 'grenade-sambal') {
    cylinder(.055, .075, mat('#a65a38')); cylinder(.057, .005, steel, 0, .04); cylinder(.05, .018, steel, 0, -.047); box(.06, .035, .002, paper, 0, 0, .055); ring(.018, steel, 0, .045).rotation.x = Math.PI / 2;
  } else if (['grenade-smoke', 'grenade-red-smoke', 'grenade-fogging', 'grenade-stun'].includes(id)) {
    cylinder(.035, .13, id === 'grenade-stun' ? steel : olive); cylinder(.036, .018, id === 'grenade-red-smoke' ? red : paper, 0, .025);
    if (id === 'grenade-stun') for (let i = 0; i < 4; i++) { cylinder(.036, .006, olive, 0, -.045 + i * .025); }
    pin();
  } else {
    const body = ball(id === 'grenade-chilli' ? .035 : .045, olive); body.scale.y = 1.2;
    for (let i = 0; i < 4; i++) { const line = ring(.044, steel, 0, -.03 + i * .02); line.rotation.x = Math.PI / 2; line.scale.setScalar(.8); }
    pin();
  }
  return { root, dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); } };
}
export function createGrenadeViewmodel(parent: THREE.Object3D) {
  const root = new THREE.Group(); root.name = 'grenade-hands'; parent.add(root); root.visible = false;
  const models = GRENADE_CATALOG.map(i => buildGrenadeModel(i.id)!); models.forEach(m => root.add(m.root));
  const glove = new THREE.MeshStandardMaterial({ color: '#444c36' }), sleeve = new THREE.MeshStandardMaterial({ color: '#626a50' });
  const handGeo = new THREE.BoxGeometry(.075, .085, .055), armGeo = new THREE.CylinderGeometry(.038, .053, .25, 8);
  const hand = new THREE.Mesh(handGeo, glove), arm = new THREE.Mesh(armGeo, sleeve); root.add(hand, arm); hand.position.set(0, -.04, .025); arm.position.set(0, -.19, .06); arm.rotation.x = -.3;
  const left = hand.clone(); root.add(left);
  return { update(id: string | null, ready: number, cooked: number) {
    root.visible = !!id; models.forEach(m => m.root.visible = m.root.name === id);
    root.position.set(.18, -.28 - Math.max(0, .35 - ready) * .9, -.5); root.rotation.set(.15, -.2, -.15);
    left.visible = cooked > 0 && cooked < .3; left.position.set(-.05 - cooked * .3, .07, 0);
  }, dispose() { root.removeFromParent(); models.forEach(m => m.dispose()); handGeo.dispose(); armGeo.dispose(); glove.dispose(); sleeve.dispose(); } };
}
