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
];
