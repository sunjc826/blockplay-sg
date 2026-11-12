import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { acesFilmic, blendGrade, buildingSeed, createDistrictLook, DAY_SKY_RAYS, gradeColor, groundCells, hazeAmount, inverseAcesFilmic, lookPalette, MARINA_LOOK, skyColorAt,
  surfaceHash, surfaceShade, wallPanels, type DistrictLook, type LookPaletteInput, type SurfacePoint } from './district-look';
import { dayLighting } from './world-lighting';
import { WEATHER } from './world-events';
import type { Rgb } from './world-sky-light';

const linear = (hex: string): Rgb => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const luminance = (c: Rgb) => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
function input(hour: number, weather: keyof typeof WEATHER = 'sunny', night = 0): LookPaletteInput {
  const l = dayLighting(hour, 316), preset = WEATHER[weather];
  const background = new THREE.Color(preset.sky).lerp(new THREE.Color(l.sky), l.skyWeight);
  return { background: [background.r, background.g, background.b], keyColor: linear(l.keyColor), keyDirection: l.key, elevation: l.elevation,
    shift: l.shift, night, sun: preset.sun, rain: preset.rain, haze: weather === 'haze' ? 1 : 0 };
}

describe('district look', () => {
  it('paints a day sky bluer and deeper at the zenith than at the horizon, and a dark night sky', () => {
    const day = lookPalette(input(13));
    expect(day.zenith[2] / day.zenith[0]).toBeGreaterThan(day.horizon[2] / day.horizon[0]);
    expect(luminance(day.zenith)).toBeLessThan(luminance(day.horizon));
    const night = lookPalette(input(22.5, 'sunny', 1));
    expect(luminance(night.zenith)).toBeLessThan(.02);
    expect(luminance(night.horizon)).toBeGreaterThan(luminance(night.zenith));
    // Clouds cover more of a rainy sky and their base is darker than the haze under it.
    const rain = lookPalette(input(16.5, 'showers'));
    expect(rain.coverage).toBeGreaterThan(day.coverage + .3);
    expect(luminance(rain.cloudShade)).toBeLessThan(luminance(rain.horizon));
    // Dusk warms the horizon.
    const dusk = lookPalette(input(18.75));
    expect(dusk.horizon[0]).toBeGreaterThan(dusk.horizon[2]);
  });

  it('blends the sky from horizon to zenith and brightens towards the sun', () => {
    const p = lookPalette(input(9.5)), sun = dayLighting(9.5, 316).key;
    const at = (d: { x: number; y: number; z: number }) => skyColorAt(p, d, sun);
    // Facing away from the sun, the horizon is the horizon colour and straight up (glow aside) the zenith.
    const flat = Math.hypot(sun.x, sun.z), away = { x: -sun.x / flat, y: 0, z: -sun.z / flat };
    at(away).forEach((v, i) => expect(v).toBeCloseTo(p.horizon[i], 2));
    expect(at({ x: 0, y: 1, z: 0 })[2] / at({ x: 0, y: 1, z: 0 })[0]).toBeGreaterThan(at(away)[2] / at(away)[0]);
    expect(luminance(at(sun))).toBeGreaterThan(luminance(at({ x: -sun.x, y: sun.y, z: -sun.z })));
  });

  it('inverts ACES so authored colours land on screen as designed', () => {
    for (const exposure of [.9, 1.05]) for (const c of [[.3, .5, .8], [.02, .01, .05], [.9, .6, .4]] as Rgb[]) {
      const back = acesFilmic(inverseAcesFilmic(c, exposure), exposure);
      back.forEach((v, i) => expect(v).toBeCloseTo(c[i], 3));
    }
  });

  it('hazes far ground more than near ground, and thins with height', () => {
    const { fogNear, fogFar } = WEATHER.sunny, haze = MARINA_LOOK.haze;
    expect(hazeAmount(50, 2, 0, fogNear, fogFar, haze)).toBe(0);
    const at500 = hazeAmount(500, 2, 0, fogNear, fogFar, haze);
    expect(at500).toBeGreaterThan(.3); expect(at500).toBeLessThan(.7);
    // A tower top at 200 m, 500 m away, stands clearer than its base.
    expect(hazeAmount(500, 2, 200, fogNear, fogFar, haze)).toBeLessThan(at500 * .7);
    // Rain closes the view in.
    expect(hazeAmount(300, 2, 0, WEATHER.showers.fogNear, WEATHER.showers.fogFar, haze)).toBeGreaterThan(hazeAmount(300, 2, 0, fogNear, fogFar, haze));
  });

  it('grades without darkening shade by itself, and leaves the picture alone at zero', () => {
    const grade = blendGrade(MARINA_LOOK.grade, 0, 0, 0);
    expect(gradeColor([.2, .3, .4], { ...grade, amount: 0 })).toEqual([.2, .3, .4]);
    const grey = gradeColor([.18, .18, .18], grade);
    expect(luminance(grey)).toBeGreaterThan(.16); expect(luminance(grey)).toBeLessThan(.2);
    // Shadows lean cool and highlights warm.
    const shade = gradeColor([.03, .03, .03], grade), light = gradeColor([.8, .8, .8], grade);
    expect(shade[2]).toBeGreaterThan(shade[0]); expect(light[0]).toBeGreaterThan(light[2]);
    // Black and white stay put.
    expect(gradeColor([0, 0, 0], grade)).toEqual([0, 0, 0]);
    expect(luminance(gradeColor([1, 1, 1], grade))).toBeGreaterThan(.97);
    // Storm and night grades take over with the weather and the hour.
    expect(blendGrade(MARINA_LOOK.grade, 0, 0, 1).saturation).toBeCloseTo(MARINA_LOOK.grade.storm.saturation);
    expect(blendGrade(MARINA_LOOK.grade, 1, 1, 0).shadows).toEqual(MARINA_LOOK.grade.night.shadows);
  });

  it('samples daytime sky with unit, cosine-weighted, upward rays', () => {
    expect(DAY_SKY_RAYS).toHaveLength(12);
    for (const d of DAY_SKY_RAYS) { expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6); expect(d.y).toBeGreaterThan(0); }
    // Cosine weighting: the mean height of the rays is 2/3.
    expect(DAY_SKY_RAYS.reduce((sum, d) => sum + d.y, 0) / 12).toBeCloseTo(2 / 3, 1);
  });

  it('drives the dome and patch uniforms, flattens for thermal skies, and fades indirect light at night and under GTAO', () => {
    const look = createDistrictLook(MARINA_LOOK), scene = new THREE.Scene(), root = new THREE.Group();
    const background = new THREE.Color('#b9dcea'); scene.background = background; look.attach(scene, root);
    expect(scene.userData.skyDome.mesh).toBe(look.dome); expect(look.dome.parent).toBe(root);
    const frame = { background, keyColor: new THREE.Color('#fff3e2'), keyDirection: { x: .3, y: .9, z: .1 }, elevation: 64, shift: 0, night: 0, sun: 1, rain: 0, haze: 0, wind: 0,
      exposure: .9, sunIrradiance: new THREE.Color(2, 2, 2), groundColor: new THREE.Color('#707060'), dt: .1, reduced: false, lowDetail: false, gtao: false };
    expect(look.update(frame)).toBe(1);
    expect(look.update({ ...frame, gtao: true })).toBeLessThan(1);
    expect(look.update({ ...frame, night: 1 })).toBe(0);
    expect(look.update({ ...frame, lowDetail: true })).toBe(0);
    expect(createDistrictLook(MARINA_LOOK, { software: true }).extension).toBeUndefined();
    look.update(frame);
    expect(look.uniforms.lookBounce.value.length()).toBeGreaterThan(0);
    const sky = look.skyAtSun(null, new THREE.Color())!;
    expect(sky.r).toBeGreaterThan(0); expect(sky.b).toBeLessThanOrEqual(1);
    const render = () => look.dome.onBeforeRender({} as THREE.WebGLRenderer, scene, new THREE.Camera(), look.dome.geometry, look.dome.material as THREE.Material, new THREE.Group());
    render(); expect(look.uniforms.lookFlat.value).toBe(0);
    background.setRGB(.004, .004, .005); render(); expect(look.uniforms.lookFlat.value).toBe(1);
    look.dispose(); expect(scene.userData.skyDome).toBeUndefined();
  });
});

