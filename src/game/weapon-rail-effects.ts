import * as THREE from 'three';

/**
 * What a rail device puts into the world: the laser's beam and the dot where it
 * lands, and the torch's cone. The viewmodel only carries the housings (see
 * `weapon-accessory-models`); these live in the world scene, flagged as
 * effects so no gameplay ray ever meets them.
 *
 * The torch and the laser's spill are each created only for a loadout that
 * carries one, and are switched by intensity rather than added and removed,
 * because a change in the number of lights recompiles every lit material in the
 * scene.
 */
export interface RailEffectsFrame {
  /** Beam from the emitter to where it lands, both in world space; `hit` puts a dot there. */
  laser?: { from: THREE.Vector3; to: THREE.Vector3; hit: boolean };
  /** The torch's lens and the direction it points, in world space. */
  light?: { from: THREE.Vector3; direction: THREE.Vector3 };
  /** The camera, which the dot is turned to face and sized against. */
  camera: THREE.Camera;
  /** 0 by day to 1 at night: a torch barely shows in daylight, so it is mostly a night tool. */
  dark?: number;
  /** Intensifier response; thermal and bare-eye views retain the visible red laser. */
  nightVision?: boolean;
}

/**
 * Where a rail device on the weapon in hand points, in world space. The
 * emitter looks down the bore (−Z) and the viewmodel is posed in camera space,
 * so its direction there goes through the camera. A gun at rest lies along the
 * eye line and gives the camera's own forward; a gun turned by a reload, an
 * inspection, a sprint or recoil turns the beam with it.
 */
export function railDeviceAim(emitter: THREE.Object3D, camera: THREE.Object3D, into: THREE.Vector3) {
  return into.set(0, 0, -1).transformDirection(emitter.matrixWorld).transformDirection(camera.matrixWorld);
}

/**
 * Candela of red light a laser's spot throws back onto what is around it. A
 * laser dot is a small, very bright patch of wall, and in the dark that patch
 * is a lamp: it reddens the surface around it and whatever stands close by.
 * By day it is lost in sunlight, so it follows `dark` (0 by day, 1 at night)
 * and is nothing until dusk; an intensifier makes much more of the same light.
 */
export function laserSpill(dark: number, nightVision = false) {
  const night = Math.max(0, Math.min(1, dark));
  return night * night * (nightVision ? .7 : .35);
}

/** How far a laser's spot lifts off the surface to light it, and how far that light carries, in metres. */
const SPILL_STANDOFF = .7, SPILL_REACH = 7;

/**
 * A laser spot as it looks on a real surface: a hot centre in a ragged red
 * patch broken into speckle, the grain coherent light makes on anything rough,
 * with a few faint spikes and a wide dim glow around it. Returns alpha-weighted
 * RGBA for a `size` × `size` sprite. Seeded, so it is the same spot every run.
 */
export function laserSpotPixels(size: number, nightVision: boolean) {
  const data = new Uint8ClampedArray(size * size * 4);
  let seed = 0x2f6e2b1;
  const random = () => { seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9 | 0; return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296; };
  // Speckle a few texels across: a coarse random grid, read back smoothly.
  const cells = Math.ceil(size / 3) + 2, grain = Float32Array.from({ length: cells * cells }, random);
  const speckle = (x: number, y: number) => {
    const u = x / 3, v = y / 3, i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j;
    const at = (di: number, dj: number) => grain[(j + dj) * cells + i + di];
    return (at(0, 0) * (1 - a) + at(1, 0) * a) * (1 - b) + (at(0, 1) * (1 - a) + at(1, 1) * a) * b;
  };
  // The edge of the patch wanders, and a handful of spikes run out of it.
  const lobes = Array.from({ length: 5 }, (_, k) => ({ phase: random() * Math.PI * 2, gain: .1 / (k + 1) }));
  const spikes = Array.from({ length: 6 }, () => ({ angle: random() * Math.PI, gain: .35 + random() * .65 }));
  const half = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + .5 - half) / half, dy = (y + .5 - half) / half, angle = Math.atan2(dy, dx);
    let wobble = 1; lobes.forEach((lobe, k) => { wobble += lobe.gain * Math.sin(angle * (k + 2) + lobe.phase); });
    const r = Math.hypot(dx, dy) / wobble;
    const core = Math.exp(-(r * r) / .01), patch = Math.exp(-(r * r) / .045), glow = Math.exp(-(r * r) / .2);
    let spike = 0;
    for (const s of spikes) { const off = Math.abs(Math.sin(angle - s.angle)) * r; spike = Math.max(spike, s.gain * Math.exp(-(off * off) / .0006) * Math.exp(-r / .28)); }
    const grainHere = speckle(x, y);
    const body = patch * (.1 + 2.6 * grainHere * grainHere * grainHere) + spike * .5 * (.3 + grainHere);
    // Faded to nothing at the rim, so the square of the sprite never shows.
    const rim = Math.max(0, 1 - Math.hypot(dx, dy)), fade = Math.min(1, rim * 4);
    const alpha = Math.min(1, core + body * .8 + glow * .1) * fade, heat = Math.min(1, core + body * .25);
    const o = (y * size + x) * 4;
    if (nightVision) { const grey = 190 + 65 * heat; data[o] = data[o + 1] = data[o + 2] = grey; }
    // Saturated through the middle, so it still reads red on a sunlit wall rather than washing to pink.
    else { data[o] = 255; data[o + 1] = 14 + 96 * heat * heat; data[o + 2] = 8 + 72 * heat * heat; }
    data[o + 3] = alpha * 255;
  }
  return data;
}

