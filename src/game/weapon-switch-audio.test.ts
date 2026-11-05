import { describe, expect, it } from 'vitest';
import manifest from '../audio/switch/manifest.json';
import { ARMORY_CATALOG } from './armory-catalog';
import { variantSpec } from './armory-state';
import { beginWeaponSwitch, weaponCarryClass, weaponSwitchFrame } from './fps-weapon-carry';
import { FPS_WEAPONS, type WeaponSpec } from './fps-rules';
import { SFX_GROUPS, sfxUrls, type SfxGroup } from './sfx-bank';
import { WEAPON_MODE_CUE, weaponSettleCue, weaponSwitchCue, weaponSwitchCues } from './weapon-switch-audio';

const family = (id: string) => FPS_WEAPONS.findIndex(weapon => weapon.id === id);
const P30 = family('p30-inspired'), SAR = family('sar21-inspired');
const HEAVY = FPS_WEAPONS.findIndex(weapon => weaponCarryClass(weapon) === 'support-sling');
const pair = (from: number, to: number) => beginWeaponSwitch(from, to, FPS_WEAPONS)!;
const seconds = (group: SfxGroup) => Math.max(...(manifest.groups as Record<string, { seconds: number }[]>)[group].map(take => take.seconds));

describe('weapon switch sounds', () => {
  it('plays stow, draw and settle once each at a steady frame rate, in order', () => {
    for (const step of [1 / 144, 1 / 30]) {
      const state = pair(SAR, P30), heard: string[] = [];
      while (!weaponSwitchFrame(state).done) {
        const was = state.elapsed; state.elapsed += step;
        const cue = weaponSwitchCue(state, FPS_WEAPONS, was, state.elapsed);
        if (cue) heard.push(cue.group);
      }
      expect(heard).toEqual(['switch-stow-rifle-sling', 'switch-draw-holster', 'switch-settle-pistol']);
    }
  });
  it('starts the draw as the new gun appears and settles before control returns', () => {
    const state = pair(SAR, HEAVY), [stow, draw, settle] = weaponSwitchCues(state, FPS_WEAPONS);
    expect(stow.at).toBeLessThan(.02);
    state.elapsed = draw.at; expect(weaponSwitchFrame(state)).toMatchObject({ phase: 'draw', family: HEAVY });
    state.elapsed = draw.at - .001; expect(weaponSwitchFrame(state)).toMatchObject({ phase: 'stow', family: SAR });
    state.elapsed = settle.at; expect(weaponSwitchFrame(state).done).toBe(false);
    expect(weaponSwitchFrame(state).bodyWeight).toBeLessThan(.15);
  });
  it('plays only the latest cue when a hitch passes several', () => {
    const state = pair(SAR, P30), cues = weaponSwitchCues(state, FPS_WEAPONS);
    expect(weaponSwitchCue(state, FPS_WEAPONS, 0, 5)).toEqual(cues[2]);
    expect(weaponSwitchCue(state, FPS_WEAPONS, .1, .11)).toBeNull();
  });
  it('hears each gun on the side of the body it is carried on', () => {
    expect(weaponSwitchCues(pair(P30, SAR), FPS_WEAPONS)[0].pan).toBeGreaterThan(0);
    const toPistol = weaponSwitchCues(pair(SAR, P30), FPS_WEAPONS);
    expect(toPistol[0].pan).toBeLessThan(0);
    expect(toPistol[1].pan).toBeGreaterThan(0);
    expect(weaponSwitchCues(pair(SAR, HEAVY), FPS_WEAPONS)[1].pan).toBeLessThan(0);
  });
  it('gives every catalog weapon published recordings that end before their beat does', () => {
    const weapons = [...FPS_WEAPONS, ...ARMORY_CATALOG.filter(item => item.category === 'weapon').map(item => variantSpec(item)!)] as WeaponSpec[];
    const stowFor = FPS_WEAPONS.map((_, i) => beginWeaponSwitch(i, i === P30 ? SAR : P30, FPS_WEAPONS)!);
    for (const state of stowFor) {
      const [stow, draw] = weaponSwitchCues(state, FPS_WEAPONS);
      expect(seconds(stow.group)).toBeLessThanOrEqual(state.stow);
      expect(seconds(draw.group)).toBeLessThanOrEqual(state.draw);
    }
    for (const weapon of weapons) {
      for (const cue of [...weaponSwitchCues({ from: 0, to: 0, stow: .4, draw: .4 }, [weapon]), weaponSettleCue(weapon)]) {
        expect(SFX_GROUPS).toContain(cue.group);
        expect(sfxUrls(cue.group, '/')[0]).toMatch(/^\/audio\/switch\//);
      }
    }
    expect(new Set(FPS_WEAPONS.map(weapon => weaponSettleCue(weapon).group)).size).toBeGreaterThan(5);
  });
  it('treats a launcher mode as the rifle it belongs to, with a selector click of its own', () => {
    const launcher = FPS_WEAPONS.find(weapon => weapon.id === 'cc-qts11-launcher'), rifle = FPS_WEAPONS.find(weapon => weapon.id === 'cc-qts11');
    expect(weaponSettleCue(launcher!)).toEqual(weaponSettleCue(rifle!));
    expect(SFX_GROUPS).toContain(WEAPON_MODE_CUE.group);
    expect(seconds(WEAPON_MODE_CUE.group)).toBeLessThan(.2);
  });
  it('leaves out the takes that came back near silent', () => {
    const files = Object.values(manifest.groups).flat().map(take => take.file).join();
    for (const take of ['settle-bullpup-1-', 'settle-bullpup-2-', 'settle-carbine-1-', 'settle-heavy-belt-1-', 'settle-oicw-1-', 'stow-back-sling-2-', 'draw-back-sling-1-', 'settle-oicw-launcher']) expect(files).not.toContain(take);
  });
});
