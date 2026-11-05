import { describe, expect, it } from 'vitest';
import { foldTransform } from './map-panel-motion';

describe('foldTransform', () => {
  const panel = { x: 280, y: 20, width: 720, height: 760 }, corner = { x: 18, y: 108, width: 166, height: 190 };

  it('lands the panel on the corner panel, whatever transform centres it', () => {
    const transform = foldTransform('matrix(1, 0, 0, 1, -360, -380)', panel, corner);
    expect(transform).toBe(`translate(${18 + 83 - 640}px,${108 + 95 - 400}px) matrix(1, 0, 0, 1, -360, -380) scale(${166 / 720},${190 / 760})`);
  });

  it('stays valid for a panel with no transform of its own', () => {
    expect(foldTransform('none', panel, corner)).not.toContain('none');
  });
});
