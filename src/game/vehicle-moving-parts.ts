/** Parts that turn, spin or hide on their own (fps-vehicles, cabin instruments); each keeps its own shadow. */
export const VEHICLE_MOVING_PARTS: ReadonlySet<string> = new Set(['vehicle-wheel', 'main-rotor', 'tail-rotor', 'vehicle-turret', 'vehicle-muzzle-flash',
  'humvee-steering-wheel', 'humvee-speed-needle', 'humvee-engine-needle']);
