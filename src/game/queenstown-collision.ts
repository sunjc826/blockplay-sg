import { createRegionMovement } from './region-collision';
export type { Obstacle, Position2D } from './region-collision';

export const QUEENSTOWN_BOUNDS = { minX: -260, maxX: 260, minZ: -212, maxZ: 212 };
const movement = createRegionMovement(QUEENSTOWN_BOUNDS);
export const canOccupy = movement.canOccupy;
export const moveInQueenstown = movement.move;
