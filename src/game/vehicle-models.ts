import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { itemById } from './armory-catalog';
import type { VehicleKind } from './vehicle-rules';
import { airframeLoft } from './helicopter-airframe';
import { buildHelicopterCabin } from './helicopter-cabin';
import { buildHumveeCabin } from './humvee-cabin';
import { buildDragonBoatModel } from './dragon-boat-model';
import { isDragonBoat } from './marina-water';
import { addShadowProxies } from './shadow-proxy';

export function vehiclePaint(id: string) {
  const item = itemById(id), canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!, colors = item?.palette || ['#45513a', '#45513a', '#45513a', '#45513a'];
  ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, 256, 256);
  let seed = 2111;
  for (let i = 0; i < 130; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; ctx.fillStyle = colors[(seed >>> 19) % colors.length]; ctx.fillRect((seed % 32) * 8, ((seed >>> 8) % 32) * 8, 8 * (2 + (seed >>> 21) % 5), 8 * (1 + (seed >>> 24) % 5)); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ name: 'Vehicle paint', map: texture, roughness: .64, metalness: .25 });
}
/** Parts that turn, spin or hide on their own (fps-vehicles, cabin instruments); each keeps its own shadow. */
export const VEHICLE_MOVING_PARTS: ReadonlySet<string> = new Set(['vehicle-wheel', 'main-rotor', 'tail-rotor', 'vehicle-turret', 'vehicle-muzzle-flash',
  'humvee-steering-wheel', 'humvee-speed-needle', 'humvee-engine-needle']);
