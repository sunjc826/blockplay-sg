import * as THREE from 'three';

/** A hollow utility cab with open passenger windows, shared by interior and exterior views. */
export function buildHumveeCabin(paint: THREE.MeshStandardMaterial) {
  const root = new THREE.Group(); root.name = 'humvee-cabin';
  const trim = new THREE.MeshStandardMaterial({ color: '#303b39', roughness: .88, emissive: '#303b39', emissiveIntensity: .16 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#141d20', roughness: .92, emissive: '#141d20', emissiveIntensity: .1 });
  const cloth = new THREE.MeshStandardMaterial({ color: '#4c5546', roughness: .98, emissive: '#4c5546', emissiveIntensity: .1 });
  const metal = new THREE.MeshStandardMaterial({ color: '#78817b', roughness: .5, metalness: .5 });
  const glazing = new THREE.MeshStandardMaterial({ color: '#b8d5d8', transparent: true, opacity: .08, depthWrite: false, side: THREE.DoubleSide, roughness: .18 });
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material = trim, parent: THREE.Object3D = root) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.name = name; mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  };
  const rod = (a: number[], b: number[], radius = .025, material = rubber) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), material);
    mesh.position.copy(from.add(to).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); root.add(mesh);
  };
  box('cab-floor', 1.91, .08, 2.64, 0, 1.02, .29, rubber);
  box('cab-firewall', 1.91, .38, .1, 0, 1.22, -1.03);
  box('cab-rear-wall', 1.98, .55, .12, 0, 1.3, 1.6, paint);
  box('cab-rear-lining', 1.84, .5, .04, 0, 1.31, 1.51);
  box('cab-rear-header', 2.01, .12, .12, 0, 2.05, 1.59, paint);
  const rear = new THREE.Mesh(new THREE.PlaneGeometry(1.79, .48), glazing); rear.name = 'cab-rear-window'; rear.position.set(0, 1.79, 1.59); root.add(rear);
  // Split roof leaves a real opening underneath the standing gunner.
  box('cab-roof-front', 2.04, .12, .85, 0, 2.1, -.645, paint);
  box('cab-roof-back', 2.04, .12, 1.19, 0, 2.1, 1.055, paint);
  for (const x of [-.71, .71]) box('cab-roof-edge', .62, .12, .68, x, 2.1, .12, paint);
  for (const side of [-1, 1]) {
    const x = side * .98;
    for (const [z, length] of [[-.38, 1.25], [.98, 1.18]]) {
      box('cab-door', .09, .43, length, x, 1.28, z, paint);
      box('cab-door-lining', .04, .36, length - .12, side * .92, 1.29, z);
      box('cab-window-sill', .12, .06, length, x, 1.51, z, rubber);
      box('cab-door-pull', .05, .04, .21, side * .88, 1.39, z + .15, metal);
    }
    box('cab-door-post', .1, .46, .18, x, 1.28, .3, paint);
    box('cab-door-post-lining', .04, .4, .18, side * .92, 1.29, .3);
    rod([x, 1.49, -1.06], [x, 2.07, -.86], .042, paint);
    for (const z of [.3, 1.59]) box('cab-window-pillar', .08, .62, .09, x, 1.79, z, paint);
    for (const z of [-.34, .94]) {
      box('cab-seat-base', .63, .15, .61, side * .5, 1.15, z, cloth);
      box('cab-seat-back', .63, .51, .13, side * .5, 1.47, z + .3, cloth);
      box('cab-headrest', .32, .21, .12, side * .5, 1.81, z + .3, cloth);
      for (const strap of [-.2, .2]) box('cab-seat-seam', .012, .4, .012, side * .5 + strap, 1.46, z + .228, rubber);
    }
    rod([side * .83, 1.93, .64], [side * .83, 1.93, 1.02], .018, metal);
    // Thin glazing keeps the road clear; side windows are wound down for rifles.
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.48, -1.065, x, 1.48, -1.065, x, 2.04, -.87, 0, 2.04, -.87], 3)); geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
    const window = new THREE.Mesh(geometry, glazing); window.name = 'cab-windscreen'; root.add(window);
    rod([side * .14, 1.49, -1.08], [side * .73, 1.58, -1.06], .012);
    rod([side * .3, 1.5, -1.08], [side * .6, 1.5, -1.08], .008);
  }
  rod([0, 1.48, -1.065], [0, 2.04, -.87], .025, paint);
  box('cab-transmission-tunnel', .34, .26, 2.15, 0, 1.17, .07, rubber);
  box('cab-dashboard', 1.83, .28, .24, 0, 1.4, -.96);
  box('cab-dashboard-top', 1.91, .06, .38, 0, 1.55, -1.01, rubber);
  box('cab-glovebox', .57, .17, .025, .52, 1.39, -.827, rubber);
  box('cab-glovebox-latch', .12, .025, .025, .52, 1.44, -.807, metal);
  for (const x of [-.83, .14, .84]) for (let n = 0; n < 4; n++) box('cab-vent', .1, .007, .012, x, 1.42 + n * .022, -.832, rubber);
  rod([-.5, 1.27, -1], [-.5, 1.46, -.73], .035);
  const wheel = new THREE.Group(); wheel.name = 'humvee-steering-wheel'; wheel.position.set(-.5, 1.46, -.73); wheel.rotation.x = -.35; root.add(wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.18, .021, 8, 24), rubber); wheel.add(rim);
  box('steering-hub', .08, .07, .055, 0, 0, 0, rubber, wheel);
  for (const angle of [0, 2.1, -2.1]) { const spoke = box('steering-spoke', .027, .16, .018, Math.sin(angle) * .08, Math.cos(angle) * .08, 0, metal, wheel); spoke.rotation.z = -angle; }
  // Low-cost analogue instruments remain legible in daylight and at night.
  const dial = new THREE.MeshBasicMaterial({ color: '#0a1719', toneMapped: false }), ink = new THREE.MeshBasicMaterial({ color: '#b9ddba', toneMapped: false });
  for (const [x, radius, name] of [[-.57, .08, 'humvee-speed-needle'], [-.33, .06, 'humvee-engine-needle']] as const) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), dial); face.position.set(x, 1.43, -.829); root.add(face);
    for (let n = 0; n <= 8; n++) { const a = -.75 * Math.PI + n / 8 * Math.PI * 1.5; const tick = box('gauge-tick', .008, .015, .004, x + Math.sin(a) * radius * .83, 1.43 + Math.cos(a) * radius * .83, -.822, ink); tick.rotation.z = -a; }
    const needle = new THREE.Group(); needle.name = name; needle.position.set(x, 1.43, -.814); root.add(needle);
    box('gauge-needle', .008, radius * .72, .006, 0, radius * .3, 0, ink, needle);
  }
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128; const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#102021'; ctx.fillRect(0, 0, 512, 128); ctx.fillStyle = '#bed6b1'; ctx.font = '20px monospace'; ctx.fillText('UTILITY 01 / 4x4', 20, 30); ctx.font = '16px monospace'; ctx.fillText('SYSTEMS READY', 20, 63); ctx.fillText('KM/H      ENGINE      RADIO', 20, 106);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.32, .12), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })); screen.position.set(-.02, 1.43, -.826); screen.name = 'cab-radio'; root.add(screen);
  rod([.12, 1.28, -.45], [.12, 1.43, -.49], .015); box('cab-gear-lever', .06, .055, .07, .12, 1.45, -.49, rubber);
  for (const x of [-.61, -.4]) box('cab-pedal', .1, .03, .17, x, 1.08, -.83, rubber);
  return root;
}

export function updateHumveeInstruments(model: THREE.Object3D, speed: number, yawRate: number, dt: number) {
  const wheel = model.getObjectByName('humvee-steering-wheel');
  if (wheel) wheel.rotation.z = THREE.MathUtils.damp(wheel.rotation.z, THREE.MathUtils.clamp(yawRate * Math.sign(speed) * 1.4, -.65, .65), 10, dt);
  const needle = model.getObjectByName('humvee-speed-needle'), engine = model.getObjectByName('humvee-engine-needle');
  if (needle) needle.rotation.z = Math.PI * .75 - Math.min(1, Math.abs(speed) * 3.6 / 80) * Math.PI * 1.5;
  if (engine) engine.rotation.z = Math.PI * .55 - Math.min(1, Math.abs(speed) / 20) * Math.PI * 1.2;
}
