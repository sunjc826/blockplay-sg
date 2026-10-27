import * as THREE from 'three';
import type { WeaponSpec } from './fps-rules';
import { opticMagnification } from './fps-rules';
import { buildReflexHousing } from './weapon-reflex';
import { buildSightHousing } from './weapon-sight-housings';
import { createOpticGlass, type OpticGlass } from './weapon-glass';
import { enemyOptic } from './enemy-weapon-layout';
import { scopeReticleFor, scopeReticleGlsl, type ScopeReticle } from './scope-reticles';

export interface WeaponSight {
  aimHeight: number; aimDepth: number; radius: number; magnification: number;
  visibility: { value: number };
  lens: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  reflection?: OpticGlass;
  /** The etched pattern, for magnified sights only. */
  reticle?: ScopeReticle;
  /** How far the lens sits off the bore line sideways, and the roll that stands it upright: both 0 but for an offset dot. */
  aimX: number; roll: number;
  /** A 1x dot at 45° beside a magnified sight, brought to the eye by canting the weapon over. */
  offset?: WeaponSight;
}
const sights = new WeakMap<THREE.Object3D, WeaponSight>();
/** The holographic ring's angular radius in the viewmodel's view: 65 MOA across in the world. */
const HOLO_RING = '0.0076';
export const getWeaponSight = (root: THREE.Object3D) => sights.get(root);

/**
 * One lens: a live scope picture with its etching when magnified, otherwise a
 * collimated dot (with a holographic ring when `ring`) and its bloom.
 */
