/**
 * The gust fronts that cross a district, as numbers. Trees (`tree-wind.ts`) and grass
 * (`ground-cover.ts`) lean to the same fronts in their vertex shaders; rain reads them here,
 * so a gust arrives everywhere at once: the canopy bends, the lawn lies over and the rain
 * slants and thickens as the front passes. Keep the constants in step with those shaders.
 */
export const GUST_DOWNWIND = { x: .984, z: .177 } as const;
/** Metres a second the fronts travel downwind. */
export const GUST_SPEED = 7;

/** 0 in a lull to 1 at the height of a gust: fronts about 140 m apart, one roughly every 20 s. */
export function gustWave(x: number, z: number, time: number) {
  const front = x * GUST_DOWNWIND.x + z * GUST_DOWNWIND.z - time * GUST_SPEED;
  return .5 + .5 * Math.sin(front * .045 + 1.5 * Math.sin(front * .017 + time * .11));
}

/**
 * Sheets inside a gust, -1 to 1: curved bands some 18 m apart running with the front, which is
 * what makes blown rain read as curtains instead of an even fall.
 */
export function gustSheet(x: number, z: number, time: number) {
  const front = x * GUST_DOWNWIND.x + z * GUST_DOWNWIND.z - time * GUST_SPEED;
  const across = z * GUST_DOWNWIND.x - x * GUST_DOWNWIND.z;
  return Math.sin(front * .35 + 2 * Math.sin(across * .09 + time * .3));
}

/** The wind at a point as a share of the weather's wind: .45 in a lull, about 2.2 in a gust, 1 on average. */
export const gustFactor = (wave: number) => .45 + 1.76 * wave * wave * wave;
