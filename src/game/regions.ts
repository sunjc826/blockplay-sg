import type * as THREE from 'three';
import { REGION_IDS, isRegionId, type RegionId } from './region-ids';
import { createRegionMovement, type Obstacle, type Position2D, type RegionBounds } from './region-collision';
import { MARINA_BOUNDS, moveInMarina, canOccupy as canOccupyMarina } from './marina-collision';
import { RAFFLES_BOUNDS, moveInRaffles, canOccupy as canOccupyRaffles } from './raffles-collision';
import { QUEENSTOWN_BOUNDS, moveInQueenstown, canOccupy as canOccupyQueenstown } from './queenstown-collision';
import { buildMarinaScene, MARINA_MAP_ROADS, MARINA_SPAWN } from './marina-scene';
import { buildRafflesScene, RAFFLES_MAP_ROADS, RAFFLES_SPAWN } from './raffles-scene';
import { buildQueenstownScene, QUEENSTOWN_MAP_ROADS, QUEENSTOWN_SPAWN } from './queenstown-scene';
import { buildChinatownScene, CHINATOWN_BOUNDS, CHINATOWN_MAP_ROADS, CHINATOWN_SPAWN } from './chinatown-scene';
import { buildKampongGlamScene, KAMPONG_GLAM_BOUNDS, KAMPONG_GLAM_MAP_ROADS, KAMPONG_GLAM_SPAWN } from './kampong-glam-scene';
import { buildJurongLakeScene, JURONG_LAKE_BOUNDS, JURONG_LAKE_MAP_ROADS, JURONG_LAKE_SPAWN } from './jurong-lake-scene';
import { CHINATOWN_STAMPS, JURONG_LAKE_STAMPS, KAMPONG_GLAM_STAMPS, MARINA_STAMPS, QUEENSTOWN_STAMPS, RAFFLES_STAMPS } from '../data/region-stamps.ts';

export { REGION_IDS, isRegionId };
export type { RegionId };

export interface RegionStamp { readonly name: string; readonly x: number; readonly z: number }
export interface RegionRoad { readonly points: readonly Position2D[] }
/** Ground spawn shared by the region game, the expedition zone and the tests. */
export interface RegionSpawn { readonly x: number; readonly z: number; readonly yaw: number }

/** Built scene handle. Every region builder returns this shape. */
export interface RegionWorld {
  scene: THREE.Scene;
  obstacles: Obstacle[];
  car: THREE.Object3D;
  stamps: THREE.Object3D[];
  animate(time: number): void;
  dispose(): void;
}

type MapLayer = 'under' | 'over';
/** Schematic map furniture in world coordinates, drawn under or over the roads. */
export type RegionMapShape =
  | { kind: 'rect'; x: number; z: number; width: number; depth: number; fill: string; radius?: number; layer?: MapLayer; fpsFill?: string; fpsLayer?: MapLayer }
  | { kind: 'line'; from: Position2D; to: Position2D; stroke: string; width: number; layer?: MapLayer; fpsStroke?: string; fpsLayer?: MapLayer };

export interface RegionDefinition {
  readonly id: RegionId;
  /** Full display name; `shortName` labels controls where the district is implied. */
  readonly name: string;
  readonly shortName: string;
  readonly modeName: string;
  readonly modeSubtitle: string;
  readonly className: string;
  readonly badge: string;
  readonly title: string;
  readonly subtitle: string;
  readonly mapTitle: string;
  /** "All <stampNoun>." and "Explore <exploreNoun> and collect N stamps." */
  readonly stampNoun: string;
  readonly exploreNoun: string;
  readonly cameraFar: number;
  readonly spawn: RegionSpawn;
  readonly stamps: readonly RegionStamp[];
  readonly bounds: RegionBounds;
  readonly mapRoads: readonly RegionRoad[];
  readonly mapPaper: string;
  readonly roadStroke: string;
  readonly roadWidth: number;
  readonly decor: readonly RegionMapShape[];
  /** Regions with a reviewed, source-linked learning catalog show the guide panel. */
  readonly hasGuide: boolean;
  readonly build: () => RegionWorld;
  readonly move: (position: Position2D, dx: number, dz: number, radius: number, obstacles: readonly Obstacle[]) => Position2D;
  readonly canOccupy: (x: number, z: number, radius: number, obstacles: readonly Obstacle[]) => boolean;
}

