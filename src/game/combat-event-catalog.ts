import { PLAYER_FACTION } from './arena-factions';
import { combatRandom, descentAlong, registerCombatEvent, MAX_TROOPS, type BlastSpec, type CombatEventDescriptor, type CombatPayload, type CombatPlane } from './combat-events';

/**
 * The shipped combat events. Importing this module registers them; the arena
 * imports it, so anything that can run a match can run these.
 */

export const ARTILLERY_SHELL = { radius: 8, damage: 140, minScale: .2, vehicleScale: 1.5, stance: true } as const;
/** Points in the event's own frame: `forward` along its heading, `side` to the right of it. */
function frame(event: Readonly<CombatEventDescriptor>) {
  const along = { x: -Math.sin(event.heading), z: -Math.cos(event.heading) }, across = { x: along.z, z: -along.x };
  return (forward: number, side: number, from: CombatPlane = event.target): CombatPlane =>
    ({ x: from.x + along.x * forward + across.x * side, z: from.z + along.z * forward + across.z * side });
}
/** Box-Muller normal deviates from a seeded stream, clipped at 2.5 sigma. */
const gaussianFrom = (random: () => number) => () => Math.max(-2.5, Math.min(2.5, Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())));
const clampIntensity = (value: number) => Math.max(.5, Math.min(2, value));
/** Fire for effect starts this long after the warning began. */
const FIRE_FOR_EFFECT = 11;

registerCombatEvent({
  id: 'artillery',
  name: 'Artillery barrage',
  description: 'Two spotting rounds walk in, then a fire-for-effect salvo lands across the marked area.',
  warning: 5,
  duration: 24,
  banner: { warning: 'ARTILLERY INBOUND · CLEAR THE MARKED AREA', active: 'ARTILLERY · GET DOWN OR GET OUT' },
  hazard: true,
  timeline(event) {
    const random = combatRandom(event.seed);
    const { target, heading } = event, intensity = Math.max(.5, Math.min(2, event.intensity));
    const offset = frame(event);
    const descent = descentAlong(heading, 1.13); // ~65° below the horizon
    const payloads: CombatPayload[] = [];
    let id = 0;
    // Spotting rounds bracket the target: one well off, one adjusted in. They only mark.
    const spot = (time: number, distance: number) => {
      const bearing = random() * Math.PI * 2;
      payloads.push({ type: 'munition', id: id++, impact: { x: target.x + Math.cos(bearing) * distance, z: target.z + Math.sin(bearing) * distance },
        time, flight: 2.4, descent, blast: null, smoke: '#d8463a' });
    };
    spot(5.5, 30 + random() * 20);
    spot(8.5, 12 + random() * 6);
    // Fire for effect: an ellipse stretched along the line of fire, as real
    // dispersion is. Box-Muller gives the spread, clipped at 2.5 sigma.
    const shells = Math.round(6 + 6 * (intensity - .5) / 1.5), span = 8;
    const gaussian = gaussianFrom(random);
    for (let i = 0; i < shells; i++) {
      payloads.push({ type: 'munition', id: id++, impact: offset(gaussian() * 8, gaussian() * 4.5),
        time: FIRE_FOR_EFFECT + i * span / shells + random() * .35, flight: 2.4, descent, blast: { ...ARTILLERY_SHELL } });
    }
    const last = payloads.reduce((end, p) => Math.max(end, p.type === 'munition' ? p.time : 0), 0);
    payloads.push({ type: 'marker', id: id++, center: { ...target }, radius: 24, from: 0, until: last + 1.5, colour: '#ff4a3a' });
    return payloads;
  },
});

/**
 * Troop transports: how the enemy's dead come back. A bot that falls waits
 * for a ride instead of reappearing at a spawn point, and the ride is visible
 * — a truck down a clear street or a helicopter that fast-ropes them in.
 * `target` is the drop, `heading` the direction of travel into it, `reach`
 * the length of the approach, `troops` how many get out.
 */
