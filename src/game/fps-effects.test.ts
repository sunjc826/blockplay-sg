import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createFpsEffects } from './fps-effects';
import { ISSUED_STYLE, patchStyle, type EffectStyle } from './fps-effect-styles';

/**
 * The effects layer builds scene objects; only drawing them needs a GPU, so
 * everything about which colour ends up on which instance is checkable here.
 */
const styled = (id: string, patch: Parameters<typeof patchStyle>[1]): EffectStyle => ({ ...patchStyle(ISSUED_STYLE, patch), id, name: id });
const RIFLE = styled('rifle', { flare: { core: '#ff0000', star: '#00ff00', cone: '#0000ff', light: '#ffff00' }, tracer: { colour: '#ff00ff', opacity: .5 }, brass: { colour: '#112233' }, ring: { surface: '#010203' } });
const SUPPORT = styled('support', { flare: { core: '#00ffff' }, tracer: { colour: '#123456' }, brass: { colour: '#aabbcc' }, ring: { surface: '#fedcba' } });

function rig(style?: EffectStyle) {
  const world = new THREE.Scene(), view = new THREE.Scene();
  const effects = createFpsEffects(world, view, { style });
  const camera = new THREE.PerspectiveCamera();
  // Stands in for the weapon's ejection port, in the viewmodel scene.
  const port = new THREE.Object3D(); port.position.set(.04, .16, .23); view.add(port);
  view.updateMatrixWorld(true);
  const mesh = (name: string) => effects.root.getObjectByName(name) as THREE.InstancedMesh;
  const colourAt = (name: string, index: number) => new THREE.Color().fromBufferAttribute(mesh(name).instanceColor!, index);
  return { effects, world, view, camera, port, mesh, colourAt };
}
const hex = (colour: THREE.Color) => '#' + colour.getHexString();
/**
 * A ring is drawn at its style's colour times its own fade, so comparing raw
 * values would be comparing brightness. Normalizing to the brightest channel
 * leaves only the tint, which is the part the style decides.
 */
const tint = (colour: THREE.Color) => {
  const peak = Math.max(colour.r, colour.g, colour.b, 1e-6);
  return [colour.r / peak, colour.g / peak, colour.b / peak];
};
const tintOf = (hexColour: string) => tint(new THREE.Color(hexColour));
const expectTint = (got: THREE.Color, want: string) =>
  tint(got).forEach((channel, i) => expect(channel).toBeCloseTo(tintOf(want)[i], 2));

it('starts in the style it is given and repaints the rig when it changes', () => {
  const { effects, view } = rig(RIFLE);
  const flare = effects.flare;
  const core = (flare.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
  expect(effects.style.id).toBe('rifle');
  expect(hex(core.color)).toBe('#ff0000');
  const light = view.children.find(o => o instanceof THREE.PointLight) as THREE.PointLight;
  expect(hex(light.color)).toBe('#ffff00');

  effects.setStyles([RIFLE, SUPPORT], 1);
  expect(effects.style.id).toBe('support');
  expect(hex(core.color)).toBe('#00ffff');
  effects.dispose();
});

it('keeps drawing a case in the colours of the weapon that ejected it', () => {
  const { effects, camera, port, colourAt } = rig(RIFLE);
  effects.setStyles([RIFLE, SUPPORT], 0);
  effects.fire({ recoil: .018, eject: port, camera });
  effects.update(1 / 60, camera, 0);
  expect(hex(colourAt('fps-brass', 0))).toBe('#112233');

  // Switch weapons and fire again: the first case keeps the rifle's brass and
  // the second arrives in the support weapon's, out of the same instanced draw.
  effects.setStyles([RIFLE, SUPPORT], 1);
  effects.fire({ recoil: .026, eject: port, camera });
  effects.update(1 / 60, camera, 0);
  expect(hex(colourAt('fps-brass', 0))).toBe('#112233');
  expect(hex(colourAt('fps-brass', 1))).toBe('#aabbcc');
  effects.dispose();
});

it('draws an impact in the style of the round that made it, not the weapon in hand', () => {
  const { effects, camera, colourAt } = rig(RIFLE);
  effects.setStyles([RIFLE, SUPPORT], 0);
  const point = new THREE.Vector3(0, 1, -3), normal = new THREE.Vector3(0, 0, 1);
  effects.impact(point, normal, 'surface', 1);
  effects.update(1 / 600, camera, 0);
  expectTint(colourAt('fps-impact-rings', 0), '#010203');

  effects.setStyles([RIFLE, SUPPORT], 1);
  // A round still in the air from the rifle lands after the swap, named explicitly.
  effects.impact(point, normal, 'surface', 1, 'rifle');
  effects.impact(point, normal, 'surface', 1);
  effects.update(1 / 600, camera, 0);
  expectTint(colourAt('fps-impact-rings', 1), '#010203');
  expectTint(colourAt('fps-impact-rings', 2), '#fedcba');
  effects.dispose();
});

it('falls back to the weapon in hand for a spawn it cannot place', () => {
  const { effects, camera, colourAt } = rig(RIFLE);
  // 'gone' was never declared to the layer, so it resolves to the current style.
  effects.impact(new THREE.Vector3(0, 1, -3), new THREE.Vector3(0, 0, 1), 'surface', 1, 'gone');
  effects.update(1 / 600, camera, 0);
  expectTint(colourAt('fps-impact-rings', 0), '#010203');
  effects.dispose();
});

it('flags its whole world tree so a gameplay ray can filter it out', () => {
  const { effects, world } = rig();
  expect(effects.root.userData.fpsEffect).toBe(true);
  expect(world.children.filter(o => !o.userData.fpsEffect)).toHaveLength(0);
  expect(effects.style.id).toBe(ISSUED_STYLE.id);
  effects.dispose();
  expect(world.children).toHaveLength(0);
});
