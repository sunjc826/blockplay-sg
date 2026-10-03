import * as THREE from 'three';
import type { WeaponSpec } from './fps-rules';
import { opticMagnification } from './fps-rules';
import { buildReflexHousing } from './weapon-reflex';
import { createOpticGlass, type OpticGlass } from './weapon-glass';

export interface WeaponSight {
  aimHeight: number; aimDepth: number; radius: number; magnification: number;
  visibility: { value: number };
  lens: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  reflection?: OpticGlass;
}
const sights = new WeakMap<THREE.Object3D, WeaponSight>();
export const getWeaponSight = (root: THREE.Object3D) => sights.get(root);

/** Shared by the shop and the FPS: one housing per optic slot. */
export function fitWeaponOptic(root: THREE.Object3D, weapon: WeaponSpec) {
  if (weapon.optic === 'iron') return () => {};
  const sar = weapon.id === 'sar21-inspired', integrated = sar && weapon.optic !== 'reflex';
  const original = root.getObjectByName('sar21-inspired__optic');
  const wasVisible = original?.visible ?? true;
  if (original) original.visible = integrated;
  const group = new THREE.Group(); group.name = 'equipped-optic'; root.add(group);
  const geometry: THREE.BufferGeometry[] = [];
  const aimHeight = integrated ? .328 : sar ? .343 : .350;
  const rearZ = integrated ? .194 : sar ? .12 : .15;
  const radius = integrated ? .0235 : .042;
  let housing: ReturnType<typeof buildReflexHousing> | undefined;
  let scopeGlass: ReturnType<typeof createOpticGlass> | undefined;
  if (!integrated) {
    group.name = weapon.optic === 'precision' ? 'fps-precision-optic' : 'fps-reflex-optic';
    housing = buildReflexHousing(group, aimHeight, rearZ, sar);
  } else {
    // The original SAR housing includes opaque lens faces. Seat the coating
    // just ahead of the rear face, and composite it over the live scope image.
    scopeGlass = createOpticGlass(radius, .0014, 'scope');
    scopeGlass.reflection.surface.position.set(0, aimHeight, rearZ + .0015);
    group.add(scopeGlass.reflection.surface);
  }
  const magnified = opticMagnification(weapon) > 1.01;
  const visibility = { value: magnified ? 0 : 1 };
  const lensMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', side: magnified ? THREE.DoubleSide : THREE.FrontSide, transparent: true, depthWrite: false });
  lensMaterial.toneMapped = magnified;
  // The etched scope uses lens UVs; the reflex uses a collimated ray. Both are
  // clipped by the recessed aperture and occluded by the physical housing.
  lensMaterial.onBeforeCompile = shader => {
    shader.uniforms.sightVisibility = visibility;
    shader.uniforms.sightBloom = { value: 0 };
    shader.vertexShader = 'varying vec2 sightUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n sightUv = uv;');
    if (!magnified) {
      shader.vertexShader = 'varying vec3 sightRay;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        #include <project_vertex>
        // Express the eye-to-lens ray in the optic's basis. A collimated dot
        // follows the eye across the aperture instead of sticking to its UVs.
        sightRay = vec3(dot(mvPosition.xyz, modelViewMatrix[0].xyz),
                        dot(mvPosition.xyz, modelViewMatrix[1].xyz),
                        dot(mvPosition.xyz, modelViewMatrix[2].xyz));
      `);
      shader.fragmentShader = 'varying vec3 sightRay;\n' + shader.fragmentShader;
    }
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
      float line = 1.0 - smoothstep(0.003, 0.003 + aa, min(abs(p.x), abs(p.y)));
      line *= 1.0 - smoothstep(0.35, 0.36, r);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.035, 0.028), line);
      // Soft eye-box shadow grows while the eye is coming into alignment.
      float edge = smoothstep(mix(0.12, 0.39, sightVisibility), 0.5, r);
      diffuseColor.rgb *= 1.0 - edge * 0.9;
      diffuseColor.a = sightVisibility;
      ` : `
      vec2 angularPosition = sightRay.xy / max(abs(sightRay.z), 0.001);
      float angle = length(angularPosition);
      float angularAA = max(fwidth(angle), 0.00015);
      float core = 1.0 - smoothstep(0.0022, 0.0022 + angularAA, angle);
      float aperture = 1.0 - smoothstep(0.46, 0.5, r);
      if (sightBloom > 0.5) {
        // Add light around the emitter without replacing the scene behind it.
        // Both halo scales are angular, so they stay steady as the eye moves.
        float halo = exp(-angle * angle / 0.000055) * 0.30;
        float bloom = exp(-angle * angle / 0.00024) * 0.065;
        vec2 streak = angularPosition / vec2(0.014, 0.0009);
        float flare = exp(-dot(streak, streak)) * 0.045;
        diffuseColor.rgb = vec3(1.0, 0.025, 0.008);
        diffuseColor.a = (halo + bloom + flare) * aperture * sightVisibility;
      } else {
        // A tiny warm centre gives the emitter depth while retaining the
        // original crisp aiming diameter. The bloom is a separate light layer.
        float hotCentre = exp(-angle * angle / 0.0000015);
        diffuseColor.rgb = mix(vec3(1.0, 0.025, 0.008), vec3(1.0, 0.55, 0.28), hotCentre);
        diffuseColor.a = core * aperture * sightVisibility;
      }
      `}
    `);
  };
  lensMaterial.customProgramCacheKey = () => magnified ? 'scope-reticle-v3' : 'reflex-reticle-v4';
  const lensGeometry = new THREE.CircleGeometry(radius, 48); geometry.push(lensGeometry);
  const lens = new THREE.Mesh(lensGeometry, lensMaterial); lens.name = 'fps-scope-lens';
  lens.position.set(0, aimHeight, integrated ? rearZ + .001 : rearZ - .044); lens.visible = !magnified; lens.renderOrder = 2; group.add(lens);
  let bloomMaterial: THREE.MeshBasicMaterial | undefined;
  if (!magnified) {
    bloomMaterial = lensMaterial.clone();
    bloomMaterial.blending = THREE.AdditiveBlending;
    bloomMaterial.onBeforeCompile = (shader, renderer) => {
      lensMaterial.onBeforeCompile(shader, renderer);
      shader.uniforms.sightBloom.value = 1;
    };
    bloomMaterial.customProgramCacheKey = () => 'reflex-bloom-v1';
    const bloom = new THREE.Mesh(lensGeometry, bloomMaterial);
    bloom.name = 'fps-reflex-bloom'; bloom.renderOrder = 2;
    lens.renderOrder = 3;
    // Parenting shares the lens's visibility, clipping, and eye alignment.
    lens.add(bloom);
  }
  const sight: WeaponSight = { aimHeight, aimDepth: integrated ? -.36 : -.47, radius, magnification: opticMagnification(weapon), lens, visibility, reflection: scopeGlass?.reflection ?? housing?.reflection };
  sights.set(root, sight);
  return () => {
    if (original) original.visible = wasVisible;
    sights.delete(root); group.removeFromParent(); housing?.dispose(); scopeGlass?.dispose(); geometry.forEach(g => g.dispose()); lensMaterial.dispose(); bloomMaterial?.dispose();
  };
}

/** The target covers only the lens, so crop FOV as well as applying magnification. */
export function scopeFov(worldFov: number, lensFraction: number, magnification: number) {
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(worldFov / 2)) * lensFraction / magnification));
}

export function createScopeRenderer(renderer: THREE.WebGLRenderer) {
  // One reusable 384px PiP target. Lens reflections have their own throttled pass.
  const target = new THREE.WebGLRenderTarget(384, 384, { depthBuffer: true, stencilBuffer: false });
  const camera = new THREE.PerspectiveCamera();
  const lensPosition = new THREE.Vector3();
  return {
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
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target); renderer.clear(); renderer.render(world, camera); renderer.setRenderTarget(previous);
      if (sight.lens.material.map !== target.texture) {
        sight.lens.material.map = target.texture;
        sight.lens.material.needsUpdate = true;
      }
      return true;
    },
    dispose() { target.dispose(); },
  };
}
