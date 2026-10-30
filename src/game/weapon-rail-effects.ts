import * as THREE from 'three';

/**
 * What a rail device puts into the world: the laser's beam and the dot where it
 * lands, and the torch's cone. The viewmodel only carries the housings (see
 * `weapon-accessory-models`); these live in the world scene, flagged as
 * effects so no gameplay ray ever meets them.
 *
 * The torch is created only for a loadout that carries one, and is switched by
 * intensity rather than added and removed, because a change in the number of
 * lights recompiles every lit material in the scene.
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

export function createRailEffects(world: THREE.Scene, withLight: boolean) {
  const root = new THREE.Group(); root.name = 'fps-rail-effects'; root.userData.fpsEffect = true; world.add(root);
  // A thin open tube from z 0 to −1, scaled out to the beam's length.
  const beamGeometry = new THREE.CylinderGeometry(.0015, .0015, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, -.5);
  const beamMaterial = new THREE.MeshBasicMaterial({ color: '#ff2a18', transparent: true, opacity: .28, blending: THREE.AdditiveBlending, depthWrite: false, forceSinglePass: true });
  const beam = new THREE.Mesh(beamGeometry, beamMaterial); beam.name = 'fps-laser-beam'; beam.frustumCulled = false; beam.visible = false; root.add(beam);
  // The dot: a soft red disc with a hot centre, always facing the eye.
  function makeDotTexture(nightVision: boolean) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context) {
      const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
      // Saturated through the middle, so it still reads red on a sunlit wall rather than washing to orange.
      glow.addColorStop(0, nightVision ? 'rgba(255,255,255,1)' : 'rgba(255,120,100,1)');
      glow.addColorStop(.22, nightVision ? 'rgba(240,240,240,1)' : 'rgba(255,20,10,1)');
      glow.addColorStop(.5, nightVision ? 'rgba(200,200,200,.4)' : 'rgba(230,0,0,.4)');
      glow.addColorStop(1, nightVision ? 'rgba(160,160,160,0)' : 'rgba(200,0,0,0)');
      context.fillStyle = glow; context.fillRect(0, 0, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const dotTexture = makeDotTexture(false), nvgDotTexture = makeDotTexture(true);
  const dotMaterial = new THREE.SpriteMaterial({ map: dotTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const dot = new THREE.Sprite(dotMaterial); dot.name = 'fps-laser-dot'; dot.visible = false; root.add(dot);
  const torch = withLight ? new THREE.SpotLight('#fff1dc', 0, 70, .34, .55, 1.4) : null;
  if (torch) { torch.name = 'fps-weapon-light'; root.add(torch); root.add(torch.target); }
  const toward = new THREE.Vector3(), cameraPosition = new THREE.Vector3();
  return {
    /** Draws one frame; anything left out of `frame` is switched off. */
    update(frame: RailEffectsFrame) {
      const laser = frame.laser;
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
          dot.scale.setScalar(Math.max(.05, range * .014));
        }
      }
      if (!torch) return;
      const dark = Math.max(0, Math.min(1, frame.dark ?? 1));
      torch.intensity = frame.light ? 90 * (.1 + .9 * dark * dark) : 0;
      if (frame.light) {
        torch.position.copy(frame.light.from);
        torch.target.position.copy(frame.light.from).addScaledVector(frame.light.direction, 10);
      }
    },
    dispose() {
      root.removeFromParent(); beamGeometry.dispose(); beamMaterial.dispose(); dotTexture.dispose(); nvgDotTexture.dispose(); dotMaterial.dispose(); torch?.dispose();
    },
  };
}
