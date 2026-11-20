import { SCORE_EVENTS, SCORE_RULES, popupTotal, type ScoreSnapshot } from '../game/match-score';
import './match-score.css';

/** The player's own recent awards, newest first, beside the crosshair. */
export default function MatchScoreFeed({ score, selfId, now }: { score: ScoreSnapshot | undefined; selfId: string | undefined; now: number }) {
  const own = (score?.events ?? []).filter(e => e.actor === selfId && now - e.at <= SCORE_RULES.popupSeconds).slice(-3).reverse();
  if (!own.length) return null;
  return <div className="match-score-feed" aria-live="polite" aria-label="Score awards">
    {own.map(event => <p key={event.id} data-score-event={event.id} className={now - event.at > SCORE_RULES.popupSeconds - .6 ? 'is-leaving' : ''}>
      <strong>+{popupTotal(event)}</strong>
      <span>{event.parts.map(([kind, points]) => <span key={kind} data-score-kind={kind}>{SCORE_EVENTS[kind].label}{event.parts.length > 1 && <small>{points}</small>}</span>)}</span>
    </p>)}
  </div>;
}