/** Texels across the spot's sprite, and how much wider the sprite is than the old plain disc for the same hot centre. */
const DOT_TEXELS = 96, DOT_SPREAD = 2.2;

export function createRailEffects(world: THREE.Scene, withLight: boolean, withLaser = false) {
  const root = new THREE.Group(); root.name = 'fps-rail-effects'; root.userData.fpsEffect = true; world.add(root);
  // A thin open tube from z 0 to −1, scaled out to the beam's length.
  const beamGeometry = new THREE.CylinderGeometry(.0015, .0015, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, -.5);
  const beamMaterial = new THREE.MeshBasicMaterial({ color: '#ff2a18', transparent: true, opacity: .28, blending: THREE.AdditiveBlending, depthWrite: false, forceSinglePass: true });
  const beam = new THREE.Mesh(beamGeometry, beamMaterial); beam.name = 'fps-laser-beam'; beam.frustumCulled = false; beam.visible = false; root.add(beam);
  // The dot: a speckled red spot with a hot centre, always facing the eye.
  function makeDotTexture(nightVision: boolean) {
    const texture = new THREE.DataTexture(laserSpotPixels(DOT_TEXELS, nightVision), DOT_TEXELS, DOT_TEXELS, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true;
    return texture;
  }
  const dotTexture = makeDotTexture(false), nvgDotTexture = makeDotTexture(true);
  const dotMaterial = new THREE.SpriteMaterial({ map: dotTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const dot = new THREE.Sprite(dotMaterial); dot.name = 'fps-laser-dot'; dot.visible = false; root.add(dot);
  const torch = withLight ? new THREE.SpotLight('#fff1dc', 0, 70, .34, .55, 1.4) : null;
  if (torch) { torch.name = 'fps-weapon-light'; root.add(torch); root.add(torch.target); }
  // The red the spot throws back at night. No shadows: it is far too faint to need them.
  const spill = withLaser ? new THREE.PointLight('#ff2a18', 0, SPILL_REACH, 2) : null;
  if (spill) { spill.name = 'fps-laser-spill'; root.add(spill); }
  const toward = new THREE.Vector3(), cameraPosition = new THREE.Vector3();
  return {
    /** Draws one frame; anything left out of `frame` is switched off. */
    update(frame: RailEffectsFrame) {
      const laser = frame.laser, dark = Math.max(0, Math.min(1, frame.dark ?? 1));
      // Stronger tube response at the same hit point and angular size. Let the
      // device post pass supply phosphor colour and tier-dependent lamp bloom.
      dotMaterial.map = frame.nightVision ? nvgDotTexture : dotTexture;
      beamMaterial.color.set(frame.nightVision ? '#a8a8a8' : '#ff2a18');
      beamMaterial.opacity = frame.nightVision ? .18 : .28;
      beam.visible = !!laser; dot.visible = !!laser?.hit;
      if (laser) {
        const length = laser.from.distanceTo(laser.to);
        beam.position.copy(laser.from); beam.lookAt(toward.copy(laser.from).multiplyScalar(2).sub(laser.to)); beam.scale.set(1, 1, length);
        if (laser.hit) {
          // Pulled a little towards the eye so it sits on the surface rather than in it.
          frame.camera.getWorldPosition(cameraPosition);
          const range = laser.to.distanceTo(cameraPosition);
          dot.position.copy(laser.to).lerp(cameraPosition, Math.min(.5, .03 / Math.max(range, .01)));
          // A few pixels across however far it lands, the glow around a much smaller hot centre.
          // The dark-adapted eye sees more of the glow, so the spot swells a little at night.
          dot.scale.setScalar(Math.max(.05, range * .014) * DOT_SPREAD * (1 + .35 * dark));
          // Speckle is an interference pattern: it crawls whenever the spot or the eye moves, and holds still when they do.
          dotMaterial.rotation = (laser.to.x + laser.to.y + laser.to.z + cameraPosition.x + cameraPosition.z) * 9;
        }
      }
      if (spill) {
        spill.intensity = laser?.hit ? laserSpill(dark, frame.nightVision) : 0;
        // Stood off the surface towards the gun, so it lights the wall around the spot rather than one point of it.
        if (laser?.hit) spill.position.copy(laser.to).add(toward.copy(laser.from).sub(laser.to).setLength(Math.min(SPILL_STANDOFF, laser.from.distanceTo(laser.to) * .5)));
      }
      if (!torch) return;
      torch.intensity = frame.light ? 90 * (.1 + .9 * dark * dark) : 0;
      if (frame.light) {
        torch.position.copy(frame.light.from);
        torch.target.position.copy(frame.light.from).addScaledVector(frame.light.direction, 10);
      }
    },
    dispose() {
      root.removeFromParent(); beamGeometry.dispose(); beamMaterial.dispose(); dotTexture.dispose(); nvgDotTexture.dispose(); dotMaterial.dispose(); torch?.dispose(); spill?.dispose();
    },
  };
}
