import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FpsDamageFeedback from './FpsDamageFeedback';
import type { FpsHud } from '../game/fps-engine';
it('renders persistent low/critical feedback only during a living player’s gameplay',()=>{
  const hud:Pick<FpsHud,'health'|'maxHealth'|'armor'|'maxArmor'|'phase'|'arenaSelf'>={health:15,maxHealth:100,armor:0,maxArmor:75,phase:'playing',arenaSelf:null};
  const render=(patch:Partial<typeof hud>)=>renderToStaticMarkup(<FpsDamageFeedback hud={{...hud,...patch}}/>);
  expect(render({})).toContain('data-health-band="critical"');
  expect(render({health:40})).toContain('data-health-band="low"');
  expect(render({health:90})).toContain('opacity:0');
  expect(render({health:0})).toBe('');expect(render({phase:'paused'})).toBe('');
  expect(render({})).not.toContain('fps-armor-break');
});
