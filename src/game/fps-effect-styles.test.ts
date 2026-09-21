import { afterEach, expect, it } from 'vitest';
import { effectStyleForWeapon, ISSUED_STYLE, mixHex, registeredEffectStyles, registerEffectStyle, resolveEffectStyle, tintStyle, unregisterEffectStyle } from './fps-effect-styles';
import { ejectCasing, type Casing } from './fps-casings';
import { createImpactField, recordImpact } from './fps-impacts';

afterEach(() => registeredEffectStyles().forEach(unregisterEffectStyle));
const hex = /^#[0-9a-f]{6}$/;
const colours = (style: ReturnType<typeof resolveEffectStyle>) => [
  style.flare.core, style.flare.star, style.flare.cone, style.flare.light,
  style.tracer.colour, style.spark.hot, style.spark.cold,
  style.ring.surface, style.ring.target, style.dust, style.smoke, style.brass.colour,
];

it('blends colours in sRGB and refuses to blank one on bad input', () => {
  expect(mixHex('#000000', '#ffffff', .5)).toBe('#808080');
  expect(mixHex('#ff0000', '#00ff00', 0)).toBe('#ff0000');
  expect(mixHex('#ff0000', '#00ff00', 1)).toBe('#00ff00');
  expect(mixHex('#f00', '#00f', .5)).toBe('#800080');
  // Out of range clamps, and anything unparseable leaves the first colour alone.
  expect(mixHex('#000000', '#ffffff', 9)).toBe('#ffffff');
  expect(mixHex('#123456', 'not a colour', .5)).toBe('#123456');
  expect(mixHex('rgb(1,2,3)', '#ffffff', .5)).toBe('rgb(1,2,3)');
});

it('leaves issued kit exactly as it was before styles existed', () => {
  const issued = effectStyleForWeapon({ equipment: { variant: 'sar-issued', skin: 'skin-issued', attachments: {} } });
  expect({ ...issued, id: ISSUED_STYLE.id }).toEqual(ISSUED_STYLE);
  colours(issued).forEach(colour => expect(colour).toMatch(hex));
});

it('carries a premium weapon\'s accent through the flare, tracer and sparks', () => {
  const gold = effectStyleForWeapon({ equipment: { variant: 'sar-vanguard', skin: 'skin-issued', attachments: {} }, accent: '#d6ad52' });
  const steel = effectStyleForWeapon({ equipment: { variant: 'sar-marksman', skin: 'skin-issued', attachments: {} }, accent: '#b8c6cf' });
  expect(gold.flare.star).not.toBe(ISSUED_STYLE.flare.star);
  expect(gold.flare.star).not.toBe(steel.flare.star);
  expect(gold.tracer.colour).not.toBe(steel.tracer.colour);
  // The heart of the flash stays near-white whatever the accent, or it reads as
  // a coloured bulb rather than as ignition.
  const blue = tintStyle(ISSUED_STYLE, '#0000ff');
  expect(parseInt(blue.flare.core.slice(5, 7), 16)).toBeLessThan(220);
  expect(parseInt(blue.flare.core.slice(1, 3), 16)).toBeGreaterThan(200);
  colours(gold).forEach(colour => expect(colour).toMatch(hex));
});

it('gives an unknown or missing weapon the issued look instead of throwing', () => {
  expect(effectStyleForWeapon(undefined).flare).toEqual(ISSUED_STYLE.flare);
  expect(resolveEffectStyle({ variant: 'no-such-weapon' }).flare).toEqual(ISSUED_STYLE.flare);
  expect(resolveEffectStyle({}).id).toBe('issued');
  // A malformed accent is ignored rather than blanking the flare.
  expect(resolveEffectStyle({ accent: 'chartreuse' }).flare).toEqual(ISSUED_STYLE.flare);
});

it('patches only what a registration names, and lets a skin outrank a weapon', () => {
  const plain = resolveEffectStyle({ variant: 'sar-vanguard', accent: '#d6ad52' });
  registerEffectStyle('sar-vanguard', { tracer: { colour: '#22ff88' }, name: 'Vanguard' });
  const patched = resolveEffectStyle({ variant: 'sar-vanguard', accent: '#d6ad52' });
  expect(patched.tracer.colour).toBe('#22ff88');
  expect(patched.name).toBe('Vanguard');
  // Everything the patch left out survives, the tier's figures and the accent
  // tint alike: only the one colour it named has moved.
  expect(patched.tracer.opacity).toBe(plain.tracer.opacity);
  expect(patched.flare).toEqual(plain.flare);
  expect(patched.spark).toEqual(plain.spark);
  expect({ ...patched, tracer: plain.tracer, name: plain.name }).toEqual(plain);
  registerEffectStyle('skin-gold', { tracer: { colour: '#ffcc00' }, brass: { colour: '#fff1b0' } });
  const skinned = resolveEffectStyle({ variant: 'sar-vanguard', skin: 'skin-gold', accent: '#d6ad52' });
  expect(skinned.tracer.colour).toBe('#ffcc00');
  expect(skinned.brass.colour).toBe('#fff1b0');
  expect(skinned.brass.metalness).toBe(patched.brass.metalness);
  unregisterEffectStyle('skin-gold');
  expect(resolveEffectStyle({ variant: 'sar-vanguard', skin: 'skin-gold' }).tracer.colour).toBe('#22ff88');
});

it('gives each loadout a stable id, so a spawn can find its style again later', () => {
  const rifle = { equipment: { variant: 'sar-vanguard', skin: 'skin-issued', attachments: {} }, accent: '#d6ad52' };
  const support = { equipment: { variant: 'ult-issued', skin: 'skin-issued', attachments: {} } };
  expect(effectStyleForWeapon(rifle).id).toBe(effectStyleForWeapon(rifle).id);
  expect(effectStyleForWeapon(rifle).id).not.toBe(effectStyleForWeapon(support).id);
});

it('tags what a shot leaves behind, so switching weapons never retints it', () => {
  const rifle = effectStyleForWeapon({ equipment: { variant: 'sar-vanguard', skin: 'skin-issued', attachments: {} }, accent: '#d6ad52' });
  const support = effectStyleForWeapon({ equipment: { variant: 'ult-issued', skin: 'skin-issued', attachments: {} } });
  const list: Casing[] = [];
  ejectCasing(list, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, undefined, Math.random, rifle.id);
  ejectCasing(list, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, undefined, Math.random, support.id);
  expect(list.map(casing => casing.style)).toEqual([rifle.id, support.id]);

  const field = createImpactField();
  recordImpact(field, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 'surface', 1, Math.random, rifle.id);
  // The tag reaches the sparks and the scorch too, not only the impact itself.
  expect(field.impacts[0].style).toBe(rifle.id);
  expect(field.sparks.every(spark => spark.style === rifle.id)).toBe(true);
  expect(field.scorches[0].style).toBe(rifle.id);
  // An untagged record is still legal; the renderer falls back to the weapon in hand.
  recordImpact(field, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 });
  expect(field.impacts[1].style).toBeUndefined();
});
