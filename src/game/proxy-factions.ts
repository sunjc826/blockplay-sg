import { hashString, type CharacterLook } from './character-rig';
import { PROXY_FACTIONS, type ProxyFactionDesign, type ProxyOperatorDesign } from './proxy-faction-catalog';
export { PROXY_FACTIONS, type ProxyFactionDesign, type ProxyOperatorDesign } from './proxy-faction-catalog';

export function proxyCharacterLook(factionId: ProxyFactionDesign['id'], operatorId: ProxyOperatorDesign['id'], id = 'operator-01'): CharacterLook {
  const faction = PROXY_FACTIONS.find(candidate => candidate.id === factionId);
  const operator = faction?.operators.find(candidate => candidate.id === operatorId);
  if (!faction || !operator) throw new Error('Unknown proxy faction/operator pairing.');
  const seed = hashString(id), palette = faction.palette;
  return {
    skin: ['#e0ac82', '#c68b62', '#a86f4c', '#6b402a'][seed % 4], hair: ['#231a14', '#3a2a1e', '#141110'][seed % 3],
    top: palette.top, bottom: palette.bottom, shoes: palette.shoes, gloves: palette.gloves,
    vest: palette.vest, plates: true, backpack: palette.backpack, build: operator.build,
    headwear: 'helmet', headwearColor: palette.helmet, accent: faction.accent,
    camo: { pattern: faction.camo, on: 'top', headwear: false },
    uniform: faction.id === 'freedom-force' ? 'expeditionary' : 'collective',
    panel: faction.panel, identification: faction.identification,
    roleKit: operator.id, weapon: operator.weapon,
  };
}
