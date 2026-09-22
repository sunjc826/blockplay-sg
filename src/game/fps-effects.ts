import * as THREE from 'three';
import { advanceCasings, casingFade, ejectCasing, MAX_CASINGS, type Casing } from './fps-casings';
import { advanceImpacts, clearImpactField, createImpactField, impactDust, impactRing, MAX_IMPACTS, MAX_SCORCHES, MAX_SPARKS, recordImpact, scorchAlpha, sparkHeat, sparkStreak, type ImpactKind } from './fps-impacts';
import { advanceMuzzle, createMuzzle, igniteMuzzle, muzzleShape, resetMuzzle } from './fps-muzzle';
import { MAX_ROUNDS_IN_FLIGHT } from './fps-projectiles';
import { advanceSplashes, clearSplashField, createSplashField, dropletScale, MAX_DROPLETS, MAX_SPLASHES, recordSplash, splashColumn, splashRings } from './fps-splashes';
import { ISSUED_STYLE, type EffectStyle } from './fps-effect-styles';

/**
 * Everything a shot leaves behind, drawn. The arcs, lifetimes and shapes are
 * owned by the pure modules beside this one; this file is the part that cannot
 * run without a renderer, and it is deliberately the only part that knows what
 * a `THREE.InstancedMesh` is.
 *
 * Every pool is allocated once at its ceiling and drawn as a single object:
 * one instanced draw for the brass, one for the impact rings, one for the dust
 * and smoke, one for the scorches, one batched `LineSegments` for every spark
 * in the air, and two for water: the foam rings and a billboard pool shared by
 * the spray columns and droplets. Nothing is created or disposed while firing, which is what
 * keeps a held trigger from sawing at the allocator on a software renderer.
 *
 * The whole world-space tree is flagged `fpsEffect`, so the engine's raycasts
 * filter it out wholesale: brass on the floor can never stop a bullet.
 *
 * Every colour comes from an `EffectStyle` rather than from a constant here, so
 * a premium weapon flares, traces and ejects in its own colours without this
 * file knowing anything about the armoury. Because the pools are shared and a
 * player can switch weapons while their last burst is still in the air, each
 * spawn is tagged with the style that made it and is drawn in that style for
 * the rest of its life — switching weapons never retints the brass already on
 * the floor or the marks already on the wall.
 */
export type { ImpactKind };

/** Wisps of barrel smoke alight at once, beyond the dust the impacts throw. */
const MAX_SMOKE = 10;
const PUFF_CAPACITY = MAX_IMPACTS + MAX_SMOKE;

interface Smoke { x: number; y: number; z: number; vy: number; drift: number; age: number; life: number }

/**
 * A soft radial disc as raw bytes rather than a canvas, so no DOM is touched
 * and the falloff is exactly the curve written here. `channel` decides where
 * the disc lives: in alpha for the additive sprites, or in RGB for the scorch,
 * whose blend reads the colour rather than the coverage.
 */
function radialTexture(size: number, edge: number, channel: 'alpha' | 'colour' = 'alpha') {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + .5) / size * 2 - 1, dy = (y + .5) / size * 2 - 1;
    const distance = Math.min(1, Math.hypot(dx, dy));
    const falloff = Math.round(Math.pow(Math.max(0, 1 - distance), edge) * 255);
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = channel === 'alpha' ? 255 : falloff;
    data[i + 3] = channel === 'alpha' ? falloff : 255;
  }
  return finishTexture(data, size);
}
function finishTexture(data: Uint8Array, size: number) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
/**
 * A soft annulus in alpha, peaking at `peak` of the radius: a ripple ring seen
 * from above, whose foam is brightest on the crest and gone either side of it.
 */
function ringTexture(size: number, peak: number, width: number) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + .5) / size * 2 - 1, dy = (y + .5) / size * 2 - 1;
    const off = (Math.hypot(dx, dy) - peak) / width, i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(Math.exp(-off * off) * (Math.hypot(dx, dy) < 1 ? 255 : 0));
  }
  return finishTexture(data, size);
}

