/** Game atmosphere presets, not live forecasts or measured PSI readings. */
export const WEATHER = {
  sunny: { name: 'Sunny & humid', sky: '#b9dcea', fogNear: 200, fogFar: 850, sun: 1, ambient: 1, rain: 0, wind: 0 },
  cloudy: { name: 'Overcast', sky: '#b4c2c8', fogNear: 130, fogFar: 650, sun: .5, ambient: .85, rain: 0, wind: .8 },
  showers: { name: 'Passing showers', sky: '#91a7b4', fogNear: 80, fogFar: 420, sun: .35, ambient: .8, rain: .4, wind: 1.5 },
  thunderstorm: { name: 'Afternoon thunderstorm', sky: '#607582', fogNear: 45, fogFar: 260, sun: .18, ambient: .6, rain: .85, wind: 3 },
  monsoon: { name: 'Monsoon rain', sky: '#81949e', fogNear: 55, fogFar: 310, sun: .25, ambient: .72, rain: .7, wind: 2 },
  squall: { name: 'Sumatra squall', sky: '#677d86', fogNear: 35, fogFar: 230, sun: .2, ambient: .65, rain: 1, wind: 7 },
  haze: { name: 'Hazy skies', sky: '#c5b89d', fogNear: 20, fogFar: 190, sun: .6, ambient: .85, rain: 0, wind: .3 },
} as const;
export type WeatherId = keyof typeof WEATHER;
export const CELEBRATIONS = {
  none: { name: 'No celebration', colors: ['#ffffff', '#ffffff'], fireworks: false },
  christmas: { name: 'Christmas light-up', colors: ['#ffca66', '#ef5252'], fireworks: false },
  'new-year': { name: 'New Year celebration', colors: ['#ffd66b', '#73e7ff'], fireworks: true },
  'lunar-new-year': { name: 'Lunar New Year', colors: ['#ff5345', '#ffd36b'], fireworks: false },
  'national-day': { name: 'National Day', colors: ['#ff5050', '#ffffff'], fireworks: true },
} as const;
export type CelebrationId = keyof typeof CELEBRATIONS;
export interface EnvironmentSettings { weather: WeatherId | 'auto'; celebration: CelebrationId | 'auto'; reducedEffects: boolean }
export const DEFAULT_ENVIRONMENT: Readonly<EnvironmentSettings> = { weather: 'auto', celebration: 'auto', reducedEffects: false };
export function validWeather(value: unknown): value is WeatherId { return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WEATHER, value); }
export function validCelebration(value: unknown): value is CelebrationId { return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CELEBRATIONS, value); }
export function sanitizeEnvironment(value: unknown): EnvironmentSettings {
  const v = value && typeof value === 'object' ? value as Partial<EnvironmentSettings> : {};
  return { weather: validWeather(v.weather) ? v.weather : 'auto', celebration: validCelebration(v.celebration) ? v.celebration : 'auto', reducedEffects: v.reducedEffects === true };
}
/** Singapore has no daylight-saving changes. UTC accessors avoid device timezone. */
export function singaporeDate(now: number) { return new Date(now + 8 * 3600_000); }
// Published UTC+8 calendar dates avoid ICU's one-day discrepancy in 2027.
// Source: https://www.hko.gov.hk/en/Observatorys-Blog/109092/ (Table 1).
// Extend this table as needed; unlisted years remain manually selectable.
export const LUNAR_NEW_YEAR_STARTS: Readonly<Record<number, string>> = {
  2025: '01-29', 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13',
  2030: '02-03', 2031: '01-23', 2032: '02-11', 2033: '01-31', 2034: '02-19',
};
export function seasonalCelebration(now: number): CelebrationId {
  const local = singaporeDate(now), month = local.getUTCMonth() + 1, day = local.getUTCDate();
  if ((month === 12 && day === 31) || (month === 1 && day <= 2)) return 'new-year';
  if (month === 12) return 'christmas';
  if (month === 8 && day <= 9) return 'national-day';
  const year = local.getUTCFullYear(), lunarStart = LUNAR_NEW_YEAR_STARTS[year];
  if (lunarStart) {
    const start = Date.parse(`${year}-${lunarStart}T00:00:00+08:00`);
    if (now >= start && now < start + 15 * 86400_000) return 'lunar-new-year';
  }
  return 'none';
}
export const WEATHER_PERIOD_MS = 10 * 60_000;
/** Shared UTC slots keep weather continuous across district changes; no API calls. */
export function automaticWeather(now: number): WeatherId {
  const local = singaporeDate(now), month = local.getUTCMonth() + 1, hour = local.getUTCHours();
  const wet = month >= 11 || month <= 1;
  const choices: WeatherId[] = ['sunny', 'sunny', 'cloudy', 'cloudy', 'showers', 'showers', wet ? 'monsoon' : 'sunny'];
  if (hour >= 12 && hour <= 19) choices.push('thunderstorm', 'showers');
  if (hour >= 3 && hour <= 10 && month >= 4 && month <= 11) choices.push('squall');
  if (month >= 7 && month <= 10) choices.push('haze');
  const slot = Math.floor(now / WEATHER_PERIOD_MS);
  const hash = Math.imul(slot ^ (slot >>> 16), 0x45d9f3b) >>> 0;
  return choices[hash % choices.length];
}
export function resolveEnvironment(settings: EnvironmentSettings, now = Date.now()) {
  return { weather: settings.weather === 'auto' ? automaticWeather(now) : settings.weather,
    celebration: settings.celebration === 'auto' ? seasonalCelebration(now) : settings.celebration,
    reducedEffects: settings.reducedEffects };
}
