import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ExpeditionDeployment from './ExpeditionDeployment';
import type { DeploymentView } from '../game/expedition-deployment';

const deployment: DeploymentView = { choice: 'random', resolved: null, canChoose: true,
  markers: [{id:'entry',x:40,y:45,visible:true},{id:'park',x:60,y:60,visible:true}], zoom: 1,
  points: [{ id: 'entry', name: 'District entry', x: -18, z: 83, yaw: 0, pitch: 0 }, { id: 'park', name: 'Community court', x: 50, z: 0, yaw: 0, pitch: 0 }] };
it('offers random and world-anchored landing buttons over the real aerial scene', () => {
  const html = renderToStaticMarkup(<ExpeditionDeployment zone="queenstown" deployment={deployment} onChoose={() => {}} />);
  expect(html).toContain('Random entry point'); expect(html).toContain('Community court');
  expect(html).toContain('Choose your landing zone'); expect(html).toContain('aria-label="Deploy at Community court"');
  expect(html).toContain('left:60%;top:60%'); expect(html).toContain('aria-label="Aerial camera"');
  expect(html).not.toContain('<select'); expect(html).not.toContain('<svg');
});
it('does not offer redeployment after play starts or during checkpoint travel', () => {
  expect(renderToStaticMarkup(<ExpeditionDeployment zone="queenstown" deployment={null} onChoose={() => {}} />)).toBe('');
  expect(renderToStaticMarkup(<ExpeditionDeployment zone="queenstown" deployment={{ ...deployment, canChoose: false }} onChoose={() => {}} />)).toBe('');
});
