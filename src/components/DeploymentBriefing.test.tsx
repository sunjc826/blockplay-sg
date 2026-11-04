import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DeploymentBriefing, { briefingLines, DeploymentOverlay } from './DeploymentBriefing';

const props = { location: 'Queenstown', time: '06:30', weather: 'Passing showers', reduced: false };
const clock = () => ({ elapsed: .21, decayAt: null });

it('announces the complete briefing once, including real world time and weather', () => {
  const html = renderToStaticMarkup(<DeploymentBriefing {...props} respawn={false} clock={clock} />);
  expect(html).toContain('aria-label="EXPEDITION / INSERTION. LOCATION  QUEENSTOWN, SINGAPORE. TIME      06:30 SGT. WEATHER   PASSING SHOWERS"');
  expect(html).toContain('data-line="weather" aria-hidden="true"><span data-i="0">W</span>');
});

it('heads the feed differently for a respawn', () => {
  expect(briefingLines({ ...props, respawn: false })[0]).toBe('EXPEDITION / INSERTION');
  expect(briefingLines({ ...props, respawn: true })[0]).toBe('OPERATOR / REDEPLOYMENT');
  expect(renderToStaticMarkup(<DeploymentBriefing {...props} respawn clock={clock} />)).toContain('aria-label="OPERATOR / REDEPLOYMENT. LOCATION');
});

it('keeps the feed up after the descent ends, with the letterbox on its way out', () => {
  const html = renderToStaticMarkup(<DeploymentOverlay location="Queenstown" intro={null} briefing={{ ...props, respawn: true, time: '06:30', weather: 'Rain' }} clock={clock} />);
  expect(html).toContain('data-stage="out"');
  expect(html).toContain('deployment-briefing');
  expect(renderToStaticMarkup(<DeploymentOverlay location="Queenstown" intro={null} briefing={null} clock={clock} />)).not.toContain('deployment-briefing');
});
