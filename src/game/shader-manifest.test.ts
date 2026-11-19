import { describe, expect, it } from 'vitest';
import { isShaderManifest, packShaders, unpackShader } from './shader-manifest';
import { SHADER_MANIFEST_PATH } from './shader-warm';
import { SHADER_MANIFEST_PATH as WORKER_PATH } from '../lib/sw-policy';

const stock = Array.from({ length: 40 }, (_, line) => `stock line ${line};`).join('\n');
const pairs = [
  { vertex: `#define A\n${stock}`, fragment: `#define LIT\n${stock}\nvoid main() {}` },
  { vertex: `#define A\n${stock}`, fragment: `#define LIT\n#define MAP\n${stock}\nvoid main() {}` },
  { vertex: `#define B\n${stock}\n`, fragment: `${stock}\n\n\nvoid main() {}` },
];

describe('shader manifest', () => {
  it('returns every source exactly, blank lines and trailing newline included', () => {
    const manifest = packShaders(pairs, ['B_EXT', 'A_EXT', 'A_EXT']);
    expect(manifest.programs).toHaveLength(3);
    manifest.programs.forEach(([vertex, fragment], index) => {
      expect(unpackShader(manifest, vertex)).toBe(pairs[index].vertex);
      expect(unpackShader(manifest, fragment)).toBe(pairs[index].fragment);
    });
    expect(manifest.extensions).toEqual(['A_EXT', 'B_EXT']);
    expect(isShaderManifest(JSON.parse(JSON.stringify(manifest)))).toBe(true);
  });

  it('stores a shared line, a shared shader and a repeated program once', () => {
    const manifest = packShaders([...pairs, pairs[0]]);
    expect(manifest.programs).toHaveLength(3);
    expect(manifest.shaders).toHaveLength(5); // The first two programs share a vertex shader.
    expect(manifest.lines.filter(line => line === 'stock line 7;')).toHaveLength(1);
    // The stock block is one run in every shader after the first.
    expect(manifest.shaders[2].length).toBeLessThanOrEqual(8);
  });

  it('names a list by its content', () => {
    expect(packShaders(pairs).id).toBe(packShaders(pairs).id);
    expect(packShaders(pairs.slice(0, 2)).id).not.toBe(packShaders(pairs).id);
    expect(packShaders([{ ...pairs[0], fragment: `${pairs[0].fragment} ` }, ...pairs.slice(1)]).id).not.toBe(packShaders(pairs).id);
  });

  it('refuses what a missing file falls back to', () => {
    expect(isShaderManifest(null)).toBe(false);
    expect(isShaderManifest('<!doctype html>')).toBe(false);
    expect(isShaderManifest({ ...packShaders(pairs), version: 2 })).toBe(false);
    expect(isShaderManifest({ ...packShaders(pairs), programs: [[0, 99]] })).toBe(false);
  });

  it('is fetched from the path the service worker leaves to the network', () => {
    expect(WORKER_PATH).toBe(SHADER_MANIFEST_PATH);
  });
});
