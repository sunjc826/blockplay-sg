import * as THREE from 'three';
import type { Obstacle } from './region-collision';
import { getEnvironmentSettings } from './environment-settings';
import { CELEBRATIONS, DEFAULT_ENVIRONMENT, WEATHER, resolveEnvironment, type CelebrationId } from './world-events';

/** One bounded effect pool per scene. No textures, network traffic or shadow passes. */
export function createWorldAtmosphere(scene: THREE.Scene, anchors: readonly { x: number; z: number }[], obstacles: readonly Obstacle[], multiplayer = false) {
  const originalBackground = scene.background, originalFog = scene.fog;
  const background = originalBackground instanceof THREE.Color ? originalBackground.clone() : new THREE.Color('#b9dcea');
  const fog = new THREE.Fog(background, 150, 700);
  scene.background = background; scene.fog = fog;
  const lights: { light: THREE.Light; intensity: number; sun: boolean }[] = [];
  scene.traverse(object => { if (object instanceof THREE.DirectionalLight || object instanceof THREE.HemisphereLight) lights.push({ light: object, intensity: object.intensity, sun: object instanceof THREE.DirectionalLight }); });
  const root = new THREE.Group(); root.name = 'world-atmosphere'; root.userData.fpsEffect = true; scene.add(root);
  const rainRoot = new THREE.Group(); root.add(rainRoot);
  const rainCount = 900, rainPositions = new Float32Array(rainCount * 6);
  const rainGeometry = new THREE.BufferGeometry(); rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const rainMaterial = new THREE.LineBasicMaterial({ color: '#cde9f4', transparent: true, opacity: .45, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial); rain.frustumCulled = false; rainRoot.add(rain);
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
  let active = resolveEnvironment(getEnvironmentSettings()), lastSettings = getEnvironmentSettings();
  const targetColor = new THREE.Color();
  let wetness = 0, wind = 0, disposed = false;
  const sample = (i: number, salt: number) => { const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return n - Math.floor(n); };
  const seeds = Array.from({ length: rainCount }, (_, i) => [sample(i, 1), sample(i, 2), sample(i, 3)]);
  // Index static roofs once; precipitation never scans the whole district per drop.
  const roofs = new Map<string, Obstacle[]>(), cell = 12;
  for (const obstacle of obstacles) {
    for (let x = Math.floor(obstacle.minX / cell); x <= Math.floor(obstacle.maxX / cell); x++)
      for (let z = Math.floor(obstacle.minZ / cell); z <= Math.floor(obstacle.maxZ / cell); z++) {
        const key = `${x},${z}`, bucket = roofs.get(key) ?? []; bucket.push(obstacle); roofs.set(key, bucket);
      }
  }
  const underRoof = (x: number, y: number, z: number) => (roofs.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ?? []).some(o => x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ && y < (o.maxY ?? 12));
  const sky = { x: 0, y: 0, z: 0 };
  return {
    root,
    update(dt: number, camera: THREE.Camera, now = Date.now()) {
      if (disposed) return;
      const settings = getEnvironmentSettings();
      if (settings !== lastSettings || now - lastCheck >= 1000 || now < lastNow) {
        active = resolveEnvironment(multiplayer ? { ...DEFAULT_ENVIRONMENT, reducedEffects: settings.reducedEffects } : settings, now);
        lastCheck = now; lastSettings = settings;
      }
      lastNow = now;
      root.userData.weather = active.weather; root.userData.celebration = active.celebration;
      const preset = WEATHER[active.weather], reduced = active.reducedEffects || !!motion?.matches;
      const step = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0)), blend = 1 - Math.exp(-step * .65);
      targetColor.set(preset.sky); background.lerp(targetColor, blend); fog.color.copy(background);
      fog.near += (preset.fogNear - fog.near) * blend; fog.far += (preset.fogFar - fog.far) * blend;
      wetness += (preset.rain - wetness) * blend; wind += (preset.wind - wind) * blend;
      const time = (now % 3600_000) / 1000;
      // A gentle cloud glow, never a full-screen white strobe. Disabled with reduced motion.
      const lightning = !reduced && active.weather === 'thunderstorm' ? Math.max(0, 1 - Math.abs(time % 23 - 1) / .4) * .16 : 0;
      for (const { light, intensity, sun } of lights) light.intensity += (intensity * (sun ? preset.sun + lightning : preset.ambient + lightning) - light.intensity) * blend;
      if (previousEvent !== active.celebration) {
        previousEvent = active.celebration;
        const event = CELEBRATIONS[active.celebration];
        materials.forEach((material, i) => material.color.set(event.colors[i]));
        celebrationRoot.visible = active.celebration !== 'none';
        festivalObjects.forEach(({ lantern, star }) => { lantern.visible = active.celebration === 'lunar-new-year'; star.visible = !lantern.visible; });
        sparkMaterial.color.set(event.colors[0]);
      }
      camera.getWorldPosition(rainRoot.position);
      sky.x = rainRoot.position.x; sky.y = rainRoot.position.y; sky.z = rainRoot.position.z;
      // Collider roofs provide shelter; low cover does not count as a roof.
      const sheltered = underRoof(sky.x, sky.y + .5, sky.z);
      const drops = Math.floor(rainCount * wetness * (reduced ? .25 : 1));
      rain.visible = drops > 0 && !sheltered; rainGeometry.setDrawRange(0, drops * 2);
      if (rain.visible) {
        for (let i = 0; i < drops; i++) {
          const seed = seeds[i], x = ((seed[0] * 44 + time * wind) % 44) - 22, z = seed[1] * 44 - 22;
          const y = ((seed[2] * 26 - time * 22) % 26 + 26) % 26 - 5;
          const roof = sky.y + y < .1 || underRoof(sky.x + x, sky.y + y, sky.z + z);
          const k = i * 6; rainPositions[k] = x; rainPositions[k + 1] = y; rainPositions[k + 2] = z;
          rainPositions[k + 3] = x + (roof ? 0 : wind * .05); rainPositions[k + 4] = y - (roof ? 0 : .85); rainPositions[k + 5] = z;
        }
        rainGeometry.attributes.position.needsUpdate = true;
      }
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
      bulbs.forEach(mesh => mesh.dispose());
      scene.remove(root); scene.background = originalBackground; scene.fog = originalFog;
      lights.forEach(({ light, intensity }) => { light.intensity = intensity; });
      [rainGeometry, bulbGeometry, lanternGeometry, starGeometry, cordGeometry, sparkGeometry].forEach(g => g.dispose());
      [rainMaterial, cordMaterial, sparkMaterial, ...materials].forEach(m => m.dispose());
    },
  };
}
