import * as THREE from 'three';
import { hashString, type CharacterGesture, type CharacterLook } from './character-rig';

/** Arena role colours stay on the torso and helmet band so teams read at range. */
export const ARENA_ROLE_COLORS = { tank: '#d95b50', sniper: '#a37add', bot: '#d8a24b', player: '#53c1d0' } as const;
const SKIN = ['#f1c9a5', '#e0ac82', '#c68b62', '#a86f4c', '#8a5638', '#6b402a'] as const;
const HAIR = ['#141110', '#231a14', '#3a2a1e', '#5b5048', '#8c8a86'] as const;
const pick = <T>(list: readonly T[], seed: number, salt: number) => list[(seed >>> salt) % list.length];
const mix = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

export function arenaRoleColor(actor: { bot: boolean; role: string }) {
  return actor.bot ? actor.role === 'tank' ? ARENA_ROLE_COLORS.tank : actor.role === 'sniper' ? ARENA_ROLE_COLORS.sniper : ARENA_ROLE_COLORS.bot : ARENA_ROLE_COLORS.player;
}

export function arenaCharacterLook(actor: { bot: boolean; role: string; id?: string }): CharacterLook {
  const color = arenaRoleColor(actor), seed = hashString(actor.id ?? actor.role);
  const heavy = actor.bot && actor.role === 'tank', sniper = actor.bot && actor.role === 'sniper';
  return {
    skin: pick(SKIN, seed, 0), hair: pick(HAIR, seed, 5),
    top: mix(color, '#2f3630', .15), bottom: mix(color, '#2f3630', .62), shoes: '#1d1f1c', gloves: '#22261f',
    build: heavy ? 1.16 : sniper ? .95 : 1,
    headwear: sniper ? 'boonie' : 'helmet', headwearColor: sniper ? mix(color, '#4a4c38', .55) : '#26322e',
    vest: '#26322e', plates: heavy, backpack: heavy || seed % 3 === 0 ? '#2f3a31' : undefined,
    accent: color, weapon: heavy ? 'lmg' : sniper ? 'marksman' : 'rifle',
  };
}

export interface NpcLookSource { id: string; role: string; interaction: { kind: 'vendor' | 'dialogue' } }

/** Deterministic per NPC id: the same stallholder keeps the same face and clothes. */
export function npcCharacterLook(npc: NpcLookSource): CharacterLook {
  const seed = hashString(npc.id), role = npc.role.toLowerCase();
  const base: CharacterLook = {
    skin: pick(SKIN, seed, 0), hair: pick(HAIR, seed, 4), shoes: pick(['#2a2522', '#4a4038', '#d9d6cf', '#3b3f46'], seed, 9),
    top: pick(['#e9e4d6', '#7b9aa8', '#b35b4b', '#5e7f5c', '#d5b25a'], seed, 7), bottom: pick(['#2f3646', '#4b4a45', '#6a5c48'], seed, 11),
    sleeves: 'short', build: .94 + (seed % 7) / 30, hairStyle: seed % 5 === 0 ? 'long' : seed % 11 === 0 ? 'bald' : 'short',
    headwear: 'none',
  };
  if (npc.interaction.kind === 'vendor') {
    const scarf = seed % 4 === 1;
    return { ...base, apron: pick(['#f3efe3', '#d94f3d', '#2f5e8c', '#e3c25a'], seed, 13),
      headwear: scarf ? 'headscarf' : role.includes('kopi') ? 'none' : 'cap', headwearColor: scarf ? pick(['#2d5a6b', '#7b3d5a', '#e7dfcf'], seed, 15) : '#f3efe3',
      towel: role.includes('kopi') ? '#f1eee6' : undefined, hairStyle: scarf ? 'short' : base.hairStyle };
  }
  if (role.includes('route') || role.includes('marshal')) return { ...base, top: '#e8ee5b', bottom: '#2e3340', sleeves: 'long', headwear: 'cap', headwearColor: '#23303a', lanyard: '#1f4f8f' };
  if (role.includes('neighbourhood') || role.includes('volunteer')) return { ...base, top: '#d8633a', lanyard: '#f2f2f2', headwear: seed % 2 ? 'cap' : 'none', headwearColor: '#d8633a' };
  if (role.includes('local guide') || role.includes('concierge')) return { ...base, top: '#23283a', bottom: '#23283a', sleeves: 'long', shoes: '#141414', lanyard: '#b8964f', hairStyle: 'short' };
  return { ...base, shorts: true, shoes: '#5b5751' };
}

/** What a local does while nobody is talking to them. */
export function npcIdleGesture(npc: NpcLookSource, time: number): CharacterGesture {
  const seed = hashString(npc.id), cycle = (time + seed % 17) % 14;
  if (npc.interaction.kind === 'vendor') return cycle < 6 ? 'clasp' : cycle < 10 ? 'wipe' : 'idle';
  if (npc.role.toLowerCase().includes('resident')) return cycle < 9 ? 'behind' : 'idle';
  return cycle < 10 ? 'idle' : 'clasp';
}
