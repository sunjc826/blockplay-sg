/**
 * Head-mounted vision devices: image-intensifier tubes (NVG) and thermal
 * cores, after the tiers of S.T.A.L.K.E.R.'s suit night vision. A low tier is
 * not a weaker filter but a worse instrument: a first-generation tube has less
 * gain, so the dark stays dark, and it is noisiest exactly when it works
 * hardest; its image circle is narrow and blurred at the rim, and a lamp blooms
 * into a halo that hides whatever stands under it. A third-generation
 * white-phosphor tube is wide, clean and quick to light.
 *
 * Thermal sees heat rather than light, so it works the same at noon and at
 * midnight and finds people in shadow, but it cannot read a sign, does not see
 * through glass, and a cheap core is coarse and freezes to recalibrate.
 *
 * Everything here is data and bookkeeping; `fps-vision` draws it.
 */
export type VisionKind = 'nvg' | 'thermal';
export type ThermalPalette = 'white-hot' | 'black-hot' | 'ironbow';

export interface VisionSpec {
  kind: VisionKind;
  /** Generation as sold, shown on the HUD: tubes 1–3, thermal cores 1–2. */
  generation: number;
  /** NVG only: the most the tube multiplies the scene's light by, in full dark. Thermal is 1. */
  gain: number;
  /** Grain at full gain, 0–1. A tube grows noisier as its gain rises. */
  noise: number;
  /** Image circle radius as a share of half the screen's longer side; above about 1.15 only the corners darken. */
  aperture: number;
  /** Image softness, 0 sharp to 1 smeared. */
  blur: number;
  /** Halo around bright points (NVG) or warm bodies (thermal), 0–1. */
  halo: number;
  /** Colour of a fully lit pixel: the tube's phosphor, or the display's tint. */
  phosphor: string;
  /** Barrel distortion towards the rim, 0–1. */
  distortion: number;
  /** Thermal only: sensor rows, so the picture is this many pixels tall. 0 is full resolution. */
  rows: number;
  /** Thermal only: edge enhancement, 0–1. */
  detail: number;
  /** Thermal only: the palettes the core offers, the first being the default. */
  palettes: readonly ThermalPalette[];
  /** Seconds from switching on to a full picture. */
  warmup: number;
  /** Thermal only: a non-uniformity correction that freezes the picture every `every` seconds for `hold`. */
  calibration?: { every: number; hold: number };
}

export const PALETTE_LABELS: Record<ThermalPalette, string> = { 'white-hot': 'WHT', 'black-hot': 'BLK', ironbow: 'IRON' };

/**
 * Keyed by catalog id. The catalog owns price, level and weight; this owns
 * what the device does to the picture.
 */
export const VISION_DEVICES: Readonly<Record<string, VisionSpec>> = {
  'nvg-gen1': { kind: 'nvg', generation: 1, gain: 3.4, noise: .62, aperture: .7, blur: .6, halo: 1, phosphor: '#7dff6e', distortion: .5, rows: 0, detail: 0, palettes: [], warmup: 1.4 },
  'nvg-gen2': { kind: 'nvg', generation: 2, gain: 5.2, noise: .32, aperture: .9, blur: .28, halo: .6, phosphor: '#8dff9a', distortion: .2, rows: 0, detail: 0, palettes: [], warmup: .8 },
  'nvg-gen3': { kind: 'nvg', generation: 3, gain: 7.5, noise: .13, aperture: 1.3, blur: .06, halo: .32, phosphor: '#e2f1ff', distortion: .05, rows: 0, detail: 0, palettes: [], warmup: .35 },
  'thermal-t1': { kind: 'thermal', generation: 1, gain: 1, noise: .3, aperture: 1.02, blur: .3, halo: .55, phosphor: '#e3eadf', distortion: .12, rows: 160, detail: .25, palettes: ['white-hot'], warmup: 1.8, calibration: { every: 26, hold: .4 } },
  'thermal-t2': { kind: 'thermal', generation: 2, gain: 1, noise: .1, aperture: 1.4, blur: .08, halo: .3, phosphor: '#ffffff', distortion: 0, rows: 360, detail: .7, palettes: ['white-hot', 'black-hot', 'ironbow'], warmup: .9 },
};
export const visionSpec = (id: string | undefined): VisionSpec | undefined => id ? VISION_DEVICES[id] : undefined;

/**
 * Heat a tagged object adds over the ground it stands on, in the thermal
 * shader's temperature units (the world sits around .3). `object.userData.heat`
 * names one of these; a character rig's flesh counts as `body`.
 */
export const HEAT_SOURCES = { body: .55, engine: .3, target: .36 } as const;
export type HeatSource = keyof typeof HEAT_SOURCES;
export const isHeatSource = (value: unknown): value is HeatSource => typeof value === 'string' && value in HEAT_SOURCES;

