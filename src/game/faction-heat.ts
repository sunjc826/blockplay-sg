import { SQUAD_FACTIONS, type SquadFaction } from './arena-factions';

/**
 * Faction heat: how hard each side is pushing in each part of a district, in
 * the spirit of a wanted level or a horde director. Every sector holds one
 * heat value per faction, 0–1, clamped to that faction's band there. Losses
 * raise a side's heat where they happened, a share of that spills up to the
 * parent sector, and a damped share leaks across to the other side; hits that
 * do not kill add a little too, so a running firefight builds heat before
 * anyone falls. Heat holds while a sector is being fought over and, once it
 * has been quiet a while, drains back to the band's floor, so a stronghold
 * rests hot and a backwater rests cold. The band's curve then turns heat into
 * strength: how many troops a side wants there, how fast it sends them and
 * how well they are equipped. How far a side has climbed above its floor is
 * its surge, which sets how far its squads range and how often fire comes in.
 *
 * Pure and three.js-free: the arena feeds it casualties and time and reads
 * strength back, and the same field runs in tests.
 */

/**
 * How heat becomes strength. `linear` is proportional; `slow-burn` stays
 * quiet until the heat is high and then escalates; `hair-trigger` answers the
 * first trouble hard and levels off; `tiers` steps, wanted-level style.
 */
export type HeatCurve = 'linear' | 'slow-burn' | 'hair-trigger' | 'tiers';
/** The range one faction's heat is held to in one sector, and how it scales. */
export interface HeatBand { min: number; max: number; curve?: HeatCurve }
export type FactionHeatBands = Partial<Record<SquadFaction, HeatBand>>;
export interface HeatSector {
  id: string;
  /** A sub-sector inherits any band it does not set from here, and passes a share of its heat up. */
  parent?: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Relative share of the district's troops. */
  weight: number;
  heat?: FactionHeatBands;
}
export interface HeatTuning {
  /** Heat one casualty adds to its own side in the sector it fell in. */
  casualty: number;
  /** Share of a casualty's heat a hit that does not kill adds, at 100 damage. */
  contact: number;
  /** Share of the usual heat a fight between bots alone adds: the war goes on without you, but it is yours that escalates. */
  skirmish: number;
  /** Share of a rise passed on to the parent sector. */
  spill: number;
  /** Share of a rise the other side picks up, scaled again by how much room it has left. */
  leak: number;
  /**
   * Heat drained per second toward each band's floor once a sector has been
   * quiet for `hold`: half this near the floor, twice it at the ceiling, so a
   * peak falls away quickly and the last of it lingers.
   */
  decay: number;
  /** Seconds a side's heat in a sector stays put after a full casualty there; smaller rises hold it for their share of this. */
  hold: number;
}
export const HEAT_TUNING: HeatTuning = { casualty: .12, contact: .1, skirmish: .25, spill: .5, leak: .5, decay: .003, hold: 30 };

export function heatCurve(heat: number, curve: HeatCurve = 'linear') {
  const h = Math.max(0, Math.min(1, heat));
  if (curve === 'slow-burn') return h ** 2.2;
  if (curve === 'hair-trigger') return 1 - (1 - h) ** 2.2;
  if (curve === 'tiers') return Math.min(3, Math.floor(h * 4)) / 3;
  return h;
}

/** Bands a district starts from by risk; sectors override them where a place is a stronghold or a backwater. */
export const DISTRICT_HEAT: Record<'low' | 'medium' | 'high', Record<SquadFaction, HeatBand>> = {
  low: { mercenaries: { min: .2, max: .65 }, 'armed-forces': { min: .15, max: .6 } },
  medium: { mercenaries: { min: .35, max: .85 }, 'armed-forces': { min: .15, max: .65 } },
  high: { mercenaries: { min: .45, max: .95, curve: 'hair-trigger' }, 'armed-forces': { min: .1, max: .6 } },
};

/**
 * What a side's strength buys it. The forces are scaled down on purpose:
 * friendly squads support the player, they do not fight the district for them.
 */
export const FACTION_SCALE: Record<SquadFaction, { troops: readonly [number, number]; topUp: readonly [number, number] }> = {
  mercenaries: { troops: [3, 14], topUp: [40, 12] },
  'armed-forces': { troops: [1, 6], topUp: [60, 20] },
};
/**
 * What the radio says as a side's hottest sector crosses each step, climbing
 * (`up`) and, from the second step back to calm, standing down (`down`, on the
 * first step). Steps a district's band never reaches simply never sound.
 */
