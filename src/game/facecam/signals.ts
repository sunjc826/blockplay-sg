import type { FpsHud } from '../fps-engine';
import { matchResultEvent } from '../match-callouts';
import type { Acting } from './acting';

export function observeHud(a: Acting, h: FpsHud, prev: FpsHud | undefined) {
  a.reload = !!h.reloading;
  a.low = h.health > 0 && h.health <= h.maxHealth * 0.35;
  if (!prev) return;
  const dead = (v: FpsHud) => v.health <= 0 || !!v.deathRecap || v.arenaSelf?.alive === false;
  if ((h.arenaSelf?.kills ?? h.hits) > (prev.arenaSelf?.kills ?? prev.hits)) a.signal('elimination');
  if (h.chain >= 2 && h.chain > prev.chain) a.signal('streak');
  if (h.incoming && !prev.incoming) a.signal('incoming');
  if (a.low && prev.health > prev.maxHealth * 0.35) a.signal('low');
  if (h.vehicle !== 'on-foot' && h.vehicle !== prev.vehicle) a.signal('vehicle');
  if (dead(h) !== dead(prev)) a.signal(dead(h) ? 'death' : 'respawn');
  if (
    ((h.phase === 'complete' || h.phase === 'defeated') && prev.phase !== h.phase) ||
    (h.arena?.finished && !prev.arena?.finished)
  ) {
    const result = h.arena && h.arenaSelf ? matchResultEvent(h.arena, h.arenaSelf.id) : null;
    if (result === 'draw') a.signal('pause');
    else
      a.signal(
        result ? (result === 'win' || result === 'ffa-win' ? 'won' : 'lost') : h.phase === 'complete' ? 'won' : 'lost'
      );
  }
}
