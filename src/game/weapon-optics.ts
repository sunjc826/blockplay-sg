import * as THREE from 'three';
import type { WeaponSpec } from './fps-rules';
import { opticMagnification } from './fps-rules';
import { buildReflexHousing } from './weapon-reflex';
import { buildSightHousing, roundedRect, type SightWindow } from './weapon-sight-housings';
import { createOpticGlass, type OpticGlass } from './weapon-glass';
import { enemyOptic } from './enemy-weapon-layout';
import { scopeReticleFor, scopeReticleGlsl, type ScopeReticle } from './scope-reticles';

export interface WeaponSight {
  aimHeight: number; aimDepth: number; radius: number; magnification: number;
  visibility: { value: number };
  /** NV-compatible illumination, shared by the core and its optical scatter. */
  nightVision: { value: number };
  lens: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  reflection?: OpticGlass;
  /** The etched pattern, for magnified sights only. */
  reticle?: ScopeReticle;
  /** How far the lens sits off the bore line sideways, and the roll that stands it upright: both 0 but for an offset dot. */
  aimX: number; roll: number;
  /** A 1x dot at 45° beside a magnified sight, brought to the eye by canting the weapon over. */
  offset?: WeaponSight;
}
const sights = new WeakMap<THREE.Object3D, WeaponSight>();
// EOTECH 0-reticle: 68 MOA ring and 1 MOA centre dot. Convert world angles
// (65° FOV) to the viewmodel's 54° FOV, keeping the reticle target-relative.
const HOLO_RING = (Math.tan(THREE.MathUtils.degToRad(68 / 120)) * Math.tan(THREE.MathUtils.degToRad(27)) / Math.tan(THREE.MathUtils.degToRad(32.5))).toFixed(7);
export const getWeaponSight = (root: THREE.Object3D) => sights.get(root);

/**
 * One lens: a live scope picture with its etching when magnified, otherwise a
 * collimated dot (with a holographic ring when `ring`) and its bloom.
 */