export const HEAT_CALLS: Readonly<Record<SquadFaction, readonly { at: number; up: string; down?: string }[]>> = {
  mercenaries: [
    { at: .55, up: 'Black Kite is stirring. Expect more patrols.', down: 'Black Kite has pulled back. The district is quietening.' },
    { at: .7, up: 'Black Kite is sending reinforcements. Fire will come in more often.' },
    { at: .85, up: 'Black Kite is all in. Every patrol is hunting.' },
  ],
  'armed-forces': [
    { at: .3, up: 'A friendly section is on its way to support you.', down: 'Friendly sections are standing down.' },
    { at: .45, up: 'More friendly sections are heading for your fight.' },
    { at: .6, up: 'The armed forces are pushing in strength.' },
  ],
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const validBand = (band: HeatBand | undefined): band is HeatBand =>
  !!band && Number.isFinite(band.min) && Number.isFinite(band.max) && band.min >= 0 && band.max <= 1 && band.min <= band.max;

export function createHeatField(options: { sectors: readonly HeatSector[]; defaults: Record<SquadFaction, HeatBand>; tuning?: Partial<HeatTuning> }) {
  const tuning = { ...HEAT_TUNING, ...options.tuning };
  const sectors = new Map(options.sectors.map(s => [s.id, s]));
  /** Own band, else the nearest ancestor's, else the district default. Cycles end at the default. */
  const bandOf = (id: string | null, faction: SquadFaction): HeatBand => {
    const seen = new Set<string>();
    for (let s = id ? sectors.get(id) : undefined; s && !seen.has(s.id); s = s.parent ? sectors.get(s.parent) : undefined) {
      seen.add(s.id);
      if (validBand(s.heat?.[faction])) return s.heat![faction]!;
    }
    return options.defaults[faction];
  };
  // '' is the district itself: ground no sector claims, and every sector's last parent.
  const ids = ['', ...sectors.keys()];
  const heat = new Map(ids.map(id => [id, Object.fromEntries(SQUAD_FACTIONS.map(f => [f, bandOf(id || null, f).min])) as Record<SquadFaction, number>]));
  /** Until when each side's heat holds in each sector, on the field's own clock. */
  const held = new Map(ids.map(id => [id, Object.fromEntries(SQUAD_FACTIONS.map(f => [f, -Infinity])) as Record<SquadFaction, number>]));
  let clock = 0;
  const clampTo = (id: string, faction: SquadFaction, value: number) => { const b = bandOf(id || null, faction); return Math.max(b.min, Math.min(b.max, value)); };
  /** How far a side still has to climb in its band: 1 at the floor, 0 at the ceiling. */
  const room = (id: string, faction: SquadFaction) => { const b = bandOf(id || null, faction), span = b.max - b.min; return span > 0 ? (b.max - heat.get(id)![faction]) / span : 0; };
  /**
   * Raises one side in one sector and returns what it actually rose by. The
   * last stretch of a band climbs at under half pace, so only a sustained
   * fight holds a side at its ceiling. A side pinned there still counts as fighting.
   */
  const raise = (id: string, faction: SquadFaction, amount: number) => {
    const row = heat.get(id); if (!row || !(amount > 0)) return 0;
    // A stray round holds heat for a moment, a casualty for the full hold: skirmishing alone cannot pin a side.
    const hold = held.get(id)!; hold[faction] = Math.max(hold[faction], clock + tuning.hold * Math.min(1, amount / tuning.casualty));
    const before = row[faction]; row[faction] = clampTo(id, faction, before + amount * (.4 + .6 * room(id, faction))); return row[faction] - before;
  };

  /** The most specific sector at a point: the smallest box containing it, or null. */
  function sectorAt(x: number, z: number) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    let best: HeatSector | null = null, area = Infinity;
    for (const s of sectors.values()) {
      const { minX, maxX, minZ, maxZ } = s.bounds, a = (maxX - minX) * (maxZ - minZ);
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ && a < area) { best = s; area = a; }
    }
    return best;
  }
  /**
   * Someone on `faction` fell in `id` (null for unclaimed ground). Their side
   * heats up there and, by `spill` per step, in every sector above it. The
   * other side picks up `leak` of each rise, less as it nears its own ceiling,
   * and what it picks up never leaks back, so the two cannot feed each other.
   */
  function casualty(faction: SquadFaction, id: string | null, weight = 1) {
    let amount = tuning.casualty * weight;
    const seen = new Set<string>();
    for (let at: string = id && sectors.has(id) ? id : ''; amount > 1e-4 && !seen.has(at); ) {
      seen.add(at);
      const rose = raise(at, faction, amount);
      for (const other of SQUAD_FACTIONS) if (other !== faction) raise(at, other, rose * tuning.leak * room(at, other));
      if (!at) break;
      const parent = sectors.get(at)?.parent;
      at = parent && sectors.has(parent) ? parent : '';
      amount *= tuning.spill;
    }
  }
  function step(dt: number) {
    if (!(dt > 0)) return;
    clock += dt;
    for (const [id, row] of heat) for (const faction of SQUAD_FACTIONS) {
      // Only the part of this step past the hold drains.
      const quiet = Math.min(dt, clock - held.get(id)![faction]);
      if (quiet > 0) row[faction] = Math.max(bandOf(id || null, faction).min, row[faction] - tuning.decay * (.5 + 1.5 * (1 - room(id, faction))) * quiet);
    }
  }
  const level = (faction: SquadFaction, id: string | null) => heat.get(id && sectors.has(id) ? id : '')![faction];
  const strength = (faction: SquadFaction, id: string | null) => heatCurve(level(faction, id), bandOf(id && sectors.has(id) ? id : null, faction).curve);
  /** How far a side has climbed through its band in a sector: 0 resting at the floor, 1 at the ceiling. */
  const surgeAt = (faction: SquadFaction, id: string | null) => { const at = id && sectors.has(id) ? id : ''; return 1 - room(at, faction); };
  /**
   * `of` across the district: the mean over the top-level sectors by weight,
   * pulled halfway to the hottest sector (or the district row) so one fight
   * in a big district still moves the whole of it. The district row alone
   * when there are no sectors.
   */
  function overDistrict(of: (id: string | null) => number) {
    const top = [...sectors.values()].filter(s => !s.parent || !sectors.has(s.parent));
    const total = top.reduce((sum, s) => sum + Math.max(0, s.weight), 0);
    if (!(total > 0)) return of(null);
    const hottest = Math.max(of(null), ...[...sectors.keys()].map(of));
    return (top.reduce((sum, s) => sum + Math.max(0, s.weight) * of(s.id), 0) / total + hottest) / 2;
  }
  const districtStrength = (faction: SquadFaction) => overDistrict(id => strength(faction, id));
  /** How far a side has climbed through its bands across the district, 0–1. */
  const surge = (faction: SquadFaction) => overDistrict(id => surgeAt(faction, id));
  /** Troops a side wants in the district, and seconds between its top-up rides. */
  const troops = (faction: SquadFaction) => Math.round(lerp(...FACTION_SCALE[faction].troops, districtStrength(faction)));
  const topUpInterval = (faction: SquadFaction) => lerp(...FACTION_SCALE[faction].topUp, districtStrength(faction));
  /**
   * Where a side most needs troops: the sector whose share of the wanted
   * total, by weight and strength, is furthest above the troops already there.
   */
  function neediest(faction: SquadFaction, present: (sector: HeatSector) => number) {
    const pool = [...sectors.values()].filter(s => s.weight > 0);
    const total = pool.reduce((sum, s) => sum + s.weight * strength(faction, s.id), 0);
    if (!(total > 0)) return null;
    // At least one, so a side wanting none still ranks its sectors.
    const want = Math.max(1, troops(faction));
    return pool.map(s => ({ s, gap: want * s.weight * strength(faction, s.id) / total - present(s) })).sort((a, b) => b.gap - a.gap)[0].s;
  }
  function reset() {
    clock = 0;
    for (const [id, row] of heat) for (const f of SQUAD_FACTIONS) { row[f] = bandOf(id || null, f).min; held.get(id)![f] = -Infinity; }
  }
  /** Every sector's heat for snapshots and the HUD; '' is the district. */
  const snapshot = () => [...heat].map(([sector, row]) => ({ sector, ...row }));
  return { sectorAt, casualty, step, level, strength, districtStrength, surge, surgeAt, troops, topUpInterval, neediest, reset, snapshot, band: (faction: SquadFaction, id: string | null) => bandOf(id, faction) };
}
export type HeatField = ReturnType<typeof createHeatField>;
