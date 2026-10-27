import { useCallback, useEffect, useState, type ReactNode } from 'react';

type Mode = 'training' | 'world';
type Stage = 'waiting' | 'building' | 'assets' | 'leaving' | 'done';

const TIPS: Record<Mode | 'any', readonly string[]> = {
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
};

// Long enough for the slowest district on a software renderer; past it the
// game's own start card, with its own loading state, takes over.
const GIVE_UP_MS = 25_000;
const FADE_MS = 360;

/**
 * Covers a play screen while its district builds. Building the world blocks
 * the main thread for a moment, so the game mounts only after this screen
 * has painted (otherwise the menu freezes on the click), and the bar runs on
 * the compositor so it keeps moving through the stall.
 */
export default function PlayLoading({ mode, district, back, children }: { mode: Mode; district: string; back: ReactNode; children: (onLoaded: () => void) => ReactNode }) {
  const [stage, setStage] = useState<Stage>('waiting');
  const [tip] = useState(() => { const tips = [...TIPS.any, ...TIPS[mode]]; return tips[Math.floor(Math.random() * tips.length)]; });
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
  const onLoaded = useCallback(() => setStage(current => current === 'leaving' || current === 'done' ? current : 'leaving'), []);

  return <>
    {stage !== 'waiting' && children(onLoaded)}
    {stage !== 'done' && <div className={`play-loading${stage === 'leaving' ? ' is-leaving' : ''}`} role="status" aria-live="polite" aria-busy={stage !== 'leaving'}>
      <Skyline />
      <div className="play-loading-back">{back}</div>
      <div className="play-loading-body">
        <span className="play-loading-kicker">{mode === 'training' ? 'TRAINING · LIVE-FIRE RANGE' : 'OPEN WORLD · DEPLOYMENT'}</span>
        <h1>{district}</h1>
        <div className="play-loading-bar" aria-hidden="true"><i /></div>
        <p className="play-loading-stage">{stage === 'assets' || stage === 'leaving' ? mode === 'training' ? 'Setting up targets and your gear…' : 'Placing patrols, supplies and your gear…' : `Building ${district}…`}</p>
      </div>
      <p className="play-loading-tip"><span>TIP</span>{tip}</p>
    </div>}
  </>;
}

/** The menu's skyline, so the loading screen reads as the same place. */
export function Skyline() {
  return <div className="game-menu-skyline" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ '--h': `${18 + ((i * 37) % 53)}%`, '--w': `${2.2 + ((i * 13) % 5) * 0.6}%` } as React.CSSProperties} className={i % 9 === 4 ? 'lit' : undefined} />)}</div>;
}
