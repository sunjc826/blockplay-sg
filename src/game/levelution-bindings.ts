import type { LevelutionBinding } from './levelution';
import './levelution-catalog';

/**
 * Which arena runs which Levelution event on which of its stage parts. No
 * coordinates: a part that moves in a redesign takes its event with it, and
 * levelution-bindings.test.ts builds every arena named here and fails on a
 * part that has been renamed or removed.
 */
export const LEVELUTION_BINDINGS: readonly LevelutionBinding[] = [
  { id: 'container-yard-topple', arena: 'container-yard', archetype: 'stack-topple', name: 'Container stack',
    parts: { stack: 'container-stack-b' },
    triggers: [{ kind: 'blast', role: 'stack', health: 250 }, { kind: 'clock', at: .6 }] },
];
