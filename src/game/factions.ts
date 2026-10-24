/**
 * The two sides of every firefight. Players serve with the Armed Forces;
 * every bot is a contractor with Black Kite, a fictional private military
 * company hired against them. A faction decides who a bot shoots, whose
 * rounds hurt whom, and what a figure wears: uniform fabric, camouflage and
 * the patches on its shoulders and chest. Nothing here is a real unit's
 * insignia; the forces' pattern is only in the spirit of a pixelated
 * temperate camouflage.
 */
export type FactionId = 'forces' | 'mercenaries';

/**
 * A fabric pattern the character rig paints in its shader. `digital` is
 * square pixels clustered into larger blocks; `blotch` is soft-edged
 * value-noise patches. `colors` are drawn over the base fabric colour, rarest
 * last; `scale` is cells per metre.
 */
export interface CamoPattern { style: 'digital' | 'blotch'; colors: readonly [string, string, string]; scale: number }

/** A sewn-on badge, about 7 cm across. `field` is the cloth, `mark` the device on it. */
export interface PatchLook { design: 'flag' | 'bar' | 'diamond' | 'chevron' | 'tape'; field: string; mark: string }

export interface FactionUniform {
  top: string; bottom: string; camo: CamoPattern;
  /** Which fabric carries the pattern: the whole uniform, or the shirt alone over plain trousers. */
  camoOn: 'all' | 'top';
  vest: string; helmet: string; boots: string; gloves: string;
  /** Soft headwear for roles that do not wear a helmet. */
  cap: string;
  patches: { left: PatchLook; right: PatchLook; chest: PatchLook };
}

export interface Faction {
  id: FactionId; name: string; short: string; description: string;
  /** Name labels, scoreboard and minimap: the side at a glance. */
  color: string;
  uniform: FactionUniform;
}

export const FACTIONS: Readonly<Record<FactionId, Faction>> = {
  forces: {
    id: 'forces', name: 'Armed Forces', short: 'FORCES',
    description: 'You and every other player: regular infantry in pixelated green, flag on the left shoulder.',
    color: '#53c1d0',
    uniform: {
      top: '#6c7a52', bottom: '#6c7a52', camoOn: 'all',
      camo: { style: 'digital', colors: ['#45532f', '#2a2d22', '#8b7c58'], scale: 42 },
      vest: '#4b5636', helmet: '#56633f', boots: '#1d1f1c', gloves: '#2b2f25', cap: '#56633f',
      patches: {
        left: { design: 'flag', field: '#f2f0ea', mark: '#d0303a' },
        right: { design: 'bar', field: '#35402a', mark: '#d9b64a' },
        chest: { design: 'tape', field: '#4b5636', mark: '#1c2016' },
      },
    },
  },
  mercenaries: {
    id: 'mercenaries', name: 'Black Kite Contractors', short: 'BLACK KITE',
    description: 'Every bot: a private military company in coyote shirts, charcoal trousers and black plate carriers, with an orange kite on black.',
    color: '#e8833a',
    uniform: {
      top: '#a8916a', bottom: '#3a3c40', camoOn: 'top',
      camo: { style: 'blotch', colors: ['#7d6a4a', '#5a5c3e', '#d1bd92'], scale: 9 },
      vest: '#1f2124', helmet: '#26282b', boots: '#6b5a40', gloves: '#1b1c1e', cap: '#2a2b2e',
      patches: {
        left: { design: 'diamond', field: '#121214', mark: '#e8833a' },
        right: { design: 'chevron', field: '#121214', mark: '#e8833a' },
        chest: { design: 'diamond', field: '#121214', mark: '#e8833a' },
      },
    },
  },
};

export const FACTION_IDS = Object.keys(FACTIONS) as FactionId[];
export const isFactionId = (value: unknown): value is FactionId => typeof value === 'string' && Object.hasOwn(FACTIONS, value);
/** Players are the forces, bots the contractors; an explicit faction wins. */
export const factionOf = (actor: { bot: boolean; faction?: FactionId }): FactionId => actor.faction ?? (actor.bot ? 'mercenaries' : 'forces');
export const getFaction = (actor: { bot: boolean; faction?: FactionId }) => FACTIONS[factionOf(actor)];
/** Whether `a` should shoot at `b`. Players still fight each other in LAN matches; contractors never turn on their own. */
export const hostile = (a: { bot: boolean; faction?: FactionId }, b: { bot: boolean; faction?: FactionId }) =>
  factionOf(a) !== factionOf(b) || (!a.bot && !b.bot);
