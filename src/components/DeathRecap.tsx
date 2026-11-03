import { useEffect } from 'react';
import { DEATH_WINDOW_SECONDS, formatDuration, type DeathRecapView } from '../game/death-recap';
import './death-recap.css';

/**
 * The moment after falling: who did it and how this life went, over the scene
 * itself. Expeditions may skip on to the respawn map; an arena match simply
 * counts down, since there is nothing to choose.
 */
export default function DeathRecap({ recap, respawnIn, touch, onSkip, onMenu, onLoadout }: {
  recap: DeathRecapView; respawnIn: number; touch?: boolean;
  onSkip?: () => void; onMenu?: () => void; onLoadout?: () => void;
}) {
  useEffect(() => {
    if (!onSkip) return;
    const key = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); onSkip(); }
      else if (event.code === 'Escape') { event.stopPropagation(); onMenu?.(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onSkip, onMenu]);
  const { killer, life, session, attackers, dealtToKiller } = recap;
  const killerHp = killer ? Math.ceil(killer.health + killer.armor) : 0;
  const tiles: [string, string][] = [
    ['Survived', formatDuration(life.seconds)],
    ['Eliminations', String(life.kills)],
    ['Damage dealt', String(life.damageDealt)],
    ['Accuracy', life.accuracy === null ? '–' : `${life.accuracy}%`],
    ['Distance', `${life.distance} m`],
    ['Longest kill', life.longestKill ? `${life.longestKill} m` : '–'],
  ];
  const total = attackers.reduce((most, entry) => Math.max(most, entry.damage), 1);
  const headline = recap.selfInflicted ? 'Self-inflicted' : killer?.friendly ? 'Friendly fire' : 'Killed by';
  return <section className="death-recap" role="status" aria-label={`${headline} ${killer?.name ?? recap.cause}`} data-recap-serial={recap.serial} data-has-killer={!!killer}>
    <div className="death-recap-flash" key={recap.serial} />
    <header className="death-recap-head">
      <span>{headline}</span>
      <h2>{killer ? killer.name : recap.cause}</h2>
      {killer && <p>{killer.rank && <b>{killer.rank}</b>}{killer.faction && <i>{killer.faction}</i>}</p>}
    </header>
    {killer && <div className="death-recap-tag" data-death-killer={killer.id} style={{ visibility: 'hidden' }}><b>{killer.name}</b><small>{killer.alive ? `${killerHp} HP` : 'Also down'}</small></div>}

    <div className="death-recap-cards">
      <article className="death-recap-card">
        <h3>{killer ? 'Killing blow' : 'Cause'}</h3>
        {killer ? <dl className="death-recap-facts">
          <div><dt>Weapon</dt><dd>{killer.weapon}</dd></div>
          <div><dt>Range</dt><dd>{killer.range === null ? '–' : `${Math.round(killer.range)} m`}</dd></div>
          <div><dt>They had left</dt><dd>{killer.alive ? `${killerHp} HP` : 'Down too'}</dd></div>
          <div><dt>You dealt them</dt><dd>{dealtToKiller.hits ? `${Math.round(dealtToKiller.damage)} in ${dealtToKiller.hits} ${dealtToKiller.hits === 1 ? 'hit' : 'hits'}` : 'Nothing'}</dd></div>
        </dl> : <p className="death-recap-cause">{recap.selfInflicted ? 'You did this one to yourself.' : 'No one to blame this time.'}</p>}
        {attackers.length > 0 && <><h3>Damage taken</h3><ul className="death-recap-attackers">{attackers.map(entry =>
          <li key={entry.name} data-killer={entry.killer}><span>{entry.name}</span><b>{Math.round(entry.damage)}</b><i style={{ transform: `scaleX(${Math.max(.04, entry.damage / total)})` }} /></li>)}</ul></>}
      </article>
      <article className="death-recap-card death-recap-life">
        <h3>This life</h3>
        <div className="death-recap-tiles">{tiles.map(([label, value]) => <div key={label}><b>{value}</b><small>{label}</small></div>)}</div>
        <p className="death-recap-session"><span>Session K/D <b>{session.kills} / {session.deaths}</b></span>{life.credits > 0 && <span>Earned <b>+{life.credits} CR</b></span>}</p>
      </article>
    </div>
    {recap.notes.length > 0 && <ul className="death-recap-notes">{recap.notes.map(note => <li key={note}>{note}</li>)}</ul>}

    <div className="death-recap-foot">
      {recap.windowLeft === null
        ? <strong>Back in {Math.ceil(respawnIn)}s</strong>
        : <div className="death-recap-progress" aria-hidden="true"><i style={{ transform: `scaleX(${recap.windowLeft / DEATH_WINDOW_SECONDS})` }} /></div>}
      <div className="death-recap-actions">
        {onSkip && <button type="button" className="death-recap-skip" onClick={onSkip}>{!touch && <kbd>Space</kbd>} Choose respawn</button>}
        {onLoadout && <button type="button" className="respawn-loadout-trigger" onClick={onLoadout}>Respawn loadout</button>}
      </div>
    </div>
  </section>;
}
