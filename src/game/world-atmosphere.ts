import type { SunRayLight } from './sun-rays';
import { setTreeWeather } from './tree-wind';
import * as THREE from 'three';
import type { Obstacle } from './region-collision';
import { getEnvironmentSettings } from './environment-settings';
import { CELEBRATIONS, DEFAULT_ENVIRONMENT, WEATHER, resolveEnvironment, type CelebrationId } from './world-events';
import { dayLighting, nightExposureAmount, singaporeDayOfYear, type LightingState } from './world-lighting';
import { createSkyLight, type Rgb } from './world-sky-light';
import type { WaterMaterial } from './water';
import { createNightExposure, skyVisibility } from './night-exposure';
import { createRainEffects, createRainSurface } from './rain-effects';
import { createWetSurfaces } from './wet-surfaces';
import { getGraphicsSettings } from './graphics-settings';
import { createWaterRipples } from './water-ripples';
import { createRainReceivers } from './rain-receivers';
import { createVehicleRain } from './vehicle-rain';
import { blendGrade, createDistrictLook, type ColorGrade, type DistrictLook } from './district-look';
import { softwareRenderer } from './fps-sun-shadows';

/**
 * One bounded effect pool per scene. No textures, network traffic or shadow passes.
 * Given the renderer, the district's hemisphere light hands over to a sky light (`world-sky-light`).
 * A scene with `userData.districtLook` also gets its gradient sky, clouds, height haze, baked
 * daytime indirect light and colour grade (`district-look`); other districts are unchanged.
 */