export interface VisionState {
  on: boolean;
  /** Index into the spec's palettes. */
  palette: number;
  /** 0 just switched on, 1 a full picture. */
  warm: number;
  /** Seconds until the next calibration freeze, and what is left of the current one. */
  untilCalibration: number; calibrating: number;
}
export const createVisionState = (on = false): VisionState => ({ on, palette: 0, warm: on ? 1 : 0, untilCalibration: 0, calibrating: 0 });

/** Switches the device; returns whether it is now on. A device always comes up from cold. */
export function toggleVision(state: VisionState, spec: VisionSpec | undefined) {
  state.on = !!spec && !state.on;
  state.warm = 0; state.calibrating = 0;
  state.untilCalibration = spec?.calibration?.every ?? 0;
  return state.on;
}
/** Next palette on a core that has more than one; returns whether it changed. */
export function cycleVisionPalette(state: VisionState, spec: VisionSpec | undefined) {
  if (!spec || !state.on || spec.palettes.length < 2) return false;
  state.palette = (state.palette + 1) % spec.palettes.length;
  return true;
}
/**
 * One button for a touchscreen: off, on, then each further palette, then off.
 * On a device with one picture it is a plain toggle.
 */
export function stepVisionButton(state: VisionState, spec: VisionSpec | undefined) {
  if (!spec) return false;
  if (!state.on) { state.palette = 0; return toggleVision(state, spec); }
  if (state.palette + 1 < spec.palettes.length) return cycleVisionPalette(state, spec);
  state.palette = 0; return toggleVision(state, spec);
}
export function advanceVision(state: VisionState, spec: VisionSpec | undefined, dt: number) {
  if (!spec || !state.on) return;
  // The calibration clock starts once the core is up, not partway through the frame that brings it up.
  const warming = state.warm < 1;
  state.warm = Math.min(1, state.warm + dt / Math.max(.05, spec.warmup));
  state.calibrating = Math.max(0, state.calibrating - dt);
  if (!spec.calibration || warming) return;
  state.untilCalibration -= dt;
  if (state.untilCalibration <= 0) { state.calibrating = spec.calibration.hold; state.untilCalibration += spec.calibration.every; }
}
export const activePalette = (state: VisionState, spec: VisionSpec | undefined): ThermalPalette | '' =>
  spec?.kind === 'thermal' ? spec.palettes[state.palette % spec.palettes.length] ?? 'white-hot' : '';

/**
 * How much the tube amplifies right now. Its automatic brightness control
 * holds it near 1 in daylight and opens it up as the light goes: `darkness` is
 * the hour's shift from day (0) to night (1), and a blackout darkens further.
 */
export function visionGain(spec: VisionSpec | undefined, darkness: number, blackout = 0) {
  if (spec?.kind !== 'nvg') return 1;
  const dark = Math.max(0, Math.min(1, darkness + blackout * .5));
  return 1 + (spec.gain - 1) * dark ** 1.3;
}
/** How hard the tube is working, 0–1, which is how noisy its picture is. */
export const visionStrain = (spec: VisionSpec | undefined, gain: number) =>
  spec?.kind === 'nvg' && spec.gain > 1 ? Math.max(0, Math.min(1, (gain - 1) / (spec.gain - 1))) : spec?.kind === 'thermal' ? .5 : 0;
/** How much of a smoke or gas cloud the view shows, 0–.9: a thermal core sees through most of it. */
export const cloudOpacity = (amount: number, thermal: boolean) => Math.min(.9, .25 + amount * .7) * (thermal ? .3 : 1);
/** The control-guide name for a worn device's key. */
export const visionKeyLabel = (spec: VisionSpec) => spec.kind === 'nvg' ? 'Night vision' : spec.palettes.length > 1 ? 'Thermal · J palette' : 'Thermal';
/** Share of a screen (long side over short, 16:9 by default) inside a device's image circle, 0–1. */
export function visibleShare(aperture: number, aspect = 16 / 9) {
  let inside = 0; const n = 64;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = ((i + .5) / n - .5) * aspect, y = (j + .5) / n - .5;
    if (Math.hypot(x, y) / (.5 * aspect) <= aperture) inside++;
  }
  return inside / (n * n);
}
/**
 * The dossier's figures for a device, or for the naked eye (`undefined`), so a
 * tube is compared with what it costs you as well as what it gives.
 */
export function visionFigures(spec: VisionSpec | undefined) {
  return { gain: spec?.kind === 'nvg' ? spec.gain : 1, view: Math.round(visibleShare(spec?.aperture ?? 9) * 100), grain: Math.round((spec?.noise ?? 0) * 100),
    sharpness: Math.round((1 - (spec?.blur ?? 0)) * 100), halo: Math.round((spec?.kind === 'nvg' ? spec.halo : 0) * 100),
    lines: spec?.kind === 'thermal' ? spec.rows : 0, palettes: spec?.palettes.length ?? 0, warmup: spec?.warmup ?? 0 };
}
