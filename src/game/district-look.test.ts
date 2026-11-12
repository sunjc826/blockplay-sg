import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { acesFilmic, blendGrade, createDistrictLook, DAY_SKY_RAYS, gradeColor, hazeAmount, inverseAcesFilmic, lookPalette, MARINA_LOOK, skyColorAt, type LookPaletteInput } from './district-look';
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
