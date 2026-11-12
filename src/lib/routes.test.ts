import { describe, expect, it } from 'vitest';
import { canonicalUrl, routeFromPath } from './routes';

describe('routes', () => {
  it('maps each screen path, with or without a trailing slash', () => {
    expect(routeFromPath('/')).toBe('menu');
    expect(routeFromPath('/play')).toBe('play');
    expect(routeFromPath('/play/single-player')).toBe('single-player');
    expect(routeFromPath('/play/multiplayer')).toBe('multiplayer-menu');
    expect(routeFromPath('/play/training')).toBe('training-menu');
    expect(routeFromPath('/play/team-deathmatch')).toBe('team-deathmatch');
    expect(routeFromPath('/play/team-deathmatch/dragon-courtyard')).toBe('dragon-courtyard');
    expect(routeFromPath('/play/team-deathmatch/smith-street/')).toBe('smith-street');
    expect(routeFromPath('/play/hardpoint')).toBe('hardpoint');
    expect(routeFromPath('/play/free-for-all')).toBe('free-for-all');
    expect(routeFromPath('/play/multiplayer/team-deathmatch')).toBe('host-team-deathmatch');
    expect(routeFromPath('/play/multiplayer/team-deathmatch/dragon-courtyard')).toBe('host-dragon-courtyard');
    expect(routeFromPath('/play/multiplayer/team-deathmatch/smith-street/')).toBe('host-smith-street');
    expect(routeFromPath('/play/multiplayer/hardpoint')).toBe('host-hardpoint');
    expect(routeFromPath('/play/multiplayer/free-for-all')).toBe('host-free-for-all');
    expect(routeFromPath('/tutorial/')).toBe('tutorial');
    expect(routeFromPath('/training')).toBe('training');
    expect(routeFromPath('/world/')).toBe('world');
    expect(routeFromPath('/multiplayer/')).toBe('multiplayer');
    expect(routeFromPath('/store')).toBe('store');
    expect(routeFromPath('/inventory/')).toBe('inventory');
    expect(routeFromPath('/settings')).toBe('settings');
    expect(routeFromPath('/debug/')).toBe('debug');
    expect(routeFromPath('/faction-designs/')).toBe('faction-designs');
  });

  it('falls back to the menu for unknown paths', () => {
    expect(routeFromPath('/play/queenstown')).toBe('menu');
    expect(routeFromPath('')).toBe('menu');
  });

  it('sends old LAN invites to the lobby in the debug shell', () => {
    expect(canonicalUrl('/', '?room=ABC123')).toBe('/debug?room=ABC123');
    expect(canonicalUrl('/debug', '?room=ABC123')).toBeNull();
    expect(canonicalUrl('/', '')).toBeNull();
    expect(canonicalUrl('/multiplayer', '?room=ABC123')).toBeNull();
  });
});

it('keeps solo and hosted arena deep links under their mode picker',async()=>{
  const {TDM_AREAS}=await import('../game/arena-match');
  const {HARDPOINT_ARENAS}=await import('../game/hardpoint');
  const {parentRoute}=await import('./routes');
  const {directionBetween}=await import('./route-transition');
  for(const hosted of [false,true])for(const mode of ['team-deathmatch','hardpoint'] as const) {
    const areas=mode==='hardpoint'?HARDPOINT_ARENAS.map(config=>config.area):TDM_AREAS;
    for(const area of areas){
      const route=routeFromPath(`/play/${hosted?'multiplayer/':''}${mode}/${area.id}`);
      expect(route).not.toBe('menu');
      expect(parentRoute(route)).toBe(`${hosted?'host-':''}${mode}`);
      expect(directionBetween(parentRoute(route),route)).toBe('forward');
      expect(directionBetween(route,parentRoute(route))).toBe('back');
    }
  }
});
