/**
 * What an armor insert does besides its pool and its share: what it is rated
 * to stop, whether it gives the wearer away, and whether a hit can glance off
 * it altogether.
 *
 * A pool and a share alone made every insert a bigger number, and made the
 * heaviest rounds no different against them from the lightest. Rating them is
 * how the inserts keep pace with the guns: an insert absorbs its full share of
 * anything up to its rating and half as much for every class beyond it, so a
 * .50 goes through rifle plates and only the heaviest inserts hold it.
 */

/** What a round is and what an insert stops, lightest first. Fictional classes, not a real protection standard. */
export const THREAT_CLASSES = ['pistol', 'rifle', 'gpmg', 'heavy'] as const;
export type ThreatClass = typeof THREAT_CLASSES[number];
export const THREAT_NAMES: Record<ThreatClass, string> = { pistol: 'pistol rounds', rifle: 'rifle rounds', gpmg: 'GPMG rounds', heavy: 'heavy MG rounds' };

/**
 * A round's class by calibre: 5.56 is a rifle round, 7.62 a GPMG's, 9 to 12 mm
 * a pistol's and 12 mm up a heavy gun's. Anything that is not a round (a blast,
 * gas, the gun's own recoil) has no class and meets the insert's full share.
 */
export function threatOf(caliberMm: number | undefined): ThreatClass | undefined {
  if (caliberMm === undefined || !Number.isFinite(caliberMm) || caliberMm <= 0) return undefined;
  if (caliberMm >= 12) return 'heavy';
  if (caliberMm >= 9) return 'pistol';
  return caliberMm >= 7 ? 'gpmg' : 'rifle';
}
/** What an insert keeps of its share for each class a round is above its rating. */
export const OVERMATCH = .5;
export function ratedAbsorption(absorption: number, stops: ThreatClass, caliberMm?: number) {
  const threat = threatOf(caliberMm);
  if (!threat) return absorption;
  return absorption * OVERMATCH ** Math.max(0, THREAT_CLASSES.indexOf(threat) - THREAT_CLASSES.indexOf(stops));
}

export interface InsertTraits {
  stops: ThreatClass;
  /** It smells: opponents' minimaps show the wearer, and bots see them from further and through smoke. */
  scent: boolean;
  /** The chance a round glances off without touching the pool or the wearer. */
  deflect: number;
}
/** Every insert before ratings existed, and no insert at all, behaves as rifle-rated. */
export const PLAIN_INSERT: InsertTraits = Object.freeze({ stops: 'rifle', scent: false, deflect: 0 });
/** How a scent changes a bot's sight of the wearer. */
export const SCENT = { sightRange: 1.5 } as const;
/** How far off someone sees the wearer, from how far they see anyone else. */
export const sightRangeAgainst = (range: number, insert: InsertTraits) => range * (insert.scent ? SCENT.sightRange : 1);
/** Whether smoke between them hides the wearer: not if they can be smelled through it. */
export const smokeHides = (insert: InsertTraits) => !insert.scent;
export const MAX_DEFLECT = .3;
/** What the radio says when a round glances off. */
export const DEFLECT_LINE = 'Ong lai! A round glanced off the crown.';

/** An insert's traits from the catalog or from the network, clamped to what an insert may do. */
export function insertTraits(value: { stops?: unknown; scent?: unknown; deflect?: unknown } | undefined): InsertTraits {
  if (!value) return PLAIN_INSERT;
  const stops = THREAT_CLASSES.includes(value.stops as ThreatClass) ? value.stops as ThreatClass : PLAIN_INSERT.stops;
  const deflect = typeof value.deflect === 'number' && Number.isFinite(value.deflect) ? Math.max(0, Math.min(MAX_DEFLECT, value.deflect)) : 0;
  return { stops, scent: value.scent === true, deflect };
}
