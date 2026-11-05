import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { initialFpsHud } from '../game/fps-engine';
import { FpsHealthLine } from './FpsVitals';

const line = (health: number, armor = 0, maxArmor = 100) => renderToStaticMarkup(<FpsHealthLine hud={{ ...initialFpsHud, phase: 'playing', health, armor, maxArmor, maxHealth: 100 }} />);

it('shrinks to the share of health left, with the number over it', () => {
  const html = line(38);
  expect(html).toContain('<b>38</b>');
  expect(html).toContain('scaleX(0.38)');
  expect(html).toContain('aria-label="Health 38 of 100, armor 0"');
  expect(html).toContain('data-health-band="low"');
});

it('draws armor only while there is some', () => {
  expect(line(100)).not.toContain('fps-armor-track');
  const html = line(100, 35);
  expect(html).toContain('+35');
  expect(html).toContain('scaleX(0.35)');
});

it('says so in words when health is critical, not only in colour', () => {
  expect(line(100)).not.toContain('CRITICAL');
  expect(line(38)).not.toContain('CRITICAL');
  expect(line(18)).toContain('CRITICAL · FIND COVER');
  expect(line(0)).toContain('OPERATOR DOWN');
});
