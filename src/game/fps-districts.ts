import { FPS_SPAWN, FPS_TARGETS } from './fps-rules';
import { VEHICLE_SPAWNS, type VehicleSpawn, type VehicleKind } from './vehicle-rules';
import type { WorldZoneId, ZonePosition, ZoneSpawn } from './world-zones';

export interface FpsDistrict {
  label: string; setting: string; spawn: ZoneSpawn; targets: readonly ZonePosition[];
  vehicles: Record<VehicleKind, VehicleSpawn>;
  props: readonly (readonly [asset: number, x: number, z: number, width: number, depth: number])[];
}
const districts: Record<WorldZoneId, FpsDistrict> = {
  'marina-bay': {
    label: 'Marina FPS', setting: 'promenade', spawn: FPS_SPAWN, targets: FPS_TARGETS, vehicles: VEHICLE_SPAWNS,
    props: [[3, -48, 71, .77, .52], [4, -40, 63, 1.87, .41], [4, -52, 64, 1.87, .41], [5, -45, 72, .37, .37], [5, -43, 72, .37, .37]],
  },
  'raffles-place': {
    label: 'Raffles FPS', setting: 'city square', spawn: { x: 0, z: 52, yaw: 0, pitch: -.03 },
    targets: [{ x: 0, z: 35 }, { x: -6, z: 34 }, { x: 6, z: 34 }, { x: -12, z: 32 }, { x: 12, z: 32 }, { x: -18, z: 36 }, { x: 18, z: 36 }, { x: 0, z: 22 }],
    vehicles: { car: { x: -6, z: 52, yaw: -Math.PI / 2 }, helicopter: { x: 18, z: 45, yaw: 0 } },
    props: [[3, -4, 56, .77, .52], [4, 4, 49, 1.87, .41], [5, -1, 57, .37, .37], [5, 1, 57, .37, .37]],
  },
  queenstown: {
    label: 'Queenstown FPS', setting: 'estate approach', spawn: { x: -15, z: 116, yaw: 0, pitch: -.03 },
    targets: [{ x: -15, z: 100 }, { x: -18, z: 99 }, { x: -12, z: 99 }, { x: -20, z: 104 }, { x: -10, z: 104 }, { x: -22, z: 112 }, { x: -8, z: 112 }, { x: -15, z: 88 }],
    vehicles: { car: { x: -19, z: 120, yaw: -Math.PI / 2 }, helicopter: { x: 0, z: 116, yaw: 0 } },
    props: [[3, -17, 124, .77, .52], [4, -12, 120, 1.87, .41], [5, -16, 125, .37, .37], [5, -14, 125, .37, .37]],
  },
  chinatown: {
    label: 'Chinatown FPS', setting: 'temple forecourt', spawn: { x: -124, z: 100, yaw: 0, pitch: -.03 },
    targets: [{ x: -124, z: 70 }, { x: -130, z: 69 }, { x: -118, z: 69 }, { x: -136, z: 74 }, { x: -112, z: 74 }, { x: -138, z: 82 }, { x: -110, z: 82 }, { x: -124, z: 58 }],
    vehicles: { car: { x: -130, z: 104, yaw: -Math.PI / 2 }, helicopter: { x: -104, z: 88, yaw: 0 } },
    props: [[3, -126, 106, .77, .52], [4, -120, 103, 1.87, .41], [5, -125, 107, .37, .37], [5, -123, 107, .37, .37]],
  },
  'kampong-glam': {
    label: 'Kampong Glam FPS', setting: 'palm mall', spawn: { x: 10, z: -112, yaw: Math.PI, pitch: -.03 },
    targets: [{ x: 10, z: -72 }, { x: 4, z: -71 }, { x: 16, z: -71 }, { x: -1, z: -76 }, { x: 21, z: -76 }, { x: -1, z: -84 }, { x: 21, z: -84 }, { x: 10, z: -62 }],
    vehicles: { car: { x: 0, z: -114, yaw: -Math.PI / 2 }, helicopter: { x: -20, z: -100, yaw: 0 } },
    props: [[3, 8, -116, .77, .52], [4, 14, -113, 1.87, .41], [5, 9, -117, .37, .37], [5, 11, -117, .37, .37]],
  },
  'jurong-lake': {
    label: 'Jurong FPS', setting: 'lakeside park', spawn: { x: -60, z: -185, yaw: Math.PI, pitch: -.03 },
    targets: [{ x: -60, z: -150 }, { x: -66, z: -151 }, { x: -54, z: -151 }, { x: -72, z: -156 }, { x: -48, z: -156 }, { x: -74, z: -164 }, { x: -46, z: -164 }, { x: -60, z: -140 }],
    vehicles: { car: { x: -70, z: -187, yaw: -Math.PI / 2 }, helicopter: { x: -20, z: -170, yaw: 0 } },
    props: [[3, -62, -189, .77, .52], [4, -56, -186, 1.87, .41], [5, -61, -190, .37, .37], [5, -59, -190, .37, .37]],
  },
  changi: {
    label: 'Changi FPS', setting: 'aircraft apron', spawn: { x: 60, z: 198, yaw: 0, pitch: -.03 },
    targets: [{ x: 60, z: 172 }, { x: 54, z: 173 }, { x: 66, z: 173 }, { x: 48, z: 178 }, { x: 72, z: 178 }, { x: 46, z: 186 }, { x: 74, z: 186 }, { x: 60, z: 162 }],
    vehicles: { car: { x: 50, z: 200, yaw: -Math.PI / 2 }, helicopter: { x: 100, z: 190, yaw: 0 } },
    props: [[3, 58, 200, .77, .52], [4, 64, 197, 1.87, .41], [5, 59, 201, .37, .37], [5, 61, 201, .37, .37]],
  },
  'upper-thomson': {
    label: 'Thomson FPS', setting: 'park lawn', spawn: { x: 192, z: -30, yaw: 0, pitch: -.03 },
    targets: [{ x: 192, z: -60 }, { x: 186, z: -59 }, { x: 198, z: -59 }, { x: 180, z: -64 }, { x: 204, z: -64 }, { x: 178, z: -72 }, { x: 206, z: -72 }, { x: 192, z: -50 }],
    vehicles: { car: { x: 183, z: -26, yaw: -Math.PI / 2 }, helicopter: { x: 202, z: -18, yaw: 0 } },
    props: [[3, 190, -24, .77, .52], [4, 196, -27, 1.87, .41], [5, 191, -23, .37, .37], [5, 193, -23, .37, .37]],
  },
  punggol: {
    label: 'Punggol FPS', setting: 'waterfront lawn', spawn: { x: 139, z: -12, yaw: 0, pitch: -.03 },
    targets: [{ x: 139, z: -40 }, { x: 133, z: -39 }, { x: 145, z: -39 }, { x: 127, z: -44 }, { x: 151, z: -44 }, { x: 125, z: -52 }, { x: 153, z: -52 }, { x: 139, z: -30 }],
    vehicles: { car: { x: 130, z: -8, yaw: -Math.PI / 2 }, helicopter: { x: 152, z: -4, yaw: 0 } },
    props: [[3, 137, -6, .77, .52], [4, 143, -9, 1.87, .41], [5, 138, -5, .37, .37], [5, 140, -5, .37, .37]],
  },
  harbourfront: {
    label: 'HarbourFront FPS', setting: 'gateway lawn', spawn: { x: 180, z: 88, yaw: 0, pitch: -.03 },
    targets: [{ x: 180, z: 58 }, { x: 174, z: 59 }, { x: 186, z: 59 }, { x: 168, z: 64 }, { x: 192, z: 64 }, { x: 166, z: 72 }, { x: 194, z: 72 }, { x: 180, z: 48 }],
    vehicles: { car: { x: 171, z: 92, yaw: -Math.PI / 2 }, helicopter: { x: 192, z: 96, yaw: 0 } },
    props: [[3, 178, 94, .77, .52], [4, 184, 91, 1.87, .41], [5, 179, 95, .37, .37], [5, 181, 95, .37, .37]],
  },
  sentosa: {
    label: 'Sentosa FPS', setting: 'island lawn', spawn: { x: 165, z: 100, yaw: 0, pitch: -.03 },
    targets: [{ x: 165, z: 70 }, { x: 159, z: 71 }, { x: 171, z: 71 }, { x: 153, z: 76 }, { x: 177, z: 76 }, { x: 151, z: 84 }, { x: 179, z: 84 }, { x: 165, z: 60 }],
    vehicles: { car: { x: 156, z: 104, yaw: -Math.PI / 2 }, helicopter: { x: 178, z: 106, yaw: 0 } },
    props: [[3, 163, 106, .77, .52], [4, 169, 103, 1.87, .41], [5, 164, 107, .37, .37], [5, 166, 107, .37, .37]],
  },
  geylang: {
    label: 'Geylang FPS', setting: 'lane-end park', spawn: { x: 185, z: 60, yaw: 0, pitch: -.03 },
    targets: [{ x: 185, z: 30 }, { x: 179, z: 31 }, { x: 191, z: 31 }, { x: 173, z: 36 }, { x: 197, z: 36 }, { x: 171, z: 44 }, { x: 199, z: 44 }, { x: 185, z: 20 }],
    vehicles: { car: { x: 176, z: 64, yaw: -Math.PI / 2 }, helicopter: { x: 198, z: 68, yaw: 0 } },
    props: [[3, 183, 66, .77, .52], [4, 189, 63, 1.87, .41], [5, 184, 67, .37, .37], [5, 186, 67, .37, .37]],
  },
  tuas: {
    label: 'Tuas FPS', setting: 'laydown yard', spawn: { x: 137, z: 165, yaw: 0, pitch: -.03 },
    targets: [{ x: 137, z: 135 }, { x: 131, z: 136 }, { x: 143, z: 136 }, { x: 125, z: 141 }, { x: 149, z: 141 }, { x: 123, z: 149 }, { x: 151, z: 149 }, { x: 137, z: 125 }],
    vehicles: { car: { x: 128, z: 169, yaw: -Math.PI / 2 }, helicopter: { x: 150, z: 172, yaw: 0 } },
    props: [[3, 135, 171, .77, .52], [4, 141, 168, 1.87, .41], [5, 136, 172, .37, .37], [5, 138, 172, .37, .37]],
  },
  woodlands: {
    label: 'Woodlands FPS', setting: 'town green', spawn: { x: 137, z: 115, yaw: 0, pitch: -.03 },
    targets: [{ x: 137, z: 85 }, { x: 131, z: 86 }, { x: 143, z: 86 }, { x: 125, z: 91 }, { x: 149, z: 91 }, { x: 123, z: 99 }, { x: 151, z: 99 }, { x: 137, z: 75 }],
    vehicles: { car: { x: 128, z: 119, yaw: -Math.PI / 2 }, helicopter: { x: 150, z: 121, yaw: 0 } },
    props: [[3, 135, 121, .77, .52], [4, 141, 118, 1.87, .41], [5, 136, 122, .37, .37], [5, 138, 122, .37, .37]],
  },
  tampines: {
    label: 'Tampines FPS', setting: 'eco green', spawn: { x: -188, z: 168, yaw: 0, pitch: -.03 },
    targets: [{ x: -188, z: 140 }, { x: -194, z: 141 }, { x: -182, z: 141 }, { x: -200, z: 146 }, { x: -176, z: 146 }, { x: -202, z: 154 }, { x: -174, z: 154 }, { x: -188, z: 130 }],
    vehicles: { car: { x: -197, z: 172, yaw: -Math.PI / 2 }, helicopter: { x: -175, z: 174, yaw: 0 } },
    props: [[3, -190, 174, .77, .52], [4, -184, 171, 1.87, .41], [5, -189, 175, .37, .37], [5, -187, 175, .37, .37]],
  },
  'toa-payoh': {
    label: 'Toa Payoh FPS', setting: 'school field', spawn: { x: 170, z: 88, yaw: 0, pitch: -.03 },
    targets: [{ x: 170, z: 58 }, { x: 164, z: 59 }, { x: 176, z: 59 }, { x: 158, z: 64 }, { x: 182, z: 64 }, { x: 156, z: 72 }, { x: 184, z: 72 }, { x: 170, z: 48 }],
    vehicles: { car: { x: 161, z: 92, yaw: -Math.PI / 2 }, helicopter: { x: 183, z: 94, yaw: 0 } },
    props: [[3, 168, 94, .77, .52], [4, 174, 91, 1.87, .41], [5, 169, 95, .37, .37], [5, 171, 95, .37, .37]],
  },
  'bukit-timah': {
    label: 'Bukit Timah FPS', setting: 'avenue green', spawn: { x: 175, z: 103, yaw: 0, pitch: -.03 },
    targets: [{ x: 175, z: 75 }, { x: 169, z: 76 }, { x: 181, z: 76 }, { x: 163, z: 81 }, { x: 187, z: 81 }, { x: 161, z: 89 }, { x: 189, z: 89 }, { x: 175, z: 65 }],
    vehicles: { car: { x: 166, z: 107, yaw: -Math.PI / 2 }, helicopter: { x: 188, z: 109, yaw: 0 } },
    props: [[3, 173, 109, .77, .52], [4, 179, 106, 1.87, .41], [5, 174, 110, .37, .37], [5, 176, 110, .37, .37]],
  },
  bishan: {
    label: 'Bishan FPS', setting: 'town field', spawn: { x: 185, z: 130, yaw: 0, pitch: -.03 },
    targets: [{ x: 185, z: 94 }, { x: 179, z: 95 }, { x: 191, z: 95 }, { x: 173, z: 100 }, { x: 197, z: 100 }, { x: 171, z: 108 }, { x: 199, z: 108 }, { x: 185, z: 84 }],
    vehicles: { car: { x: 176, z: 134, yaw: -Math.PI / 2 }, helicopter: { x: 192, z: 136, yaw: 0 } },
    props: [[3, 183, 136, .77, .52], [4, 189, 133, 1.87, .41], [5, 184, 137, .37, .37], [5, 186, 137, .37, .37]],
  },
  orchard: {
    label: 'Orchard FPS', setting: 'park lawn', spawn: { x: 205, z: 150, yaw: 0, pitch: -.03 },
    targets: [{ x: 205, z: 120 }, { x: 199, z: 121 }, { x: 211, z: 121 }, { x: 193, z: 126 }, { x: 217, z: 126 }, { x: 191, z: 134 }, { x: 219, z: 134 }, { x: 205, z: 110 }],
    vehicles: { car: { x: 196, z: 154, yaw: -Math.PI / 2 }, helicopter: { x: 214, z: 162, yaw: 0 } },
    props: [[3, 203, 156, .77, .52], [4, 209, 153, 1.87, .41], [5, 204, 157, .37, .37], [5, 206, 157, .37, .37]],
  },
};
export const getFpsDistrict = (region: WorldZoneId): FpsDistrict => districts[region];