function createLens(magnification: number, radius: number, reticle: ScopeReticle | undefined, ring: boolean) {
  const magnified = magnification > 1.01;
  const visibility = { value: magnified ? 0 : 1 };
  const lensMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', side: magnified ? THREE.DoubleSide : THREE.FrontSide, forceSinglePass: true, transparent: true, depthWrite: false });
  lensMaterial.toneMapped = magnified;
  // The etched scope uses lens UVs; the reflex uses a collimated ray. Both are
  // clipped by the recessed aperture and occluded by the physical housing.
  lensMaterial.onBeforeCompile = shader => {
    shader.uniforms.sightVisibility = visibility;
    shader.uniforms.sightBloom = { value: 0 };
    shader.uniforms.sightRadius = { value: radius };
    shader.vertexShader = 'varying vec2 sightUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n sightUv = uv;');
    if (!magnified) {
      shader.vertexShader = 'varying vec3 sightRay;\nvarying vec3 sightCentre;\nvarying float sightWindow;\nuniform float sightRadius;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        #include <project_vertex>
        // Express the eye-to-lens ray in the optic's basis. A collimated dot
        // follows the eye across the aperture instead of sticking to its UVs.
        sightRay = vec3(dot(mvPosition.xyz, modelViewMatrix[0].xyz),
                        dot(mvPosition.xyz, modelViewMatrix[1].xyz),
                        dot(mvPosition.xyz, modelViewMatrix[2].xyz));
        // The same for the lens centre, and the window's angular radius. Both
        // carry the model scale squared, which cancels in every ratio below.
        vec3 centreView = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        sightCentre = vec3(dot(centreView, modelViewMatrix[0].xyz),
                           dot(centreView, modelViewMatrix[1].xyz),
                           dot(centreView, modelViewMatrix[2].xyz));
        sightWindow = sightRadius * dot(modelViewMatrix[0].xyz, modelViewMatrix[0].xyz) / max(abs(sightCentre.z), 1e-5);
      `);
      shader.fragmentShader = 'varying vec3 sightRay;\nvarying vec3 sightCentre;\nvarying float sightWindow;\n' + shader.fragmentShader;
    }
    if (reticle) shader.fragmentShader = scopeReticleGlsl(reticle) + shader.fragmentShader;
    shader.fragmentShader = 'varying vec2 sightUv;\nuniform float sightVisibility;\nuniform float sightBloom;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      vec2 p = sightUv - 0.5;
      float r = length(p);
      float aa = max(fwidth(p.x), fwidth(p.y));
      ${magnified ? `
      // Approximate curved glass at the periphery by resampling the existing
      // scope image. Keep the central aiming area undistorted.
      float bend = smoothstep(0.24, 0.49, r);
      vec2 glassUv = clamp(sightUv - p * bend * 0.075, vec2(0.002), vec2(0.998));
      #ifdef USE_MAP
        diffuseColor.rgb = texture2D(map, glassUv).rgb;
        // A restrained chromatic fringe makes the curved edge read as glass.
        diffuseColor.r = texture2D(map, clamp(glassUv + p * bend * 0.008, vec2(0.002), vec2(0.998))).r;
        diffuseColor.b = texture2D(map, clamp(glassUv - p * bend * 0.008, vec2(0.002), vec2(0.998))).b;
      #endif
      // Restrained blue-green transmission tint; keep the centre nearly neutral.
      diffuseColor.rgb *= mix(vec3(0.96, 0.99, 1.0), vec3(0.80, 0.93, 0.97), bend * 0.55);
      // The etching sits on a glass plate, so the periphery bend leaves it alone.
      float line = scopeReticle(p, aa) * (1.0 - smoothstep(0.47, 0.49, r));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.035, 0.028), line);
      // Soft eye-box shadow grows while the eye is coming into alignment.
      float edge = smoothstep(mix(0.12, 0.39, sightVisibility), 0.5, r);
      diffuseColor.rgb *= 1.0 - edge * 0.9;
      diffuseColor.a = sightVisibility;
      ` : `
      // A strictly collimated dot only exists once the optic's axis falls inside
      // the window, which during the raise is the last instant: it would pop in.
      // While the eye is still off-axis, hold the dot inside the glass on the
      // side nearest the axis, and let it brighten as the window comes square.
      // The more oblique the eye, the more of that side the tube's rear lip
      // hides, so the pin draws inward with the angle. Within three quarters
      // of the window the dot is collimated, so the settled picture is unchanged.
      vec2 windowCentre = sightCentre.xy / max(abs(sightCentre.z), 0.001);
      float offAxis = length(windowCentre);
      float pinned = sightWindow * clamp(0.92 - offAxis * 1.1, 0.2, 0.75);
      vec2 dotAt = offAxis > pinned ? windowCentre * (1.0 - pinned / offAxis) : vec2(0.0);
      float rise = 1.0 - smoothstep(sightWindow * 1.0, sightWindow * 4.4, offAxis);
      vec2 angularPosition = sightRay.xy / max(abs(sightRay.z), 0.001) - dotAt;
      float angle = length(angularPosition);
      float angularAA = max(fwidth(angle), 0.00015);
      ${ring ? `
      // A holographic sight's 1 MOA dot inside a 65 MOA ring. The viewmodel is
      // drawn at 54 degrees and the world at 65, so these view angles are 0.8 of
      // the world's: the ring spans 65 MOA of the scene. A 1 MOA dot is smaller
      // than a pixel, so the dot is held to about two and the ring's line to one.
      float dotRadius = max(0.00045, angularAA * 0.5);
      float core = 1.0 - smoothstep(dotRadius, dotRadius + angularAA, angle);
      float ringLine = max(0.00018, angularAA * 0.35);
      core = max(core, (1.0 - smoothstep(ringLine, ringLine + angularAA, abs(angle - ${HOLO_RING}))) * 0.9);
      ` : 'float core = 1.0 - smoothstep(0.0022, 0.0022 + angularAA, angle);'}
      float aperture = 1.0 - smoothstep(0.46, 0.5, r);
      if (sightBloom > 0.5) {
        // Add light around the emitter without replacing the scene behind it.
        // Both halo scales are angular, so they stay steady as the eye moves.
        ${ring ? `
        // A laser hologram is crisp: a faint haze hugging the dot and the ring,
        // and none of an LED dot's broad glow or streak.
        float halo = exp(-angle * angle / 0.000003) * 0.22 + exp(-pow(angle - ${HOLO_RING}, 2.0) / 0.0000005) * 0.06;
        float bloom = exp(-angle * angle / 0.00003) * 0.025;
        float flare = 0.0;
        ` : `
        float halo = exp(-angle * angle / 0.000055) * 0.30;
        float bloom = exp(-angle * angle / 0.00024) * 0.065;
        vec2 streak = angularPosition / vec2(0.014, 0.0009);
        float flare = exp(-dot(streak, streak)) * 0.045;
        `}
        diffuseColor.rgb = vec3(1.0, 0.025, 0.008);
        diffuseColor.a = (halo + bloom + flare) * aperture * sightVisibility * rise;
      } else {
        // A tiny warm centre gives the emitter depth while retaining the
        // original crisp aiming diameter. The bloom is a separate light layer.
        float hotCentre = exp(-angle * angle / ${ring ? '0.0000001' : '0.0000015'});
        diffuseColor.rgb = mix(vec3(1.0, 0.025, 0.008), vec3(1.0, 0.55, 0.28), hotCentre);
        diffuseColor.a = core * aperture * sightVisibility * rise;
      }
      `}
    `);
  };
  lensMaterial.customProgramCacheKey = () => magnified ? `scope-reticle-v4-${reticle}` : `reflex-reticle-v5${ring ? '-holo-v2' : ''}`;
  const lensGeometry = new THREE.CircleGeometry(radius, 48);
  const lens = new THREE.Mesh(lensGeometry, lensMaterial); lens.name = 'fps-scope-lens';
  lens.visible = !magnified; lens.renderOrder = 2;
  let bloomMaterial: THREE.MeshBasicMaterial | undefined;
  if (!magnified) {
    bloomMaterial = lensMaterial.clone();
    bloomMaterial.blending = THREE.AdditiveBlending;
    bloomMaterial.onBeforeCompile = (shader, renderer) => {
      lensMaterial.onBeforeCompile(shader, renderer);
      shader.uniforms.sightBloom.value = 1;
    };
    bloomMaterial.customProgramCacheKey = () => `reflex-bloom-v2${ring ? '-holo-v2' : ''}`;
    const bloom = new THREE.Mesh(lensGeometry, bloomMaterial);
    bloom.name = 'fps-reflex-bloom'; bloom.renderOrder = 2;
    lens.renderOrder = 3;
    // Parenting shares the lens's visibility, clipping, and eye alignment.
    lens.add(bloom);
  }
  return { lens, visibility, dispose() { lensGeometry.dispose(); lensMaterial.dispose(); bloomMaterial?.dispose(); } };
}

