/** Shared authored coordinates: model sights and the eye position must agree. */
export const MACHINE_GUN_LAYOUT = {
  'mag-inspired': { axisY: .22, sightHeight: .330, aimDepth: -.62, rearZ: .15, frontZ: -.58 },
  'cis50-inspired': { axisY: .25, sightHeight: .370, aimDepth: -.70, rearZ: .195, frontZ: -.82 },
} as const;
export type MachineGunId = keyof typeof MACHINE_GUN_LAYOUT;
