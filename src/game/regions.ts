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
import { buildChangiScene, CHANGI_BOUNDS, CHANGI_MAP_ROADS, CHANGI_SPAWN } from './changi-scene';
import { buildUpperThomsonScene, UPPER_THOMSON_BOUNDS, UPPER_THOMSON_MAP_ROADS, UPPER_THOMSON_SPAWN } from './upper-thomson-scene';
import { buildPunggolScene, PUNGGOL_BOUNDS, PUNGGOL_MAP_ROADS, PUNGGOL_SPAWN } from './punggol-scene';
import { buildHarbourfrontScene, HARBOURFRONT_BOUNDS, HARBOURFRONT_MAP_ROADS, HARBOURFRONT_SPAWN } from './harbourfront-scene';
import { buildOrchardScene, ORCHARD_BOUNDS, ORCHARD_MAP_ROADS, ORCHARD_SPAWN } from './orchard-scene';
import { CHANGI_STAMPS, CHINATOWN_STAMPS, HARBOURFRONT_STAMPS, JURONG_LAKE_STAMPS, KAMPONG_GLAM_STAMPS, MARINA_STAMPS, ORCHARD_STAMPS, PUNGGOL_STAMPS, QUEENSTOWN_STAMPS, RAFFLES_STAMPS, UPPER_THOMSON_STAMPS } from '../data/region-stamps.ts';

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
const changiMovement = createRegionMovement(CHANGI_BOUNDS);
const upperThomsonMovement = createRegionMovement(UPPER_THOMSON_BOUNDS);
const punggolMovement = createRegionMovement(PUNGGOL_BOUNDS);
const harbourfrontMovement = createRegionMovement(HARBOURFRONT_BOUNDS);
const orchardMovement = createRegionMovement(ORCHARD_BOUNDS);

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
  changi: {
    id: 'changi', name: 'Changi', shortName: 'Changi', modeName: 'Changi 3D', modeSubtitle: 'Glazed dome and the apron',
    className: 'changi-game', badge: 'CHANGI · GAME WORLD', title: 'Changi · the dome & the apron',
    subtitle: 'Low-poly game map · authored glazed roof, terminal frontage and stands', mapTitle: 'DOME & APRON',
    stampNoun: 'landside stamps', exploreNoun: 'the dome and the apron', cameraFar: 1600,
    spawn: CHANGI_SPAWN, stamps: CHANGI_STAMPS, bounds: CHANGI_BOUNDS, mapRoads: CHANGI_MAP_ROADS,
    mapPaper: '#d8ddd8', roadStroke: '#8f9691', roadWidth: 14,
    decor: [
      { kind: 'rect', x: 252, z: -120, width: 28, depth: 260, fill: '#7fb0bd', layer: 'under', fpsFill: '#2f5a63', fpsLayer: 'under' },
      { kind: 'rect', x: 202, z: -120, width: 52, depth: 260, fill: '#ddd2a8', layer: 'over' },
      { kind: 'rect', x: -260, z: 145, width: 520, depth: 60, fill: '#8f9490', layer: 'over' },
      { kind: 'rect', x: -220, z: -200, width: 440, depth: 30, fill: '#ddd8ca', layer: 'over' },
      { kind: 'rect', x: -141, z: -116, width: 172, depth: 172, radius: 86, fill: '#9fc3ce', layer: 'over' },
      { kind: 'rect', x: -262, z: -90, width: 60, depth: 240, fill: '#9cba7f', layer: 'over' },
    ],
    hasGuide: false, build: buildChangiScene, move: changiMovement.move, canOccupy: changiMovement.canOccupy,
  },
  'upper-thomson': {
    id: 'upper-thomson', name: 'Upper Thomson', shortName: 'Thomson', modeName: 'Thomson 3D', modeSubtitle: 'Eating strip and reservoir',
    className: 'upper-thomson-game', badge: 'UPPER THOMSON · GAME WORLD', title: 'Upper Thomson · strip & reservoir',
    subtitle: 'Low-poly game map · authored shop row, causeway and canopy bridge', mapTitle: 'STRIP & RESERVOIR',
    stampNoun: 'Thomson stamps', exploreNoun: 'the strip and the reservoir', cameraFar: 1500,
    spawn: UPPER_THOMSON_SPAWN, stamps: UPPER_THOMSON_STAMPS, bounds: UPPER_THOMSON_BOUNDS, mapRoads: UPPER_THOMSON_MAP_ROADS,
    mapPaper: '#d5ddcd', roadStroke: '#8f968c', roadWidth: 14,
    decor: [
      { kind: 'rect', x: -215, z: -120, width: 47, depth: 106, fill: '#6f9fae', layer: 'under', fpsFill: '#2f5a63', fpsLayer: 'under' },
      { kind: 'rect', x: -215, z: 14, width: 47, depth: 106, fill: '#6f9fae', layer: 'under', fpsFill: '#2f5a63', fpsLayer: 'under' },
      { kind: 'rect', x: -158, z: -136, width: 26, depth: 272, fill: '#6f9457', layer: 'over', fpsFill: '#33512f', fpsLayer: 'over' },
      { kind: 'rect', x: 41, z: -118, width: 88, depth: 96, fill: '#c3bcab', layer: 'over' },
      { kind: 'rect', x: 169, z: -150, width: 46, depth: 300, fill: '#9fb37c', layer: 'over', fpsFill: '#3d5840', fpsLayer: 'over' },
      { kind: 'line', from: { x: -146, z: -70 }, to: { x: -146, z: 70 }, stroke: '#d8cfb6', width: 5, layer: 'over' },
    ],
    hasGuide: false, build: buildUpperThomsonScene, move: upperThomsonMovement.move, canOccupy: upperThomsonMovement.canOccupy,
  },
  punggol: {
    id: 'punggol', name: 'Punggol', shortName: 'Punggol', modeName: 'Punggol 3D', modeSubtitle: 'Waterway, precincts and the point',
    className: 'punggol-game', badge: 'PUNGGOL · GAME WORLD', title: 'Punggol · waterway & waterfront',
    subtitle: 'Low-poly game map · authored channel, arch crossing, precincts and jetty', mapTitle: 'WATERWAY & POINT',
    stampNoun: 'waterway stamps', exploreNoun: 'the waterway and the point', cameraFar: 1600,
    spawn: PUNGGOL_SPAWN, stamps: PUNGGOL_STAMPS, bounds: PUNGGOL_BOUNDS, mapRoads: PUNGGOL_MAP_ROADS,
    mapPaper: '#d4ddd4', roadStroke: '#909790', roadWidth: 14,
    decor: [
      { kind: 'rect', x: -233, z: -105, width: 466, depth: 30, fill: '#6f9fae', layer: 'under', fpsFill: '#2f5a63', fpsLayer: 'under' },
      { kind: 'rect', x: 202, z: 160, width: 36, depth: 33, fill: '#6f9fae', layer: 'under', fpsFill: '#2f5a63', fpsLayer: 'under' },
      { kind: 'rect', x: -20, z: 40, width: 80, depth: 100, fill: '#c6bfae', layer: 'over' },
      { kind: 'rect', x: 100, z: -57, width: 78, depth: 58, fill: '#9fb37c', layer: 'over', fpsFill: '#3d5840', fpsLayer: 'over' },
      { kind: 'rect', x: -237, z: -35, width: 50, depth: 150, fill: '#9cba7f', layer: 'over' },
      { kind: 'line', from: { x: 215, z: -150 }, to: { x: 215, z: 120 }, stroke: '#c9c2b0', width: 5, layer: 'over' },
      { kind: 'line', from: { x: 215, z: 156 }, to: { x: 215, z: 192 }, stroke: '#b08a5c', width: 4, layer: 'over' },
    ],
    hasGuide: false, build: buildPunggolScene, move: punggolMovement.move, canOccupy: punggolMovement.canOccupy,
  },
  harbourfront: {
    id: 'harbourfront', name: 'HarbourFront', shortName: 'HarbourFront', modeName: 'HarbourFront 3D', modeSubtitle: 'Quay, wharf and the ridge',
    className: 'harbourfront-game', badge: 'HARBOURFRONT · GAME WORLD', title: 'HarbourFront · quay & cable line',
    subtitle: 'Low-poly game map · authored stepped mall, cruise berth, gantries and ridge', mapTitle: 'QUAY & WHARF',
    stampNoun: 'harbour stamps', exploreNoun: 'the quay and the ridge', cameraFar: 1600,
    spawn: HARBOURFRONT_SPAWN, stamps: HARBOURFRONT_STAMPS, bounds: HARBOURFRONT_BOUNDS, mapRoads: HARBOURFRONT_MAP_ROADS,
    mapPaper: '#d3dbd8', roadStroke: '#8e958f', roadWidth: 14,
    decor: [
      { kind: 'rect', x: -128, z: 140, width: 228, depth: 40, fill: '#5f97ab', layer: 'under', fpsFill: '#2f5a63', fpsLayer: 'under' },
      { kind: 'rect', x: 10, z: 0, width: 100, depth: 100, fill: '#c6bfae', layer: 'over' },
      { kind: 'rect', x: -120, z: 0, width: 90, depth: 100, fill: '#d3ccbb', layer: 'over' },
      { kind: 'rect', x: -210, z: -130, width: 50, depth: 90, fill: '#87a86a', layer: 'over', fpsFill: '#3d5840', fpsLayer: 'over' },
      { kind: 'rect', x: 150, z: 0, width: 60, depth: 100, fill: '#9fb37c', layer: 'over', fpsFill: '#3d5840', fpsLayer: 'over' },
      { kind: 'line', from: { x: 5, z: -70 }, to: { x: 5, z: 170 }, stroke: '#c0ccd2', width: 4, layer: 'over' },
      { kind: 'line', from: { x: 109, z: 138 }, to: { x: 109, z: 192 }, stroke: '#b08a5c', width: 5, layer: 'over' },
    ],
    hasGuide: false, build: buildHarbourfrontScene, move: harbourfrontMovement.move, canOccupy: harbourfrontMovement.canOccupy,
  },
  orchard: {
    id: 'orchard', name: 'Orchard Road', shortName: 'Orchard', modeName: 'Orchard 3D', modeSubtitle: 'Walk the shopping belt',
    className: 'orchard-game', badge: 'ORCHARD ROAD · GAME WORLD', title: 'Orchard · the shopping belt',
    subtitle: 'Low-poly game map · authored boulevard, malls and a peranakan lane', mapTitle: 'BOULEVARD & MALLS',
    stampNoun: 'boulevard stamps', exploreNoun: 'the shopping belt', cameraFar: 1400,
    spawn: ORCHARD_SPAWN, stamps: ORCHARD_STAMPS, bounds: ORCHARD_BOUNDS, mapRoads: ORCHARD_MAP_ROADS,
    mapPaper: '#ded9cc', roadStroke: '#95918a', roadWidth: 16,
    decor: [
      { kind: 'rect', x: 183, z: -45, width: 44, depth: 210, fill: '#9fb37c', layer: 'over', fpsFill: '#3d5840', fpsLayer: 'over' },
      { kind: 'rect', x: -148, z: -104, width: 66, depth: 78, fill: '#b9c8d2', layer: 'over' },
      { kind: 'rect', x: -38, z: -107, width: 76, depth: 84, fill: '#cdc6b4', layer: 'over' },
      { kind: 'rect', x: 82, z: -102, width: 70, depth: 74, fill: '#d8cdb2', layer: 'over' },
      { kind: 'rect', x: -38, z: 30, width: 76, depth: 80, fill: '#b5b2ab', layer: 'over' },
      { kind: 'rect', x: 80, z: 29, width: 74, depth: 82, fill: '#c6bfae', layer: 'over' },
      { kind: 'line', from: { x: -215, z: 0 }, to: { x: 215, z: 0 }, stroke: '#7f9f66', width: 5, layer: 'over' },
    ],
    hasGuide: false, build: buildOrchardScene, move: orchardMovement.move, canOccupy: orchardMovement.canOccupy,
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
