import { registerLevelution, stageReach } from './levelution';

/**
 * Every shipped Levelution archetype, registered on import. An archetype is
 * written against part roles and reads positions only from the parts it is
 * handed, so it runs unchanged on any map that can fill its roles.
 */

/**
 * A stack gives way. The part's `toppled` state is what is left standing plus
 * what fell, authored beside the stack in its scene: typically a lane opened
 * through the block, fallen boxes as cover across the ground beyond, and a
 * climb onto the rows still standing.
 */
registerLevelution({
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
