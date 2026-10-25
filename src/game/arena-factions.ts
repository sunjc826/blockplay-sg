/**
 * Who a soldier fights for, painted as a whole uniform rather than one stripe.
 * The base colours (top, trousers, vest, helmet, kit), the printed camouflage
 * and the sewn badges say which faction a figure belongs to from across a
 * district; the accent on the helmet band, which also tints the name label and
 * health bar, says which role inside that faction it plays. Accents are picked
 * against their own faction's cloth, so a band never sinks into the uniform
 * under it.
 *
 * A faction also picks a side, and factions on one side never fight each
 * other: players are the armed forces, the mercenaries are against them.
 * Either side can field the crews that work a mortar or hold a rooftop; a crew
 * wears its event's faction. Players still fight players in LAN matches. Black Kite is fictional, and the
 * forces' badges are generic rather than any real unit's insignia.
 */
export interface ArenaFactionPalette {
  /** Shirt or smock, trousers and boots. */
  top: string; bottom: string; shoes: string;
  /** Load-bearing vest, plates, belt pouches and pack. */
  vest: string; backpack: string; gloves: string;
  helmet: string; boonie: string;
}
/**
 * A fabric pattern the character rig paints in its shader. `digital` is
 * square pixels clustered into larger blocks; `blotch` is soft-edged
 * value-noise patches. `colors` are drawn over the base fabric colour, rarest
 * last; `scale` is cells per metre.
 */
export interface CamoPattern { style: 'digital' | 'blotch'; colors: readonly [string, string, string]; scale: number }
/** A sewn-on badge, about 7 cm across. `field` is the cloth, `mark` the device on it; `count` stacks a `chevrons` rank badge. */
export interface PatchLook { design: 'flag' | 'bar' | 'diamond' | 'chevron' | 'chevrons' | 'tape'; field: string; mark: string; count?: number }
export type ArenaSide = 'forces' | 'opposition';
export interface ArenaFaction {
  id: string; name: string; description: string;
  /** For HUD meters and the scoreboard. */
  short: string;
  side: ArenaSide;
  palette: Readonly<ArenaFactionPalette>;
  /** Printed over the palette's cloth: the shirt alone (`top`) or the whole uniform and helmet cover (`all`). */
  camo: { pattern: CamoPattern; on: 'all' | 'top' };
  /** One on the outside of each upper arm, one on the left breast. */
  patches: { left?: PatchLook; right?: PatchLook; chest?: PatchLook };
  /** Soft caps and shades on patrol instead of helmets; heavies still wear one. */
  caps?: boolean;
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
  const patches = Object.values(faction.patches).flatMap(p => p ? [p.field, p.mark] : []);
  if (!faction.name || ![...Object.values(faction.palette), ...faction.camo.pattern.colors, ...patches, faction.accent, ...Object.values(faction.roleAccents)].every(colour => HEX.test(colour))) throw new Error('Faction colours must be #rrggbb.');
  registry.set(faction.id, Object.freeze({ ...faction, palette: Object.freeze({ ...faction.palette }), roleAccents: Object.freeze({ ...faction.roleAccents }) }));
}
export const getArenaFaction = (id: string) => registry.get(id);
export const listArenaFactions = () => [...registry.values()];
/** Players, local and remote, and the friendly squads that support them. */
export const PLAYER_FACTION = 'armed-forces';
/** Bots whose role names no faction. */
export const DEFAULT_BOT_FACTION = 'mercenaries';
/** The two factions that field squads by transport, and so carry heat (faction-heat.ts). */
export const SQUAD_FACTIONS = ['armed-forces', 'mercenaries'] as const;
export type SquadFaction = typeof SQUAD_FACTIONS[number];

/** An explicit faction wins; otherwise players are the forces and bots the default. */
export const factionIdOf = (actor: { bot: boolean; faction?: string }) => actor.faction ?? (actor.bot ? DEFAULT_BOT_FACTION : PLAYER_FACTION);
const sideOf = (actor: { bot: boolean; faction?: string }) => getArenaFaction(factionIdOf(actor))?.side ?? (actor.bot ? 'opposition' : 'forces');
/** Whether `a` should shoot at `b`: the other side, or another player. */
export const hostile = (a: { bot: boolean; faction?: string }, b: { bot: boolean; faction?: string }) =>
  sideOf(a) !== sideOf(b) || (!a.bot && !b.bot);

registerArenaFaction({
  id: 'armed-forces', name: 'Armed forces', short: 'FORCES', side: 'forces',
  description: 'Jungle-green pixel camouflage, olive webbing and a covered helmet, flag on the left shoulder: the players and their friendly squads.',
  palette: { top: '#4a5d38', bottom: '#3c4b2e', shoes: '#1c1d18', vest: '#3a452d', backpack: '#435134', gloves: '#262b1f', helmet: '#3d4a31', boonie: '#56663f' },
  camo: { pattern: { style: 'digital', colors: ['#2f3d24', '#1e2119', '#6b5a3c'], scale: 42 }, on: 'all' },
  patches: {
    left: { design: 'flag', field: '#f2f0ea', mark: '#d0303a' },
    right: { design: 'bar', field: '#2f3a26', mark: '#d9b64a' },
    chest: { design: 'tape', field: '#3a452d', mark: '#1c2016' },
  },
  accent: '#8fdc6e', roleAccents: { 'mortar-crew': '#d9e86a', overwatch: '#f1d45a' },
});
registerArenaFaction({
  id: 'mercenaries', name: 'Black Kite mercenaries', short: 'BLACK KITE', side: 'opposition',
  description: 'Deep navy contractor kit in soft camouflage over near-black plate carriers, caps and shades on patrol, an orange kite on the shoulder. The squads that come for you.',
  palette: { top: '#1f3557', bottom: '#172840', shoes: '#121318', vest: '#151c29', backpack: '#1b2537', gloves: '#10141c', helmet: '#192334', boonie: '#2a4166' },
  camo: { pattern: { style: 'blotch', colors: ['#2c4670', '#14223a', '#3a5a86'], scale: 9 }, on: 'top' },
  patches: {
    left: { design: 'diamond', field: '#0d0f14', mark: '#e8833a' },
    right: { design: 'chevron', field: '#0d0f14', mark: '#e8833a' },
    chest: { design: 'diamond', field: '#0d0f14', mark: '#e8833a' },
  },
  caps: true,
  accent: '#e3a63f', roleAccents: { assault: '#e3a63f', tank: '#ef5d4f', sniper: '#b99cff', 'mortar-crew': '#ff9150', overwatch: '#f1d45a' },
});
