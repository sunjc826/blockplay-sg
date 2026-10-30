import { PLAYER_FACTION, SQUAD_FACTIONS, type SquadFaction } from './arena-factions';

export type FacilityKind = 'command' | 'garage' | 'helipad';
export type FacilityActionKind = 'capture' | 'build' | 'repair';
export interface FacilityPoint { x: number; y: number; z: number }
export interface FacilitySite extends FacilityPoint {
  id: string; name: string; kind: FacilityKind; initialOwner: SquadFaction | null;
  deployment: { x: number; z: number; yaw: number };
}
export interface FacilityState extends FacilitySite {
  owner: SquadFaction | null; health: number; maxHealth: number;
  contested: boolean; suppressed: boolean; pressure: number; deployIn: number;
  action: { kind: FacilityActionKind; by: string; faction: SquadFaction; progress: number; stalled: boolean } | null;
}
export interface FacilityActor extends FacilityPoint {
  id: string; faction: string; alive: boolean; vehicle?: string; playing?: boolean;
  /** Feet, rather than the changing eye height when crouching. */
  feet: number;
}
export interface FacilitySnapshot {
  sites: FacilityState[]; supplies: Record<SquadFaction, number>;
}
export const FACILITY_RULES = {
  presenceRadius: 18, interactRadius: 4, suppressionRadius: 9, suppressionSeconds: 5,
  captureSeconds: 24, buildSeconds: 22, repairSeconds: 12,
  supplyCap: 180, initialSupplies: 100, income: .5,
  infantryCost: 3, carCost: 25, helicopterCost: 45, waveSeconds: 25, reserveSeconds: 80,
} as const;
export const FACILITY_KINDS = {
  command: { label: 'Command post', health: 450, cost: 35 },
  garage: { label: 'Garage', health: 650, cost: 50 },
  helipad: { label: 'Helipad', health: 550, cost: 70 },
} as const;
const faction = (value: string): value is SquadFaction => (SQUAD_FACTIONS as readonly string[]).includes(value);
const horizontal = (a: FacilityPoint, b: FacilityPoint) => Math.hypot(a.x - b.x, a.z - b.z);
export const facilityOperational = (site: FacilityState, side?: string) => site.health > 0 && !!site.owner && (!side || site.owner === side) && !site.suppressed;
export function facilityActionFor(site: FacilityState, side: string): FacilityActionKind | null {
  if (!faction(side)) return null;
  if (!site.health) return 'build';
  if (site.owner !== side) return 'capture';
  return site.health < site.maxHealth ? 'repair' : null;
}
export const facilityActionCost = (site: FacilityState, kind: FacilityActionKind) => kind === 'build' ? FACILITY_KINDS[site.kind].cost : kind === 'repair' ? 15 : 0;
export function facilityStatus(site: FacilityState) {
  if (site.action) return `${site.action.stalled ? 'Blocked' : site.action.kind === 'capture' ? 'Capturing' : site.action.kind === 'build' ? 'Building' : 'Repairing'} ${Math.floor(site.action.progress * 100)}%`;
  return !site.health ? site.owner ? 'Equipment destroyed' : 'Unbuilt site' : site.suppressed ? 'Deployment suppressed' : site.contested ? 'Under attack' : 'Operational';
}
export function facilityPrompt(site: FacilityState, side = PLAYER_FACTION) {
  const action = facilityActionFor(site, side);
  if (site.action) return `${site.name} · ${facilityStatus(site)} · stay nearby`;
  if (!action) return `${site.name} · ${facilityStatus(site)}`;
  const cost = facilityActionCost(site, action);
  return `${action === 'capture' ? 'Capture' : action === 'build' ? 'Build' : 'Repair'} ${site.name}${cost ? ` · ${cost} supply` : ' · 24s'}`;
}

