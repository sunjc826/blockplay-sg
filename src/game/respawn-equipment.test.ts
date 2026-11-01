import { expect, it } from 'vitest';
import { createProfile, resolveLoadout } from './armory-state';
import { respawnEquipment } from './respawn-equipment';

it('restores the chosen guns, carry slots and worn gear without rolling back supplies or rewards', () => {
  const starting = createProfile();
  starting.owned.push('plate-soft'); starting.plate = 'plate-soft';
  starting.carry = { main: 1, extra: 0 };
  starting.consumables = { bandage: 3 };
  const current = structuredClone(starting);
  current.guns[0].variant = 'sar-twoeyes'; current.carry = { main: 0, extra: null };
  current.plate = 'plate-elite'; current.rig = 'rig-sentinel'; current.vision = 'vision-none';
  current.credits += 200; current.xp += 100; current.rewarded.push('kill');
  current.consumables = { bandage: 1 }; current.quickItem = 'bandage';
  const restored = respawnEquipment(current, starting);
  expect(restored.guns).toEqual(starting.guns);
  expect(restored.carry).toEqual(starting.carry);
  expect(restored).toMatchObject({ plate: starting.plate, rig: starting.rig, vision: starting.vision,
    credits: current.credits, xp: current.xp, rewarded: ['kill'], consumables: { bandage: 1 }, quickItem: 'bandage' });
  expect(current.plate).toBe('plate-elite');
  restored.guns[0].variant = 'changed'; restored.carry.main = 0;
  expect(starting.guns[0].variant).not.toBe('changed'); expect(starting.carry.main).toBe(1);
});

it('uses the expedition-entry equipment after travel and repeated deaths', () => {
  const starting = createProfile();
  const firstDistrict = structuredClone(starting);
  firstDistrict.carry = { main: 1, extra: null }; firstDistrict.plate = 'plate-elite';
  const nextDistrict = structuredClone(firstDistrict);
  const restored = respawnEquipment(nextDistrict, starting);
  expect(resolveLoadout(restored).carriedFamilies).toEqual(resolveLoadout(starting).carriedFamilies);
  expect(resolveLoadout(restored).armor).toBe(0);
  restored.carry = { main: 1, extra: null };
  expect(respawnEquipment(restored, starting).carry).toEqual(starting.carry);
});

it('forfeits a stolen proxy prototype on death, including after district travel', () => {
  const starting=createProfile(), current=structuredClone(starting);
  current.owned.push('sar-proxy-prototype');current.guns[0].variant='sar-proxy-prototype';
  const after=respawnEquipment(structuredClone(current),starting);
  expect(after.owned).not.toContain('sar-proxy-prototype');expect(after.guns[0].variant).toBe('sar-issued');
});
