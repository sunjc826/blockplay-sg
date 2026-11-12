/**
 * The block module: one shape language for every district (docs/SHAPE-LANGUAGE.md).
 *
 * Structure sits on the 0.5 m block (storeys, bays, doors, slabs, roads and
 * plazas). Detail sits on the 0.1 m sub-unit, which is also the thinnest thing
 * that is modelled: anything finer is drawn as paint or left out, and hairline
 * gaps between neighbours are closed. Landmarks with real curves or distinctive
 * silhouettes stay freeform.
 *
 * Data only (no three.js), so the server, scripts and tests can share it.
 */

/** Structural module in metres. */
export const BLOCK = 0.5;
/** Detail sub-unit in metres: one fifth of a block. */
export const DETAIL = 0.1;
/** Thinnest modelled feature (plan width, or height of a raised element). */
export const MIN_DETAIL = DETAIL;
/** Ground overlays (paint, paving, kerb tops) may stay thinner than the
 * minimum vertically when they start this close to the ground. */
export const OVERLAY_CEILING = 0.3;

/** Named multiples, so scene code reads as the module rather than numbers. */
export const STOREY = 6 * BLOCK;            // 3 m floor-to-floor
export const BAY = 6 * BLOCK;               // 3 m window bay
export const DOOR = { width: 2 * BLOCK, height: 4 * BLOCK } as const; // 1 x 2 m
export const SLAB = 2 * BLOCK;              // 1 x 1 m paving slab
export const KERB = { height: 2 * DETAIL, width: BLOCK } as const;    // 0.2 m kerb, 0.5 m kerb stone
export const BAND = 2 * DETAIL;             // storey band / string course
export const PARAPET = { height: 2 * BLOCK, thickness: 2 * DETAIL } as const;
export const RAIL = { post: DETAIL, rail: DETAIL, height: 2 * BLOCK + 2 * DETAIL, spacing: 3 * BLOCK } as const; // 1.2 m guard rail
export const ROAD_LINE = { width: 2 * DETAIL, dash: 10 * BLOCK } as const;

const EPSILON = 1e-6;
/** Round to a multiple of `step`, without binary-fraction noise (0.30000000000000004). */
export function snap(value: number, step = DETAIL) {
  return +(Math.round(+(value / step).toFixed(6)) * step).toFixed(6);
}
export function isOnModule(value: number, step = DETAIL, tolerance = 1e-4) {
  return Math.abs(value - snap(value, step)) <= tolerance;
}

/**
 * Snap a centred span so both edges land on the `step` grid and its size is a
 * whole number of steps, at least `min`. The centre moves by at most half a
 * step plus any growth to the minimum. Equal input spans always give equal
 * output spans, so a visual box and its collider authored with the same
 * numbers stay identical after snapping.
 */
export function snapSpan(center: number, size: number, step = DETAIL, min = step) {
  const steps = Math.max(Math.round(+(Math.abs(size) / step).toFixed(6)), Math.ceil(min / step - EPSILON), 1);
  const lo = snap(center - steps * step / 2, step);
  return { center: +(lo + steps * step / 2).toFixed(6), size: +(steps * step).toFixed(6) };
}

export interface ModuleBox { x: number; y: number; z: number; w: number; h: number; d: number }
/**
 * Snap an axis-aligned box (centre and size) to the detail grid with the
 * thickness floor. Ground overlays — thinner than the minimum and starting
 * below `OVERLAY_CEILING` — keep their authored height and level, because
 * paint and paving lie on the ground and are owned by ground cover.
 */
export function snapModuleBox(x: number, y: number, z: number, w: number, h: number, d: number, step = DETAIL, min = MIN_DETAIL): ModuleBox {
  const sx = snapSpan(x, w, step, min), sz = snapSpan(z, d, step, min);
  const overlay = Math.abs(h) < min - EPSILON && y - Math.abs(h) / 2 <= OVERLAY_CEILING;
  const sy = overlay ? { center: y, size: h } : snapSpan(y, h, step, min);
  return { x: sx.center, y: sy.center, z: sz.center, w: sx.size, h: sy.size, d: sz.size };
}

/** Snap a collider footprint exactly as the matching visual box is snapped. */
export function snapFootprint<T extends { minX: number; maxX: number; minZ: number; maxZ: number }>(o: T, step = DETAIL, min = MIN_DETAIL): T {
  const x = snapSpan((o.minX + o.maxX) / 2, o.maxX - o.minX, step, min), z = snapSpan((o.minZ + o.maxZ) / 2, o.maxZ - o.minZ, step, min);
  return { ...o, minX: +(x.center - x.size / 2).toFixed(6), maxX: +(x.center + x.size / 2).toFixed(6), minZ: +(z.center - z.size / 2).toFixed(6), maxZ: +(z.center + z.size / 2).toFixed(6) };
}

/** Cylinders, beams and posts keep at least the minimum diameter. */
export const minRadius = (radius: number) => Math.max(radius, MIN_DETAIL / 2);

/**
 * Freeform zones: plan rectangles (world metres) whose box geometry is a
 * landmark and is neither snapped nor counted as generic by the audit.
 */
export interface FreeformZone { name: string; minX: number; maxX: number; minZ: number; maxZ: number; minY?: number }
export const SHAPE_FREEFORM_ZONES: Record<string, readonly FreeformZone[]> = {};