describe('district look surface variation', () => {
  const surface = MARINA_LOOK.surface!;
  const point = (p: Partial<SurfacePoint>): SurfacePoint => ({ normalY: 0, height: 10, seed: null, cells: 0, panels: 0, green: 0, ...p });

  it('hashes evenly into 0–1 and seeds the stacked parts of one building alike', () => {
    let sum = 0, n = 0;
    for (let i = -40; i < 40; i++) for (let j = -40; j < 40; j++) { const h = surfaceHash(i, j); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(1); sum += h; n++; }
    expect(sum / n).toBeCloseTo(.5, 1);
    // A podium, shaft and crown share their centre; a neighbour two cells away is seeded differently.
    expect(buildingSeed(103.2, -41.5, 8)).toEqual(buildingSeed(103.2, -41.5, 8));
    expect(buildingSeed(100.5, -41, 8)).toEqual(buildingSeed(103.9, -46, 8));
    const seeds = Array.from({ length: 30 }, (_, i) => buildingSeed(i * 17, i * 11, 8)[0]);
    expect(new Set(seeds.map(s => s.toFixed(3))).size).toBeGreaterThan(25);
    for (const s of seeds) expect(Math.abs(s)).toBeLessThanOrEqual(1);
  });

  it('lays blocky ground cells that are flat inside a cell and average out over a district', () => {
    expect(groundCells(.1, .1, surface.ground)).toBe(groundCells(.5, .5, surface.ground));
    let sum = 0, n = 0;
    for (let x = 0; x < 400; x += 1.3) for (let z = 0; z < 400; z += 1.7) { const c = groundCells(x, z, surface.ground); expect(Math.abs(c)).toBeLessThanOrEqual(1); sum += c; n++; }
    expect(Math.abs(sum / n)).toBeLessThan(.1);
    expect(wallPanels(.2, .2, surface.wall)).toBe(wallPanels(1, 1, surface.wall));
  });

  it('stays subtle: under 10% typical colour change, a third at most where every term peaks, roughness within half', () => {
    let squares = 0;
    for (let i = 0; i < 400; i++) {
      const r = (k: number) => surfaceHash(i, k) * 2 - 1;
      const shade = surfaceShade(point({ normalY: r(1), height: (r(2) + 1) * 50, seed: [r(3), r(4)], cells: r(5), panels: r(6), green: (r(7) + 1) / 2 }), surface, .16);
      for (const c of shade.color) { expect(c).toBeGreaterThan(.7); expect(c).toBeLessThan(1.35); squares += (c - 1) ** 2 / 3; }
      expect(Math.abs(shade.roughness - 1)).toBeLessThan(.5);
    }
    expect(Math.sqrt(squares / 400)).toBeLessThan(.1);
  });

  it('leaves a surface alone at zero amount, and plain meshes without a seed untinted', () => {
    const off = surfaceShade(point({ normalY: 1, seed: [1, 1], cells: 1, panels: 1, green: 1, height: 0 }), surface, 0, 0);
    expect(off.color).toEqual([1, 1, 1]); expect(off.roughness).toBe(1);
    const roof = surfaceShade(point({ normalY: 1, height: 30 }), surface, .45);
    expect(roof.color[0]).toBeCloseTo(1, 6); expect(roof.color[2]).toBeCloseTo(1, 6); expect(roof.roughness).toBeCloseTo(1, 6);
  });

  it('keeps ground cells off walls and wall panels off the ground', () => {
    const wall = surfaceShade(point({ normalY: 0, cells: 1 }), surface, .45), ground = surfaceShade(point({ normalY: 1, panels: 1 }), surface, .45);
    expect(wall.color[1]).toBeCloseTo(surfaceShade(point({ normalY: 0 }), surface, .45).color[1], 6);
    expect(ground.color[1]).toBeCloseTo(1, 6);
    expect(surfaceShade(point({ normalY: 1, cells: 1 }), surface, .45).color[1]).toBeGreaterThan(1);
  });

  it('dirties wall feet without doubling the contact shade, and lightens towers upwards', () => {
    const at = (height: number, contact: number) => surfaceShade(point({ height }), surface, contact).color[1];
    expect(at(0, .16)).toBeLessThan(at(3, .16));
    // Where the look's contact term already darkens the foot (no GTAO), the grime gives way.
    expect(at(0, .45)).toBeGreaterThan(at(0, .16));
    expect(at(60, .16)).toBeGreaterThan(at(10, .16));
    expect(at(60, .16)).toBeLessThanOrEqual(1 + surface.wall.lift + 1e-9);
  });

  it('warms lighter lawn cells and cools darker ones, leaving grey paving its hue', () => {
    const light = surfaceShade(point({ normalY: 1, cells: 1, green: 1 }), surface, 0).color;
    const dark = surfaceShade(point({ normalY: 1, cells: -1, green: 1 }), surface, 0).color;
    const grey = surfaceShade(point({ normalY: 1, cells: 1, green: 0 }), surface, 0).color;
    expect(light[0] / light[2]).toBeGreaterThan(1); expect(dark[0] / dark[2]).toBeLessThan(1); expect(grey[0]).toBeCloseTo(grey[2], 6);
  });

  it('turns the surface pass on only for looks that ask for it, and off on reduced effects', () => {
    const frame = { background: new THREE.Color('#b9dcea'), keyColor: new THREE.Color('#fff3e2'), keyDirection: { x: .3, y: .9, z: .1 }, elevation: 64, shift: 0, night: 0, sun: 1, rain: 0, haze: 0, wind: 0,
      exposure: .9, sunIrradiance: new THREE.Color(2, 2, 2), groundColor: new THREE.Color('#707060'), dt: .1, reduced: false, lowDetail: false, gtao: false };
    const marina = createDistrictLook(MARINA_LOOK);
    expect(marina.extension?.albedo).toContain('lookSurface'); expect(marina.extension?.vertex).toContain('vLookCoord');
    marina.update(frame); expect(marina.uniforms.lookSurface.value.x).toBe(1);
    marina.update({ ...frame, lowDetail: true }); expect(marina.uniforms.lookSurface.value.x).toBe(0);
    const bare: DistrictLook = { ...MARINA_LOOK, surface: undefined }, plain = createDistrictLook(bare);
    expect(plain.extension?.albedo).toBeUndefined(); expect(plain.extension?.declarations).not.toContain('lookCellValue');
    plain.update(frame); expect(plain.uniforms.lookSurface.value.x).toBe(0);
    marina.dispose(); plain.dispose();
  });
});