/** Host-owned, independent pockets of infrastructure. No territory-wide capture meter. */
export function createFacilities(definitions: readonly FacilitySite[], saved?: FacilitySnapshot) {
  const sites: FacilityState[] = definitions.map(site => {
    const previous = saved?.sites.find(s => s.id === site.id);
    return { ...structuredClone(site), owner: previous?.owner ?? (previous ? null : site.initialOwner),
      health: previous ? Math.max(0, Math.min(FACILITY_KINDS[site.kind].health, previous.health)) : site.initialOwner ? FACILITY_KINDS[site.kind].health : 0,
      maxHealth: FACILITY_KINDS[site.kind].health, contested: false, suppressed: false, pressure: 0,
      deployIn: previous?.deployIn ?? 12, action: null };
  });
  const supplies: Record<SquadFaction, number> = Object.fromEntries(SQUAD_FACTIONS.map(f => [f, Math.max(0, Math.min(FACILITY_RULES.supplyCap, saved?.supplies[f] ?? FACILITY_RULES.initialSupplies))])) as Record<SquadFaction, number>;
  // Work is interrupted by travel, not silently charged a second time on return.
  for (const old of saved?.sites ?? []) if (old.action && sites.some(s => s.id === old.id)) supplies[old.action.faction] = Math.min(FACILITY_RULES.supplyCap, supplies[old.action.faction] + facilityActionCost(old, old.action.kind));
  let actors: readonly FacilityActor[] = [];
  let visible: (a: FacilityPoint, b: FacilityPoint) => boolean = () => true;
  const visibility = new Map<FacilityState, Map<FacilityActor, boolean>>();
  function visibleTo(site: FacilityState, actor: FacilityActor) {
    let seen = visibility.get(site);
    if (!seen) { seen = new Map(); visibility.set(site, seen); }
    let clear = seen.get(actor);
    if (clear === undefined) { clear = visible({ x: site.x, y: site.y + 1, z: site.z }, actor); seen.set(actor, clear); }
    return clear;
  }
  const eligible = (a: FacilityActor, site: FacilityState) => a.alive && a.playing !== false && !a.vehicle && faction(a.faction) && Math.abs(a.feet - site.y) < 2 && horizontal(a, site) <= FACILITY_RULES.presenceRadius && visibleTo(site, a);
  function balance(site: FacilityState, side: SquadFaction, radius: number = FACILITY_RULES.presenceRadius) {
    let friends = 0, enemies = 0;
    for (const a of actors) if (eligible(a, site) && horizontal(a, site) <= radius) a.faction === side ? friends++ : enemies++;
    return { friends, enemies, advantage: Math.min(2, friends - enemies) };
  }
  function spend(side: SquadFaction, amount: number) {
    if (!Number.isFinite(amount) || amount < 0 || supplies[side] + 1e-6 < amount) return false;
    supplies[side] = Math.max(0, supplies[side] - amount); return true;
  }
  function request(id: string, by: string) {
    const site = sites.find(s => s.id === id), actor = actors.find(a => a.id === by);
    if (!site || !actor || !faction(actor.faction) || !eligible(actor, site) || horizontal(actor, site) > FACILITY_RULES.interactRadius || site.action) return false;
    const kind = facilityActionFor(site, actor.faction);
    if (!kind || !spend(actor.faction, facilityActionCost(site, kind))) return false;
    site.action = { kind, by, faction: actor.faction, progress: 0, stalled: true }; return true;
  }
  function cancel(site: FacilityState) {
    if (site.action) supplies[site.action.faction] = Math.min(FACILITY_RULES.supplyCap, supplies[site.action.faction] + facilityActionCost(site, site.action.kind));
    site.action = null;
  }
  function step(dt: number, present: readonly FacilityActor[], clear: typeof visible = () => true) {
    actors = present; visible = clear; visibility.clear();
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const f of SQUAD_FACTIONS) supplies[f] = Math.min(FACILITY_RULES.supplyCap, supplies[f] + FACILITY_RULES.income * dt);
    for (const site of sites) {
      site.deployIn = Math.max(0, site.deployIn - dt);
      const local = site.owner ? balance(site, site.owner) : null;
      site.contested = !!local?.enemies;
      const exit = site.owner ? balance(site, site.owner, FACILITY_RULES.suppressionRadius) : null;
      site.pressure = exit && exit.enemies > exit.friends ? Math.min(FACILITY_RULES.suppressionSeconds, site.pressure + dt) : Math.max(0, site.pressure - dt * 2);
      site.suppressed = site.pressure >= FACILITY_RULES.suppressionSeconds;
      const action = site.action;
      if (!action) continue;
      const worker = actors.find(a => a.id === action.by);
      if (!worker || !eligible(worker, site) || worker.faction !== action.faction || horizontal(worker, site) > FACILITY_RULES.interactRadius) { cancel(site); continue; }
      const advantage = balance(site, action.faction).advantage;
      action.stalled = advantage <= 0;
      if (action.stalled) continue;
      const seconds = action.kind === 'capture' ? FACILITY_RULES.captureSeconds : action.kind === 'build' ? FACILITY_RULES.buildSeconds : FACILITY_RULES.repairSeconds;
      action.progress = Math.min(1, action.progress + dt * advantage / seconds);
      if (action.progress < 1) continue;
      site.owner = action.faction;
      if (action.kind !== 'capture') site.health = site.maxHealth;
      site.action = null; site.pressure = 0; site.suppressed = false; site.deployIn = Math.max(site.deployIn, 8);
    }
  }
  function damage(id: string, amount: number, side?: string) {
    const site = sites.find(s => s.id === id);
    if (!site || site.health <= 0 || !Number.isFinite(amount) || amount <= 0 || side && site.owner === side) return 0;
    const taken = Math.min(site.health, amount); site.health -= taken;
    if (!site.health) { cancel(site); site.suppressed = false; site.pressure = 0; }
    return taken;
  }
  function snapshot(): FacilitySnapshot { return { sites: structuredClone(sites), supplies: { ...supplies } }; }
  return { sites, supplies, step, request, damage, spend, balance, snapshot };
}

