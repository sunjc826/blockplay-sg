// Works out what the service worker precaches, and the version stamp that
// names its cache. Pure and Node-only so `src/lib/sw-precache.test.ts` can
// check it without running a build.
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';

/** Build output that is never worth shipping to a cache. */
const IGNORED = /\.(map|txt)$/i;

/**
 * App-shell paths from a Rollup bundle plus the public files the install needs.
 * Sorted, so the version stamp does not move with Rollup's emit order.
 */
export function shellPaths(bundleFiles, publicFiles = []) {
  const paths = [...bundleFiles, ...publicFiles]
    .filter(file => !IGNORED.test(file))
    .map(file => (file.startsWith('/') ? file : `/${file}`));
  return [...new Set(paths)].sort();
}

/**
 * Short content stamp for the shell. The paths already carry Rollup's content
 * hashes, so hashing the list changes the cache name exactly when the build
 * output changes — and leaves it alone when only a doc or a test moved.
 */
export function versionOf(paths) {
  return createHash('sha256').update(paths.join('\n')).digest('hex').slice(0, 12);
}

/** The manifest and every icon it points at, read from `public/`. */
export function publicShellFiles(publicDirectory) {
  const icons = readdirSync(new URL('icons/', publicDirectory)).filter(file => file.endsWith('.png'));
  return ['/manifest.webmanifest', ...icons.map(file => `/icons/${file}`)];
}
