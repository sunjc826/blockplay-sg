import * as THREE from 'three';
import { rangeDamageNumber, type RangeArmorTier, type RangeDamageMeter } from './range-damage';

/** A small billboard above each dummy; never intercepts shots or sight rays. */
export function createRangeDamageLabel(target: number, tier: RangeArmorTier) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
  const context = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false });
  const sprite = new THREE.Sprite(material); sprite.position.set(0, 2.35, 0); sprite.scale.set(2.4, .75, 1); sprite.raycast = () => {};
  let previous = '';
  function update(meter: RangeDamageMeter) {
    const lines = [`DUMMY ${target} · ${tier.label}`, `LAST ${rangeDamageNumber(meter.last)}   TOTAL ${rangeDamageNumber(meter.total)}`, `ARMOR  ${rangeDamageNumber(meter.lastArmor)} / ${rangeDamageNumber(meter.totalArmor)}`];
    const key = lines.join('|'); if (key === previous) return; previous = key;
    context.clearRect(0, 0, 512, 160); context.fillStyle = '#101c27e8'; context.fillRect(0, 0, 512, 160);
    context.fillStyle = tier.color; context.fillRect(0, 0, 6, 160); context.textAlign = 'center';
    context.font = 'bold 25px sans-serif'; context.fillText(lines[0], 256, 36);
    context.fillStyle = '#ffffff'; context.font = 'bold 30px sans-serif'; context.fillText(lines[1], 256, 86);
    context.fillStyle = '#a7bfcd'; context.font = '22px sans-serif'; context.fillText(lines[2], 256, 130);
    texture.needsUpdate = true;
  }
  return { sprite, update, dispose() { sprite.removeFromParent(); texture.dispose(); material.dispose(); } };
}