export const TRANSPORT = {
  land: { warning: 3, duration: 70, speed: 11, leaving: 8 },
  air: { warning: 4, duration: 40, speed: 32, cruise: 55, hover: 9, overfly: 220 },
} as const;
const clampTo = (value: number | undefined, low: number, high: number, fallback: number) => Number.isFinite(value) ? Math.max(low, Math.min(high, value!)) : fallback;
function transportTimeline(event: Readonly<CombatEventDescriptor>, mode: 'land' | 'air'): CombatPayload[] {
  const troops = Math.round(clampTo(event.troops, 1, MAX_TROOPS, 4)), reach = clampTo(event.reach, 20, 260, 120);
  const along = { x: -Math.sin(event.heading), z: -Math.cos(event.heading) }, across = { x: along.z, z: -along.x };
  const drop = { ...event.target }, entry = { x: drop.x - along.x * reach, z: drop.z - along.z * reach };
  const payloads: CombatPayload[] = [];
  if (mode === 'land') {
    const spec = TRANSPORT.land, enter = spec.warning, arrive = enter + reach / spec.speed / .9;
    // Off the tailgate in a file along the truck, a step clear of it; a full
    // load forms two files, one down each side.
    const sides = troops > 4 ? 2 : 1, rank = Math.ceil(troops / sides);
    for (let slot = 0; slot < troops; slot++) {
      const side = sides === 2 && slot % 2 ? -1 : 1, place = sides === 2 ? Math.floor(slot / 2) : slot;
      const file = (place - (rank - 1) / 2) * 1.1;
      payloads.push({ type: 'insert', id: slot, slot, time: arrive + .8 + slot * .55, at: { x: drop.x + across.x * 2.6 * side + along.x * file, z: drop.z + across.z * 2.6 * side + along.z * file } });
    }
    const depart = arrive + 1.8 + troops * .55;
    payloads.push({ type: 'transport', id: troops, mode, entry, drop, exit: entry, enter, arrive, depart, leave: depart + reach / spec.leaving, cruise: 0, hover: 0 });
    return payloads;
  }
  const spec = TRANSPORT.air, enter = spec.warning, arrive = enter + reach / spec.speed / .85 + 2;
  const random = combatRandom(event.seed);
  // Two ropes, one each side; each troop lands a pace or so from the skids.
  for (let slot = 0; slot < troops; slot++) {
    const side = slot % 2 ? -1 : 1, spread = 1.4 + random() * .8;
    payloads.push({ type: 'insert', id: slot, slot, time: arrive + 1.2 + slot * .7,
      at: { x: drop.x + across.x * side * spread + along.x * (random() - .5), z: drop.z + across.z * side * spread + along.z * (random() - .5) } });
  }
  const depart = arrive + 2.2 + troops * .7;
  payloads.push({ type: 'transport', id: troops, mode, entry, drop, exit: { x: drop.x + along.x * spec.overfly, z: drop.z + along.z * spec.overfly },
    enter, arrive, depart, leave: depart + 9, cruise: spec.cruise, hover: spec.hover });
  return payloads;
}
registerCombatEvent({
  id: 'transport-land', name: 'Troop truck', description: 'A truck drives reinforcements in along a clear street, drops them and turns back.',
  warning: TRANSPORT.land.warning, duration: TRANSPORT.land.duration, hazard: false,
  banner: { warning: 'BLACK KITE TRUCK INBOUND · REINFORCEMENTS', active: 'MERCENARIES DISMOUNTING' },
  timeline: event => transportTimeline(event, 'land'),
});
registerCombatEvent({
  id: 'transport-air', name: 'Troop helicopter', description: 'A helicopter comes in high, hovers and fast-ropes reinforcements down.',
  warning: TRANSPORT.air.warning, duration: TRANSPORT.air.duration, hazard: false,
  banner: { warning: 'BLACK KITE HELICOPTER INBOUND · REINFORCEMENTS', active: 'MERCENARIES FAST-ROPING IN' },
  timeline: event => transportTimeline(event, 'air'),
});

