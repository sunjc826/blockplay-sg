import type { FittedPart, ShopItem } from './armory-catalog';
import { magnifiedFov } from './fps-rules';
import { muzzleBallistics } from './fps-ballistics';

const suppressor: FittedPart = {
  slot: 'muzzle', name: 'Signature-reduction suppressor',
  description: 'Hides the flash and reduces the report, at a small cost to velocity and handling.',
  accessories: { muzzle: 'suppressor' }, modifiers: { recoil: .86, mobility: .97, velocity: .9 },
};
const compensator: FittedPart = {
  slot: 'muzzle', name: 'Ported control brake', description: 'Less climb at the cost of a louder report and brighter flash.',
  accessories: { muzzle: 'compensator' }, modifiers: { recoil: .78, recoilRecovery: 1.1 },
};
const rail: FittedPart = {
  slot: 'rail', name: 'Laser-light module', description: 'A switchable aiming laser and white light. B and L control them independently.',
  accessories: { rail: 'laser-light' }, modifiers: { mobility: .99 },
};
const telescope: FittedPart = {
  slot: 'optic', name: 'Sharpshooter telescope · 3.5×', description: 'An etched telescope on the carry handle.',
  stats: { optic: 'integrated' }, modifiers: { aimFov: magnifiedFov(3.5) },
};

/** Only event specialists draw these. Regular patrol pools, shops and crates never do. */
export const ENEMY_ULTRA_CATALOG: readonly ShopItem[] = [
  {
    id: 'xm8-spectre', source: 'enemy', config: 'compact', family: 5, category: 'weapon', tier: 'Ultra', price: 0, currency: 'credits',
    name: 'XM8 · Spectre', accent: '#8ba7bd', weightKg: 3.5,
    flavorText: 'The quiet part of the squad.',
    description: 'Elite breacher issue. A suppressed compact with 40 damage, a fast cycle and a laser-light module. Full damage to 24 m; its compact barrel gives up reach beyond that. Recovered only from rare elite squads; expedition-only.',
    build: [
      { id: 'spectre-barrel', name: 'Compact match barrel', description: 'A tuned short barrel and load for close engagements.', damage: 7, interval: -.008, mobility: 1.04, traits: [{ kind: 'falloff', near: 24, far: 70, minScale: .5 }] },
      { id: 'spectre-buffer', name: 'Matched buffer and stock', description: 'A softer cycle and faster magazine change.', recoil: -.003, recoilRecovery: .18, reload: -.15 },
    ], fitted: [suppressor, rail],
  },
  {
    id: 'g36-sentinel', source: 'enemy', config: 'rifle', family: 6, category: 'weapon', tier: 'Ultra', price: 0, currency: 'credits',
    name: 'G36 · Sentinel', accent: '#8ba7bd', weightKg: 4.3,
    flavorText: 'Three-power glass. No warning shots.',
    description: 'Elite rifleman issue. A braked full-length rifle with 46 damage, its integrated 3× scope and a laser-light module. Full damage to 42 m, with a steadier cycle and a thirty-round magazine. Recovered only from rare elite squads; expedition-only.',
    build: [
      { id: 'sentinel-barrel', name: 'Selected full-length barrel', description: 'A stronger load and tighter long-range grouping.', damage: 10, ballistics: muzzleBallistics(1040), traits: [{ kind: 'falloff', near: 42, far: 115, minScale: .65 }] },
      { id: 'sentinel-buffer', name: 'Tuned carrier and buffer', description: 'Quicker cycling and recovery between shots.', interval: -.008, recoil: -.003, recoilRecovery: .18 },
    ], fitted: [compensator, rail],
  },
  {
    id: 'mg4-bastion', source: 'enemy', config: 'heavy', family: 7, category: 'weapon', tier: 'Ultra', price: 0, currency: 'credits',
    name: 'MG4 · Bastion', accent: '#8ba7bd', weightKg: 9.8, bipod: 'heavy',
    flavorText: 'The rest of the squad moves when this one speaks.',
    description: 'Elite support issue. A heavy bipod, braked heavy barrel and two-hundred-round belt deliver 43 damage with low climb. Full damage to 38 m. The long belt change and heavy handling leave openings. Recovered only from rare elite squads; expedition-only.',
    build: [
      { id: 'bastion-barrel', name: 'Heavy selected barrel', description: 'A stable sustained-fire barrel and tuned gas system.', damage: 12, recoil: -.006, recoilRecovery: .2, traits: [{ kind: 'falloff', near: 38, far: 100, minScale: .6 }] },
      { id: 'bastion-box', name: 'Two-hundred-round belt box', description: 'A deep box with a longer belt change and heavier handling.', capacity: 100, reload: .7, mobility: .92 },
    ], fitted: [compensator],
  },
  {
    id: 'xm8-sovereign', source: 'enemy', config: 'sharpshooter', family: 5, category: 'weapon', tier: 'Legendary', price: 0, currency: 'credits',
    name: 'XM8 · Sovereign', accent: '#d4ad58', weightKg: 4.8, bipod: 'quick',
    flavorText: 'A leader who prefers to give orders from a distance.',
    description: 'Command-hunt leader issue. A suppressed precision rifle: 58 damage, 2.2× precise hits, full damage to 55 m, a 3.5× telescope and twenty-round magazine. Deliberate fire and a small magazine reward careful shots. Recovered only from a legendary squad leader; expedition-only.',
    build: [
      { id: 'sovereign-barrel', name: 'Selected marksman barrel', description: 'A long match barrel with a deliberate cycle.', damage: 25, interval: .085, ballistics: muzzleBallistics(1200), traits: [{ kind: 'falloff', near: 55, far: 145, minScale: .78 }, { kind: 'precision', multiplier: 2.2 }] },
      { id: 'sovereign-magazine', name: 'Twenty-round magazine', description: 'A short precision magazine.', capacity: -10 },
      { id: 'sovereign-stock', name: 'Precision cheek stock', description: 'Less climb and faster recovery.', recoil: -.005, recoilRecovery: .22 },
    ], fitted: [telescope, suppressor, rail],
  },
  {
    id: 'g36-regent', source: 'enemy', config: 'rifle', family: 6, category: 'weapon', tier: 'Legendary', price: 0, currency: 'credits',
    name: 'G36 · Regent', accent: '#d4ad58', weightKg: 4.6,
    flavorText: 'The gold is how you know whose orders matter.',
    description: 'Command-hunt leader issue. A suppressed command rifle with 51 damage, 2× precise hits, full damage to 48 m and the integrated 3× scope. Thirty rounds and controlled recoil, with heavier handling. Recovered only from a legendary squad leader; expedition-only.',
    build: [
      { id: 'regent-barrel', name: 'Command match barrel', description: 'A selected barrel and precision load.', damage: 15, ballistics: muzzleBallistics(1100), traits: [{ kind: 'falloff', near: 48, far: 130, minScale: .7 }, { kind: 'precision', multiplier: 2 }] },
      { id: 'regent-buffer', name: 'Balanced carrier and stock', description: 'A steadier, faster cycle on a heavier frame.', interval: -.012, recoil: -.005, recoilRecovery: .24, mobility: .95 },
    ], fitted: [suppressor, rail],
  },
];
