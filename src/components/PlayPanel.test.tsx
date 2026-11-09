import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayPanel } from './PlayPanel';

it('keeps the playable map visible with setup in a dock and no spawn picker', () => {
  const html = renderToStaticMarkup(<PlayPanel label="Hardpoint" paused={false}
    primary={<button>Start match</button>} navigation={<button>Leave match</button>}
    aerial={{ zoom: 1, onZoom: () => {}, onResetView: () => {}, loadout: <button>Choose starting loadout</button> }}
    details={<p>Match settings</p>}><h2>Ready to play</h2></PlayPanel>);
  expect(html).toContain('Hardpoint aerial setup');
  expect(html).toContain('deployment-dock');
  expect(html).toContain('Choose starting loadout');
  expect(html).toContain('Briefing &amp; settings');
  expect(html).toContain('Spawn assigned automatically');
  expect(html).not.toContain('deployment-pins');
  expect(html).not.toContain('fps-overlay');
});
