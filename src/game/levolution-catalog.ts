import { registerLevolution, stageReach } from './levolution';
import { STAGE_FLOOD_SECONDS, STAGE_GIVE_WAY_SECONDS, STAGE_SHUTTER_SECONDS } from './stage-props';

/**
 * Every shipped Levolution archetype, registered on import. An archetype is
 * written against part roles and reads positions only from the parts it is
 * handed, so it runs unchanged on any map that can fill its roles.
 */

/**
 * A stack gives way. The part's `toppled` state is what is left standing plus
 * what fell, authored beside the stack in its scene: typically a lane opened
 * through the block, fallen boxes as cover across the ground beyond, and a
 * climb onto the rows still standing.
 */
registerLevolution({
  id: 'stack-topple', name: 'Stack topple', warning: 6, settle: 3,
  banner: 'STACK GIVING WAY · GET CLEAR', cause: 'Falling containers',
  roles: { stack: { states: ['toppled'] } },
  steps: ({ stack }) => {
    const reach = stageReach(stack)!;
    return [
      { type: 'marker', from: 0, until: 1.5, center: reach.center, radius: reach.radius + 2 },
      { type: 'set', at: 0, part: stack.id, state: 'toppled' },
      { type: 'crush', at: 0, damage: 400 },
    ];
  },
});

/** Seconds a gantry takes to go over; its scene authors the `falling` state to the same figure. */
const GANTRY_FALL = 3;
/**
 * A rail gantry goes over, and the leg that swings up through the stacks beneath takes their middles
 * out on the way. Staged: the gantry starts to go, the two stacks burst one after the other, and it
 * lands. The gantry's `falling` state has no colliders (it is in the air); `fallen` is where it lies.
 * Dust hangs over each landing for a quarter of a minute.
 */
registerLevolution({
  id: 'gantry-collapse', name: 'Gantry collapse', warning: 6, settle: GANTRY_FALL + 4,
  banner: 'GANTRY COMING DOWN · GET CLEAR', cause: 'Falling gantry',
  roles: { crane: { states: ['falling', 'fallen'] }, first: { states: ['toppled'] }, second: { states: ['toppled'] } },
  steps: ({ crane, first, second }) => {
    const all = [stageReach(crane)!, stageReach(first)!, stageReach(second)!];
    const minX = Math.min(...all.map(r => r.minX)), maxX = Math.max(...all.map(r => r.maxX)), minZ = Math.min(...all.map(r => r.minZ)), maxZ = Math.max(...all.map(r => r.maxZ));
    const lying = stageReach(crane, ['fallen'])!, standing = stageReach(crane, ['base'])!;
    // Which way it went, read off where it lies against where it stood.
    const heading = Math.atan2(lying.center.x - standing.center.x, lying.center.z - standing.center.z);
    const burst = (part: typeof first, at: number) => [{ type: 'set' as const, at, part: part.id, state: 'toppled' }, { type: 'crush' as const, at, damage: 400 }];
    const one = stageReach(first, ['base'])!.center, two = stageReach(second, ['base'])!.center;
    return [
      { type: 'marker', from: 0, until: GANTRY_FALL + 1.5, center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }, radius: Math.hypot(maxX - minX, maxZ - minZ) / 2 + 2 },
      { type: 'set', at: 0, part: crane.id, state: 'falling' },
      ...burst(first, GANTRY_FALL * .5), ...burst(second, GANTRY_FALL * .68),
      // One cloud bank for the whole collapse: across the two stacks as they burst, then out where the gantry lands.
      { type: 'dust', at: GANTRY_FALL * .5 + .2, center: standing.center, heading, reach: Math.hypot(one.x - two.x, one.z - two.z) / 2 },
      { type: 'set', at: GANTRY_FALL, part: crane.id, state: 'fallen' }, { type: 'crush', at: GANTRY_FALL, damage: 500 },
    ];
  },
});