/** Original utility vehicle silhouettes; no copied game logos or liveries. Forward is local -Z. */
export function buildVehicleModel(kind: VehicleKind, skin = 'paint-issued') {
  if (isDragonBoat(kind)) return buildDragonBoatModel(kind === 'dragon-boat-gold');
  const root = new THREE.Group(), paint = vehiclePaint(skin);
  // A running engine reads warm through thermal sights (fps-vision).
  root.userData.heat = 'engine';
  const dark = new THREE.MeshStandardMaterial({ color: '#20272a', roughness: .8 });
  const metal = new THREE.MeshStandardMaterial({ color: '#737b75', roughness: .4, metalness: .75 });
  const lamp = new THREE.MeshStandardMaterial({ color: '#e7dbb1', emissive: '#b29e64', emissiveIntensity: .4 });
  const red = new THREE.MeshStandardMaterial({ color: '#a44836', emissive: '#641c10', emissiveIntensity: .35 });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material = paint, parent: THREE.Object3D = root, radius = .045) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 4, h / 4, d / 4)), material); mesh.position.set(x, y, z); parent.add(mesh); mesh.userData.rainReceiver = mesh.userData.wetSurface = true; return mesh;
  };
  const rod = (a: number[], b: number[], radius = .06, material = metal, parent: THREE.Object3D = root) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), direction = to.clone().sub(from);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 10), material); mesh.position.copy(from.add(to).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); parent.add(mesh); mesh.userData.rainReceiver = mesh.userData.wetSurface = true; return mesh;
  };
  if (kind === 'car') {
    box(2.05, .55, 4.45, 0, .8, 0);
    root.add(buildHumveeCabin(paint));
    box(1.96, .24, 1.25, 0, 1.13, -1.54);
    for (const x of [-.98, .98]) {
      box(.18, .12, 2.8, x, .48, .18, dark);
      box(.24, .20, .25, x * 1.17, 1.49, -.81, dark); for (const z of [-.45, .92]) box(.05, .05, .20, x * 1.025, 1.35, z, metal);
      for (const z of [-1.45, 1.45]) {
        const wheel = new THREE.Group(); wheel.name = 'vehicle-wheel'; wheel.position.set(x * 1.03, .5, z); root.add(wheel);
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(.51, .51, .35, 24), dark); tire.userData.wetSurface = true; tire.rotation.z = Math.PI / 2; wheel.add(tire);
        for (const side of [-1, 1]) { const hub = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .015, 12), metal); hub.rotation.z = Math.PI / 2; hub.position.x = side * .181; wheel.add(hub); }
        for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; const tread = box(.37, .10, .13, 0, Math.cos(a) * .49, Math.sin(a) * .49, dark, wheel, .012); tread.rotation.x = a; }
      }
    }
    box(2.18, .18, .24, 0, .61, -2.28, dark); box(2.18, .18, .24, 0, .61, 2.28, dark);
    box(.92, .30, .03, 0, .96, -2.245, dark); for (let i = -3; i <= 3; i++) box(.045, .23, .03, i * .12, .96, -2.265, metal);
    for (const x of [-.77, .77]) { box(.35, .25, .08, x, .98, -2.25, lamp); box(.22, .24, .08, x, .91, 2.25, red); }
    for (const x of [-.8, .8]) rod([x, 2.13, -.9], [x, 2.13, 1.4], .045, dark);
    for (const z of [-.9, .6, 1.4]) rod([-.85, 2.13, z], [.85, 2.13, z], .045, dark);
    box(1.3, .35, .7, 0, 2.28, 1.15, dark);
  } else {
    root.add(buildHelicopterCabin(paint));
    root.add(airframeLoft('transmission-fairing', [
      { z: -.95, width: .12, bottom: 2.69, top: 2.83 },
      { z: -.58, width: .5, bottom: 2.66, top: 3.01 },
      { z: .35, width: .57, bottom: 2.69, top: 3.08 },
      { z: 1.08, width: .41, bottom: 2.63, top: 2.99 },
      { z: 1.43, width: .2, bottom: 2.57, top: 2.78 },
    ], paint));
    for (const side of [-1, 1]) {
      const pod = airframeLoft('engine-cowling', [
        { z: -.45, width: .21, bottom: 2.72, top: 3.03 },
        { z: -.2, width: .29, bottom: 2.66, top: 3.13 },
        { z: .85, width: .27, bottom: 2.66, top: 3.1 },
        { z: 1.35, width: .19, bottom: 2.64, top: 2.96 },
      ], paint); pod.position.x = side * .55; root.add(pod);
      const intake = new THREE.Mesh(new THREE.CircleGeometry(.17, 16), dark);
      intake.name = 'engine-intake'; intake.position.set(side * .55, 2.86, -.456); intake.rotation.y = Math.PI; root.add(intake);
      for (let i = -1; i <= 1; i++) rod([side * .55 - .13, 2.86 + i * .075, -.46], [side * .55 + .13, 2.86 + i * .075, -.46], .012, metal);
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(.16, .19, .4, 16, 1, true), metal);
      exhaust.name = 'engine-exhaust'; exhaust.rotation.x = Math.PI / 2; exhaust.position.set(side * .55, 2.8, 1.42); root.add(exhaust);
      const opening = new THREE.Mesh(new THREE.CircleGeometry(.155, 16), dark); opening.position.set(side * .55, 2.8, 1.6); root.add(opening);
    }
    root.add(airframeLoft('tail-boom', [
      { z: 2.05, width: .43, bottom: 1.3, top: 2.15 },
      { z: 2.7, width: .32, bottom: 1.45, top: 2.1 },
      { z: 4.4, width: .18, bottom: 1.75, top: 2.12 },
      { z: 5.6, width: .11, bottom: 1.93, top: 2.16 },
    ], paint));
    const finShape = new THREE.Shape(); finShape.moveTo(0, 0); finShape.lineTo(.7, 0); finShape.lineTo(.95, 1.65); finShape.lineTo(.3, 1.4); finShape.closePath();
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: .09, bevelEnabled: true, bevelSize: .035, bevelThickness: .02, bevelSegments: 2, steps: 1 }), paint); fin.rotation.y = Math.PI / 2; fin.position.set(-.045, 1.5, 5.6); fin.userData.rainReceiver = fin.userData.wetSurface = true; root.add(fin);
    box(2.2, .09, .55, 0, 1.72, 4.7);
    const rotor = new THREE.Group(); rotor.name = 'main-rotor'; rotor.position.set(0, 3.22, .15); root.add(rotor);
    rod([0, 2.8, .15], [0, 3.32, .15], .11, metal);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(.21, 16, 8), metal);
    hub.scale.y = .5; rotor.add(hub);
    for (const x of [-.18, .18]) rod([x, 2.97, .15], [x * 1.5, 3.22, .15], .026, metal);
    for (let i = 0; i < 4; i++) { const blade = new THREE.Group(); blade.rotation.y = i * Math.PI / 2; rotor.add(blade); box(.22, .055, 5.2, 0, 0, -2.62, dark, blade, .015); box(.23, .06, .4, 0, 0, -4.99, lamp, blade, .01); }
    const tailRotor = new THREE.Group(); tailRotor.name = 'tail-rotor'; tailRotor.position.set(.24, 2.11, 5.29); root.add(tailRotor);
    box(.07, 1.5, .11, 0, 0, 0, dark, tailRotor); box(.07, .11, 1.5, 0, 0, 0, dark, tailRotor);
    for (const x of [-1.20, 1.20]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, .42, -2.16), new THREE.Vector3(x, .2, -1.83),
        new THREE.Vector3(x, .17, -1.45), new THREE.Vector3(x, .17, 1.35), new THREE.Vector3(x, .23, 1.7),
      ]);
      const skid = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, .085, 10, false), dark);
      skid.name = 'landing-skid'; skid.userData.rainReceiver = skid.userData.wetSurface = true; root.add(skid);
      for (const end of [0, 1]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(.085, 10, 8), dark);
        cap.position.copy(curve.getPoint(end)); root.add(cap);
      }
      for (const z of [-.8, .85]) rod([x, .17, z], [x * .62, .93, z], .075, metal);
    }
    box(.16, .12, .16, -1.2, 2.6, 1.25, red); box(.16, .12, .16, 1.2, 2.6, 1.25, lamp);
  }
  const turret = new THREE.Group(); turret.name = 'vehicle-turret';
  turret.position.set(0, kind === 'car' ? 2.55 : .72, kind === 'car' ? -.45 : -1.7); root.add(turret);
  box(.5, .3, .85, 0, 0, -.1, dark, turret);
  box(.25, .28, .45, -.35, -.02, .12, metal, turret);
  rod([0, 0, -.4], [0, 0, -1.65], .07, metal, turret);
  const muzzle = new THREE.Object3D(); muzzle.name = 'vehicle-muzzle'; muzzle.position.z = -1.7; turret.add(muzzle);
  const flash = new THREE.Mesh(new THREE.ConeGeometry(.19, .65, 7), new THREE.MeshBasicMaterial({ color: '#ffcb66' }));
  flash.name = 'vehicle-muzzle-flash'; flash.rotation.x = -Math.PI / 2; flash.position.z = -1.9; flash.visible = false;
  flash.raycast = () => {}; turret.add(flash);
  tagRainReceivers(root);
  // One sun-shadow caster per rigid piece instead of one per part (about 120 a vehicle).
  addShadowProxies(root, VEHICLE_MOVING_PARTS);
  root.userData.vehicleKind = kind;
  return root;
}

/** Name only the exterior cabin panels: seats, controls and trim stay dry. */
function tagRainReceivers(root: THREE.Object3D) {
  const exterior = /^(cab-roof-|cab-door$|cab-rear-wall$|cab-rear-header$|cab-windscreen$|cab-rear-window$|cabin-roof$|cabin-belly$|rear-bulkhead$|nose-fairing$|cockpit-sill$|cockpit-glazing$|door-jamb$)/;
  root.traverse(o => { if (o instanceof THREE.Mesh && exterior.test(o.name)) o.userData.rainReceiver = o.userData.wetSurface = true; });
}