function createLens(magnification: number, radius: number, reticle: ScopeReticle | undefined, ring: boolean, window?: SightWindow) {
  const magnified = magnification > 1.01;
  const visibility = { value: magnified ? 0 : 1 }, nightVision = { value: 0 };
  const lensMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', side: magnified ? THREE.DoubleSide : THREE.FrontSide, forceSinglePass: true, transparent: true, depthWrite: false });
  lensMaterial.toneMapped = magnified;
  // The etched scope uses lens UVs; the reflex uses a collimated ray. Both are
  // clipped by the recessed aperture and occluded by the physical housing.
  lensMaterial.onBeforeCompile = shader => {
    shader.uniforms.sightVisibility = visibility;
    shader.uniforms.sightNightVision = nightVision;
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
    shader.fragmentShader = 'varying vec2 sightUv;\nuniform float sightVisibility;\nuniform float sightBloom;\nuniform float sightNightVision;\n' + shader.fragmentShader;
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
      ${ring ? `
      // A distant virtual image: eye translation moves the window around the
      // hologram, never drags the aim towards its edge. The physical aperture
      // reveals partial arcs during the raise and clips it when out of view.
      // Infinite collimation approximates the real sight's finite focus range.
      vec2 angularPosition = sightRay.xy / max(abs(sightRay.z), 0.001);
      float rise = 1.0;
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
      `}
      float angle = length(angularPosition);
      ${ring ? `
      // Coordinate derivatives stay well-defined at the dot centre.
      float angularAA = max(max(fwidth(angularPosition.x), fwidth(angularPosition.y)), 0.00001);
      // 68 MOA ring / 1 MOA dot. A small display-resolution floor keeps the
      // subpixel aiming dot usable; it does not scale with the glass or eye relief.
      float dotRadius = ${HOLO_RING} / 68.0;
      float dotSigma = max(dotRadius * 0.85, angularAA * 0.50);
      float dotCore = exp(-0.5 * pow(angle / dotSigma, 2.0));
      float ringLine = 0.00010;
      float strokeSigma = max(ringLine, angularAA * 0.34);
      float ringDistance = abs(angle - ${HOLO_RING});
      vec2 axes = abs(angularPosition);
      float radial = max(axes.x, axes.y);
      float tickDistance = length(vec2(min(axes.x, axes.y), max(max(${HOLO_RING} - radial, radial - ${HOLO_RING} * 1.20), 0.0)));
      float patternDistance = min(ringDistance, tickDistance);
      // Stable optical texture in angular space. Fade unresolved speckle to its
      // mean instead of sampling tiny random cells that shimmer during movement.
      const float grainCell = 0.00024;
      vec2 grainUv = angularPosition / grainCell;
      vec2 cell = floor(grainUv), blend = smoothstep(vec2(0.0), vec2(1.0), fract(grainUv));
      vec4 seeds = vec4(dot(cell, vec2(127.1, 311.7))) + vec4(0.0, 127.1, 311.7, 438.8);
      vec4 noise = fract(sin(seeds) * 43758.5453);
      float grain = mix(mix(noise.x, noise.y, blend.x), mix(noise.z, noise.w, blend.x), blend.y);
      float resolvedGrain = 1.0 - smoothstep(0.55, 1.4, angularAA / grainCell);
      float laserTexture = mix(0.88, mix(0.62, 1.0, grain), resolvedGrain);
      float patternCore = exp(-0.5 * pow(patternDistance / strokeSigma, 2.0));
      float core = max(dotCore, patternCore * laserTexture);
      ` : `float angularAA = max(fwidth(angle), 0.00015);
      float core = 1.0 - smoothstep(0.0022, 0.0022 + angularAA, angle);`}
      ${window ? 'float aperture = 1.0; // Geometry clips the complete hologram to the rectangular window.' : 'float aperture = 1.0 - smoothstep(0.46, 0.5, r);'}
      if (sightBloom > 0.5) {
        // Add light around the emitter without replacing the scene behind it.
        // Both halo scales are angular, so they stay steady as the eye moves.
        ${ring ? `
        // Low-intensity scatter hugs every illuminated stroke, including ticks.
        // Width follows pixel resolution without a broad central red fog.
        float scatterSigma = max(0.00025, angularAA * 0.75);
        float halo = exp(-0.5 * pow(patternDistance / scatterSigma, 2.0)) * 0.10;
        float bloom = exp(-0.5 * pow(angle / scatterSigma, 2.0)) * 0.14;
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
        // Holographic laser light stays red; the LED dot has a warmer centre.
        // Bloom is a separate light layer.
        ${ring ? 'diffuseColor.rgb = vec3(1.0, 0.008, 0.002);' : `float hotCentre = exp(-angle * angle / 0.0000015);
        diffuseColor.rgb = mix(vec3(1.0, 0.025, 0.008), vec3(1.0, 0.55, 0.28), hotCentre);`}
        diffuseColor.a = core * aperture * sightVisibility * rise;
      }
      // The low-output NV setting is represented in the tube's response space;
      // the intensifier applies its own phosphor, softness and residual halo.
      // Keep the core's angular geometry and alpha intact for precise aiming.
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28), sightNightVision);
      if (sightBloom > 0.5) diffuseColor.a *= mix(1.0, 0.22, sightNightVision);
      `}
    `);
  };
  lensMaterial.customProgramCacheKey = () => magnified ? `scope-reticle-v4-${reticle}` : `reflex-reticle-v7-nv${ring ? '-holo-v4-window' : ''}`;
  const lensGeometry = window ? new THREE.ShapeGeometry(roundedRect(window.width, window.height, window.corner), 8) : new THREE.CircleGeometry(radius, 48);
  if (window) {
    const positions = lensGeometry.attributes.position, uvs = lensGeometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) uvs.setXY(i, .5 + positions.getX(i) / (2 * radius), .5 + positions.getY(i) / (2 * radius));
  }
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
    bloomMaterial.customProgramCacheKey = () => `reflex-bloom-v4-nv${ring ? '-holo-v4-window' : ''}`;
    const bloom = new THREE.Mesh(lensGeometry, bloomMaterial);
    bloom.name = 'fps-reflex-bloom'; bloom.renderOrder = 2;
    lens.renderOrder = 3;
    // Parenting shares the lens's visibility, clipping, and eye alignment.
    lens.add(bloom);
  }
  return { lens, visibility, nightVision, dispose() { lensGeometry.dispose(); lensMaterial.dispose(); bloomMaterial?.dispose(); } };
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
    scopeGlass = createOpticGlass(radius, magnified ? .0014 : mount.main.window ? .0003 : .005, magnified ? 'scope' : 'reflex', reticle, mount.main.window);
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
  const main = createLens(magnification, radius, reticle, fitted === 'holo', mount?.main.window);
  main.lens.position.set(0, aimHeight, mount?.main.lensZ ?? built?.lens ?? (integrated ? rearZ + .001 : rearZ - .044)); group.add(main.lens);
  const sight: WeaponSight = { reticle, aimHeight, aimDepth: mount?.main.aimDepth ?? built?.aimDepth ?? (integrated ? -.36 : -.47), radius, magnification, lens: main.lens, visibility: main.visibility, nightVision: main.nightVision,
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
    sight.offset = { aimHeight: at.y, aimX: at.x, roll: at.roll, aimDepth: at.aimDepth, radius: at.radius, magnification: 1, lens: dot.lens, visibility: dot.visibility, nightVision: dot.nightVision, reflection: dotGlass.reflection };
  }
  sights.set(root, sight);
  return () => {
    if (original) original.visible = wasVisible;
    folded.forEach(node => { node.visible = true; });
    sights.delete(root); group.removeFromParent(); housing?.dispose(); scopeGlass?.dispose(); main.dispose(); dot?.dispose(); dotGlass?.dispose(); mount?.dispose();
  };
}

/** Set both primary and canted dots, including the one currently out of view. */
export function setSightNightVision(sight: WeaponSight | undefined, active: boolean) {
  if (!sight) return;
  sight.nightVision.value = active && sight.magnification <= 1.01 ? 1 : 0;
  if (sight.offset) setSightNightVision(sight.offset, active);
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
