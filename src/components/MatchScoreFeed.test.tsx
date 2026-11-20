import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MatchScoreFeed from './MatchScoreFeed';
import ArenaScoreboard from './ArenaScoreboard';
import { createArena } from '../game/arena-rules';
import type { ScoreSnapshot } from '../game/match-score';

const score: ScoreSnapshot = { players: {}, events: [
  { id: 1, actor: 'me', at: 1, parts: [['assist', 45]] },
  { id: 2, actor: 'them', at: 9, parts: [['kill', 100]] },
  { id: 3, actor: 'me', at: 9.5, parts: [['kill', 100], ['headshot', 25], ['double', 25]] },
] };
it('shows only the player\'s own live awards, newest first, with the total and what made it', () => {
  const html = renderToStaticMarkup(<MatchScoreFeed score={score} selfId="me" now={10} />);
  expect(html.match(/data-score-event=/g)).toHaveLength(1);
  expect(html).toContain('+150'); expect(html).toContain('Elimination'); expect(html).toContain('Headshot'); expect(html).toContain('Double kill');
  expect(html).not.toContain('Assist');
  expect(renderToStaticMarkup(<MatchScoreFeed score={score} selfId="me" now={2} />)).toContain('+45');
  expect(renderToStaticMarkup(<MatchScoreFeed score={score} selfId="nobody" now={10} />)).toBe('');
  expect(renderToStaticMarkup(<MatchScoreFeed score={undefined} selfId="me" now={10} />)).toBe('');
});
it('adds score and assist columns to the standings and breaks kill ties by score', () => {
  const a = createArena([], 2), s = a.snapshot(), [one, two] = s.actors;
  expect(renderToStaticMarkup(<ArenaScoreboard snapshot={{ ...s, score: undefined }} selfId="none" />)).not.toContain('SCORE');
  one.kills = two.kills = 3;
  s.score = { players: Object.fromEntries(s.actors.map(x => [x.id, { score: x === two ? 425 : x === one ? 300 : 0, assists: x === two ? 2 : 0 }])), events: [] };
  const html = renderToStaticMarkup(<ArenaScoreboard snapshot={s} selfId="none" />);
  expect(html).toContain('SCORE'); expect(html).toContain('<td data-score="true">425</td>');
  expect(html.indexOf(`data-actor-id="${two.id}"`)).toBeLessThan(html.indexOf(`data-actor-id="${one.id}"`));
});