/** Shared by the shop and the FPS: one housing per optic slot. */
export function fitWeaponOptic(root: THREE.Object3D, weapon: WeaponSpec) {
  // Enemy-issue platforms carry their sight in the model itself; the config
  // `applyEnemyWeaponConfig` chose decides which one, and only its glass and
  // reticle are fitted here.
  const built = enemyOptic(weapon.id, root.userData.enemyConfig);
  // A variant's own sight (weapon-accessories) brings its housing with it.
  const fitted = built ? undefined : weapon.accessories?.sight;
  if (weapon.optic === 'iron' && !built && !fitted) return () => {};
  const sar = weapon.id === 'sar21-inspired', integrated = built ? built.kind === 'scope' : !fitted && sar && weapon.optic !== 'reflex';
  const original = root.getObjectByName('sar21-inspired__optic');
  const wasVisible = original?.visible ?? true;
  if (original) original.visible = integrated;
  // A red dot is a red dot whatever field of view the variant asks for.
  const magnification = built?.kind === 'reflex' ? 1 : opticMagnification(weapon);
  const magnified = magnification > 1.01;
  const reticle = magnified ? scopeReticleFor(weapon, built) : undefined;
  const group = new THREE.Group(); group.name = 'equipped-optic'; root.add(group);
  const mount = fitted ? buildSightHousing(group, weapon.id, fitted, !!weapon.accessories?.offsetDot) : undefined;
  // A sight on a machine gun's feed cover rides it: offset by the cover's rest
  // position, the group keeps the model's space while the cover is shut.
  const carrier = mount?.carrier ? root.getObjectByName(mount.carrier) : undefined;
  if (carrier) { carrier.add(group); group.position.copy(carrier.position).negate(); }
  const folded: THREE.Object3D[] = [];
  root.traverse(node => { if (mount?.folds.includes(node.name) && node.visible) folded.push(node); });
  folded.forEach(node => { node.visible = false; });
  const aimHeight = mount?.main.y ?? built?.height ?? (integrated ? .328 : sar ? .343 : .350);
  const rearZ = integrated ? .194 : sar ? .12 : .15;
  const radius = mount?.main.radius ?? built?.radius ?? (integrated ? .0235 : .042);
  let housing: ReturnType<typeof buildReflexHousing> | undefined;
  let scopeGlass: ReturnType<typeof createOpticGlass> | undefined;
  if (mount) {
    group.name = `fps-${fitted}-optic`;
    scopeGlass = createOpticGlass(radius, magnified ? .0014 : .005, magnified ? 'scope' : 'reflex', reticle, mount.main.window);
    scopeGlass.reflection.surface.position.set(0, aimHeight, mount.main.glassZ);
    group.add(scopeGlass.reflection.surface);
  } else if (built) {
    group.name = integrated ? 'fps-integrated-optic' : 'fps-reflex-optic';
    // A scope's coating sits on the eye side of its picture; a reflex's
    // mirror sits just beyond the dot, as on the receiver-mounted housing.
    scopeGlass = createOpticGlass(radius, integrated ? .0014 : .005, integrated ? 'scope' : 'reflex', reticle);
    scopeGlass.reflection.surface.position.set(0, aimHeight, built.lens + (integrated ? .0005 : -.003));
    group.add(scopeGlass.reflection.surface);
  } else if (!integrated) {
    group.name = weapon.optic === 'precision' ? 'fps-precision-optic' : 'fps-reflex-optic';
    housing = buildReflexHousing(group, aimHeight, rearZ, sar);
  } else {
    // The original SAR housing includes opaque lens faces. Seat the coating
    // just ahead of the rear face, and composite it over the live scope image.
    scopeGlass = createOpticGlass(radius, .0014, 'scope', reticle);
    scopeGlass.reflection.surface.position.set(0, aimHeight, rearZ + .0015);
    group.add(scopeGlass.reflection.surface);
  }
  const main = createLens(magnification, radius, reticle, fitted === 'holo');
  main.lens.position.set(0, aimHeight, mount?.main.lensZ ?? built?.lens ?? (integrated ? rearZ + .001 : rearZ - .044)); group.add(main.lens);
  const sight: WeaponSight = { reticle, aimHeight, aimDepth: mount?.main.aimDepth ?? built?.aimDepth ?? (integrated ? -.36 : -.47), radius, magnification, lens: main.lens, visibility: main.visibility,
    reflection: scopeGlass?.reflection ?? housing?.reflection, aimX: 0, roll: 0 };
  // The offset dot is a second sight in its own right: its own lens, glass and
  // place for the eye, mounted turned over by the roll that stands it upright.
  let dot: ReturnType<typeof createLens> | undefined, dotGlass: ReturnType<typeof createOpticGlass> | undefined;
  if (mount?.offset) {
    const at = mount.offset;
    dot = createLens(1, at.radius, undefined, false);
    dot.lens.position.set(at.x, at.y, at.lensZ); dot.lens.rotation.z = -at.roll; group.add(dot.lens);
    dotGlass = createOpticGlass(at.radius, .005, 'reflex');
    dotGlass.reflection.surface.position.set(at.x, at.y, at.glassZ); dotGlass.reflection.surface.rotation.z = -at.roll;
    group.add(dotGlass.reflection.surface);
    sight.offset = { aimHeight: at.y, aimX: at.x, roll: at.roll, aimDepth: at.aimDepth, radius: at.radius, magnification: 1, lens: dot.lens, visibility: dot.visibility, reflection: dotGlass.reflection };
  }
  sights.set(root, sight);
  return () => {
    if (original) original.visible = wasVisible;
    folded.forEach(node => { node.visible = true; });
    sights.delete(root); group.removeFromParent(); housing?.dispose(); scopeGlass?.dispose(); main.dispose(); dot?.dispose(); dotGlass?.dispose(); mount?.dispose();
  };
}

