import type { FpsHud, FpsEngine } from '../game/fps-engine';
import './fps-debug.css';

/** Every combat event the panel can call in, with where it lands. */
const DEBUG_EVENTS = [
  ['artillery', 'Artillery', '35 m ahead'], ['artillery-creeping', 'Moving barrage', '3 advancing salvos'], ['mortar', 'Mortar', '35 m ahead'], ['air-raid', 'Air raid', '35 m ahead'],
  ['helicopter-raid', 'Gunship', 'hunts you'], ['drone', 'Drone', 'hunts you'], ['sniper', 'Sniper', 'overlooks you'],
  ['tear-gas', 'Tear gas', '35 m ahead'], ['smoke-screen', 'Smoke', '25 m ahead'], ['supply-drop', 'Supply drop', '30 m ahead'],
  ['blackout', 'Blackout', 'jams the map'], ['transport-land', 'Truck', 'reinforce'], ['transport-air', 'Helicopter', 'reinforce'], ['transport-sea', 'Landing craft', 'Sentosa coast'],
] as const;
/** The ambient sky's set pieces: scenery only, so they can be called anywhere, in any mode. */
const SKY_EVENTS = [['skyline', 'Skyline battle'], ['flyby', 'Jet pass'], ['rockets', 'Rocket salvo'], ['flak', 'Flak'], ['shootdown', 'Jet shot down'], ['naval', 'Warships']] as const;

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
      <p>Expeditions only: the director calls in events at random, paced by district risk (barrages and supply drops everywhere; raids, snipers and gas in riskier districts). Fallen enemies return through posts or reserve transports. Sentosa also has coastal landing parties.</p>
      <div className="fps-debug-options fps-debug-event-grid">
        {DEBUG_EVENTS.map(([kind, label, note]) => <button key={kind} disabled={hud.phase === 'loading'} onClick={() => engine?.triggerCombatEvent(kind)}>{label} <small>{note}</small></button>)}
      </div>
    </div>}
    <div className="fps-debug-events" role="group" aria-label="Sky scenery">
      <p>Sky scenery beyond the district, called in ahead of you (warships on the sea side of a coastal district). It harms nobody; searchlights only show at night.</p>
      <div className="fps-debug-options fps-debug-event-grid">
        {SKY_EVENTS.map(([kind, label]) => <button key={kind} disabled={hud.phase === 'loading'} onClick={() => engine?.triggerAmbient(kind)}>{label}</button>)}
      </div>
    </div>
    <small>Practice, solo bots and expeditions</small>
  </details>;
}
