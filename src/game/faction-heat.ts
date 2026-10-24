import { FACTION_IDS, type FactionId } from './factions';

/**
 * Faction heat: how hard each side is pushing in each part of a district, in
 * the spirit of a wanted level or a horde director. Every sector holds one
 * heat value per faction, 0–1, clamped to that faction's band there. Losses
 * raise a side's heat where they happened, a share of that spills up to the
 * parent sector, and a damped share leaks across to the other side. With no
 * fighting, heat drains back to the band's floor, so a stronghold rests hot
 * and a backwater rests cold. The band's curve then turns heat into strength:
 * how many troops a side wants there, how fast it sends them and how well
 * they are equipped.
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
export type FactionHeatBands = Partial<Record<FactionId, HeatBand>>;
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
  /** Share of a rise passed on to the parent sector. */
  spill: number;
  /** Share of a rise the other side picks up, scaled again by how much room it has left. */
  leak: number;
  /** Heat drained per second toward each band's floor. */
  decay: number;
}
export const HEAT_TUNING: HeatTuning = { casualty: .14, spill: .5, leak: .4, decay: .004 };

export function heatCurve(heat: number, curve: HeatCurve = 'linear') {
  const h = Math.max(0, Math.min(1, heat));
  if (curve === 'slow-burn') return h ** 2.2;
  if (curve === 'hair-trigger') return 1 - (1 - h) ** 2.2;
  if (curve === 'tiers') return Math.min(3, Math.floor(h * 4)) / 3;
  return h;
}

/** Bands a district starts from by risk; sectors override them where a place is a stronghold or a backwater. */
export const DISTRICT_HEAT: Record<'low' | 'medium' | 'high', Record<FactionId, HeatBand>> = {
  low: { mercenaries: { min: .15, max: .55 }, forces: { min: .1, max: .6 } },
  medium: { mercenaries: { min: .4, max: .8 }, forces: { min: .05, max: .55 } },
  high: { mercenaries: { min: .4, max: .95, curve: 'hair-trigger' }, forces: { min: 0, max: .5 } },
};

/**
 * What a side's strength buys it. The forces are scaled down on purpose:
 * friendly squads support the player, they do not fight the district for them.
 */