/**
 * One piece of the map comes down: a tree across a lane, a canopy onto the ground under it. The part's
 * `fallen` state is drawn from the moment it starts to go and becomes solid, and lethal, when it lands.
 * A binding says what the piece is (`banner`, `cause`).
 */
registerLevolution({
  id: 'give-way', name: 'Collapse', warning: 5, settle: STAGE_GIVE_WAY_SECONDS + 3,
  banner: 'COMING DOWN · GET CLEAR', cause: 'Falling debris',
  roles: { piece: { states: ['fallen'] } },
  steps: ({ piece }) => {
    const all = stageReach(piece)!, lying = stageReach(piece, ['fallen'])!, standing = stageReach(piece, ['base'])!;
    const heading = Math.atan2(lying.center.x - standing.center.x, lying.center.z - standing.center.z);
    return [
      { type: 'marker', from: 0, until: STAGE_GIVE_WAY_SECONDS + 1, center: all.center, radius: all.radius + 2 },
      { type: 'set', at: STAGE_GIVE_WAY_SECONDS, lead: STAGE_GIVE_WAY_SECONDS, part: piece.id, state: 'fallen' },
      { type: 'crush', at: STAGE_GIVE_WAY_SECONDS, damage: 400 },
      { type: 'dust', at: STAGE_GIVE_WAY_SECONDS + .1, center: lying.center, heading, reach: Math.max(3, lying.radius * .45) },
    ];
  },
});

/**
 * Roller shutters come down across a passage and stay down: a route closes for the rest of the match.
 * Nobody is killed by a shutter; whoever is under it when it closes is hurt and pushed clear.
 */
registerLevolution({
  id: 'lockdown', name: 'Lockdown', warning: 6, settle: STAGE_SHUTTER_SECONDS + 1,
  banner: 'SHUTTERS CLOSING · THIS WAY SHUTS', cause: 'Closing shutters',
  roles: { gate: { states: ['shut'] } },
  steps: ({ gate }) => {
    const reach = stageReach(gate)!;
    return [
      { type: 'marker', from: 0, until: STAGE_SHUTTER_SECONDS, center: reach.center, radius: Math.min(reach.radius, 6) + 2 },
      { type: 'set', at: STAGE_SHUTTER_SECONDS, lead: STAGE_SHUTTER_SECONDS, part: gate.id, state: 'shut' },
      { type: 'crush', at: STAGE_SHUTTER_SECONDS, damage: 40 },
    ];
  },
});

/**
 * A substation fails and the district's lamps, signs and windows go out for the rest of the match.
 * It only shows after dark; by day nothing but the kiosk changes. Nothing falls and nobody is hurt.
 */
registerLevolution({
  id: 'substation', name: 'Blackout', warning: 4, settle: 2,
  banner: 'SUBSTATION FAILING · LIGHTS GOING OUT', cause: 'Substation',
  roles: { kiosk: { states: ['wrecked'] } },
  steps: ({ kiosk }) => [
    { type: 'set', at: 0, part: kiosk.id, state: 'wrecked' },
    { type: 'light', at: 0, level: 1 },
  ],
});

/**
 * Low ground floods and stays flooded: a sheet of water rises over the part's zones and everyone on
 * foot in it, player or bot, moves at a little over half pace. Nothing is hurt. Dry ground beside it
 * becomes the fast way round, and whoever crosses the water is slow in the open.
 */
export const FLOOD_PACE = .58;
registerLevolution({
  id: 'flash-flood', name: 'Flood', warning: 5, settle: STAGE_FLOOD_SECONDS + 1,
  banner: 'WATER RISING · LOW GROUND FLOODS', cause: 'Flood',
  roles: { water: { states: ['flooded'] } },
  steps: ({ water }) => [
    { type: 'set', at: STAGE_FLOOD_SECONDS, lead: STAGE_FLOOD_SECONDS, part: water.id, state: 'flooded' },
    // It slows once it is over the ankles, about halfway up.
    { type: 'wade', at: STAGE_FLOOD_SECONDS * .5, zones: water.zones ?? [], pace: FLOOD_PACE },
  ],
});
