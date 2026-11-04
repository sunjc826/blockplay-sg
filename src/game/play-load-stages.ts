/**
 * What the loading screen knows about a district load. The engine reports each
 * stage as it starts; this works out how much of the bar each one gets and how
 * long is left, from how long the stages took on this device last time.
 */
export type PlayLoadMode = 'training' | 'world';
export type PlayLoadStage = 'district' | 'models' | 'shaders';

/** Placing patrols and reading routes take about 50 ms, too short to read, so they count as models. */
export const PLAY_LOAD_STAGES: readonly PlayLoadStage[] = ['district', 'models', 'shaders'];

/** A first visit's guess, from a production build on Apple silicon, soon replaced by this device's own times. */
export const DEFAULT_STAGE_MS: Record<PlayLoadStage, number> = { district: 1500, models: 300, shaders: 3200 };

export function stageLabel(stage: PlayLoadStage, mode: PlayLoadMode, district: string): string {
  switch (stage) {
    case 'district': return `Building ${district}`;
    case 'models': return mode === 'training' ? 'Loading models and targets' : 'Loading models and patrols';
    case 'shaders': return 'Preparing graphics';
  }
}

export type StageSegment = { stage: PlayLoadStage; start: number; end: number; ms: number };
export type StageTimings = Partial<Record<PlayLoadStage, number>>;

/** Each stage's share of the bar is its share of the expected time. */
export function planStages(stages: readonly PlayLoadStage[], timings: StageTimings = {}): StageSegment[] {
  const ms = stages.map(stage => Math.max(timings[stage] ?? DEFAULT_STAGE_MS[stage], 1));
  const total = ms.reduce((sum, value) => sum + value, 0);
  let spent = 0;
  return stages.map((stage, i) => {
    const start = spent / total; spent += ms[i];
    return { stage, start, end: spent / total, ms: ms[i] };
  });
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * How much slower than expected this load is running, judged on the stages
 * already finished, so a phone's first visit corrects itself. Softened, as a
 * first visit to a place borrows another district's times, and part of the gap
 * is then the district's size and not the device.
 */
export function loadPace(plan: readonly StageSegment[], index: number, elapsedBeforeStage: number): number {
  const expected = plan.slice(0, index).reduce((sum, segment) => sum + segment.ms, 0);
  return expected > 0 ? Math.sqrt(clamp(elapsedBeforeStage / expected, .25, 4)) : 1;
}

export function msLeft(plan: readonly StageSegment[], index: number, stageElapsed: number, pace: number): number {
  const later = plan.slice(index + 1).reduce((sum, segment) => sum + segment.ms, 0);
  return (later + Math.max(plan[index].ms - stageElapsed / pace, 0)) * pace;
}

/** The wording under the bar. Under two seconds a number claims more than it knows. */
export function timeLeftLabel(ms: number): string {
  return ms < 2000 ? 'Almost there' : `About ${Math.ceil(ms / 1000)} s left`;
}

/**
 * The fill's path through a stage, on a compositor animation so it keeps moving
 * while the main thread is blocked: nine tenths of the way by the expected time,
 * then a slow creep that never quite arrives, as the stage's end is only ever
 * reached by the engine reporting it.
 */
export function stageKeyframes(from: number, end: number, ms: number): { duration: number; keyframes: Keyframe[] } {
  const OVERRUN = 4, gap = Math.max(end - from, 0);
  const scale = (value: number) => ({ transform: `scaleX(${value.toFixed(4)})` });
  return { duration: Math.max(ms * OVERRUN, 1), keyframes: [
    { ...scale(from), offset: 0 },
    { ...scale(from + gap * .9), offset: 1 / OVERRUN },
    { ...scale(from + gap * .98), offset: 1 },
  ] };
}

const STORAGE_KEY = 'blockplay.load-timings.v1';
type TimingStore = { places?: Record<string, StageTimings>; last?: StageTimings };

function readStore(): TimingStore {
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); return value && typeof value === 'object' ? value : {}; }
  catch { return {}; }
}

