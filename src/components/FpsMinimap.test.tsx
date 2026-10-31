import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FpsMinimap from './FpsMinimap';
import { WORLD_ZONES } from '../game/world-zones';

it('keeps announced offshore landing craft visible at the map edge, with their faction and sector', () => {
  for (const expanded of [false, true]) {
    const html = renderToStaticMarkup(<FpsMinimap zone="sentosa" player={{ x: 0, z: 0, yaw: 0 }} mode="expedition" expanded={expanded} markers={[
      { id: 'boat-1', kind: 'boat', side: 'ally', label: 'Friendly landing craft · Southern beach west · ETA 17s', x: -155, z: 330 },
    ]} />);
    expect(html).toContain('data-minimap-marker="boat-1" data-marker-kind="boat" data-edge="true"');
    expect(html).toContain('fill="#70cfff"'); expect(html).toContain('Southern beach west');
  }
});

it('uses each district map and clips distant loot while keeping distant checkpoint directions', () => {
  for (const zone of WORLD_ZONES) {
    const player = zone.spawn;
    const html = renderToStaticMarkup(<FpsMinimap zone={zone.id} player={player} mode="expedition" markers={[
      { id: 'near', kind: 'loot', label: 'Medical supplies', x: player.x + 10, z: player.z },
      { id: 'npc', kind: 'npc', label: 'Kopi stall', x: player.x + 12, z: player.z },
      { id: 'distant-loot', kind: 'loot', label: 'Distant loot', x: player.x + 500, z: player.z },
      { id: 'exit', kind: 'checkpoint', label: 'Next district', x: player.x + 500, z: player.z, active: true },
    ]} />);
    expect(html).toContain(`data-map-zone="${zone.id}"`);
    expect(html).toContain('data-minimap-marker="near"');
    expect(html).toContain('data-minimap-marker="npc" data-marker-kind="npc"');
    expect(html).not.toContain('distant-loot');
    expect(html).toContain('data-minimap-marker="exit" data-marker-kind="checkpoint" data-edge="true" data-active="true"');
    expect(html).toContain('data-minimap-player');
    expect(html).toContain('<polyline');
    expect(html).not.toContain('<canvas');
  }
});

it('renders an arena with only the player and roads when no markers are supplied', () => {
  const html = renderToStaticMarkup(<FpsMinimap zone="marina-bay" player={{ x: 0, z: 0, yaw: 0 }} mode="arena" />);
  expect(html).toContain('data-minimap-player');
  expect(html).not.toContain('data-minimap-marker');
});

it('opens to the whole district with sector names, so distant loot is on it', () => {
  for (const zone of WORLD_ZONES) {
    const player = zone.spawn;
    const html = renderToStaticMarkup(<FpsMinimap zone={zone.id} player={player} mode="expedition" expanded markers={[
      { id: 'distant-loot', kind: 'loot', label: 'Distant loot', x: player.x + 150, z: player.z },
      { id: 'exit', kind: 'checkpoint', label: 'Next district · checkpoint', x: player.x, z: player.z + 20 },
    ]} />);
    expect(html).toContain('data-map-expanded="true"');
    expect(html).toContain('viewBox="0 0 600 440"');
    expect(html).toContain('data-minimap-marker="distant-loot"');
    expect(html).toContain('class="fps-map-sector"');
    expect(html).toContain('>Next district</text>');
  }
});

it('keeps scent reveals alongside visible combatants', () => {
  const html = renderToStaticMarkup(<FpsMinimap zone="marina-bay" player={{ x: 0, z: 0, yaw: 0 }} mode="arena"
    markers={[{ id: 'scent-bot-1', kind: 'scent', label: 'Bravo · you can smell them', x: 20, z: 10 }]} />);
  expect(html).toContain('data-minimap-marker="scent-bot-1" data-marker-kind="scent"');
  expect(html).toContain('unless you can smell them');
});

it('renders distinct ally and enemy symbols on both map sizes in combat modes', () => {
  for (const mode of ['arena', 'expedition'] as const) for (const expanded of [false, true]) {
    const html = renderToStaticMarkup(<FpsMinimap zone="marina-bay" player={{ x: 0, z: 0, yaw: 0 }} mode={mode} expanded={expanded}
      markers={[
        { id: 'ally', kind: 'ally', label: 'Alpha · Ally', x: -10, z: -15 },
        { id: 'enemy', kind: 'enemy', label: 'Bravo · Enemy', x: 10, z: -15 },
      ]} />);
    expect(html).toContain('data-marker-kind="ally"');
    expect(html).toContain('data-marker-kind="enemy"');
    expect(html).toContain('fill="#70cfff"');
    expect(html).toContain('fill="#ff675c"');
    expect(html).toContain('Alpha · Ally · 18m');
    expect(html).toContain('Bravo · Enemy · 18m');
    expect(html).toContain('within 60m while in view with clear line of sight');
    expect(html).not.toContain('Opponents hidden');
  }
});

it('hides combatants and scent reveals while the map is jammed', () => {
  const html = renderToStaticMarkup(<FpsMinimap zone="marina-bay" player={{ x: 0, z: 0, yaw: 0 }} mode="arena" jammed
    markers={[
      { id: 'ally', kind: 'ally', label: 'Ally', x: -10, z: 0 },
      { id: 'enemy', kind: 'enemy', label: 'Enemy', x: 10, z: 0 },
      { id: 'scent', kind: 'scent', label: 'Scent', x: 20, z: 0 },
    ]} />);
  expect(html).toContain('SIGNAL JAMMED');
  expect(html).not.toContain('data-minimap-marker');
});

it('shows the current conditions-based range in both combat modes and map sizes', () => {
  for (const mode of ['arena', 'expedition'] as const) for (const expanded of [false, true]) {
    const html = renderToStaticMarkup(<FpsMinimap zone="marina-bay" player={{ x: 0, z: 0, yaw: 0 }} mode={mode} expanded={expanded} contactRange={17} />);
    expect(html).toContain('data-map-contact-range="17"');
    expect(html).toContain('17m sight');
    expect(html).toContain('within 17m while in view with clear line of sight');
    expect(html).not.toContain('60m');
  }
});