/** The equipment cabinet is the damageable objective; scenery is kept intact. */
export function facilityRayDistance(site: FacilityState, origin: FacilityPoint, ray: FacilityPoint) {
  if (!site.health) return Infinity;
  let near = 0, far = Infinity;
  for (const [p, d, lo, hi] of [[origin.x, ray.x, site.x - .85, site.x + .85], [origin.y, ray.y, site.y, site.y + 1.8], [origin.z, ray.z, site.z - .65, site.z + .65]]) {
    if (Math.abs(d) < 1e-8) { if (p < lo || p > hi) return Infinity; }
    else { const a = (lo - p) / d, b = (hi - p) / d; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
  }
  return near <= far ? near : Infinity;
}

export function validFacilitySnapshot(value: unknown): value is FacilitySnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as FacilitySnapshot;
  if (!Array.isArray(v.sites) || v.sites.length > 12 || !v.supplies || !SQUAD_FACTIONS.every(f => Number.isFinite(v.supplies[f]) && v.supplies[f] >= 0 && v.supplies[f] <= FACILITY_RULES.supplyCap)) return false;
  const ids = new Set<string>();
  return v.sites.every(s => {
    if (!s || typeof s.id !== 'string' || s.id.length > 100 || ids.has(s.id) || typeof s.name !== 'string' || s.name.length > 100 || !Object.hasOwn(FACILITY_KINDS, s.kind)) return false;
    ids.add(s.id);
    return (s.owner === null || faction(s.owner)) && (s.initialOwner === null || faction(s.initialOwner)) &&
      [s.x, s.y, s.z, s.health, s.maxHealth, s.pressure, s.deployIn, s.deployment?.x, s.deployment?.z, s.deployment?.yaw].every(Number.isFinite) &&
      s.maxHealth === FACILITY_KINDS[s.kind].health && s.health >= 0 && s.health <= s.maxHealth && s.pressure >= 0 && s.pressure <= FACILITY_RULES.suppressionSeconds && s.deployIn >= 0 && s.deployIn <= 120 &&
      typeof s.contested === 'boolean' && typeof s.suppressed === 'boolean' &&
      (s.action === null || !!s.action && ['capture', 'build', 'repair'].includes(s.action.kind) && typeof s.action.by === 'string' && s.action.by.length <= 100 && faction(s.action.faction) && Number.isFinite(s.action.progress) && s.action.progress >= 0 && s.action.progress <= 1 && typeof s.action.stalled === 'boolean');
  });
}