const chinatownMovement = createRegionMovement(CHINATOWN_BOUNDS);
const kampongGlamMovement = createRegionMovement(KAMPONG_GLAM_BOUNDS);
const jurongLakeMovement = createRegionMovement(JURONG_LAKE_BOUNDS);

const definitions: Record<RegionId, RegionDefinition> = {
  'marina-bay': {
    id: 'marina-bay', name: 'Marina Bay', shortName: 'Marina', modeName: 'Marina 3D', modeSubtitle: 'Explore the expanded bay',
    className: 'marina-game', badge: 'MARINA BAY · GAME WORLD', title: 'Marina Bay · waterfront & gardens',
    subtitle: 'Expanded low-poly map · inner and outer road loops', mapTitle: 'THE BAY & GARDENS',
    stampNoun: 'stamps collected', exploreNoun: 'the bay', cameraFar: 1400,
    spawn: MARINA_SPAWN, stamps: MARINA_STAMPS, bounds: MARINA_BOUNDS, mapRoads: MARINA_MAP_ROADS,
    mapPaper: '#d7dfc8', roadStroke: '#929f8d', roadWidth: 15,
    decor: [
      { kind: 'rect', x: -80, z: -90, width: 160, depth: 140, fill: '#7db5b3', layer: 'over', fpsFill: '#315e65', fpsLayer: 'under' },
      ...[-65, -15, 35].map((z): RegionMapShape => ({ kind: 'rect', x: 139, z: z - 15, width: 24, depth: 30, fill: '#eee7ce', layer: 'over' })),
      { kind: 'rect', x: 141, z: -107, width: 20, depth: 184, radius: 4, fill: '#819872', layer: 'over' },
    ],
    hasGuide: false, build: buildMarinaScene, move: moveInMarina, canOccupy: canOccupyMarina,
  },
  'raffles-place': {
    id: 'raffles-place', name: 'Raffles Place', shortName: 'Raffles', modeName: 'Raffles 3D', modeSubtitle: 'Explore the city core',
    className: 'raffles-game', badge: 'RAFFLES · PLACE · GAME WORLD', title: 'Raffles · the financial district',
    subtitle: 'Low-poly game map · authored skyline, square and riverfront', mapTitle: 'THE CITY & QUAYS',
    stampNoun: 'district stamps', exploreNoun: 'the square and quays', cameraFar: 800,
    spawn: RAFFLES_SPAWN, stamps: RAFFLES_STAMPS, bounds: RAFFLES_BOUNDS, mapRoads: RAFFLES_MAP_ROADS,
    mapPaper: '#dedbcf', roadStroke: '#8b938e', roadWidth: 16,
    decor: [
      { kind: 'rect', x: -290, z: -168, width: 580, depth: 32, fill: '#76a8b1', layer: 'under' },
      { kind: 'rect', x: -42, z: -65, width: 92, depth: 78, fill: '#98ab78', layer: 'over', fpsFill: '#3d5840', fpsLayer: 'over' },
    ],
    hasGuide: true, build: buildRafflesScene, move: moveInRaffles, canOccupy: canOccupyRaffles,
  },
  queenstown: {
    id: 'queenstown', name: 'Queenstown', shortName: 'Queenstown', modeName: 'Queenstown 3D', modeSubtitle: 'Walk and drive the estate',
    className: 'queenstown-game', badge: 'QUEENSTOWN · GAME WORLD', title: 'Queenstown · the neighborhood loop',
    subtitle: 'Low-poly game map · authored heritage-inspired neighborhood', mapTitle: 'ESTATE & DISTRICTS',
    stampNoun: 'estate stamps', exploreNoun: 'the estate', cameraFar: 1400,
    spawn: QUEENSTOWN_SPAWN, stamps: QUEENSTOWN_STAMPS, bounds: QUEENSTOWN_BOUNDS, mapRoads: QUEENSTOWN_MAP_ROADS,
    mapPaper: '#d7dfc8', roadStroke: '#929f8d', roadWidth: 14,
    decor: [
      { kind: 'line', from: { x: -180, z: 22 }, to: { x: 180, z: 22 }, stroke: '#ddd5c5', width: 5, layer: 'over' },
      { kind: 'rect', x: -44, z: 12, width: 88, depth: 20, fill: '#498877', layer: 'over' },
      ...([[-73, -44], [73, -44], [-73, 64], [73, 64]] as const).map(([x, z]): RegionMapShape =>
        ({ kind: 'rect', x: x - 23, z: z - 9, width: 46, depth: 18, fill: '#eee7ce', layer: 'over' })),
      { kind: 'line', from: { x: -157, z: -133 }, to: { x: -157, z: 133 }, stroke: '#5d9b57', width: 5, layer: 'over' },
    ],
    hasGuide: true, build: buildQueenstownScene, move: moveInQueenstown, canOccupy: canOccupyQueenstown,
  },
  chinatown: {
    id: 'chinatown', name: 'Chinatown', shortName: 'Chinatown', modeName: 'Chinatown 3D', modeSubtitle: 'Shophouse streets and temples',
    className: 'chinatown-game', badge: 'CHINATOWN · GAME WORLD', title: 'Chinatown · shophouses & temples',
    subtitle: 'Low-poly game map · authored market lanes, terraces and temple halls', mapTitle: 'LANES & TEMPLES',
    stampNoun: 'lane stamps', exploreNoun: 'the market lanes', cameraFar: 1100,
    spawn: CHINATOWN_SPAWN, stamps: CHINATOWN_STAMPS, bounds: CHINATOWN_BOUNDS, mapRoads: CHINATOWN_MAP_ROADS,
    mapPaper: '#e2d9c8', roadStroke: '#9a9188', roadWidth: 14,
    decor: [
      { kind: 'rect', x: -158, z: 49, width: 76, depth: 58, fill: '#c4b79e', layer: 'over' },
      { kind: 'rect', x: 53, z: -41, width: 84, depth: 62, fill: '#cbbfa6', layer: 'over' },
      { kind: 'rect', x: 170, z: -75, width: 44, depth: 150, fill: '#9fb37c', layer: 'over', fpsFill: '#3d5840', fpsLayer: 'over' },
      { kind: 'line', from: { x: -46, z: -15 }, to: { x: 22, z: -15 }, stroke: '#b8342c', width: 7, layer: 'over' },
      { kind: 'line', from: { x: -46, z: 80 }, to: { x: 22, z: 80 }, stroke: '#b8342c', width: 7, layer: 'over' },
    ],
    hasGuide: false, build: buildChinatownScene, move: chinatownMovement.move, canOccupy: chinatownMovement.canOccupy,
  },
  'kampong-glam': {
    id: 'kampong-glam', name: 'Kampong Glam', shortName: 'Kampong Glam', modeName: 'Kampong Glam 3D', modeSubtitle: 'Mosque, malls and painted lanes',
    className: 'kampong-glam-game', badge: 'KAMPONG GLAM · GAME WORLD', title: 'Kampong Glam · mosque & lanes',
    subtitle: 'Low-poly game map · authored dome, palm mall and textile streets', mapTitle: 'QUARTER & CANAL',
    stampNoun: 'quarter stamps', exploreNoun: 'the quarter', cameraFar: 1100,
    spawn: KAMPONG_GLAM_SPAWN, stamps: KAMPONG_GLAM_STAMPS, bounds: KAMPONG_GLAM_BOUNDS, mapRoads: KAMPONG_GLAM_MAP_ROADS,
    mapPaper: '#ded7c6', roadStroke: '#98918a', roadWidth: 14,
    decor: [
      { kind: 'rect', x: 180, z: -160, width: 12, depth: 320, fill: '#5f8f9a', layer: 'under', fpsFill: '#2f5a63', fpsLayer: 'under' },
      { kind: 'rect', x: -202, z: -150, width: 44, depth: 300, fill: '#9db97c', layer: 'over' },
      { kind: 'rect', x: -138, z: -32, width: 96, depth: 84, fill: '#a7c186', layer: 'over' },
      { kind: 'rect', x: -25, z: -7, width: 70, depth: 54, fill: '#cfa73f', layer: 'over' },
      { kind: 'line', from: { x: 10, z: -118 }, to: { x: 10, z: -34 }, stroke: '#c9bfa6', width: 9, layer: 'over' },
    ],
    hasGuide: false, build: buildKampongGlamScene, move: kampongGlamMovement.move, canOccupy: kampongGlamMovement.canOccupy,
  },
  'jurong-lake': {
    id: 'jurong-lake', name: 'Jurong Lake', shortName: 'Jurong', modeName: 'Jurong 3D', modeSubtitle: 'Garden lake and mall cluster',
    className: 'jurong-lake-game', badge: 'JURONG LAKE · GAME WORLD', title: 'Jurong · lake, pagoda & malls',
    subtitle: 'Low-poly game map · authored garden island, causeway and eastern shore', mapTitle: 'LAKE & GARDENS',
    stampNoun: 'lakeside stamps', exploreNoun: 'the lake and its shore', cameraFar: 1500,
    spawn: JURONG_LAKE_SPAWN, stamps: JURONG_LAKE_STAMPS, bounds: JURONG_LAKE_BOUNDS, mapRoads: JURONG_LAKE_MAP_ROADS,
    mapPaper: '#d3ddcb', roadStroke: '#8f968c', roadWidth: 14,
    decor: [
      { kind: 'rect', x: -230, z: -80, width: 200, depth: 200, fill: '#7fb0bd', layer: 'under', fpsFill: '#2f5a63', fpsLayer: 'under' },
      { kind: 'rect', x: -175, z: -25, width: 65, depth: 90, fill: '#93ac74', layer: 'over' },
      { kind: 'rect', x: -248, z: 112, width: 96, depth: 76, fill: '#9cba7f', layer: 'over' },
      { kind: 'rect', x: -150, z: -195, width: 180, depth: 70, fill: '#9cba7f', layer: 'over' },
      { kind: 'line', from: { x: -110, z: 20 }, to: { x: -30, z: 20 }, stroke: '#cdc6b4', width: 10, layer: 'over' },
      { kind: 'line', from: { x: -245, z: 140 }, to: { x: 245, z: 140 }, stroke: '#b9b2a2', width: 6, layer: 'over' },
    ],
    hasGuide: false, build: buildJurongLakeScene, move: jurongLakeMovement.move, canOccupy: jurongLakeMovement.canOccupy,
  },
};

export const REGIONS: readonly RegionDefinition[] = REGION_IDS.map(id => definitions[id]);

export function getRegion(id: RegionId): RegionDefinition {
  const region = definitions[id];
  if (!region) throw new Error(`Unknown region: ${String(id)}`);
  return region;
}

/** Progress copy shared by the region game and its accessible description. */
export function regionObjective(region: RegionDefinition, collected: number) {
  return collected === region.stamps.length
    ? `All ${region.stampNoun}. Shiok! Keep exploring or reset to play again.`
    : `Find the orange rings · Explore ${region.exploreNoun} and collect ${region.stamps.length} stamps.`;
}

export const regionResetLabel = (region: RegionDefinition) =>
  `Reset ${region.shortName} ${region.id === 'marina-bay' ? 'adventure' : 'progress'} (clears stamps and conversation)`;
