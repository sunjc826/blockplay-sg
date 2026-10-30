import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { VisionSpec, VisionState } from './vision-devices';

const smooth = (a: number, b: number, t: number) => THREE.MathUtils.smoothstep(t, a, b);

/** One reversible path: reach, grip, rotate the hinge, seat the eyecup, release.
 * Derived from mount rather than a second clock so interrupted toggles retrace
 * the same pose, and restored/reduced-motion states never spawn a stray hand. */
export function visionMountPose(mount: number) {
  const flip = smooth(.22, .78, mount), seat = smooth(.72, 1, mount);
  return {
    visible: mount > 0 && mount < 1,
    flip, seat,
    reach: smooth(0, .22, mount) * (1 - smooth(.8, 1, mount)),
    grip: smooth(.12, .23, mount) * (1 - smooth(.8, .94, mount)),
    cover: smooth(.84, 1, mount),
    weaponDown: smooth(0, .18, mount) * (1 - smooth(.84, 1, mount)),
  };
}

/** Camera-space hardware, drawn in natural colour before the eyepiece pass.
 * Kept out of the world/view scenes so thermal swaps and optic captures cannot
 * turn the device itself into part of its sensor image. All five models are
 * built once; switching equipment only selects a model. */
export function createVisionMount() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(65, 1, .008, 3);
  scene.add(new THREE.HemisphereLight('#dce8f3', '#515442', 1.6));
  const light = new THREE.DirectionalLight('#fff0d6', 2.2); light.position.set(-1, 2, 2); scene.add(light);
  const root = new THREE.Group(), hinge = new THREE.Group(); scene.add(root); root.add(hinge);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const material = (color: string, roughness = .7, metalness = .08) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); materials.add(m); return m;
  };
  const olive = material('#515842'), tan = material('#7f8060'), graphite = material('#30383b'), rubber = material('#151b1c');
  const steel = material('#7d8989', .35, .7), glove = material('#474b39'), pad = material('#242b25'), sleeve = material('#626a50');
  const glass = material('#1b4b51', .16, .65);
  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    geometries.add(geometry); const object = new THREE.Mesh(geometry, m); object.position.set(x, y, z); parent.add(object); return object;
  };
  const box = (parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) =>
    mesh(parent, new RoundedBoxGeometry(w, h, d, 2, .004), m, x, y, z);
  const cylinder = (parent: THREE.Object3D, r: number, length: number, m: THREE.Material, x: number, y: number, z: number) => {
    const tube = mesh(parent, new THREE.CylinderGeometry(r, r, length, 24), m, x, y, z); tube.rotation.x = Math.PI / 2; return tube;
  };
  const models = new Map<string, THREE.Group>();
  for (const [kind, generation] of [['nvg', 1], ['nvg', 2], ['nvg', 3], ['thermal', 1], ['thermal', 2]] as const) {
    const model = new THREE.Group(); model.name = `${kind}-${generation}`; model.position.y = -.19; hinge.add(model); models.set(model.name, model);
    const body = kind === 'thermal' ? graphite : generation === 3 ? tan : olive;
    const dual = kind === 'nvg' && generation === 3;
    const radius = kind === 'nvg' && generation === 1 ? .055 : .043;
    box(model, .036, .14, .028, steel, 0, .115, -.025);
    box(model, .078, .033, .055, rubber, 0, .182, -.025);
    const axle = cylinder(model, .021, .085, steel, 0, .19, -.025); axle.rotation.set(0, 0, Math.PI / 2);
    if (kind === 'thermal') {
      // The older core has a deep sensor box and side battery; T2 is a wide,
      // shallow housing with a cooling grille and a larger ocular surround.
      box(model, generation === 1 ? .134 : .17, .095, generation === 1 ? .15 : .095, body, 0, .008, -.02);
      box(model, .038, .073, .1, rubber, -.082, .005, -.022);
      for (let i = 0; i < (generation === 1 ? 3 : 6); i++) box(model, .006, .04, .004, steel, -.035 + i * .012, .008, .031);
      const sensorZ = generation === 1 ? -.115 : -.084;
      cylinder(model, .04, .042, rubber, 0, 0, sensorZ);
      cylinder(model, .034, .004, glass, 0, 0, sensorZ - .024);
    } else {
      for (const x of dual ? [-.061, .061] : [0]) {
        cylinder(model, radius, generation === 1 ? .19 : .135, body, x, 0, -.025);
        cylinder(model, radius + .006, .028, rubber, x, 0, generation === 1 ? -.113 : -.085);
        cylinder(model, radius - .007, .003, glass, x, 0, generation === 1 ? -.129 : -.102);
        // Focus collar ridges catch light while the device turns.
        for (let i = 0; i < 4; i++) cylinder(model, radius + .002, .004, graphite, x, 0, -.055 + i * .01);
      }
      box(model, dual ? .13 : .065, .038, .048, body, dual ? 0 : -.065, .026, -.02);
      cylinder(model, .022, .07, rubber, dual ? .111 : -.067, .01, -.025);
    }
    for (const x of dual ? [-.061, .061] : [0]) {
      cylinder(model, radius + .009, .045, rubber, x, 0, .067);
      cylinder(model, radius - .007, .003, glass, x, 0, .091);
      const lip = mesh(model, new THREE.TorusGeometry(radius + .004, .008, 8, 32), rubber, x, 0, .09); lip.name = 'eyecup';
    }
    // Power dial, screw heads and a recessed generation badge.
    cylinder(model, .016, .022, rubber, .054, .049, -.01).rotation.set(0, 0, 0);
    box(model, .035, .017, .003, rubber, .045, .028, .047);
    for (let i = 0; i < generation; i++) box(model, .005, .009, .002, steel, .035 + i * .009, .028, .05);
    for (const x of [-.044, .044]) cylinder(model, .003, .003, steel, x, .035, .052);
    model.visible = false;
  }
  const hand = new THREE.Group(); hand.name = 'vision-left-hand'; root.add(hand);
  box(hand, .067, .078, .04, glove);
  box(hand, .054, .032, .009, pad, 0, .012, .024);
  const fingers: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Group(); finger.position.set(-.024 + i * .016, .034, 0); hand.add(finger); fingers.push(finger);
    box(finger, .013, .032, .018, glove, 0, .014, 0);
    box(finger, .013, .016, .026, glove, 0, .031, -.009);
    box(finger, .011, .012, .008, pad, 0, .01, .012);
  }
  const thumb = box(hand, .022, .046, .026, glove, .037, -.002, -.01); thumb.rotation.z = -.65;
  box(hand, .073, .025, .056, pad, 0, -.057, .002);
  // The wrist turns with the grip, but the forearm still comes from below the
  // camera. Keeping it separate prevents it rotating through the near plane.
  const forearm = mesh(root, new THREE.CylinderGeometry(.034, .055, 1, 10), sleeve, 0, 0, 0);
  const wrist = new THREE.Vector3(), elbow = new THREE.Vector3(-.32, -.43, -.14), armDirection = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const contact = new THREE.Vector3(), home = new THREE.Vector3(-.25, -.37, -.29);
  let selected: THREE.Group | undefined;
  return {
    scene,
    update(spec: VisionSpec | undefined, state: VisionState, aspect: number) {
      const pose = visionMountPose(state.mount);
      selected && (selected.visible = false);
      selected = spec ? models.get(`${spec.kind}-${spec.generation}`) : undefined;
      root.visible = !!selected && pose.visible;
      if (!root.visible || !selected) return pose;
      selected.visible = true;
      // Preserve hand/device framing on portrait screens without stretching it.
      camera.aspect = aspect;
      camera.fov = aspect < 1 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(38)) / aspect)) : 65;
      camera.updateProjectionMatrix();
      const dual = spec?.kind === 'nvg' && spec.generation === 3;
      hinge.position.set(dual ? .061 * pose.seat : 0, .19 + .19 * (1 - smooth(.05, .42, state.mount)), -.36 + .245 * pose.seat);
      hinge.rotation.set(-1.48 * (1 - pose.flip), .035 * Math.sin(pose.flip * Math.PI), .025 * Math.sin(pose.flip * Math.PI));
      hinge.updateMatrixWorld(true);
      // The hand follows an actual point on the housing throughout the flip.
      contact.set(dual ? -.13 : -.075, -.16, .083); hinge.localToWorld(contact);
      hand.position.lerpVectors(home, contact, pose.reach);
      hand.position.x -= .035 * Math.sin(pose.reach * Math.PI);
      hand.rotation.set(hinge.rotation.x * pose.reach - .12, -.35 * pose.reach, -.25 - .1 * pose.reach);
      for (const finger of fingers) finger.rotation.x = -.15 - pose.grip * 1.05;
      thumb.rotation.x = -pose.grip * .45;
      wrist.set(0, -.067, 0).applyEuler(hand.rotation).add(hand.position);
      armDirection.subVectors(wrist, elbow);
      forearm.position.copy(elbow).addScaledVector(armDirection, .5);
      forearm.scale.y = armDirection.length();
      forearm.quaternion.setFromUnitVectors(up, armDirection.normalize());
      return pose;
    },
    render(renderer: THREE.WebGLRenderer) {
      if (!root.visible) return;
      const exposure = renderer.toneMappingExposure;
      renderer.toneMappingExposure = .8;
      renderer.clearDepth(); renderer.render(scene, camera);
      renderer.toneMappingExposure = exposure;
    },
    async warm(renderer: THREE.WebGLRenderer) {
      root.visible = true;
      for (const model of models.values()) model.visible = true;
      await renderer.compileAsync(scene, camera);
      for (const model of models.values()) model.visible = false;
      root.visible = false;
    },
    dispose() { for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); scene.clear(); },
  };
}
