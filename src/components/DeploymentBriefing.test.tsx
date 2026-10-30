import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DeploymentBriefing, { deploymentText } from './DeploymentBriefing';

it('reveals lines in sequence from the cinematic clock and restores the same text after pause', () => {
  expect(deploymentText('LOCATION', .1, .15, false)).toBe('');
  expect(deploymentText('LOCATION', .21, .15, false)).toBe('LOC');
  expect(deploymentText('WEATHER', .9, 1.25, false)).toBe('');
  expect(deploymentText('WEATHER', 2, 1.25, false)).toBe('WEATHER');
  expect(deploymentText('LOCATION', .21, .15, false)).toBe('LOC');
  expect(deploymentText('WEATHER', 0, 1.25, true)).toBe('WEATHER');
});

it('announces the complete briefing once, including real world time and weather', () => {
  const html = renderToStaticMarkup(<DeploymentBriefing location="Queenstown" time="06:30" weather="Passing showers" elapsed={.21} reduced={false} />);
  expect(html).toContain('aria-label="LOCATION  QUEENSTOWN, SINGAPORE. TIME      06:30 SGT. WEATHER   PASSING SHOWERS"');
  expect(html).toContain('data-line="location" aria-hidden="true">LOC');
  expect(html).toContain('data-line="weather" aria-hidden="true"></div>');
});
