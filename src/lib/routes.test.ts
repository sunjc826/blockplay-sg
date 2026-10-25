import { describe, expect, it } from 'vitest';
import { canonicalUrl, routeFromPath } from './routes';

describe('routes', () => {
  it('maps each screen path, with or without a trailing slash', () => {
    expect(routeFromPath('/')).toBe('menu');
    expect(routeFromPath('/training')).toBe('training');
    expect(routeFromPath('/world/')).toBe('world');
    expect(routeFromPath('/store')).toBe('store');
    expect(routeFromPath('/debug/')).toBe('debug');
  });

  it('falls back to the menu for unknown paths', () => {
    expect(routeFromPath('/play/queenstown')).toBe('menu');
    expect(routeFromPath('')).toBe('menu');
  });

  it('sends old LAN invites to the lobby in the debug shell', () => {
    expect(canonicalUrl('/', '?room=ABC123')).toBe('/debug?room=ABC123');
    expect(canonicalUrl('/debug', '?room=ABC123')).toBeNull();
    expect(canonicalUrl('/', '')).toBeNull();
  });
});
