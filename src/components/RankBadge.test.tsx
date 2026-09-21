import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RankBadge from './RankBadge';
import { MAX_LEVEL } from '../game/progression';
import { rankInsignia, rankSets } from '../game/rank-insignia';

it('draws a mark for every level of every set, and names the rank for a screen reader', () => {
  for (const set of rankSets()) for (let level = 1; level <= MAX_LEVEL; level++) {
    const insignia = rankInsignia(level, set.id);
    const html = renderToStaticMarkup(<RankBadge insignia={insignia} />);
    // Something is always drawn: an empty badge is the failure this catches.
    expect(html).toMatch(/<(path|rect|polygon|text)/);
    expect(html).toContain(`aria-label="Rank ${insignia.label}, level ${level}"`);
  }
});
it('repeats a mark rather than needing a drawing per count', () => {
  const chevrons = (count: number) => (renderToStaticMarkup(
    <RankBadge insignia={{ ...rankInsignia(1), emblem: { kind: 'chevron', count } }} />).match(/<path/g) || []).length;
  expect(chevrons(1)).toBe(1); expect(chevrons(3)).toBe(3);
  const stars = renderToStaticMarkup(<RankBadge insignia={{ ...rankInsignia(1), emblem: { kind: 'star', count: 2 } }} />);
  expect((stars.match(/<polygon/g) || []).length).toBe(2);
});
it('crosses the rifle with itself for the top weapon shadow', () => {
  const crossed = renderToStaticMarkup(<RankBadge insignia={rankInsignia(MAX_LEVEL, 'weapons')} />);
  expect(crossed).toContain('rotate(-22)'); expect(crossed).toContain('rotate(22)');
  // One silhouette laid over itself, rather than a third drawing.
  expect((crossed.match(/M21 37h98/g) || []).length).toBe(2);
});
it('builds the laurel from leaves on a stem, and nests the mark inside it', () => {
  const wreathed = renderToStaticMarkup(<RankBadge insignia={rankInsignia(MAX_LEVEL)} />);
  // Filled leaves, five a branch: a stroked wreath with ticks aliases into a
  // face at badge size, which is the bug this shape replaced.
  expect((wreathed.match(/<ellipse/g) || []).length).toBe(10);
  expect(wreathed).toContain('scale(.68)');
  const bare = renderToStaticMarkup(<RankBadge insignia={rankInsignia(20)} />);
  expect(bare).not.toContain('<ellipse'); expect(bare).not.toContain('scale(.68)');
});
it('shows the number itself where the set has no title', () => {
  expect(renderToStaticMarkup(<RankBadge insignia={rankInsignia(37, 'numerals')} />)).toContain('>37</text>');
});
