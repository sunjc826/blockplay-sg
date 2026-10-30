/**
 * Time of day as light: where the sun (or the moon) is, what colour it is, how
 * much the sky fills in, and what colour the sky itself is. Pure numbers and
 * hex strings, so it is testable without a renderer; `world-atmosphere` applies
 * it to the scene's own lights.
 *
 * The sun follows Singapore's real path: 1.35° N, so it rises almost due east
 * a little after 7 am, passes close to overhead around 1 pm (the island keeps
 * UTC+8, an hour ahead of its solar time), and sets almost due west after 7 pm.
 * World axes: +x is east and −z is north, as on the minimap.
 */
export const TIMES_OF_DAY = {
  dawn: { name: 'Dawn', hour: 7.25 },
  morning: { name: 'Morning', hour: 9.5 },
  noon: { name: 'Midday', hour: 13 },
  afternoon: { name: 'Afternoon', hour: 16.5 },
  dusk: { name: 'Dusk', hour: 18.75 },
  night: { name: 'Night', hour: 22.5 },
} as const;
export type TimeOfDayId = keyof typeof TIMES_OF_DAY;
export const validTimeOfDay = (value: unknown): value is TimeOfDayId => typeof value === 'string' && Object.prototype.hasOwnProperty.call(TIMES_OF_DAY, value);

const LATITUDE = 1.35 * Math.PI / 180;
/** Local clock hour of solar noon: Singapore runs on UTC+8 at about 104° E. */
const SOLAR_NOON = 13.05;
const degrees = (radians: number) => radians * 180 / Math.PI;

/** Hours since Singapore midnight, fractional. No daylight saving to account for. */
export function singaporeHour(now: number) {
  const local = new Date(now + 8 * 3600_000);
  return local.getUTCHours() + local.getUTCMinutes() / 60 + local.getUTCSeconds() / 3600;
}
export function singaporeDayOfYear(now: number) {
  const local = new Date(now + 8 * 3600_000);
  return Math.floor((local.getTime() - Date.UTC(local.getUTCFullYear(), 0, 1)) / 86400_000);
}
export interface Direction { x: number; y: number; z: number }
/** Unit vector towards the sun, and its elevation in degrees (negative below the horizon). */
export function sunDirection(hour: number, dayOfYear = 172): Direction & { elevation: number } {
  const declination = -23.44 * Math.PI / 180 * Math.cos(2 * Math.PI * (dayOfYear + 10) / 365);
  const hourAngle = (hour - SOLAR_NOON) * Math.PI / 12;
  const sinElevation = Math.sin(LATITUDE) * Math.sin(declination) + Math.cos(LATITUDE) * Math.cos(declination) * Math.cos(hourAngle);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinElevation)));
  // Horizontal components in east/north, from the hour angle and declination.
  const east = -Math.cos(declination) * Math.sin(hourAngle);
  const north = Math.sin(declination) * Math.cos(LATITUDE) - Math.cos(declination) * Math.sin(LATITUDE) * Math.cos(hourAngle);
  const flat = Math.hypot(east, north) || 1, cos = Math.cos(elevation);
  return { x: east / flat * cos, y: Math.sin(elevation), z: -north / flat * cos, elevation: degrees(elevation) };
}

