import { createRegionMovement } from './region-collision';
export type { Obstacle, Position2D } from './region-collision';

export const RAFFLES_BOUNDS = { minX: -290, maxX: 290, minZ: -134, maxZ: 265 };
const movement = createRegionMovement(RAFFLES_BOUNDS);
export const canOccupy = movement.canOccupy;
export const moveInRaffles = movement.move;
