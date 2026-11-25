import { expect, test } from 'vitest';
import { tidyLine } from './commentary.ts';

test('a caption loses a stray closing bracket or quote but keeps balanced ones', () => {
  expect(tidyLine('  Going for the medkit.}  ')).toBe('Going for the medkit.');
  expect(tidyLine('The map is the real opponent today.)')).toBe('The map is the real opponent today.');
  expect(tidyLine('Three down (and counting)')).toBe('Three down (and counting)');
  expect(tidyLine('He said "steady"')).toBe('He said "steady"');
  expect(tidyLine('Walao eh."')).toBe('Walao eh.');
  expect(tidyLine('one\n two')).toBe('one two');
});