/**
 * Air raid: jets cross the district in a line and each drops a stick of
 * bombs. Bombs come from straight above, so a roof is the cover that counts:
 * get indoors, under a void deck or under a viaduct.
 */
export const AIR_RAID = { warning: 10, duration: 32, speed: 110, height: 140, stick: 5, spacing: 12, over: 12.5, stagger: 2.2, ring: 40 } as const;
export const AIR_BOMB: BlastSpec = { radius: 12, damage: 200, minScale: .15, vehicleScale: 2, stance: true, overhead: true };
registerCombatEvent({
  id: 'air-raid', name: 'Air raid', cause: 'Air raid',
  description: 'Jets cross the district and each drops a stick of bombs. Only a roof overhead keeps them off you.',
  warning: AIR_RAID.warning, duration: AIR_RAID.duration, hazard: true,
  banner: { warning: 'AIR RAID · GET UNDER A ROOF', active: 'AIR RAID · STAY UNDER COVER' },
  timeline(event) {
    const random = combatRandom(event.seed), offset = frame(event), intensity = clampIntensity(event.intensity);
    const jets = intensity < .9 ? 1 : intensity < 1.6 ? 2 : 3, { speed, spacing, stick } = AIR_RAID;
    const descent = descentAlong(event.heading, 1.2);
    const payloads: CombatPayload[] = [];
    let id = 0, last = 0;
    for (let jet = 0; jet < jets; jet++) {
      const side = (jet - (jets - 1) / 2) * 16, over = AIR_RAID.over + jet * AIR_RAID.stagger, reach = 600;
      payloads.push({ type: 'flyer', id: id++, model: 'jet', from: offset(-reach, side), to: offset(reach, side), height: AIR_RAID.height + jet * 8, enter: over - reach / speed, leave: over + reach / speed });
      for (let bomb = 0; bomb < stick; bomb++) {
        const forward = (bomb - (stick - 1) / 2) * spacing + (random() - .5) * 3;
        const time = over + forward / speed;
        payloads.push({ type: 'munition', id: id++, kind: 'bomb', impact: offset(forward, side + (random() - .5) * 4), time, flight: 2.5, descent, blast: { ...AIR_BOMB } });
        last = Math.max(last, time);
      }
    }
    payloads.push({ type: 'marker', id: id++, center: { ...event.target }, radius: AIR_RAID.ring, from: 0, until: last + 1.5, colour: '#ff8a2a' });
    return payloads;
  },
});

/**
 * Helicopter raid: an attack helicopter comes in and circles a player. Its
 * door gunner walks tracers onto someone it can see, then fires a burst. It
 * can be shot down; the host owns its health and its gun.
 */
export const RAID = { warning: 8, duration: 80, radius: 30, approach: 220, health: 700, orbit: [32, 56] as const, round: 12, spread: .06,
  walkIn: 1, burst: 1.5, rate: .1, pause: [2.5, 4] as const, sight: 110 } as const;
registerCombatEvent({
  id: 'helicopter-raid', name: 'Helicopter raid', cause: 'Gunship', targeting: { policy: 'player' },
  description: 'An attack helicopter circles overhead and its door gunner fires on anyone in the open. It can be shot down.',
  warning: RAID.warning, duration: RAID.duration, hazard: true,
  banner: { warning: 'ENEMY HELICOPTER INBOUND · FIND COVER', active: 'HELICOPTER RAID · BREAK LINE OF SIGHT OR SHOOT IT DOWN' },
  timeline(event) {
    const offset = frame(event), intensity = clampIntensity(event.intensity);
    const arrive = RAID.warning, orbit = RAID.orbit[0] + (RAID.orbit[1] - RAID.orbit[0]) * (intensity - .5) / 1.5, leave = arrive + orbit;
    return [
      { type: 'orbit', id: 0, entry: offset(-RAID.approach, 0), center: { ...event.target }, radius: RAID.radius, exit: offset(60, 260), enter: 0, arrive, leave, gone: leave + 10 },
      { type: 'presence', id: 1, until: leave },
    ];
  },
});

