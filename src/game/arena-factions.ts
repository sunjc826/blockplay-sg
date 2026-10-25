/**
 * Who a soldier fights for, painted as a whole uniform rather than one stripe.
 * The base colours (top, trousers, vest, helmet, kit) say which faction a
 * figure belongs to from across a district; the accent on the sleeve bands and
 * helmet band, which also tints the name label and health bar, says which role
 * inside that faction it plays. Accents are picked against their own faction's
 * cloth, so a band never sinks into the uniform under it.
 */
export interface ArenaFactionPalette {
  /** Shirt or smock, trousers and boots. */
  top: string; bottom: string; shoes: string;
  /** Load-bearing vest, plates, belt pouches and pack. */
  vest: string; backpack: string; gloves: string;
  helmet: string; boonie: string;
}
export interface ArenaFaction {
  id: string; name: string; description: string;
  palette: Readonly<ArenaFactionPalette>;
  /** The faction's own signal colour: the band and label of any role without one below. */
  accent: string;
  /** Per-role band colours, by arena role id. */
  roleAccents: Readonly<Record<string, string>>;
}

const HEX = /^#[0-9a-f]{6}$/i;
const registry = new Map<string, ArenaFaction>();
/** Local, statically imported palettes only, like arena roles. */
export function registerArenaFaction(faction: ArenaFaction) {
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(faction.id) || registry.has(faction.id)) throw new Error('Faction ID must be unique and use lowercase letters, numbers or hyphens.');
  if (!faction.name || ![...Object.values(faction.palette), faction.accent, ...Object.values(faction.roleAccents)].every(colour => HEX.test(colour))) throw new Error('Faction colours must be #rrggbb.');
  registry.set(faction.id, Object.freeze({ ...faction, palette: Object.freeze({ ...faction.palette }), roleAccents: Object.freeze({ ...faction.roleAccents }) }));
}
export const getArenaFaction = (id: string) => registry.get(id);
export const listArenaFactions = () => [...registry.values()];
/** Players, local and remote. */
export const PLAYER_FACTION = 'armed-forces';
/** Bots whose role names no faction. */
export const DEFAULT_BOT_FACTION = 'mercenaries';

registerArenaFaction({
  id: 'armed-forces', name: 'Armed forces', description: 'Jungle-green fatigues, olive webbing and a drab helmet: the players.',
  palette: { top: '#4a5d38', bottom: '#3c4b2e', shoes: '#1c1d18', vest: '#3a452d', backpack: '#435134', gloves: '#262b1f', helmet: '#3d4a31', boonie: '#56663f' },
  accent: '#8fdc6e', roleAccents: {},
});
registerArenaFaction({
  id: 'mercenaries', name: 'Mercenaries', description: 'Deep navy contractor kit over near-black plate carriers. The squads that come for you.',
  palette: { top: '#1f3557', bottom: '#172840', shoes: '#121318', vest: '#151c29', backpack: '#1b2537', gloves: '#10141c', helmet: '#192334', boonie: '#2a4166' },
  accent: '#e3a63f', roleAccents: { assault: '#e3a63f', tank: '#ef5d4f', sniper: '#b99cff' },
});
registerArenaFaction({
  id: 'militia', name: 'Militia', description: 'Sun-faded khaki and sand webbing: the locals who crew the mortars and hold the rooftops.',
  palette: { top: '#6b5d40', bottom: '#524733', shoes: '#2b241c', vest: '#3f372a', backpack: '#5c513b', gloves: '#332c22', helmet: '#4f4634', boonie: '#7d6d4a' },
  accent: '#ff9150', roleAccents: { 'mortar-crew': '#ff9150', overwatch: '#f1d45a' },
});
