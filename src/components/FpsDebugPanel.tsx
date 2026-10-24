import type { FpsHud, FpsEngine } from '../game/fps-engine';
import './fps-debug.css';

export default function FpsDebugPanel({ hud, engine }: { hud: FpsHud; engine: FpsEngine | null }) {
  if (!hud.debugAvailable) return null;
  return <details className="fps-debug-panel">
    <summary>Debug survival <span>{hud.debug.healthMultiplier}× HP{hud.debug.regeneration ? ' · REGEN' : ''}</span></summary>
    <div className="fps-debug-options" role="group" aria-label="Debug maximum health">
      {([1, 5, 10] as const).map(multiplier => <button key={multiplier} aria-pressed={hud.debug.healthMultiplier === multiplier}
        onClick={() => engine?.configureDebug({ ...hud.debug, healthMultiplier: multiplier })}>{multiplier}× <small>{multiplier * 100} HP</small></button>)}
    </div>
    <label><input type="checkbox" checked={hud.debug.regeneration} onChange={event => engine?.configureDebug({ ...hud.debug, regeneration: event.target.checked })} /> Regenerate health</label>
    <p>Recover 10% of maximum HP each second after 3 seconds without damage. Settings last for this tab, including zone travel.</p>
    <button className="fps-debug-heal" disabled={hud.health <= 0 || hud.phase === 'loading'} onClick={() => engine?.refillHealth()}>Refill health · {hud.maxHealth} HP</button>
    {hud.combatEventsAvailable && <div className="fps-debug-events" role="group" aria-label="Combat events">
      <label><input type="checkbox" checked={hud.debug.combatEvents} onChange={event => engine?.configureDebug({ ...hud.debug, combatEvents: event.target.checked })} /> Random events</label>
      <p>Expeditions only: artillery strikes at random times and places, paced by district risk. Fallen enemies come back by truck or helicopter either way.</p>
      <div className="fps-debug-options">
        <button disabled={hud.phase === 'loading'} onClick={() => engine?.triggerCombatEvent('artillery')}>Artillery <small>35 m ahead</small></button>
        <button disabled={hud.phase === 'loading'} onClick={() => engine?.triggerCombatEvent('transport-land')}>Truck <small>reinforce</small></button>
        <button disabled={hud.phase === 'loading'} onClick={() => engine?.triggerCombatEvent('transport-air')}>Helicopter <small>reinforce</small></button>
      </div>
    </div>}
    <small>Practice, solo bots and expeditions</small>
  </details>;
}