export interface LightingState {
  /** Unit vector towards the light that casts shadows: the sun by day, the moon by night. */
  key: Direction;
  /** Key light colour, and its intensity as a multiple of the district's authored sun. */
  keyColor: string; keyScale: number;
  /** Sky fill as a multiple of the district's authored hemisphere light, and the colours it shifts to. */
  ambientScale: number; skyFill: string; groundFill: string;
  /** Sky/fog colour this hour pulls towards, and how strongly (0 keeps the weather's own sky). */
  sky: string; skyWeight: number;
  /** How far from plain daylight the hour is: 0 at full day, 1 at night. Authored colours shift by this. */
  shift: number;
  /** Tone-mapping exposure for the hour. */
  exposure: number;
  /** Sun elevation in degrees; negative at night. */
  elevation: number;
}
/** Keyed by sun elevation in degrees. Between keys every number and colour is interpolated. */
const KEYS: readonly (Omit<LightingState, 'key' | 'elevation'> & { at: number })[] = [
  // Direct moonlight supports navigation; local sky/moon visibility keeps sheltered detail difficult unaided.
  { at: -14, keyColor: '#afbcd4', keyScale: .24, ambientScale: .24, skyFill: '#5c6a80', groundFill: '#202735', sky: '#101827', skyWeight: 1, shift: 1, exposure: 1.05 },
  { at: -4, keyColor: '#b4a4c8', keyScale: .025, ambientScale: .32, skyFill: '#7a7fa6', groundFill: '#25232e', sky: '#5d5f86', skyWeight: .9, shift: 1, exposure: 1.05 },
  { at: 2, keyColor: '#ff9a5a', keyScale: .55, ambientScale: .55, skyFill: '#f0b997', groundFill: '#58463d', sky: '#eaa27c', skyWeight: .7, shift: .9, exposure: 1.05 },
  { at: 9, keyColor: '#ffbf80', keyScale: .85, ambientScale: .6, skyFill: '#f6d4b5', groundFill: '#5e5246', sky: '#f2c6a0', skyWeight: .4, shift: .6, exposure: .98 },
  { at: 22, keyColor: '#ffe3c1', keyScale: 1.02, ambientScale: .6, skyFill: '#eaf0f6', groundFill: '#6c6758', sky: '#d9e4ea', skyWeight: .12, shift: .2, exposure: .93 },
  { at: 45, keyColor: '#fff3e2', keyScale: 1.12, ambientScale: .58, skyFill: '#e4efff', groundFill: '#707060', sky: '#b9dcea', skyWeight: 0, shift: 0, exposure: .9 },
];
const hex = (value: string) => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
const mixHex = (a: string, b: string, t: number) => `#${hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** The light of one clock hour on one day of the year. */
export function dayLighting(hour: number, dayOfYear = 172): LightingState {
  const sun = sunDirection(((hour % 24) + 24) % 24, dayOfYear), elevation = sun.elevation;
  const upper = KEYS.findIndex(key => key.at >= elevation);
  const a = KEYS[upper <= 0 ? 0 : upper - 1], b = KEYS[upper < 0 ? KEYS.length - 1 : upper];
  const t = a === b ? 0 : smooth(Math.max(0, Math.min(1, (elevation - a.at) / (b.at - a.at))));
  const number = (key: 'keyScale' | 'ambientScale' | 'skyWeight' | 'shift' | 'exposure') => a[key] + (b[key] - a[key]) * t;
  // Below the horizon the moon takes over as the key light: opposite the sun, well up.
  // The hand-over happens where the key is at its dimmest, so shadows fade rather than flip.
  const moon = elevation < -4;
  const key = moon ? normalise({ x: -sun.x, y: .9, z: -sun.z }) : normalise({ x: sun.x, y: Math.max(.08, sun.y), z: sun.z });
  return { key, keyColor: mixHex(a.keyColor, b.keyColor, t), keyScale: number('keyScale'), ambientScale: number('ambientScale'),
    skyFill: mixHex(a.skyFill, b.skyFill, t), groundFill: mixHex(a.groundFill, b.groundFill, t), sky: mixHex(a.sky, b.sky, t),
    skyWeight: number('skyWeight'), shift: number('shift'), exposure: number('exposure'), elevation };
}
function normalise(v: Direction): Direction { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; }
/** The hour a setting stands for: a named time, or Singapore's clock when automatic. */
export const resolveHour = (time: TimeOfDayId | 'auto', now: number) => time === 'auto' ? singaporeHour(now) : TIMES_OF_DAY[time].hour;
export const mixColor = mixHex;
/** Full geometry-based night attenuation after twilight; daylight and warm dusk retain their authored light. */
export function nightExposureAmount(elevation: number) {
  const t = Math.max(0, Math.min(1, (-3 - elevation) / 9));
  return t * t * (3 - 2 * t);
}