export function createWorldAtmosphere(scene: THREE.Scene, anchors: readonly { x: number; z: number }[], obstacles: readonly Obstacle[], multiplayer = false, renderer?: THREE.WebGLRenderer, tutorialDaylight = false, groundHeight?: (x: number, z: number) => number) {
  const originalBackground = scene.background, originalFog = scene.fog;
  const coarsePointer = typeof matchMedia !== 'undefined' ? matchMedia('(pointer: coarse)') : null;
  const background = originalBackground instanceof THREE.Color ? originalBackground.clone() : new THREE.Color('#b9dcea');
  const fog = new THREE.Fog(background, 150, 700);
  scene.background = background; scene.fog = fog;
  // Each district authored one sun and one sky; time of day moves and recolours them from those originals.
  const lights: { light: THREE.Light; intensity: number; sun: boolean; color: THREE.Color; ground?: THREE.Color; reach: number }[] = [];
  const water = new Set<WaterMaterial>();
  scene.traverse(object => {
    if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.userData.fpsWater && typeof material.userData.setLighting === 'function') water.add(material as WaterMaterial);
    }
    if (object instanceof THREE.DirectionalLight || object instanceof THREE.HemisphereLight) lights.push({ light: object, intensity: object.intensity, sun: object instanceof THREE.DirectionalLight,
      color: object.color.clone(), ground: object instanceof THREE.HemisphereLight ? object.groundColor.clone() : undefined,
      reach: object instanceof THREE.DirectionalLight ? Math.max(60, object.position.distanceTo(object.target.position)) : 0 });
  });
  const originalPositions = lights.map(({ light }) => light.position.clone());
  const sunLight = lights.find(l => l.sun)?.light as THREE.DirectionalLight | undefined;
  const skyFill = lights.find(l => !l.sun)?.light as THREE.HemisphereLight | undefined;
  const skyLight = renderer && skyFill ? createSkyLight(renderer, scene) : null;
  const lookOptions = scene.userData.districtLook as DistrictLook | undefined;
  const look = lookOptions ? createDistrictLook(lookOptions, { software: !!renderer && softwareRenderer(renderer) }) : null;
  const gtaoCapable = !!renderer && !softwareRenderer(renderer) && renderer.capabilities.isWebGL2;
  const exposure = createNightExposure(scene, look?.extension);
  const sunIrradiance = new THREE.Color(), keyColor = new THREE.Color(), groundColor = new THREE.Color(), lensSky = new THREE.Color();
  let lookDay = 0;
  // The sky light replaces the hemisphere's lighting; the hemisphere keeps being driven so its colours and intensity feed the sky.
  if (skyLight && skyFill) skyFill.visible = false;
  const rgb = (c: THREE.Color): Rgb => [c.r, c.g, c.b];
  const keyDirection = new THREE.Vector3(), shiftColor = new THREE.Color();
  const exposurePoint = new THREE.Vector3();
  let lighting: LightingState = dayLighting(13);
  /** What the frame's light amounts to, for the parts of the view the scene's lights do not reach. */
  const output = { lighting, key: 1, ambient: 1, skyVisibility: 1, moonVisibility: 1, shadows: true, occlusion: true };
  // Shared with the depth-based sunlight post-process.
  const originalSunRays = scene.userData.sunRays;
  const sunRays: SunRayLight = { direction: { x: 0, y: 1, z: 0 }, color: '#fff3e2', elevation: -90, sunlight: 0, reduced: false };
  scene.userData.sunRays = sunRays;
  /** Eased air conditions around the camera, shared with lens and audio effects. */
  const air = { rain: 0, haze: 0, sunlight: 1, wind: 0, sheltered: false, storm: false, clock: 0 };
  const root = new THREE.Group(); root.name = 'world-atmosphere'; root.userData.fpsEffect = true; scene.add(root);
  look?.attach(scene, root);
  const receivers = createRainReceivers(scene), rainGround = scene.userData.rainGroundHeight ?? groundHeight ?? (() => 0);
  const columns = createRainSurface(obstacles, (x,z) => receivers.water(x,z) ?? rainGround(x,z));
  const staticHit = { height: 0, normal: new THREE.Vector3(0,1,0) };
  const rainSurface = (x:number,z:number) => { staticHit.height=columns(x,z);return receivers.sample(x,z,staticHit).height; };
  const vehicleRain = createVehicleRain(scene, groundHeight ?? (() => 0));
  const rainEffects = createRainEffects(root, columns, (x,z,hit) => {
    const waterY=receivers.water(x,z);hit.kind=waterY!==null&&Math.abs(hit.height-waterY)<.001?'water':'solid';
    receivers.sample(x,z,hit);return vehicleRain.sample(x,z,hit);
  });
  const wetGround = { surface: scene.userData.groundCover?.wetGround as ((x: number, z: number) => number | null) | undefined, exposed: rainSurface, wetness: 0, time: 0 };
  scene.userData.wetGround = wetGround;
  const shelterHit = { height: 0, normal: new THREE.Vector3(0, 1, 0), object: undefined as THREE.Object3D | undefined };
  const wetSurfaces = createWetSurfaces(scene);
  const ripples = createWaterRipples(scene,water,receivers.water,rainSurface);
  const celebrationRoot = new THREE.Group(); root.add(celebrationRoot);
  const bulbGeometry = new THREE.SphereGeometry(.2, 6, 4);
  const lanternGeometry = new THREE.SphereGeometry(.48, 8, 6);
  const starGeometry = new THREE.OctahedronGeometry(.6);
  const cordGeometry = new THREE.BufferGeometry();
  const cordMaterial = new THREE.LineBasicMaterial({ color: '#57685b' });
  const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
  const places = anchors.slice(0, 8);
  const bulbs = materials.map(material => new THREE.InstancedMesh(bulbGeometry, material, Math.max(1, places.length * 13)));
  bulbs.forEach(mesh => { mesh.count = 0; celebrationRoot.add(mesh); });
  const bulbMatrix = new THREE.Matrix4();
  const festivalObjects: { lantern: THREE.Mesh; star: THREE.Mesh }[] = [];
  const cords: number[] = [];
  for (const [index, anchor] of places.entries()) {
    const display = new THREE.Group(); display.position.set(anchor.x, 0, anchor.z); celebrationRoot.add(display);
    // Hanging decorations stay above head height and never obstruct authored routes.
    for (let i = 0; i <= 12; i++) {
      const x = i - 6, y = 7 + .035 * x * x;
      const bulb = bulbs[(i + index) % 2];
      bulb.setMatrixAt(bulb.count++, bulbMatrix.makeTranslation(anchor.x + x, y, anchor.z));
      if (i) cords.push(anchor.x + x - 1, 7 + .035 * (x - 1) ** 2, anchor.z, anchor.x + x, y, anchor.z);
    }
    const lantern = new THREE.Mesh(lanternGeometry, materials[0]); lantern.position.set(0, 6.2, 0); lantern.scale.y = 1.3; display.add(lantern);
    const star = new THREE.Mesh(starGeometry, materials[1]); star.position.set(0, 6.2, 0); display.add(star);
    festivalObjects.push({ lantern, star });
  }
  bulbs.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); });
  cordGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cords, 3)); celebrationRoot.add(new THREE.LineSegments(cordGeometry, cordMaterial));
  const sparkCount = 120, sparkPositions = new Float32Array(sparkCount * 3);
  const sparkGeometry = new THREE.BufferGeometry(); sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const sparkMaterial = new THREE.PointsMaterial({ color: '#ffd66b', size: .55, transparent: true, depthWrite: false });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial); sparks.frustumCulled = false; root.add(sparks);
  // Cosmetic meshes must not obstruct any ray, including host-owned bot sight lines.
  root.traverse(object => { object.raycast = () => {}; object.userData.fpsEffect = true; });
  const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let previousEvent: CelebrationId | undefined, lastCheck = -Infinity, lastNow = -Infinity;
  const courseSettings = (settings: ReturnType<typeof getEnvironmentSettings>) => tutorialDaylight ? { ...settings, timeOfDay: 'noon' as const, weather: 'sunny' as const, celebration: 'none' as const } : settings;
  let active = resolveEnvironment(courseSettings(getEnvironmentSettings())), lastSettings = getEnvironmentSettings();
  const targetColor = new THREE.Color();
  let wetness = 0, wind = 0, haze = 0, sunlight = 1, disposed = false, started = false;
  const sky = { x: 0, y: 0, z: 0 };
  return {
    root,
    scanMaterials: exposure.scanMaterials,
    /** The light this frame resolved to: the hour's state and its effective key and fill, weather included. */
    get light() { return output; },
    /** Resolved scene conditions, including the shared automatic conditions in multiplayer. */
    get conditions() { return active; },
    get air() { return air; },
    /** Static natural-light visibility, also useful for renderer-independent review. */
    get exposure() { return exposure; },
    /** The district look, when the scene has one. */
    get look() { return look; },
    /**
     * For the lens flare: the colour clear sky round the sun reaches the canvas as,
     * when this district draws a gradient sky; null otherwise (the plain clear colour applies).
     */
    lensSky(graded: boolean) { return look ? look.skyAtSun(graded ? scene.userData.colorGrade as ColorGrade : null, lensSky) : null; },
    update(dt: number, camera: THREE.Camera, now = Date.now()) {
      if (disposed) return;
      const settings = getEnvironmentSettings();
      if (settings !== lastSettings || now - lastCheck >= 1000 || now < lastNow) {
        active = resolveEnvironment(multiplayer ? { ...DEFAULT_ENVIRONMENT, reducedEffects: settings.reducedEffects, shadows: settings.shadows, occlusion: settings.occlusion } : courseSettings(settings), now);
        lastCheck = now; lastSettings = settings;
      }
      lastNow = now;
      root.userData.weather = active.weather; root.userData.celebration = active.celebration;
      const preset = WEATHER[active.weather], reduced = active.reducedEffects || !!motion?.matches;
      // The first frame lands on the hour's light; only later changes ease in.
      const step = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0)), blend = started ? 1 - Math.exp(-step * .65) : 1;
      started = true;
      lighting = dayLighting(active.hour, singaporeDayOfYear(now));
      const night = nightExposureAmount(lighting.elevation);
      const cloudFill = 1 - night * .55 * (1 - preset.sun);
      exposure.update(night, lighting.key, step, lookDay);
      const local = exposure.sample(camera.getWorldPosition(exposurePoint));
      output.skyVisibility = 1 - night * (1 - skyVisibility(local.sky));
      output.moonVisibility = 1 - night * .975 * (1 - local.moon);
      targetColor.set(preset.sky).lerp(shiftColor.set(lighting.sky), lighting.skyWeight); background.lerp(targetColor, blend); fog.color.copy(background);
      fog.near += (preset.fogNear - fog.near) * blend; fog.far += (preset.fogFar - fog.far) * blend;
      wetness += (preset.rain - wetness) * blend; wind += (preset.wind - wind) * blend;
      setTreeWeather(scene, wind, reduced);
      haze += ((active.weather === 'haze' ? 1 : 0) - haze) * blend; sunlight += (preset.sun - sunlight) * blend;
      sunRays.direction = lighting.key; sunRays.color = lighting.keyColor; sunRays.elevation = lighting.elevation;
      sunRays.sunlight = sunlight; sunRays.reduced = reduced;
      const time = (now % 3600_000) / 1000;
      scene.userData.groundCover?.grass.update(camera, time, reduced, coarsePointer?.matches ?? false, getGraphicsSettings().grassDetail);
      // A gentle cloud glow, never a full-screen white strobe. Disabled with reduced motion.
      const lightning = !reduced && active.weather === 'thunderstorm' ? Math.max(0, 1 - Math.abs(time % 23 - 1) / .4) * .16 : 0;
      keyDirection.set(lighting.key.x, lighting.key.y, lighting.key.z);
      for (const { light, intensity, sun, color, ground, reach } of lights) {
        light.intensity += (intensity * (sun ? (preset.sun + lightning) * lighting.keyScale : (preset.ambient * cloudFill + lightning) * lighting.ambientScale) - light.intensity) * blend;
        if (light instanceof THREE.DirectionalLight) {
          // Kept at its authored distance from wherever its target is, so a following shadow frustum follows too.
          light.position.copy(light.target.position).addScaledVector(keyDirection, reach);
          light.color.copy(color).lerp(shiftColor.set(lighting.keyColor), lighting.shift);
        } else if (light instanceof THREE.HemisphereLight && ground) {
          light.color.copy(color).lerp(shiftColor.set(lighting.skyFill), lighting.shift);
          light.groundColor.copy(ground).lerp(shiftColor.set(lighting.groundFill), lighting.shift);
        }
      }
      if (look && lookOptions) {
        sunIrradiance.copy(sunLight?.color ?? keyColor.setRGB(1, 1, 1)).multiplyScalar(sunLight?.intensity ?? 0);
        lookDay = look.update({ background, keyColor: keyColor.set(lighting.keyColor), keyDirection: lighting.key, elevation: lighting.elevation, shift: lighting.shift,
          night, sun: sunlight, rain: wetness, haze, wind, exposure: lighting.exposure, sunIrradiance, groundColor: groundColor.set(lighting.groundFill), dt: step, reduced, lowDetail: active.reducedEffects, gtao: active.occlusion && gtaoCapable });
        // Materials that keep three's fog (water, grass, glows) fade to the haze's average horizon.
        fog.color.copy(look.horizon);
        scene.userData.colorGrade = blendGrade(lookOptions.grade, lighting.shift, night, Math.max(0, Math.min(1, (.6 - sunlight) / .45)));
      }
      for (const material of water) { material.userData.setLighting(lighting, background, fog.color, preset.sun + lightning, blend); material.userData.setRain(wetness, reduced); }
      if (skyLight && skyFill) {
        const fill = Math.max(1e-4, skyFill.intensity);
        skyLight.update({ sky: rgb(skyFill.color), horizon: rgb(background), ground: rgb(skyFill.groundColor), key: rgb(sunLight?.color ?? skyFill.color),
          keyDirection: lighting.key, keyRatio: sunLight ? sunLight.intensity / fill : 0 }, skyFill.intensity, step);
      }
      output.lighting = lighting; output.key = preset.sun * lighting.keyScale; output.ambient = preset.ambient * cloudFill * lighting.ambientScale; output.shadows = active.shadows; output.occlusion = active.occlusion;
      root.userData.timeOfDay = active.hour;
      if (previousEvent !== active.celebration) {
        previousEvent = active.celebration;
        const event = CELEBRATIONS[active.celebration];
        materials.forEach((material, i) => material.color.set(event.colors[i]));
        celebrationRoot.visible = active.celebration !== 'none';
        festivalObjects.forEach(({ lantern, star }) => { lantern.visible = active.celebration === 'lunar-new-year'; star.visible = !lantern.visible; });
        sparkMaterial.color.set(event.colors[0]);
      }
      camera.getWorldPosition(exposurePoint);
      sky.x = exposurePoint.x; sky.y = exposurePoint.y; sky.z = exposurePoint.z;
      vehicleRain.update(step, exposurePoint, wetness, reduced, rainEffects.splash);
      shelterHit.height = rainSurface(sky.x, sky.z); shelterHit.object = undefined;
      const sheltered = vehicleRain.sample(sky.x, sky.z, shelterHit).height > sky.y + .15;
      air.rain = wetness; air.haze = haze; air.sunlight = sunlight; air.wind = wind; air.sheltered = sheltered; air.storm = active.weather === 'thunderstorm'; air.clock = (now % 3600_000) / 1000;
      rainEffects.update(step, exposurePoint, wetness, wind, reduced, getGraphicsSettings().rainDetail);
      wetSurfaces.update(step, wetness);
      ripples.update(camera,getGraphicsSettings().waterDetail,reduced,wetness);root.userData.waterRipples=ripples.mesh.count;
      wetGround.wetness = wetSurfaces.wetness; wetGround.time = time;
      root.userData.rain = { ...rainEffects.counts, radius: rainEffects.radius };
      sparks.visible = !reduced && CELEBRATIONS[active.celebration].fireworks && places.length > 0;
      if (sparks.visible) {
        const burst = Math.floor(time / 5), age = time % 5, anchor = places[burst % places.length];
        sparks.position.set(anchor.x, 32, anchor.z); sparkMaterial.opacity = Math.max(0, 1 - age / 3);
        for (let i = 0; i < sparkCount; i++) {
          const angle = i * 2.399963, vertical = 1 - 2 * (i + .5) / sparkCount, radius = Math.sqrt(1 - vertical * vertical) * age * 6;
          sparkPositions[i * 3] = Math.cos(angle) * radius;
          sparkPositions[i * 3 + 1] = vertical * age * 6 - age * age * 1.3;
          sparkPositions[i * 3 + 2] = Math.sin(angle) * radius;
        }
        sparkGeometry.attributes.position.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      if (originalSunRays === undefined) delete scene.userData.sunRays; else scene.userData.sunRays = originalSunRays;
      bulbs.forEach(mesh => mesh.dispose());
      rainEffects.dispose(); ripples.dispose(); vehicleRain.dispose(); wetSurfaces.dispose(); delete scene.userData.wetGround;
      skyLight?.dispose(); if (skyFill) skyFill.visible = true;
      look?.dispose(); delete scene.userData.colorGrade;
      exposure.dispose();
      for (const material of water) material.userData.resetLighting();
      scene.remove(root); scene.background = originalBackground; scene.fog = originalFog;
      lights.forEach(({ light, intensity, color, ground }, index) => {
        light.intensity = intensity; light.color.copy(color); light.position.copy(originalPositions[index]);
        if (light instanceof THREE.HemisphereLight && ground) light.groundColor.copy(ground);
      });
      [bulbGeometry, lanternGeometry, starGeometry, cordGeometry, sparkGeometry].forEach(g => g.dispose());
      [cordMaterial, sparkMaterial, ...materials].forEach(m => m.dispose());
    },
  };
}