/** This place's own times, or failing that the last place loaded here, which is at least this device. */
export function readStageTimings(place: string): StageTimings {
  const store = readStore();
  return store.places?.[place] ?? store.last ?? {};
}

/** Weighted to the latest, since a cold shader cache makes the very first load the slowest. */
export function recordStageTimings(place: string, measured: StageTimings) {
  try {
    const store = readStore(), previous = store.places?.[place] ?? {}, next: StageTimings = {};
    for (const [stage, ms] of Object.entries(measured) as [PlayLoadStage, number][]) {
      const before = previous[stage];
      next[stage] = Math.round(before === undefined ? ms : before * .3 + ms * .7);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ places: { ...store.places, [place]: next }, last: next }));
  } catch { /* Private windows and full storage just keep the default estimate. */ }
}

/** The engine's view of the screen: what to tell it, and whether it is what the player is looking at. */
export type PlayLoadScreen = { report(stage: PlayLoadStage, done?: number): void; covering(): boolean };

export type PlayLoadSnapshot = { index: number; done: number; finished: boolean };

/** One load's progress. Stale or repeated reports are ignored, so the bar only goes forward. */
export function createPlayLoadTracker(mode: PlayLoadMode, place: string, now: () => number = () => performance.now()) {
  const stages = PLAY_LOAD_STAGES;
  const plan = planStages(stages, readStageTimings(`${mode}:${place}`));
  const started = now(), measured: StageTimings = {}, listeners = new Set<() => void>();
  let stageStarted = started, snapshot: PlayLoadSnapshot = { index: 0, done: 0, finished: false }, pace = 1, wasHidden = typeof document !== 'undefined' && document.hidden;
  const emit = () => listeners.forEach(listener => listener());
  const closeStage = (time: number) => { measured[stages[snapshot.index]] = time - stageStarted; };
  return {
    plan,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    pace: () => pace,
    /** False for good after this load, so a later crossing draws its world as before. */
    covering: () => !snapshot.finished,
    msLeft: () => msLeft(plan, snapshot.index, now() - stageStarted, pace),
    report(stage: PlayLoadStage, done = 0) {
      if (snapshot.finished) return;
      wasHidden ||= typeof document !== 'undefined' && document.hidden;
      const index = stages.indexOf(stage);
      if (index < snapshot.index) return;
      if (index === snapshot.index) {
        if (done > snapshot.done) { snapshot = { ...snapshot, done }; emit(); }
        return;
      }
      const time = now();
      closeStage(time);
      stageStarted = time; pace = loadPace(plan, index, time - started);
      snapshot = { index, done, finished: false }; emit();
    },
    /** A failed load never reached the last stage, and a hidden tab's timers say nothing about the device. */
    finish() {
      if (snapshot.finished) return;
      const complete = snapshot.index === stages.length - 1;
      if (complete && !wasHidden) { closeStage(now()); recordStageTimings(`${mode}:${place}`, measured); }
      snapshot = { ...snapshot, finished: true }; emit();
    },
  };
}
export type PlayLoadTracker = ReturnType<typeof createPlayLoadTracker>;

/**
 * Resolves once the GPU has finished everything submitted so far. Without this
 * the backlog surfaces later as a main-thread stall in some following frame.
 * Gives up rather than hang, as a lost context never signals.
 */
export async function gpuCaughtUp(gl: WebGL2RenderingContext, giveUpMs = 8000): Promise<void> {
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!sync) return;
  gl.flush();
  const started = performance.now();
  // The status only changes between tasks, which is why this polls and doesn't spin.
  while (gl.getSyncParameter(sync, gl.SYNC_STATUS) !== gl.SIGNALED && performance.now() - started < giveUpMs) await new Promise(resolve => setTimeout(resolve, 16));
  gl.deleteSync(sync);
}

/** Lets a queued frame paint before the next blocking step, without hanging in a hidden tab. */
export function yieldToPaint(): Promise<void> {
  return new Promise(resolve => {
    const fallback = setTimeout(resolve, 100);
    requestAnimationFrame(() => { clearTimeout(fallback); setTimeout(resolve, 0); });
  });
}
