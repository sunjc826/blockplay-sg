import type { LevolutionBinding } from './levolution';
import './levolution-catalog';

/**
 * Which arena runs which Levolution event on which of its stage parts. No
 * coordinates: a part that moves in a redesign takes its event with it, and
 * levolution-bindings.test.ts builds every arena named here and fails on a
 * part that has been renamed or removed.
 */
export const LEVOLUTION_BINDINGS: readonly LevolutionBinding[] = [
  // Both gantries go on the same clock; the east one warns three seconds longer, so the yard comes down west then east.
  { id: 'container-yard-west', arena: 'container-yard', archetype: 'gantry-collapse', name: 'West gantry',
    parts: { crane: 'stacking-crane-west', first: 'container-stack-b', second: 'container-stack-a' },
    triggers: [{ kind: 'blast', role: 'crane', health: 300 }, { kind: 'clock', at: .6 }] },
  { id: 'container-yard-east', arena: 'container-yard', archetype: 'gantry-collapse', name: 'East gantry', warning: 9,
    parts: { crane: 'stacking-crane-east', first: 'container-stack-c', second: 'container-stack-d' },
    triggers: [{ kind: 'blast', role: 'crane', health: 300 }, { kind: 'clock', at: .6 }] },
  // Trees: a squall is not needed, only time or a blast at the roots.
  ...([['timah-corridor', 'corridor-tree'], ['thomson-crossing', 'street-tree'], ['jurong-gardens', 'garden-tree'], ['ubin-village', 'village-tree'], ['gardens-cool-house', 'lawn-tree'],
    ['harbour-gateway', 'gateway-tree'], ['raffles-square', 'square-tree'], ['queenstown-green', 'green-tree'], ['marina-gardens', 'garden-tree']] as const).map(([arena, part]): LevolutionBinding => ({
    id: `${arena}-tree`, arena, archetype: 'give-way', name: 'Rain tree', banner: 'TREE COMING DOWN · GET CLEAR', cause: 'Falling tree',
    parts: { piece: part }, triggers: [{ kind: 'blast', role: 'piece', health: 200 }, { kind: 'clock', at: .5 }] })),
  // Shelters and awnings: the overhead cover goes and what is left is low cover.
  ...([['smith-street', 'street-canopy', 'Street canopy'], ['woodlands-park', 'lawn-shelter', 'Lawn shelter'], ['kampong-courts', 'court-awning', 'Court awning'], ['changi-arrival', 'arrival-canopy', 'Arrival canopy']] as const).map(([arena, part, name]): LevolutionBinding => ({
    id: `${arena}-canopy`, arena, archetype: 'give-way', name, banner: 'ROOF COMING DOWN · GET OUT FROM UNDER IT', cause: 'Falling roof',
    parts: { piece: part }, triggers: [{ kind: 'blast', role: 'piece', health: 200 }, { kind: 'clock', at: .55 }] })),
  { id: 'tampines-hub-lockdown', arena: 'tampines-hub', archetype: 'lockdown', name: 'West concourse', parts: { gate: 'west-concourse-shutters' }, triggers: [{ kind: 'clock', at: .5 }] },
  // Blackouts only show after dark; by day the kiosk burns out and nothing else changes.
  ...(['geylang-lorongs', 'little-india-lanes', 'yishun-courts'] as const).map((arena): LevolutionBinding => ({
    id: `${arena}-blackout`, arena, archetype: 'substation', name: 'Substation', parts: { kiosk: 'substation' }, triggers: [{ kind: 'blast', role: 'kiosk', health: 150 }, { kind: 'clock', at: .5 }] })),
  // Floods: the clock only. Nothing a player does brings the water.
  ...([['bishan-court', 'park-flood', 'River park', .5], ['orchard-boulevard', 'boulevard-flood', 'Boulevard', .5], ['punggol-green', 'waterway-flood', 'Waterway', .5],
    ['dragon-courtyard', 'courtyard-flood', 'Water main', .5], ['katong-court', 'street-flood', 'Water main', .5], ['sentosa-palms', 'beach-tide', 'Tide', .45]] as const).map(([arena, part, name, at]): LevolutionBinding => ({
    id: `${arena}-flood`, arena, archetype: 'flash-flood', name, ...(name === 'Tide' ? { banner: 'TIDE COMING IN · THE BEACH SIDE FLOODS' } : name === 'Water main' ? { banner: 'WATER MAIN BURST · LOW GROUND FLOODS' } : {}),
    parts: { water: part }, triggers: [{ kind: 'clock', at }] })),
];
