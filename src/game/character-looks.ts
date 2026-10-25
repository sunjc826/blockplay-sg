import * as THREE from 'three';
import { hashString, type CharacterGesture, type CharacterLook } from './character-rig';
import { DEFAULT_BOT_FACTION, factionIdOf, getArenaFaction, type ArenaFaction } from './arena-factions';
import { getArenaRole } from './arena-roles';

const SKIN = ['#f1c9a5', '#e0ac82', '#c68b62', '#a86f4c', '#8a5638', '#6b402a'] as const;
const HAIR = ['#141110', '#231a14', '#3a2a1e', '#5b5048', '#8c8a86'] as const;
const pick = <T>(list: readonly T[], seed: number, salt: number) => list[(seed >>> salt) % list.length];
const mix = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

/** The host's call when the actor carries one; otherwise players are the armed forces and a bot wears its role's faction. */
export function arenaFaction(actor: { bot: boolean; role: string; faction?: string }): ArenaFaction {
  const id = actor.faction ?? (actor.bot ? getArenaRole(actor.role)?.faction ?? DEFAULT_BOT_FACTION : factionIdOf(actor));
  return getArenaFaction(id) ?? getArenaFaction(DEFAULT_BOT_FACTION)!;
}

/** The band on the helmet, also the name label and health bar: role within faction. */
export function arenaRoleColor(actor: { bot: boolean; role: string; faction?: string }) {
  const faction = arenaFaction(actor);
  return faction.roleAccents[actor.role] ?? faction.accent;
}

/**
 * The uniform says which side: cloth, camouflage, carrier and badges. The
 * band says which role, and the kit says which job: plates and a bigger frame
 * for heavies, a boonie and a marksman rifle for anyone who shoots from far
 * off, and for contractors on patrol a cap and shades. A bot's rank (see
 * arena-ranks) shows as chevrons on the right sleeve and in its kit: a recruit
 * in a faded uniform without plates, pack or shades, a veteran in plates, a
 * pack and shades, and a contractor veteran in a helmet rather than a cap.
 */
export function arenaCharacterLook(actor: { bot: boolean; role: string; id?: string; faction?: string; rank?: number }): CharacterLook {
  const faction = arenaFaction(actor), { palette } = faction, seed = hashString(actor.id ?? actor.role);
  const heavy = actor.bot && actor.role === 'tank', sniper = actor.bot && (actor.role === 'sniper' || actor.role === 'overwatch');
  const rank = actor.bot ? actor.rank : undefined, recruit = rank === 1, veteran = rank === 3;
  const headwear = sniper ? 'boonie' : faction.caps && actor.bot && !heavy && !veteran ? 'cap' : 'helmet';
  // A little fade or wear per soldier, so a squad is a squad and not a print run; a recruit's kit is the most worn.
  const wear = (seed % 5) / 40 + (recruit ? .12 : 0);
  const right = faction.patches.right ?? faction.patches.left;
  const patches = rank && right ? { ...faction.patches, right: { design: 'chevrons' as const, field: right.field, mark: right.mark, count: rank } } : faction.patches;
  return {
    skin: pick(SKIN, seed, 0), hair: pick(HAIR, seed, 5),
    top: mix(palette.top, '#9a9a88', wear), bottom: mix(palette.bottom, '#20221e', wear), shoes: palette.shoes, gloves: palette.gloves,
    camo: { pattern: faction.camo.pattern, on: faction.camo.on, headwear: headwear === 'boonie' || faction.camo.on === 'all' && headwear === 'helmet' },
    patches,
    build: heavy ? 1.16 : sniper ? .95 : 1,
    headwear, headwearColor: headwear === 'boonie' ? palette.boonie : palette.helmet,
    eyewear: veteran || headwear === 'cap' && !recruit ? '#121314' : undefined,
    vest: palette.vest, plates: heavy || veteran || !recruit && !!faction.caps && actor.bot && seed % 2 === 0,
    backpack: heavy || veteran || !recruit && seed % 3 === 0 ? palette.backpack : undefined,
    accent: arenaRoleColor(actor), weapon: heavy ? 'lmg' : sniper ? 'marksman' : 'rifle',
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
