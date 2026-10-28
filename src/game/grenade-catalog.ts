import type { ShopItem } from './armory-catalog';
import type { BlastSpec } from './combat-events';
import type { FoodEffect } from './food-effects';
import type { GrenadeConditionKind } from './grenade-effects';
export type GrenadeEffect =
  | { kind: 'blast'; blast: BlastSpec; shred?: number }
  | { kind: 'cloud'; radius: number; seconds: number; colour: string; dps: number; overhead?: boolean; blocksSight?: boolean }
  | { kind: 'repel' | 'reveal'; radius: number; seconds: number }
  | { kind: 'condition'; condition: GrenadeConditionKind; radius: number; seconds: number; strength: number; facing?: boolean; lingering?: boolean }
  | { kind: 'bomblets'; count: number; damage: number; radius: number; spread: number; line?: boolean; seconds?: number }
  | { kind: 'mission'; count: number; delay: number; spread: number }
  | { kind: 'rally'; radius: number; sky?: boolean; effects: readonly FoodEffect[] };
export interface GrenadeSpec { fuse: number; throwSpeed: number; bounce: number; trigger?: 'apex' | 'rest' | 'launch'; effects: readonly GrenadeEffect[] }
export const grenadeBlast = (damage: number, radius: number): BlastSpec => ({ damage, radius, minScale: .2, vehicleScale: .6, stance: true });
const blast = (damage: number, radius: number, shred = 0): GrenadeEffect => ({ kind: 'blast', blast: grenadeBlast(damage, radius), shred });
const cloud = (radius: number, seconds: number, colour = '#e4e5dd', dps = 0): GrenadeEffect => ({ kind: 'cloud', radius, seconds, colour, dps });
const condition = (condition: GrenadeConditionKind, radius: number, seconds: number, strength = 1, extra = {}): GrenadeEffect => ({ kind: 'condition', condition, radius, seconds, strength, ...extra });
const item = (id: string, name: string, tier: ShopItem['tier'], requiredLevel: number, price: number, weightKg: number, throwSpeed: number, fuse: number, effects: readonly GrenadeEffect[], description: string, extra: Partial<GrenadeSpec> = {}, flavorText?: string): ShopItem => ({
  id: `grenade-${id}`, name, category: 'consumable', supplyType: 'grenade', tier, requiredLevel, price, currency: ['Issued', 'Field'].includes(tier) ? 'credits' : 'tokens', weightKg,
  grenade: { fuse, throwSpeed, bounce: .3, effects, ...extra }, description, flavorText,
});
export const GRENADE_CATALOG: readonly ShopItem[] = [
  item('frag', 'Frag grenade', 'Issued', 1, 110, .4, 14, 3.5, [blast(100, 6)], 'Scored steel fragments: 100 damage, 6 m blast.'),
  item('smoke', 'Smoke grenade', 'Issued', 1, 80, .45, 14, 1.5, [cloud(6, 25)], 'White smoke blocks sight within 6 m for 25 s.'),
  item('stun', 'Stun grenade', 'Field', 2, 190, .35, 15, 1.5, [condition('dazed', 8, 3, 1, { facing: true }), condition('deafened', 12, 5)], 'Flash dazes for 3 s; bang deafens for 5 s. Players take half daze time.'),
  item('chilli', 'Chilli padi mini-frag', 'Field', 3, 240, .2, 16, 3, [blast(115, 6, .3)], 'Dense filler hits for 115 within 6 m; the wire coil sends 30% through plates.', {}, 'Small but chilli padi.'),
  item('fogging', 'Town council fogging canister', 'Field', 3, 210, .6, 13, 1, [cloud(9, 35), { kind: 'repel', radius: 9, seconds: 35 }], 'Thermal fog blocks sight and insecticide drives bots out for 35 s.', {}, 'The fogging man comes round at five, and every window on the block shuts.'),
  item('red-smoke', 'Red smoke · fire mission', 'Elite', 5, 90, .45, 14, 1.5, [cloud(9, 35, '#b74739'), { kind: 'reveal', radius: 12, seconds: 20 }, { kind: 'mission', count: 4, delay: 8, spread: 10 }], 'Red smoke, team spotting, then four mortar rounds. Warning visible to everyone. One mission per 60 s.', {}, "Throw it where you want the mortars, then don't stand there."),
  item('durian', 'Durian · Mao Shan Wang', 'Ultra', 10, 150, 1.6, 10, 3.5, [blast(135, 7, .4), condition('retching', 10, 5, .25, { lingering: true }), { kind: 'repel', radius: 10, seconds: 40 }], 'Thorny husk blasts and shreds plates. Smell slows reloads and repels bots; does not block sight.', { bounce: .15 }, 'Not allowed on the MRT. Not allowed in the hotel lobby. Nobody said anything about here.'),
  item('sambal', 'Sambal belacan, void-deck strength', 'Ultra', 11, 140, .5, 14, 2, [cloud(10, 35, '#985b38', 5), condition('streaming-eyes', 10, 6, .3, { lingering: true })], 'Heating charge makes a 10 m belacan cloud for 35 s: 5 HP/s through plates and streaming eyes.', {}, 'Level 3 smells it. Level 12 smells it. The town council gets four emails.'),
  item('oranges', 'Mandarin orange pair', 'Ultra', 12, 170, .5, 14, 3.5, [{ kind: 'bomblets', count: 8, damage: 50, radius: 3.5, spread: 9 }], 'Splits at the top of the arc into two, then eight: eight small blasts scattered over 9 m.', { trigger: 'apex' }, 'Always in pairs. Never four. Eight is huat.'),
  item('chope', 'Chope packet', 'Ultra', 10, 130, .05, 12, 3.5, [{ kind: 'reveal', radius: 12, seconds: 45 }, { kind: 'repel', radius: 9, seconds: 45 }], 'Lands flat without bouncing. Marks enemies for your side and tells bots the spot is taken.', { bounce: 0, trigger: 'rest' }, "A tissue packet on the table means taken. Everyone knows. Even them."),
  item('whistle', "Encik's whistle", 'Legendary', 15, 220, .3, 14, 2, [condition('at-attention', 14, 3.5), condition('deafened', 14, 6), { kind: 'rally', radius: 14, effects: [{ kind: 'steady', strength: .2, seconds: 60 }] }], 'Thunderflash and parade whistle: enemies stand at attention; allies gain steady aim. Players stand for half time.'),
  item('firecrackers', "Ah Gong's firecracker string", 'Legendary', 18, 260, .9, 12, 1, [{ kind: 'bomblets', count: 16, damage: 55, radius: 3.5, spread: 12, line: true, seconds: 4 }, condition('dazed', 4, 3.5), condition('deafened', 14, 8), { kind: 'repel', radius: 20, seconds: 60 }], 'A line of sixteen pops over 4 s. Dazes, deafens and drives bots from 20 m.', {}, 'Ah Gong kept one box back in 1972. It is time.'),
  item('finale', 'Countdown finale shell', 'Mythic', 24, 380, 2.2, 9, 2, [{ kind: 'cloud', radius: 25, seconds: 6, colour: '#edbc5d', dps: 6, overhead: true, blocksSight: false }, condition('dazed', 30, 3.5), { kind: 'rally', radius: 30, sky: true, effects: [{ kind: 'fired-up', strength: .15, seconds: 120 }, { kind: 'energised', strength: .15, seconds: 120 }] }], 'Lands upright, waits 2 s, then launches 60 m. Golden embers fall for 6 s; roofs leave 20%. Allies under open sky rally.', { trigger: 'launch' }, 'The whole island counts down with you.'),
];
export const grenadeEffectLines = (spec?: GrenadeSpec): string[] => spec?.effects.map(e => {
  switch (e.kind) {
    case 'blast': return `Blast · ${e.blast.damage} damage · ${e.blast.radius} m${e.shred ? ` · ${e.shred * 100}% shred` : ''}`;
    case 'cloud': return `${e.dps ? `Gas · ${e.dps} HP/s` : 'Smoke'} · ${e.radius} m · ${e.seconds} s`;
    case 'condition': return `${e.condition.replaceAll('-', ' ')} · ${e.radius} m · ${e.seconds} s${e.lingering ? ' after leaving' : ''}`;
    case 'repel': case 'reveal': return `${e.kind === 'reveal' ? 'Marked' : 'Repel'} · ${e.radius} m · ${e.seconds} s`;
    case 'bomblets': return `Bomblets · ${e.count} × ${e.damage} damage · ${e.radius} m`;
    case 'mission': return `Fire mission · ${e.count} mortars · starts in ${e.delay} s`;
    case 'rally': return `Rally · ${e.radius} m · ${e.effects.map(f => `${f.kind} ${f.strength * 100}% / ${f.seconds} s`).join(' · ')}`;
  }
}) ?? [];
export const grenadeDangerRadius = (spec: GrenadeSpec) => Math.max(2, ...spec.effects.map(e => e.kind === 'blast' ? e.blast.radius : 'radius' in e ? e.radius : e.spread));

export function grenadeWhistleLine(address: { level: number; rank: string; tone?: string }) {
  const level = address.tone === 'recruit' ? 1 : address.level;
  return level >= 35 ? 'Sorry sir, fall in please.' : level >= 20 ? `Fall in, ${address.rank}.` : level >= 12 ? 'Fall in. Steady, whole lot.' : 'FALL IN!';
}