/**
 * Mortar fire: a two-man crew sets up 60–120 m away and drops salvos on an
 * area. The rounds are a pure timeline from the descriptor; kill the crew and
 * nothing more is fired, though rounds already in the air still land.
 */
export const MORTAR = { warning: 4, duration: 62, first: 4.5, interval: 7, flight: 4, sigma: 5, ring: 18, crew: 2 } as const;
export const MORTAR_ROUND: BlastSpec = { radius: 6, damage: 110, minScale: .2, vehicleScale: 1.2, stance: true };
registerCombatEvent({
  id: 'mortar', name: 'Mortar fire', cause: 'Mortar',
  description: 'A mortar team drops salvos on an area until both of them are dead. Find the pit, or keep moving.',
  warning: MORTAR.warning, duration: MORTAR.duration, hazard: true,
  banner: { warning: 'MORTAR FIRE INBOUND · CLEAR THE MARKED AREA', active: 'MORTAR FIRE · KEEP MOVING OR SILENCE THE CREW' },
  timeline(event) {
    const random = combatRandom(event.seed), offset = frame(event), gaussian = gaussianFrom(random);
    const salvos = Math.max(5, Math.min(8, Math.round(4 + 2 * clampIntensity(event.intensity))));
    const launch = event.origin ?? offset(-90, 0), descent = descentAlong(event.heading, 1.3);
    const payloads: CombatPayload[] = [];
    let id = 0, last = 0;
    for (let salvo = 0; salvo < salvos; salvo++) for (let round = 0; round < 2; round++) {
      const time = MORTAR.first + salvo * MORTAR.interval + round * .6 + random() * .3;
      payloads.push({ type: 'munition', id: id++, kind: 'mortar', launch: { ...launch }, impact: offset(gaussian() * MORTAR.sigma, gaussian() * MORTAR.sigma),
        time, flight: MORTAR.flight, descent, blast: { ...MORTAR_ROUND } });
      last = Math.max(last, time);
    }
    payloads.push({ type: 'marker', id: id++, center: { ...event.target }, radius: MORTAR.ring, from: 0, until: last + 1.5, colour: '#ff7a2a' });
    payloads.push({ type: 'presence', id: id++, until: last });
    return payloads;
  },
});

/**
 * Loitering drone: flies in, circles, locks on to a player it can see, then
 * dives and detonates. It is live on the host (it chases); a burst of rifle
 * fire brings it down.
 */
export const DRONE = { warning: 6, duration: 70, cruise: 20, dive: 28, loiter: 14, height: 32, lock: 1.6, commit: 9, health: 30, sight: 80, stay: 60 } as const;
export const DRONE_BLAST: BlastSpec = { radius: 6, damage: 130, minScale: .2, vehicleScale: 1.5, stance: true };
registerCombatEvent({
  id: 'drone', name: 'Loitering drone', cause: 'Drone', targeting: { policy: 'player' },
  description: 'A drone circles, locks on to someone it can see and dives. Shoot it down, or break its line of sight before it commits.',
  warning: DRONE.warning, duration: DRONE.duration, hazard: true,
  banner: { warning: 'DRONE INBOUND · LISTEN FOR IT', active: 'DRONE OVERHEAD · SHOOT IT DOWN OR GET INSIDE' },
  timeline: () => [{ type: 'presence', id: 0, until: DRONE.stay }],
});

/**
 * Rooftop sniper: a marksman takes a high perch within rifle reach of whoever
 * is nearest, so they can always be shot back. Their scope glints while they
 * line up a shot. They stay until killed or until the event runs out, then
 * relocate. Patrols only look up at them once they have been shot at.
 */