export const FACTION_SCALE: Record<FactionId, { troops: readonly [number, number]; topUp: readonly [number, number] }> = {
  mercenaries: { troops: [3, 14], topUp: [40, 12] },
  forces: { troops: [0, 4], topUp: [75, 30] },
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const validBand = (band: HeatBand | undefined): band is HeatBand =>
  !!band && Number.isFinite(band.min) && Number.isFinite(band.max) && band.min >= 0 && band.max <= 1 && band.min <= band.max;

export function createHeatField(options: { sectors: readonly HeatSector[]; defaults: Record<FactionId, HeatBand>; tuning?: Partial<HeatTuning> }) {
  const tuning = { ...HEAT_TUNING, ...options.tuning };
  const sectors = new Map(options.sectors.map(s => [s.id, s]));
  /** Own band, else the nearest ancestor's, else the district default. Cycles end at the default. */
  const bandOf = (id: string | null, faction: FactionId): HeatBand => {
    const seen = new Set<string>();
    for (let s = id ? sectors.get(id) : undefined; s && !seen.has(s.id); s = s.parent ? sectors.get(s.parent) : undefined) {
      seen.add(s.id);
      if (validBand(s.heat?.[faction])) return s.heat![faction]!;
    }
    return options.defaults[faction];
  };
  // '' is the district itself: ground no sector claims, and every sector's last parent.
  const ids = ['', ...sectors.keys()];
  const heat = new Map(ids.map(id => [id, Object.fromEntries(FACTION_IDS.map(f => [f, bandOf(id || null, f).min])) as Record<FactionId, number>]));
  const clampTo = (id: string, faction: FactionId, value: number) => { const b = bandOf(id || null, faction); return Math.max(b.min, Math.min(b.max, value)); };
  /** Raises one side in one sector and returns what it actually rose by. */
  const raise = (id: string, faction: FactionId, amount: number) => {
    const row = heat.get(id); if (!row || !(amount > 0)) return 0;
    const before = row[faction]; row[faction] = clampTo(id, faction, before + amount); return row[faction] - before;
  };
  /** How far through its band a side is, 0 at the floor and 1 at the ceiling. */
  const room = (id: string, faction: FactionId) => { const b = bandOf(id || null, faction), span = b.max - b.min; return span > 0 ? (b.max - heat.get(id)![faction]) / span : 0; };

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
  function casualty(faction: FactionId, id: string | null, weight = 1) {
    let amount = tuning.casualty * weight;
    const seen = new Set<string>();
    for (let at: string = id && sectors.has(id) ? id : ''; amount > 1e-4 && !seen.has(at); ) {
      seen.add(at);
      const rose = raise(at, faction, amount);
      for (const other of FACTION_IDS) if (other !== faction) raise(at, other, rose * tuning.leak * room(at, other));
      if (!at) break;
      const parent = sectors.get(at)?.parent;
      at = parent && sectors.has(parent) ? parent : '';
      amount *= tuning.spill;
    }
  }
  function step(dt: number) {
    if (!(dt > 0)) return;
    for (const [id, row] of heat) for (const faction of FACTION_IDS) {
      const floor = bandOf(id || null, faction).min;
      row[faction] = Math.max(floor, row[faction] - tuning.decay * dt);
    }
  }
  const level = (faction: FactionId, id: string | null) => heat.get(id && sectors.has(id) ? id : '')![faction];
  const strength = (faction: FactionId, id: string | null) => heatCurve(level(faction, id), bandOf(id && sectors.has(id) ? id : null, faction).curve);
  /** Weighted over the top-level sectors, or the district itself when it has none. */
  function districtStrength(faction: FactionId) {
    const top = [...sectors.values()].filter(s => !s.parent || !sectors.has(s.parent));
    const total = top.reduce((sum, s) => sum + Math.max(0, s.weight), 0);
    return total > 0 ? top.reduce((sum, s) => sum + Math.max(0, s.weight) * strength(faction, s.id), 0) / total : strength(faction, null);
  }
  /** Troops a side wants in the district, and seconds between its top-up rides. */
  const troops = (faction: FactionId) => Math.round(lerp(...FACTION_SCALE[faction].troops, districtStrength(faction)));
  const topUpInterval = (faction: FactionId) => lerp(...FACTION_SCALE[faction].topUp, districtStrength(faction));
  /**
   * Where a side most needs troops: the sector whose share of the wanted
   * total, by weight and strength, is furthest above the troops already there.
   */
  function neediest(faction: FactionId, present: (sector: HeatSector) => number) {
    const pool = [...sectors.values()].filter(s => s.weight > 0);
    const total = pool.reduce((sum, s) => sum + s.weight * strength(faction, s.id), 0);
    if (!(total > 0)) return null;
    // At least one, so a side wanting none still ranks its sectors.
    const want = Math.max(1, troops(faction));
    return pool.map(s => ({ s, gap: want * s.weight * strength(faction, s.id) / total - present(s) })).sort((a, b) => b.gap - a.gap)[0].s;
  }
  function reset() { for (const [id, row] of heat) for (const f of FACTION_IDS) row[f] = bandOf(id || null, f).min; }
  /** Every sector's heat for snapshots and the HUD; '' is the district. */
  const snapshot = () => [...heat].map(([sector, row]) => ({ sector, forces: row.forces, mercenaries: row.mercenaries }));
  return { sectorAt, casualty, step, level, strength, districtStrength, troops, topUpInterval, neediest, reset, snapshot, band: (faction: FactionId, id: string | null) => bandOf(id, faction) };
}
export type HeatField = ReturnType<typeof createHeatField>;