/** The target covers only the lens, so crop FOV as well as applying magnification. */
export function scopeFov(worldFov: number, lensFraction: number, magnification: number) {
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(worldFov / 2)) * lensFraction / magnification));
}

export function createScopeRenderer(renderer: THREE.WebGLRenderer) {
  // One reusable PiP target, sized to the lens's on-screen pixels so the image
  // is not upscaled in fullscreen or at high DPI. Lens reflections have their own pass.
  const target = new THREE.WebGLRenderTarget(384, 384, { depthBuffer: true, stencilBuffer: false });
  const camera = new THREE.PerspectiveCamera();
  const lensPosition = new THREE.Vector3(), buffer = new THREE.Vector2();
  /** Gives a magnified lens its picture now, so its first aim changes no material (and compiles no shader). */
  function prepare(sight: WeaponSight) {
    if (sight.magnification <= 1.01 || sight.lens.material.map === target.texture) return;
    sight.lens.material.map = target.texture;
    sight.lens.material.needsUpdate = true;
  }
  return {
    prepare,
    render(world: THREE.Scene, worldCamera: THREE.PerspectiveCamera, viewCamera: THREE.PerspectiveCamera, sight: WeaponSight | undefined, active: boolean, aimProgress = 1) {
      if (!sight) return false;
      // Powered reflex dots are gated by the optical aperture and eye alignment,
      // never by the aim button. Only magnified scopes fade with the ADS animation.
      sight.visibility.value = sight.magnification <= 1.01 ? 1 : THREE.MathUtils.smoothstep(aimProgress, .12, .92);
      sight.lens.visible = active && sight.visibility.value > 0;
      if (!sight.lens.visible || sight.magnification <= 1.01) return false;
      sight.lens.getWorldPosition(lensPosition);
      const depth = -lensPosition.applyMatrix4(viewCamera.matrixWorldInverse).z;
      const fraction = sight.radius / (Math.max(.01, depth) * Math.tan(THREE.MathUtils.degToRad(viewCamera.fov / 2)));
      camera.copy(worldCamera); camera.aspect = 1;
      camera.fov = scopeFov(worldCamera.fov, fraction, sight.magnification); camera.updateProjectionMatrix();
      // `fraction` is the lens radius over half the view height, so this is its
      // diameter in drawing-buffer pixels, in 128px steps to avoid reallocating.
      const size = THREE.MathUtils.clamp(Math.ceil(fraction * renderer.getDrawingBufferSize(buffer).y / 128) * 128, 384, 1024);
      if (target.width !== size) target.setSize(size, size);
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target); renderer.clear(); renderer.render(world, camera); renderer.setRenderTarget(previous);
      prepare(sight);
      return true;
    },
    /** Draws the world into the target once while loading, so the GPU builds its pipelines for this target's format before the first aim needs them. */
    warm(world: THREE.Scene, worldCamera: THREE.Camera) {
      const previous = renderer.getRenderTarget(), shadows = renderer.shadowMap.needsUpdate;
      renderer.shadowMap.needsUpdate = false;
      renderer.setRenderTarget(target); renderer.clear(); renderer.render(world, worldCamera); renderer.setRenderTarget(previous);
      renderer.shadowMap.needsUpdate = shadows;
    },
    dispose() { target.dispose(); },
  };
}