export function createFpsEffects(world: THREE.Scene, view: THREE.Scene, options: { worldLight?: boolean; style?: EffectStyle } = {}) {
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], textures: THREE.Texture[] = [];
  const keep = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g; };
  const hold = <T extends THREE.Material>(m: T) => { materials.push(m); return m; };
  const paint = <T extends THREE.Texture>(t: T) => { textures.push(t); return t; };

  // Every style this round can draw in, by id. A spawn stores its style's id
  // and looks it back up here, so a case thrown by the rifle keeps its brass
  // after the player has swapped to the support weapon. Two entries in
  // practice, one per equipped weapon.
  const known = new Map<string, EffectStyle>();
  let current: EffectStyle = options.style ?? ISSUED_STYLE;
  known.set(current.id, current);
  const styleOf = (tag?: string) => (tag && known.get(tag)) || current;
  const root = new THREE.Group(); root.name = 'fps-effects'; root.userData.fpsEffect = true; root.frustumCulled = false; world.add(root);
  const soft = paint(radialTexture(64, 1.6)), blob = paint(radialTexture(64, .9)), mark = paint(radialTexture(64, 1.1, 'colour'));

  // --- muzzle -------------------------------------------------------------
  const muzzle = createMuzzle();
  const flare = new THREE.Group(); flare.name = 'fps-muzzle-flare'; flare.visible = false;
  const additive = (color: string, map?: THREE.Texture) => hold(new THREE.MeshBasicMaterial({ color, ...(map ? { map } : {}), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const flashCore = additive('#ffe6b4'), flashStar = additive('#ffd489', soft), flashCone = additive('#ffbf6a');
  const core = new THREE.Mesh(keep(new THREE.SphereGeometry(.026, 8, 6)), flashCore); core.position.z = -.02; flare.add(core);
  const star = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), flashStar); star.position.z = -.03; flare.add(star);
  const petalGeometry = keep(new THREE.PlaneGeometry(1, .16));
  const petals = [0, Math.PI / 2, Math.PI / 4].map(angle => {
    const petal = new THREE.Mesh(petalGeometry, flashStar); petal.position.z = -.035; petal.rotation.z = angle; flare.add(petal); return petal;
  });
  // A short cone down the bore, so the flare has a direction as well as a size.
  const cone = new THREE.Mesh(keep(new THREE.ConeGeometry(.04, .17, 7, 1, true)), flashCone);
  cone.rotation.x = -Math.PI / 2; cone.position.z = -.09; flare.add(cone);
  // The viewmodel scene holds the weapon and two hands and nothing else, so a
  // light in it is nearly free and lights exactly what a real flash would.
  const viewLight = new THREE.PointLight('#ffca7a', 0, 2.2, 2); view.add(viewLight);
  // The map is a different matter: one point light is the whole budget, and it
  // is the only reason a flash brightens the wall you are standing next to.
  const worldLight = options.worldLight === false ? null : new THREE.PointLight('#ffb968', 0, 13, 2);
  if (worldLight) { worldLight.userData.fpsEffect = true; root.add(worldLight); }

  // --- brass --------------------------------------------------------------
  const casings: Casing[] = [];
  // White base colour, because the brass tint arrives per instance: two weapons
  // firing into the same pool can leave two different colours of case on the floor.
  const casingMaterial = hold(new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: .85, roughness: .34 }));
  const casingMesh = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(.0048, .0055, .023, 6)), casingMaterial, MAX_CASINGS);
  casingMesh.name = 'fps-brass';
  casingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); casingMesh.frustumCulled = false; casingMesh.userData.fpsEffect = true; root.add(casingMesh);

  // --- impacts ------------------------------------------------------------
  const field = createImpactField();
  const quad = keep(new THREE.PlaneGeometry(1, 1));
  const ringMesh = new THREE.InstancedMesh(quad, additive('#ffffff', blob), MAX_IMPACTS);
  ringMesh.name = 'fps-impact-rings';
  ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ringMesh.frustumCulled = false; ringMesh.userData.fpsEffect = true; root.add(ringMesh);

  const puffGeometry = keep(new THREE.PlaneGeometry(1, 1));
  const puffMesh = new THREE.InstancedMesh(puffGeometry, additive('#ffffff', soft), PUFF_CAPACITY);
  puffMesh.name = 'fps-puffs';
  puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); puffMesh.frustumCulled = false; puffMesh.userData.fpsEffect = true; root.add(puffMesh);

  const scorchGeometry = keep(new THREE.PlaneGeometry(1, 1));
  // A scorch has to *darken* the surface it sits on, which additive cannot do;
  // and `instanceColor` tints an instance rather than setting its coverage, so
  // it cannot fade a normally blended one either. The blend does the work
  // instead: `dst x (1 - src)` leaves the surface alone where the mark is black
  // and takes colour out of it where the mark is bright, which turns the
  // per-instance colour into the fade. Stock material state throughout — no
  // patched shader, nothing extra per vertex.
  const scorchMaterial = hold(new THREE.MeshBasicMaterial({
    map: mark, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcColorFactor,
    // The alpha factors matter as much as the colour ones: left to follow the
    // colour blend, this would also multiply the framebuffer's own alpha down
    // to nothing, and the page underneath would show through the quad as a
    // pale square around every mark. Alpha is passed through untouched.
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const scorchMesh = new THREE.InstancedMesh(scorchGeometry, scorchMaterial, MAX_SCORCHES);
  scorchMesh.name = 'fps-scorches';
  scorchMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scorchMesh.frustumCulled = false; scorchMesh.userData.fpsEffect = true; root.add(scorchMesh);

  // --- splashes --------------------------------------------------------------
  // Water throws back spray rather than sparks: see fps-splashes. Two draws:
  // the foam rings lying on the surface, and one billboard pool shared by every
  // droplet in the air and the white column standing over each entry point.
  const splashField = createSplashField();
  const foamRing = paint(ringTexture(64, .78, .12));
  const splashRingMesh = new THREE.InstancedMesh(quad, additive('#ffffff', foamRing), MAX_SPLASHES * 2);
  splashRingMesh.name = 'fps-splash-rings';
  splashRingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); splashRingMesh.frustumCulled = false; splashRingMesh.userData.fpsEffect = true; root.add(splashRingMesh);
  // Normally blended, not additive: white spray has to show against a bright
  // sky as well as against the water, and adding white to sky shows nothing.
  const SPRAY_CAPACITY = MAX_SPLASHES + MAX_DROPLETS;
  const sprayMesh = new THREE.InstancedMesh(quad, hold(new THREE.MeshBasicMaterial({ color: '#ffffff', map: blob, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })), SPRAY_CAPACITY);
  sprayMesh.name = 'fps-spray';
  sprayMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sprayMesh.frustumCulled = false; sprayMesh.userData.fpsEffect = true; root.add(sprayMesh);
  const flat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
  const upright = new THREE.Quaternion(), yawOnly = new THREE.Euler(0, 0, 0, 'YXZ');
  const spray = new THREE.Color('#e9f4f6'), foam = new THREE.Color('#d8eef0');

  const sparkGeometry = keep(new THREE.BufferGeometry());
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 6), 3));
  sparkGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 6), 3));
  sparkGeometry.setDrawRange(0, 0);
  const sparkMesh = new THREE.LineSegments(sparkGeometry, hold(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  sparkMesh.name = 'fps-sparks';
  sparkMesh.frustumCulled = false; sparkMesh.userData.fpsEffect = true; root.add(sparkMesh);

  // --- tracers ------------------------------------------------------------
  const tracerMaterial = hold(new THREE.LineBasicMaterial({ color: '#ffe8b0', transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const beamGeometry = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
  const beam = new THREE.Line(beamGeometry, tracerMaterial); beam.frustumCulled = false; beam.visible = false; beam.userData.fpsEffect = true; root.add(beam);
  const trailGeometry = keep(new THREE.BufferGeometry());
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_ROUNDS_IN_FLIGHT * 6), 3));
  trailGeometry.setDrawRange(0, 0);
  // One batched draw for every round in the air, rather than a line object each.
  const trails = new THREE.LineSegments(trailGeometry, tracerMaterial);
  trails.frustumCulled = false; trails.visible = false; trails.userData.fpsEffect = true; root.add(trails);
  let beamTime = 0;

  const smoke: Smoke[] = [];
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3(), colour = new THREE.Color(), hotSpark = new THREE.Color();
  const axis = new THREE.Vector3(), forward = new THREE.Vector3(0, 0, 1), spin = new THREE.Quaternion();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  [casingMesh, ringMesh, puffMesh, scorchMesh, splashRingMesh, sprayMesh].forEach(mesh => {
    for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, hidden);
    mesh.instanceMatrix.needsUpdate = true;
  });
  [ringMesh, puffMesh, scorchMesh, casingMesh, splashRingMesh, sprayMesh].forEach(mesh => { for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, colour.setRGB(0, 0, 0)); mesh.instanceColor!.needsUpdate = true; });

  /**
   * Paints the parts of the rig that only ever belong to the weapon in hand:
   * the flare, its two lights and the tracer. Everything else is painted per
   * spawn in `update`, from the style that spawn was tagged with.
   */
  function applyStyle(style: EffectStyle) {
    current = style; known.set(style.id, style);
    flashCore.color.set(style.flare.core); flashStar.color.set(style.flare.star); flashCone.color.set(style.flare.cone);
    viewLight.color.set(style.flare.light);
    tracerMaterial.color.set(style.tracer.colour); tracerMaterial.opacity = style.tracer.opacity;
    casingMaterial.metalness = style.brass.metalness; casingMaterial.roughness = style.brass.roughness;
    if (worldLight) { worldLight.color.set(style.flare.light); worldLight.distance = 13 * style.flare.reach; }
  }
  applyStyle(current);

  return {
    root, flare,
    get style() { return current; },
    /** Live counts, surfaced so a browser smoke can assert the effects ran. */
    get counts() { return { casings: casings.length, impacts: field.impacts.length, sparks: field.sparks.length, scorches: field.scorches.length, smoke: smoke.length, splashes: splashField.splashes.length, droplets: splashField.droplets.length }; },
    /** Re-parents the flare when the equipped weapon changes. */
    attachMuzzle(socket?: THREE.Object3D | null) { if (socket) socket.add(flare); else flare.removeFromParent(); },
    /**
     * Declares every look this round can draw in and picks the one in hand.
     * Called once per weapon change; the whole list is passed each time so the
     * styles of weapons not currently held stay resolvable for anything they
     * left lying in the world.
     */
    setStyles(styles: readonly EffectStyle[], active = 0) {
      styles.forEach(style => known.set(style.id, style));
      applyStyle(styles[active] ?? styles[0] ?? current);
    },
    /**
     * One round leaves the barrel: the flare lights, a case leaves the port on
     * the weapon's own axes, and the barrel takes on a little heat.
     */
    fire(shot: { recoil: number; eject?: THREE.Object3D | null; camera: THREE.Camera; carry?: THREE.Vector3 }) {
      igniteMuzzle(muzzle, shot.recoil);
      if (!shot.eject) return;
      // The viewmodel lives in camera space, so the port's world transform there
      // becomes a world one by carrying the camera's own rotation and origin.
      shot.eject.getWorldQuaternion(quaternion).premultiply(shot.camera.quaternion);
      shot.eject.getWorldPosition(position); shot.camera.localToWorld(position);
      right.set(1, 0, 0).applyQuaternion(quaternion); up.set(0, 1, 0).applyQuaternion(quaternion); back.set(0, 0, 1).applyQuaternion(quaternion);
      ejectCasing(casings, position, right, up, back, shot.carry ?? { x: 0, y: 0, z: 0 }, Math.random, current.id);
    },
    /** The streak a hitscan round leaves between the muzzle and where it stopped. */
    beam(from: THREE.Vector3, to: THREE.Vector3) {
      const attribute = beamGeometry.getAttribute('position');
      attribute.setXYZ(0, from.x, from.y, from.z); attribute.setXYZ(1, to.x, to.y, to.z); attribute.needsUpdate = true;
      beamTime = .055;
    },
    /** A short streak behind each round still in the air, so a slow shot reads as travelling. */
    trails(rounds: readonly { position: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number }; travelled: number }[]) {
      const attribute = trailGeometry.getAttribute('position');
      const count = Math.min(rounds.length, MAX_ROUNDS_IN_FLIGHT);
      for (let i = 0; i < count; i++) {
        const round = rounds[i], tail = Math.min(round.travelled, 2.5);
        attribute.setXYZ(i * 2, round.position.x - round.direction.x * tail, round.position.y - round.direction.y * tail, round.position.z - round.direction.z * tail);
        attribute.setXYZ(i * 2 + 1, round.position.x, round.position.y, round.position.z);
      }
      attribute.needsUpdate = true; trailGeometry.setDrawRange(0, count * 2); trails.visible = count > 0;
    },
    /**
     * `style` names the look of the weapon that fired the round, which for one
     * still in the air need not be the weapon now in hand.
     */
    impact(point: THREE.Vector3, normal: THREE.Vector3, kind: ImpactKind = 'surface', energy = 1, style?: string) {
      recordImpact(field, point, normal, kind, energy, Math.random, style ?? current.id);
    },
    /**
     * A round meeting water at `point`, travelling along `direction`. Water
     * leaves no scorch and throws no sparks, whatever the weapon, so a splash
     * carries no style.
     */
    splash(point: THREE.Vector3, direction: THREE.Vector3, energy = 1) {
      recordSplash(splashField, point, direction, energy);
    },
    /**
     * Advances every pool and writes it into the buffers the renderer reads.
     * `groundY` is the floor brass lands on; `camera` billboards the puffs.
     */
    update(dt: number, camera: THREE.Camera, groundY = 0) {
      if (advanceMuzzle(muzzle, dt) && flare.parent) {
        flare.getWorldPosition(position); camera.localToWorld(position);
        if (smoke.length >= MAX_SMOKE) smoke.shift();
        smoke.push({ x: position.x, y: position.y, z: position.z, vy: .22 + Math.random() * .16, drift: Math.random() * Math.PI * 2, age: 0, life: 1.1 + Math.random() * .6 });
      }
      advanceCasings(casings, dt, groundY);
      advanceImpacts(field, dt);
      advanceSplashes(splashField, dt);
      for (let i = smoke.length - 1; i >= 0; i--) {
        const wisp = smoke[i]; wisp.age += Math.max(0, Math.min(dt, .25));
        if (wisp.age >= wisp.life) { smoke.splice(i, 1); continue; }
        wisp.y += wisp.vy * dt; wisp.x += Math.cos(wisp.drift) * .06 * dt; wisp.z += Math.sin(wisp.drift) * .06 * dt;
      }
      beamTime = Math.max(0, beamTime - dt); beam.visible = beamTime > 0;

      const shape = muzzleShape(muzzle);
      flare.visible = shape.live;
      if (shape.live) {
        const size = current.flare.size;
        flare.rotation.z = shape.roll;
        core.scale.set(shape.core * size, shape.core * size, shape.core * 2.6 * size);
        star.scale.setScalar((.10 + shape.core * .26) * size);
        petals.forEach((petal, i) => petal.scale.set((.16 + shape.petal * (i === 2 ? .34 : .52)) * size, size, 1));
        cone.scale.set(shape.core * size, (shape.petal * 1.2 + .2) * size, shape.core * size);
        flashCore.opacity = Math.min(1, shape.core); flashStar.opacity = Math.min(1, shape.glow * .9); flashCone.opacity = Math.min(1, shape.glow * .7);
        flare.getWorldPosition(position);
        viewLight.position.copy(position); viewLight.intensity = shape.light * 5.5 * current.flare.reach;
        if (worldLight) { camera.localToWorld(position); worldLight.position.copy(position); worldLight.intensity = shape.light * 26 * current.flare.reach; }
      } else {
        viewLight.intensity = 0; if (worldLight) worldLight.intensity = 0;
      }

      for (let i = 0; i < MAX_CASINGS; i++) {
        const casing = casings[i];
        if (!casing) { casingMesh.setMatrixAt(i, hidden); continue; }
        const fade = casingFade(casing);
        quaternion.setFromAxisAngle(axis.set(casing.ax, casing.ay, casing.az), casing.angle);
        casingMesh.setColorAt(i, colour.set(styleOf(casing.style).brass.colour));
        casingMesh.setMatrixAt(i, matrix.compose(position.set(casing.x, casing.y, casing.z), quaternion, scale.setScalar(fade)));
      }
      casingMesh.instanceMatrix.needsUpdate = true; casingMesh.instanceColor!.needsUpdate = true;

      for (let i = 0; i < MAX_IMPACTS; i++) {
        const impact = field.impacts[i];
        if (!impact) { ringMesh.setMatrixAt(i, hidden); continue; }
        const ring = impactRing(impact);
        quaternion.setFromUnitVectors(forward, axis.set(impact.nx, impact.ny, impact.nz));
        // Lifted off the surface by a hair, or it z-fights the wall it marks.
        ringMesh.setMatrixAt(i, matrix.compose(
          position.set(impact.x + impact.nx * .008, impact.y + impact.ny * .008, impact.z + impact.nz * .008),
          quaternion, scale.set(ring.scale, ring.scale, 1)));
        const ringStyle = styleOf(impact.style).ring;
        ringMesh.setColorAt(i, colour.set(impact.kind === 'target' ? ringStyle.target : ringStyle.surface).multiplyScalar(Math.min(1, ring.brightness)));
      }
      ringMesh.instanceMatrix.needsUpdate = true; ringMesh.instanceColor!.needsUpdate = true;

      camera.getWorldQuaternion(quaternion);
      for (let i = 0; i < PUFF_CAPACITY; i++) {
        const impact = i < MAX_IMPACTS ? field.impacts[i] : undefined;
        const wisp = i >= MAX_IMPACTS ? smoke[i - MAX_IMPACTS] : undefined;
        if (impact) {
          const dust = impactDust(impact), dustStyle = styleOf(impact.style);
          const spread = dust.scale * dustStyle.dustScale;
          puffMesh.setColorAt(i, colour.set(dustStyle.dust).multiplyScalar(Math.max(0, Math.min(1, dust.brightness))));
          puffMesh.setMatrixAt(i, spread > 0 ? matrix.compose(
            position.set(impact.x + impact.nx * dust.rise, impact.y + impact.ny * dust.rise + dust.rise * .35, impact.z + impact.nz * dust.rise),
            quaternion, scale.set(spread, spread, 1)) : hidden);
        } else if (wisp) {
          const t = wisp.age / wisp.life, size = .06 + t * .3;
          puffMesh.setColorAt(i, colour.set(current.smoke).multiplyScalar(Math.max(0, .34 * Math.min(1, t / .15) * Math.pow(1 - t, 1.4))));
          puffMesh.setMatrixAt(i, matrix.compose(position.set(wisp.x, wisp.y, wisp.z), quaternion, scale.set(size, size, 1)));
        } else { puffMesh.setColorAt(i, colour.setScalar(0)); puffMesh.setMatrixAt(i, hidden); }
      }
      puffMesh.instanceMatrix.needsUpdate = true; puffMesh.instanceColor!.needsUpdate = true;

      for (let i = 0; i < MAX_SCORCHES; i++) {
        const scorch = field.scorches[i];
        if (!scorch) { scorchMesh.setColorAt(i, colour.setScalar(0)); scorchMesh.setMatrixAt(i, hidden); continue; }
        quaternion.setFromUnitVectors(forward, axis.set(scorch.nx, scorch.ny, scorch.nz));
        quaternion.multiply(spin.setFromAxisAngle(forward, scorch.spin));
        // Grey: how much of the surface's own colour this mark takes away.
        scorchMesh.setColorAt(i, colour.setScalar(scorchAlpha(scorch) * styleOf(scorch.style).scorch));
        scorchMesh.setMatrixAt(i, matrix.compose(
          position.set(scorch.x + scorch.nx * .006, scorch.y + scorch.ny * .006, scorch.z + scorch.nz * .006),
          quaternion, scale.set(scorch.radius * 2, scorch.radius * 2, 1)));
      }
      scorchMesh.instanceMatrix.needsUpdate = true; scorchMesh.instanceColor!.needsUpdate = true;

      for (let i = 0; i < MAX_SPLASHES; i++) {
        const splash = splashField.splashes[i];
        if (!splash) { splashRingMesh.setMatrixAt(i * 2, hidden); splashRingMesh.setMatrixAt(i * 2 + 1, hidden); continue; }
        splashRings(splash).forEach((ring, j) => {
          quaternion.copy(flat).multiply(spin.setFromAxisAngle(forward, splash.spin + j));
          // A couple of millimetres proud of the water, or the two z-fight.
          splashRingMesh.setMatrixAt(i * 2 + j, ring.brightness > 0 ? matrix.compose(position.set(splash.x, splash.y + .006, splash.z), quaternion, scale.set(ring.radius * 2, ring.radius * 2, 1)) : hidden);
          splashRingMesh.setColorAt(i * 2 + j, colour.copy(foam).multiplyScalar(ring.brightness * .8));
        });
      }
      splashRingMesh.instanceMatrix.needsUpdate = true; splashRingMesh.instanceColor!.needsUpdate = true;

      // The column turns only about the vertical, as a real one would look from
      // anywhere around it; droplets face the camera outright.
      camera.getWorldQuaternion(quaternion);
      upright.setFromEuler(yawOnly.setFromQuaternion(quaternion, 'YXZ').set(0, yawOnly.y, 0, 'YXZ'));
      for (let i = 0; i < SPRAY_CAPACITY; i++) {
        const splash = i < MAX_SPLASHES ? splashField.splashes[i] : undefined;
        const drop = i >= MAX_SPLASHES ? splashField.droplets[i - MAX_SPLASHES] : undefined;
        if (splash) {
          const column = splashColumn(splash);
          if (column.brightness <= .01) { sprayMesh.setMatrixAt(i, hidden); continue; }
          sprayMesh.setColorAt(i, spray);
          sprayMesh.setMatrixAt(i, matrix.compose(position.set(splash.x, splash.y + column.height * .45, splash.z), upright,
            scale.set(column.width * (.35 + .65 * column.brightness), column.height, 1)));
        } else if (drop) {
          const size = dropletScale(drop);
          sprayMesh.setColorAt(i, spray);
          sprayMesh.setMatrixAt(i, matrix.compose(position.set(drop.x, drop.y, drop.z), quaternion, scale.set(size, size, 1)));
        } else sprayMesh.setMatrixAt(i, hidden);
      }
      sprayMesh.instanceMatrix.needsUpdate = true; sprayMesh.instanceColor!.needsUpdate = true;

      const sparkPosition = sparkGeometry.getAttribute('position'), sparkColour = sparkGeometry.getAttribute('color');
      field.sparks.forEach((spark, i) => {
        const sparkStyle = styleOf(spark.style).spark;
        const heat = sparkHeat(spark), streak = sparkStreak(spark) * sparkStyle.streak, speed = Math.max(1e-6, Math.hypot(spark.vx, spark.vy, spark.vz));
        sparkPosition.setXYZ(i * 2, spark.x, spark.y, spark.z);
        sparkPosition.setXYZ(i * 2 + 1, spark.x - spark.vx / speed * streak, spark.y - spark.vy / speed * streak, spark.z - spark.vz / speed * streak);
        colour.set(sparkStyle.cold).lerp(hotSpark.set(sparkStyle.hot), heat).multiplyScalar(Math.pow(heat, 1.4));
        sparkColour.setXYZ(i * 2, colour.r, colour.g, colour.b);
        // The tail is dimmer than the head, which is what makes it read as motion.
        sparkColour.setXYZ(i * 2 + 1, colour.r * .15, colour.g * .15, colour.b * .15);
      });
      sparkPosition.needsUpdate = true; sparkColour.needsUpdate = true;
      sparkGeometry.setDrawRange(0, field.sparks.length * 2);
      sparkMesh.visible = field.sparks.length > 0;
    },
    reset() {
      casings.length = 0; smoke.length = 0; clearImpactField(field); clearSplashField(splashField); resetMuzzle(muzzle);
      beamTime = 0; beam.visible = trails.visible = flare.visible = sparkMesh.visible = false;
      viewLight.intensity = 0; if (worldLight) worldLight.intensity = 0;
      trailGeometry.setDrawRange(0, 0); sparkGeometry.setDrawRange(0, 0);
      [casingMesh, ringMesh, puffMesh, scorchMesh, splashRingMesh, sprayMesh].forEach(mesh => {
        for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, hidden);
        mesh.instanceMatrix.needsUpdate = true;
      });
      [ringMesh, puffMesh, scorchMesh, casingMesh, splashRingMesh, sprayMesh].forEach(mesh => {
        for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, colour.setScalar(0));
        mesh.instanceColor!.needsUpdate = true;
      });
    },
    dispose() {
      flare.removeFromParent(); viewLight.removeFromParent(); root.removeFromParent();
      [casingMesh, ringMesh, puffMesh, scorchMesh, splashRingMesh, sprayMesh].forEach(mesh => mesh.dispose());
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    },
  };
}
export type FpsEffects = ReturnType<typeof createFpsEffects>;
