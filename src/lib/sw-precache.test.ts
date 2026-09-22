import { expect, it } from 'vitest';
// @ts-expect-error Node-only build helper has no declaration file.
import { shellPaths, versionOf } from '../../scripts/service-worker-manifest.mjs';

const BUNDLE = ['index.html', 'assets/index-9f3c2a1b.js', 'assets/three-77a1c0de.js', 'assets/index-1b2c3d4e.css', 'assets/index-9f3c2a1b.js.map'];
const PUBLIC = ['/manifest.webmanifest', '/icons/icon-192.png'];

it('precaches the whole build as root-absolute paths, and no source maps', () => {
  expect(shellPaths(BUNDLE, PUBLIC)).toEqual([
    // index.html is cached as '/': the URL a navigation asks for, and the one
    // hosts that redirect '/index.html' cannot break.
    '/',
    '/assets/index-1b2c3d4e.css',
    '/assets/index-9f3c2a1b.js',
    '/assets/three-77a1c0de.js',
    '/icons/icon-192.png',
    '/manifest.webmanifest',
  ]);
});

it('gives the same version to the same build, whatever order Rollup emitted it in', () => {
  const shuffled = [...BUNDLE].reverse();
  expect(versionOf(shellPaths(shuffled, PUBLIC))).toEqual(versionOf(shellPaths(BUNDLE, PUBLIC)));
});

it('changes the version when the build output changes', () => {
  const rebuilt = BUNDLE.map(file => file.replace('index-9f3c2a1b', 'index-0000ffff'));
  expect(versionOf(shellPaths(rebuilt, PUBLIC))).not.toEqual(versionOf(shellPaths(BUNDLE, PUBLIC)));
});
