import { createRegionMovement } from './region-collision';
export type { Obstacle, Position2D } from './region-collision';

export const MARINA_BOUNDS = { minX: -338, maxX: 388, minZ: -328, maxZ: 288 };
const movement = createRegionMovement(MARINA_BOUNDS);
export const canOccupy = movement.canOccupy;
export const moveInMarina = movement.move;
