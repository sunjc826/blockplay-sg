import { expect, it } from 'vitest';
import { armorBrokeOnScreen, bloodBorder, type ScreenVitals } from './screen-damage';
it('scales the blood border with relative health and clears at recovery or death',()=>{
  expect(bloodBorder(80,100).opacity).toBe(0);expect(bloodBorder(0,100).opacity).toBe(0);
  expect(bloodBorder(40,100).band).toBe('low');expect(bloodBorder(20,100).band).toBe('critical');
  expect(bloodBorder(5,100).opacity).toBeGreaterThan(bloodBorder(20,100).opacity);
  expect(bloodBorder(20,100).opacity).toBeGreaterThan(bloodBorder(40,100).opacity);
  expect(bloodBorder(100,500)).toEqual(bloodBorder(20,100));
});
it('flashes only on a live armor break, not first snapshots, gear expiry, death or respawn',()=>{
  const before:ScreenVitals={health:80,armor:20,maxArmor:75,playing:true,alive:true,deaths:0};
  const broken={...before,health:75,armor:0};
  expect(armorBrokeOnScreen(before,broken)).toBe(true);
  expect(armorBrokeOnScreen(broken,broken)).toBe(false);
  expect(armorBrokeOnScreen(null,broken)).toBe(false);
  for(const next of [{...broken,maxArmor:0},{...broken,playing:false},{...broken,alive:false,health:0},{...broken,deaths:1}])expect(armorBrokeOnScreen(before,next)).toBe(false);
});
