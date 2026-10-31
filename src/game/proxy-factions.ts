import type { ArenaFactionPalette, CamoPattern, PatchLook } from './arena-factions';
import { hashString, type CharacterLook } from './character-rig';

/** Art-only catalog. Deliberately absent from arena-factions/arena-roles:
 * alliances, AI, heat, spawning and combat statistics remain undecided. */
export interface ProxyFactionDesign {
  id: 'freedom-force' | 'collective-cops';
  name: string;
  influence: string;
  premise: string;
  silhouette: string;
  palette: Readonly<ArenaFactionPalette>;
  panel: string;
  accent: string;
  identification: PatchLook;
  camo: CamoPattern;
  swatches: readonly { name: string; hex: string }[];
  operators: readonly ProxyOperatorDesign[];
}
export interface ProxyOperatorDesign {
  id: 'lancer' | 'wayfinder' | 'bastion' | 'conductor';
  name: string;
  concept: string;
  equipment: string;
  build: number;
  weapon: 'rifle' | 'marksman';
}

export const PROXY_FACTIONS: readonly ProxyFactionDesign[] = [
  {
    id: 'freedom-force', name: 'Freedom Force', influence: 'Western expeditionary influence',
    premise: 'A small expeditionary task group projecting influence through advisers, precision raids and local partnerships.',
    silhouette: 'Open shoulders, pale tapered plates, helmet comms and folded twin optics. A spread wing marks chest, shoulders and pack.',
    palette: { top: '#a69578', bottom: '#756d5d', shoes: '#403d38', vest: '#d6c9ac', backpack: '#9a8e75', gloves: '#574f42', helmet: '#c5b696', boonie: '#a69578' },
    panel: '#526f85', accent: '#e7bc68',
    identification: { design: 'wing', field: '#344b60', mark: '#f1e9d6' },
    camo: { style: 'blotch', colors: ['#8d876e', '#c3b99e', '#696b5a'], scale: 15 },
    swatches: [{ name: 'Sand cloth', hex: '#a69578' }, { name: 'Bone armor', hex: '#d6c9ac' }, { name: 'Steel blue panels', hex: '#526f85' }, { name: 'Signal amber', hex: '#e7bc68' }],
    operators: [
      { id: 'lancer', name: 'Lancer', concept: 'Precision entry specialist', equipment: 'Breaching-tool scabbard, compact tool pouch and a short rifle study.', build: 1.03, weapon: 'rifle' },
      { id: 'wayfinder', name: 'Wayfinder', concept: 'Reconnaissance and target designation', equipment: 'Single tall radio mast, observation case and scoped rifle study.', build: .97, weapon: 'marksman' },
    ],
  },
  {
    id: 'collective-cops', name: 'Collective Corps', influence: 'Eastern security-force influence',
    premise: 'An elite security detachment projecting influence through protected infrastructure, surveillance and disciplined intervention.',
    silhouette: 'Continuous visor and jaw guard, square jade shoulder shells and segmented hip armor. An open gate marks chest, shoulders and pack.',
    palette: { top: '#677273', bottom: '#424e53', shoes: '#252f34', vest: '#344b49', backpack: '#3d5352', gloves: '#28383c', helmet: '#5d7470', boonie: '#677273' },
    panel: '#75968a', accent: '#bf5547',
    identification: { design: 'gate', field: '#293e43', mark: '#ece5cb' },
    camo: { style: 'digital', colors: ['#566564', '#81918b', '#3e5054'], scale: 30 },
    swatches: [{ name: 'Slate cloth', hex: '#677273' }, { name: 'Jade armor', hex: '#75968a' }, { name: 'Graphite webbing', hex: '#344b49' }, { name: 'Cinnabar trim', hex: '#bf5547' }],
    operators: [
      { id: 'bastion', name: 'Bastion', concept: 'Protected entry and interdiction', equipment: 'Slung armored shield, full visor and broad ceramic shoulder shells.', build: 1.12, weapon: 'rifle' },
      { id: 'conductor', name: 'Conductor', concept: 'Sensor coordination and command', equipment: 'Twin raised sensor heads, a hard tablet case and a compact rifle study.', build: 1.01, weapon: 'rifle' },
    ],
  },
];

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
