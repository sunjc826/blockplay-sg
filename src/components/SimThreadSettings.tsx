import { MenuButton } from './MenuControls';
import { SIM_THREADS, setSimThread, useSimThread, useSimWorkerFailure } from '../game/sim-thread-setting';

const DESCRIPTIONS = {
  main: 'Enemies are simulated alongside the drawing',
  worker: 'Enemies are simulated on a second processor core',
} as const;

/** Settings › Video: whether Open World, solo matches and hosted matches simulate their enemies off the drawing thread. */
export default function SimThreadSettings() {
  const thread = useSimThread(), failure = useSimWorkerFailure();
  return <div className="armory-settings-group sim-thread-settings">
    <h2>Background simulation</h2>
    <p>Experimental. In Open World, solo matches and matches you host, moves enemy and vehicle decisions off the thread that draws the game, so busy fights interrupt the frame rate less. It uses more memory, and maps take a little longer to load. Applies from the next district or match you load. If it cannot run, the game carries on without it; a match in progress starts again. Saved on this device.</p>
    <div role="group" aria-label="Background simulation">{SIM_THREADS.map(t =>
      <MenuButton variant="choice" key={t.value} data-sim-thread={t.value} aria-pressed={thread === t.value} onClick={() => setSimThread(t.value)}><span><strong>{t.name}{t.value === 'main' ? ' · Default' : ''}</strong><small>{DESCRIPTIONS[t.value]}</small></span></MenuButton>)}
    </div>
    {failure && thread === 'worker' && <p role="status" data-sim-failure>It stopped working on this visit, so the game is running without it until the page is reloaded. Choose On again to retry sooner. ({failure})</p>}
  </div>;
}
