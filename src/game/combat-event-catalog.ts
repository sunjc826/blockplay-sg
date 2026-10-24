import { combatRandom, descentAlong, registerCombatEvent, MAX_TROOPS, type CombatEventDescriptor, type CombatPayload, type CombatPlane } from './combat-events';

/**
 * The shipped combat events. Importing this module registers them; the arena
 * imports it, so anything that can run a match can run these.
 */

export const ARTILLERY_SHELL = { radius: 8, damage: 140, minScale: .2, vehicleScale: 1.5, stance: true } as const;
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
    const along = { x: -Math.sin(heading), z: -Math.cos(heading) }, across = { x: along.z, z: -along.x };
    const offset = (forward: number, side: number): CombatPlane => ({ x: target.x + along.x * forward + across.x * side, z: target.z + along.z * forward + across.z * side });
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
    const gaussian = () => Math.max(-2.5, Math.min(2.5, Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())));
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

/** A friendly ride is the same truck or helicopter; only what the HUD and comms call it changes. */
const FRIENDLY_BANNERS: Readonly<Record<string, { warning: string; active: string }>> = {
  'transport-land': { warning: 'FRIENDLY TRUCK INBOUND · ARMED FORCES', active: 'FRIENDLY SECTION DISMOUNTING' },
  'transport-air': { warning: 'FRIENDLY HELICOPTER INBOUND · ARMED FORCES', active: 'FRIENDLY SECTION FAST-ROPING IN' },
};
export const bannerOf = (event: Pick<CombatEventDescriptor, 'kind' | 'faction'>, plugin: { banner: { warning: string; active: string } }) =>
  (event.faction === 'forces' && FRIENDLY_BANNERS[event.kind]) || plugin.banner;
