import { describe, expect, it, afterEach } from 'vitest';
import * as THREE from 'three';
import { automaticWeather, CELEBRATIONS, DEFAULT_ENVIRONMENT, resolveEnvironment, sanitizeEnvironment, seasonalCelebration, WEATHER, WEATHER_PERIOD_MS } from './world-events';
import { createWorldAtmosphere } from './world-atmosphere';
import { setEnvironmentSettings } from './environment-settings';
const at = (date: string) => Date.parse(date);
afterEach(() => setEnvironmentSettings({ ...DEFAULT_ENVIRONMENT }));

describe('Singapore event calendar', () => {
  it('switches Christmas and New Year at Singapore midnight, including year wrap', () => {
    expect(seasonalCelebration(at('2026-11-30T15:59:59Z'))).toBe('none');
    expect(seasonalCelebration(at('2026-11-30T16:00:00Z'))).toBe('christmas');
    expect(seasonalCelebration(at('2026-12-30T15:59:59Z'))).toBe('christmas');
    expect(seasonalCelebration(at('2026-12-30T16:00:00Z'))).toBe('new-year');
    expect(seasonalCelebration(at('2027-01-02T15:59:59Z'))).toBe('new-year');
    expect(seasonalCelebration(at('2027-01-02T16:00:00Z'))).toBe('none');
  });
  it('uses the lunar calendar rather than a fixed January/February day', () => {
    expect(seasonalCelebration(at('2026-02-16T15:59:59Z'))).toBe('none');
    expect(seasonalCelebration(at('2026-02-16T16:00:00Z'))).toBe('lunar-new-year');
    expect(seasonalCelebration(at('2026-03-03T12:00:00Z'))).toBe('lunar-new-year');
    expect(seasonalCelebration(at('2026-03-03T16:00:00Z'))).toBe('none');
    expect(seasonalCelebration(at('2027-02-06T12:00:00Z'))).toBe('lunar-new-year');
  });
  it('ends National Day decorations after August 9 Singapore time', () => {
    expect(seasonalCelebration(at('2026-08-09T15:59:59Z'))).toBe('national-day');
    expect(seasonalCelebration(at('2026-08-09T16:00:00Z'))).toBe('none');
  });
  it('supports forced events outside their season and explicit off', () => {
    expect(resolveEnvironment({ ...DEFAULT_ENVIRONMENT, celebration: 'christmas', weather: 'squall' }, at('2026-06-01'))).toMatchObject({ celebration: 'christmas', weather: 'squall' });
    expect(resolveEnvironment({ ...DEFAULT_ENVIRONMENT, celebration: 'none' }, at('2026-12-25')).celebration).toBe('none');
  });
  it('rejects corrupt saves, inherited keys and unsupported presets', () => {
    for (const value of [null, 42, { weather: '__proto__', celebration: 'constructor', reducedEffects: 'yes' }, { weather: 'snow' }]) expect(sanitizeEnvironment(value)).toEqual(DEFAULT_ENVIRONMENT);
  });
  it('keeps weather deterministic within each UTC slot and exercises every preset', () => {
    const found = new Set<string>();
    for (let now = at('2026-01-01'); now < at('2027-01-01'); now += WEATHER_PERIOD_MS) {
      const weather = automaticWeather(now); found.add(weather);
      expect(automaticWeather(now + WEATHER_PERIOD_MS - 1)).toBe(weather);
    }
    expect([...found].sort()).toEqual(Object.keys(WEATHER).sort());
  });
});

describe('world atmosphere lifecycle', () => {
  function setup(multiplayer = false, obstacles: { minX: number; maxX: number; minZ: number; maxZ: number; maxY?: number }[] = []) {
    const scene = new THREE.Scene(), background = new THREE.Color('#ddeeff'), fog = new THREE.Fog('#ddeeff', 100, 600);
    scene.background = background; scene.fog = fog;
    const light = new THREE.DirectionalLight('#ffffff', 2); scene.add(light);
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 2, 0);
    const atmosphere = createWorldAtmosphere(scene, [{ x: 0, z: 0 }], obstacles, multiplayer);
    return { scene, background, fog, light, camera, atmosphere };
  }
  it('blends storm visibility and restores original scene state exactly on disposal', () => {
    setEnvironmentSettings({ weather: 'thunderstorm', celebration: 'none' });
    const { scene, background, fog, light, camera, atmosphere } = setup();
    for (let i = 0; i < 120; i++) atmosphere.update(.1, camera, at('2026-06-01') + i * 100);
    expect((scene.fog as THREE.Fog).far).toBeLessThan(300); expect(light.intensity).toBeLessThan(1);
    atmosphere.dispose(); atmosphere.dispose();
    expect(scene.background).toBe(background); expect(scene.fog).toBe(fog); expect(light.intensity).toBe(2);
    expect(scene.children).toEqual([light]);
  });
  it('uses fixed pools, supports every celebration, and excludes effects from rays', () => {
    const { camera, atmosphere } = setup();
    const count: THREE.Object3D[] = []; atmosphere.root.traverse(o => count.push(o));
    for (const celebration of Object.keys(CELEBRATIONS) as (keyof typeof CELEBRATIONS)[]) {
      setEnvironmentSettings({ weather: 'squall', celebration }); atmosphere.update(.1, camera);
      expect(atmosphere.root.userData.celebration).toBe(celebration);
      const after: THREE.Object3D[] = []; atmosphere.root.traverse(o => after.push(o)); expect(after).toEqual(count);
    }
    atmosphere.root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 6.2, 10), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObject(atmosphere.root, true)).toEqual([]);
    atmosphere.dispose();
  });
  it('disables fireworks with reduced effects and keeps rain bounded', () => {
    setEnvironmentSettings({ weather: 'squall', celebration: 'new-year', reducedEffects: true });
    const { camera, atmosphere } = setup();
    for (let i = 0; i < 100; i++) atmosphere.update(.1, camera);
    const sparks = atmosphere.root.children.find(o => o instanceof THREE.Points)!;
    const rain = atmosphere.root.children[0].children[0] as THREE.LineSegments;
    expect(sparks.visible).toBe(false); expect(rain.geometry.drawRange.count).toBeLessThanOrEqual(450);
    atmosphere.dispose();
  });
  it('suppresses rain under a roof but not above it', () => {
    setEnvironmentSettings({ weather: 'squall' });
    const { camera, atmosphere } = setup(false, [{ minX: -3, maxX: 3, minZ: -3, maxZ: 3, maxY: 5 }]);
    atmosphere.update(.1, camera); const rain = atmosphere.root.children[0].children[0]; expect(rain.visible).toBe(false);
    camera.position.y = 8; atmosphere.update(.1, camera); expect(rain.visible).toBe(true);
    atmosphere.dispose();
  });
  it('ignores local weather and celebration overrides in LAN', () => {
    setEnvironmentSettings({ weather: 'haze', celebration: 'christmas' });
    const { camera, atmosphere } = setup(true), now = at('2026-06-01'); atmosphere.update(.1, camera, now);
    expect(atmosphere.root.userData.weather).toBe(automaticWeather(now)); expect(atmosphere.root.userData.celebration).toBe('none');
    atmosphere.dispose();
  });
});