/** `reach`: the furthest a perch may be from whoever it watches, inside the 125 m any rifle fired back can carry. */
export const OVERWATCH = { warning: 3, duration: 85, stay: 80, range: [45, 95] as const, rise: 5, reach: 110 } as const;
registerCombatEvent({
  id: 'sniper', name: 'Rooftop sniper', targeting: { policy: 'player' },
  description: 'A marksman on a high perch. Watch for the scope glint, and stay out of their line.',
  warning: OVERWATCH.warning, duration: OVERWATCH.duration, hazard: true,
  banner: { warning: 'SNIPER TAKING POSITION', active: 'SNIPER · WATCH FOR THE GLINT' },
  timeline: () => [{ type: 'presence', id: 0, until: OVERWATCH.stay }],
});

/**
 * Supply drop: a cargo aircraft drops a crate on a parachute. Whoever reaches
 * it first has it: a player opens it, or patrols that hold it for a few
 * seconds carry it off.
 */
export const SUPPLY = { warning: 4, duration: 100, speed: 70, height: 150, release: 12, fall: 100, sink: 5.5, until: 95, claim: 2.8, hold: 5 } as const;
registerCombatEvent({
  id: 'supply-drop', name: 'Supply drop', targeting: { policy: 'area', range: [35, 90] },
  description: 'A crate comes down on a parachute. Get to it before the patrols carry it off.',
  warning: SUPPLY.warning, duration: SUPPLY.duration, hazard: false,
  banner: { warning: 'SUPPLY DROP INBOUND', active: 'SUPPLY DROP · GET TO THE CRATE FIRST' },
  timeline(event) {
    const offset = frame(event), reach = 700, land = SUPPLY.release + SUPPLY.fall / SUPPLY.sink;
    return [
      { type: 'flyer', id: 0, model: 'cargo', from: offset(-reach, 0), to: offset(reach, 0), height: SUPPLY.height, enter: SUPPLY.release - reach / SUPPLY.speed, leave: SUPPLY.release + reach / SUPPLY.speed },
      { type: 'crate', id: 1, at: { ...event.target }, release: SUPPLY.release, land, height: SUPPLY.fall, until: SUPPLY.until },
      { type: 'marker', id: 2, center: { ...event.target }, radius: 5, from: land, until: SUPPLY.until, colour: '#5fe08a' },
      { type: 'presence', id: 3, until: SUPPLY.until },
    ];
  },
});

/**
 * Smoke screen: canisters land in a line across the event's heading and
 * raise a wall of smoke that blocks sight both ways, for bots and players.
 */
export const SMOKE_SCREEN = { warning: 2, duration: 46, canisters: 4, spacing: 9, radius: 8, from: 3, until: 38 } as const;
registerCombatEvent({
  id: 'smoke-screen', name: 'Smoke screen', targeting: { policy: 'area', range: [20, 55] },
  description: 'A wall of smoke rises across the street. Nobody sees through it, you included.',
  warning: SMOKE_SCREEN.warning, duration: SMOKE_SCREEN.duration, hazard: false,
  banner: { warning: 'SMOKE INBOUND', active: 'SMOKE SCREEN · NO LINE OF SIGHT THROUGH IT' },
  timeline(event) {
    const random = combatRandom(event.seed), offset = frame(event), descent = descentAlong(event.heading, 1);
    const payloads: CombatPayload[] = [];
    for (let i = 0; i < SMOKE_SCREEN.canisters; i++) {
      const at = offset((random() - .5) * 4, (i - (SMOKE_SCREEN.canisters - 1) / 2) * SMOKE_SCREEN.spacing), time = 2.4 + i * .25;
      payloads.push({ type: 'munition', id: i * 2, kind: 'canister', impact: at, time, flight: 1.6, descent, blast: null, smoke: '#cfd2cc' });
      payloads.push({ type: 'cloud', id: i * 2 + 1, center: at, radius: SMOKE_SCREEN.radius, from: time + .3, until: SMOKE_SCREEN.until + random() * 4, dps: 0, colour: '#c6c9c3' });
    }
    return payloads;
  },
});

/**
 * Tear gas: canisters land around the target and a choking cloud settles.
 * It wears through anyone inside, plates or not, until they get out.
 */
