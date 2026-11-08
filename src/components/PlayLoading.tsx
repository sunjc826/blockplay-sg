import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPlayLoadTracker, stageKeyframes, stageLabel, timeLeftLabel, type PlayLoadMode, type PlayLoadScreen, type PlayLoadTracker } from '../game/play-load-stages';

type Stage = 'waiting' | 'building' | 'assets' | 'leaving' | 'done';

const HEADINGS: Record<PlayLoadMode, string> = {
  training: 'TRAINING · LIVE-FIRE RANGE',
  world: 'OPEN WORLD · DEPLOYMENT',
  tutorial: 'TRAINING · TUTORIAL',
  arena: 'MATCH · ARENA',
};

const TIPS: Record<PlayLoadMode | 'any', readonly string[]> = {
  any: [
    'Armour absorbs a share of each hit until its points run out.',
    'Every elimination pays credits and XP. Spend them in the Store.',
    'Supplies on your belt are spent when used. Restock in the Store.',
    'Night vision and thermal devices are in the Store, for when the city goes dark.',
  ],
  training: [
    'Practice drills are safe. Counter-fire drills shoot back: move when warned.',
    'Drive Utility 01 or fly Falcon 01 to cover the range between targets.',
  ],
  world: [
    'Weapons and their rounds drop apart. Pick up both.',
    'Local contacts in the field sell supplies. Find one and talk to trade.',
    'Cross a marked checkpoint to travel to the next district.',
  ],
  tutorial: [
    'Follow the current lesson on screen to find the next station.',
    'Open the menu to review the current lesson or skip to the next one.',
  ],
  arena: [
    'Open Players & scores from the match menu to see the standings.',
    'You can choose your next respawn loadout from the match menu.',
  ],
};

// Long enough for the slowest district on a software renderer; past it the
// game's own start card, with its own loading state, takes over.
const GIVE_UP_MS = 25_000;
const FADE_MS = 360;

/**
 * Covers a play screen while its district builds. Building the world blocks
 * the main thread for a moment, so the game mounts only after this screen
 * has painted (otherwise the menu freezes on the click), and the bar runs on
 * the compositor so it keeps moving through the stall. The bar is divided by
 * the stages the engine reports, sized by how long they took here last time.
 */
export default function PlayLoading({ mode, district, heading = HEADINGS[mode], back, children }: {
  mode: PlayLoadMode; district: string; heading?: string; back: ReactNode;
  children: (onLoaded: (ready: boolean) => void, loadScreen: PlayLoadScreen) => ReactNode;
}) {
  const [stage, setStage] = useState<Stage>('waiting');
  const [tip] = useState(() => { const tips = mode === 'tutorial' ? TIPS.tutorial : [...TIPS.any, ...TIPS[mode]]; return tips[Math.floor(Math.random() * tips.length)]; });
  useEffect(() => {
    let timer = 0;
    const frame = requestAnimationFrame(() => { timer = window.setTimeout(() => setStage('building'), 0); });
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, []);
  // The game's effects run before this one, so the world is built by now.
  useEffect(() => { if (stage === 'building') setStage(current => current === 'building' ? 'assets' : current); }, [stage]);
  useEffect(() => {
    if (stage === 'leaving') { const timer = window.setTimeout(() => setStage('done'), FADE_MS); return () => clearTimeout(timer); }
    if (stage === 'done') return;
    const timer = window.setTimeout(() => setStage('leaving'), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [stage]);
  const [tracker] = useState(() => createPlayLoadTracker(mode, district));
  const onLoaded = useCallback((ready: boolean) => { tracker.finish(ready); setStage(current => current === 'leaving' || current === 'done' ? current : 'leaving'); }, [tracker]);

  return <>
    {stage !== 'done' && <div className={`play-loading${stage === 'leaving' ? ' is-leaving' : ''}`} role="status" aria-live="polite" aria-busy={stage !== 'leaving'}>
      <Skyline />
      <div className="play-loading-back">{back}</div>
      <div className="play-loading-body">
        <span className="play-loading-kicker">{heading}</span>
        <h1>{district}</h1>
        <LoadMeter tracker={tracker} mode={mode} district={district} />
      </div>
      <p className="play-loading-tip"><span>TIP</span>{tip}</p>
    </div>}
    {stage !== 'waiting' && children(onLoaded, tracker)}
  </>;
}

/**
 * Its own component because it redraws for the countdown, which must not
 * re-render the game mounted beside it.
 */
function LoadMeter({ tracker, mode, district }: { tracker: PlayLoadTracker; mode: PlayLoadMode; district: string }) {
  const { plan } = tracker;
  const { index, done, finished } = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot);
  const fill = useRef<HTMLElement>(null), running = useRef<Animation | null>(null);
  const [left, setLeft] = useState(() => tracker.msLeft());
  const segment = plan[index];
  const progress = segment.start + (segment.end - segment.start) * done;
  useLayoutEffect(() => {
    const element = fill.current;
    if (!element) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { element.style.transform = `scaleX(${finished ? 1 : progress})`; return; }
    const from = Math.max(new DOMMatrix(getComputedStyle(element).transform).a, 0);
    element.style.transform = `scaleX(${from})`;
    running.current?.cancel();
    if (finished) running.current = element.animate?.([{ transform: `scaleX(${from})` }, { transform: 'scaleX(1)' }], { duration: 220, easing: 'ease-out', fill: 'forwards' }) ?? null;
    else {
      const { duration, keyframes } = stageKeyframes(Math.max(from, progress), segment.end, segment.ms * (1 - done) * tracker.pace());
      running.current = element.animate?.(keyframes, { duration, fill: 'forwards' }) ?? null;
    }
  }, [progress, done, finished, segment, tracker]);
  useEffect(() => {
    setLeft(tracker.msLeft());
    if (finished) return;
    const timer = window.setInterval(() => setLeft(tracker.msLeft()), 250);
    return () => clearInterval(timer);
  }, [tracker, index, finished]);
  const label = stageLabel(segment.stage, mode, district);
  return <>
    <div className="play-loading-bar" role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={finished ? 100 : Math.floor(progress * 100)} aria-valuetext={finished ? 'Ready' : label}>
      <i ref={fill} />
      {plan.slice(1).map(({ stage, start }) => <b key={stage} style={{ left: `${start * 100}%` }} />)}
    </div>
    <p className="play-loading-stage" data-stage={segment.stage}>
      <span>{label}…</span>
      <small aria-hidden="true">{index + 1} of {plan.length} · {finished ? 'Ready' : timeLeftLabel(left)}</small>
    </p>
  </>;
}

/** The menu's skyline, so the loading screen reads as the same place. */
export function Skyline() {
  return <div className="game-menu-skyline" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ '--h': `${18 + ((i * 37) % 53)}%`, '--w': `${2.2 + ((i * 13) % 5) * 0.6}%` } as React.CSSProperties} className={i % 9 === 4 ? 'lit' : undefined} />)}</div>;
}
