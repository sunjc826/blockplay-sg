import * as THREE from 'three';
import { rangeDamageDps, rangeDamageNumber, type RangeArmorTier, type RangeDamageMeter } from './range-damage';

/** A small billboard above each dummy; never intercepts shots or sight rays. */
export function createRangeDamageLabel(target: number, tier: RangeArmorTier) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 144;
  const context = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(.5, 0);
  sprite.scale.set(1.8, 1.8 * canvas.height / canvas.width, 1);
  sprite.raycast = () => {};
  const title = `Dummy ${target} · ${tier.label}`;
  let previous = '';
  function update(meter: RangeDamageMeter, now: number, cleared: boolean) {
    const damaged = meter.lastHitAt !== null;
    const health = damaged ? `Last ${rangeDamageNumber(meter.last)}   Total ${rangeDamageNumber(meter.total)}   DPS ${rangeDamageNumber(rangeDamageDps(meter, now, cleared))}` : '';
    const details = damaged ? `Hits ${meter.hits} · Armor ${rangeDamageNumber(meter.lastArmor)} last / ${rangeDamageNumber(meter.totalArmor)} total` : '';
    const key = `${title}|${health}|${details}`;
    if (key === previous) return;
    previous = key;
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    context.textAlign = 'center';
    context.font = 'bold 32px sans-serif';
    const panelWidth = damaged ? width : Math.min(width, context.measureText(title).width + 36);
    const panelTop = damaged ? 0 : height - 48;
    context.fillStyle = '#101c27cf';
    context.beginPath();
    context.roundRect((width - panelWidth) / 2, panelTop, panelWidth, height - panelTop, 12);
    context.fill();
    context.fillStyle = tier.color;
    context.fillText(title, width / 2, panelTop + 34, panelWidth - 24);
    if (damaged) {
      context.fillStyle = '#ffffff';
      context.font = 'bold 36px sans-serif';
      context.fillText(health, width / 2, 86, width - 24);
      context.fillStyle = '#d3e2ea';
      context.font = '30px sans-serif';
      context.fillText(details, width / 2, 126, width - 24);
    }
    texture.needsUpdate = true;
  }
  return { sprite, update, dispose() { sprite.removeFromParent(); texture.dispose(); material.dispose(); } };
}
