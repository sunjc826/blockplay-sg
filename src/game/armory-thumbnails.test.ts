import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { armoryThumbnailShots } from './armory-thumbnails';

it('ships a real WebP shot for every store item, finish platform and vehicle wrap', () => {
  const shots = armoryThumbnailShots();
  expect(new Set(shots.map(shot => shot.file)).size).toBe(shots.length);
  for (const shot of shots) {
    const image = readFileSync(new URL(`../../public/images/armory/${shot.file}`, import.meta.url));
    expect(image.toString('ascii', 0, 4), shot.file).toBe('RIFF');
    expect(image.toString('ascii', 8, 12), shot.file).toBe('WEBP');
    expect(image.length, shot.file).toBeGreaterThan(500);
  }
});
