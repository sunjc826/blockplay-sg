import { PLATE_SEATS } from './fps-healing';
import type { SfxGroup } from './sfx-bank';

/** Takes are published at the level their sound should have relative to each other; this sits them with the reload handling, the seat a little above it. */
export const HANDS_MIX = .5;
export interface HandsCue { at: number; group: SfxGroup; pan: number; level: number }
/**
 * The armor plate's sounds, on the beats of `supplyMotion('plates')` in shares of
 * the use. Each is timed from its attack, at the recording's natural speed. The
 * left hand does the job, so most of it sits a little left; the seat is in the chest.
 */
export const PLATE_CUES: readonly HandsCue[] = [
  { at: .001, group: 'hands-plate-draw', pan: -.25, level: 1 },
  { at: .47, group: 'hands-plate-feed', pan: -.1, level: 1 },
  { at: PLATE_SEATS, group: 'hands-plate-seat', pan: 0, level: 1 },
  // The two presses of the palm on the panel.
  { at: .8, group: 'hands-plate-pat', pan: -.1, level: 1 },
  { at: .84, group: 'hands-plate-pat', pan: -.1, level: .75 },
];
/** The cue this step of the use reached. A hitch can pass several: only the latest plays, so they never pile up. */
export const plateCue = (from: number, to: number) => PLATE_CUES.filter(cue => from < cue.at && cue.at <= to).pop() ?? null;