export const TEAR_GAS = { warning: 4, duration: 40, canisters: 3, spread: 5, radius: 7, dps: 7, until: 32, ring: 15 } as const;
registerCombatEvent({
  id: 'tear-gas', name: 'Tear gas', cause: 'Tear gas',
  description: 'A choking cloud that hurts whoever stays in it, armour or not. Walk out of it.',
  warning: TEAR_GAS.warning, duration: TEAR_GAS.duration, hazard: true,
  banner: { warning: 'GAS INBOUND · CLEAR THE MARKED AREA', active: 'TEAR GAS · GET OUT OF THE CLOUD' },
  timeline(event) {
    const random = combatRandom(event.seed), offset = frame(event), descent = descentAlong(event.heading, 1);
    const payloads: CombatPayload[] = [];
    for (let i = 0; i < TEAR_GAS.canisters; i++) {
      const angle = i / TEAR_GAS.canisters * Math.PI * 2 + random() * .6, at = offset(Math.cos(angle) * TEAR_GAS.spread, Math.sin(angle) * TEAR_GAS.spread);
      const time = TEAR_GAS.warning + .2 + i * .3;
      payloads.push({ type: 'munition', id: i * 2, kind: 'canister', impact: at, time, flight: 1.6, descent, blast: null, smoke: '#e2dfb8' });
      payloads.push({ type: 'cloud', id: i * 2 + 1, center: at, radius: TEAR_GAS.radius, from: time + .4, until: TEAR_GAS.until, dps: TEAR_GAS.dps, colour: '#e4e1c4' });
    }
    payloads.push({ type: 'marker', id: 9, center: { ...event.target }, radius: TEAR_GAS.ring, from: 0, until: TEAR_GAS.until, colour: '#e8d34a' });
    return payloads;
  },
});

/**
 * Blackout: radio and map jamming for most of a minute. At night the
 * district's light goes too. It hurts nobody; it takes away what you see.
 */
export const BLACKOUT = { warning: 3, duration: 55, until: 48 } as const;
registerCombatEvent({
  id: 'blackout', name: 'Blackout', targeting: { policy: 'area', range: [0, 40] },
  description: 'Jammers take out the map and the radio; at night the lights go with them.',
  warning: BLACKOUT.warning, duration: BLACKOUT.duration, hazard: false,
  banner: { warning: 'JAMMING DETECTED', active: 'COMMS JAMMED · MAP DOWN' },
  timeline: () => [{ type: 'jam', id: 0, from: BLACKOUT.warning, until: BLACKOUT.until }],
});
/** A friendly ride is the same truck or helicopter; only what the HUD and comms call it changes. */
const FRIENDLY_BANNERS: Readonly<Record<string, { warning: string; active: string }>> = {
  'transport-land': { warning: 'FRIENDLY TRUCK INBOUND · ARMED FORCES', active: 'FRIENDLY SECTION DISMOUNTING' },
  'transport-air': { warning: 'FRIENDLY HELICOPTER INBOUND · ARMED FORCES', active: 'FRIENDLY SECTION FAST-ROPING IN' },
  sniper: { warning: 'FRIENDLY SNIPER MOVING UP · ARMED FORCES', active: 'FRIENDLY OVERWATCH ON THE ROOFS' },
};
export const bannerOf = (event: Pick<CombatEventDescriptor, 'kind' | 'faction'>, plugin: { banner: { warning: string; active: string } }) =>
  (event.faction === PLAYER_FACTION && FRIENDLY_BANNERS[event.kind]) || plugin.banner;
/** Hazards that pick their targets by side, so one fighting for the players is no danger to them. Blasts and gas hurt everyone. */
const AIMED_BY_SIDE: ReadonlySet<string> = new Set(['sniper']);
/** Whether an event is a danger to the players: worth an alarm, a tone and a mark on the map. */
export const threatens = (event: Pick<CombatEventDescriptor, 'kind' | 'faction'>, plugin: { hazard: boolean }) =>
  plugin.hazard && !(event.faction === PLAYER_FACTION && AIMED_BY_SIDE.has(event.kind));
