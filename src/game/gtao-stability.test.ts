import { describe, expect, it } from 'vitest';
import { GTAOShader } from 'three/addons/shaders/GTAOShader.js';
import { PoissonDenoiseShader } from 'three/addons/shaders/PoissonDenoiseShader.js';
import { stableDepthChoice, withStableNormals } from './gtao-stability';

describe('GTAO stable normals', () => {
  it('replaces the normal reconstruction in both of three\'s shaders', () => {
    for (const source of [GTAOShader.fragmentShader, PoissonDenoiseShader.fragmentShader]) {
      const patched = withStableNormals(source);
      expect(patched).not.toBe(source);
      expect(patched).toContain('stableDepthDerivative');
      expect(patched.match(/vec3 computeNormalFromDepth\(/g)).toHaveLength(1);
      // The rest of the shader is untouched.
      expect(patched).toContain('void main()');
    }
  });

  it('leaves a source without the function alone', () => {
    expect(withStableNormals('void main() {}')).toBe('void main() {}');
  });

  it('steps over a single pixel standing proud of a plane', () => {
    // Depth rises evenly across the slab; the centre pixel is a strip a little nearer.
    expect(stableDepthChoice(.90, .91, .92 - .004, .93, .94)).toBe('centred');
  });

  it('follows the side that continues the surface at a silhouette', () => {
    // Background behind on the left, the object's face from the centre on.
    expect(stableDepthChoice(.99, .99, .5, .501, .502)).toBe('forward');
    expect(stableDepthChoice(.498, .499, .5, .99, .99)).toBe('back');
  });

  it('keeps a pixel on a two-pixel strip on the strip', () => {
    // Centre and its left neighbour are the strip top, a little nearer than the slab.
    expect(stableDepthChoice(.90, .91 - .004, .92 - .004, .93, .94)).toBe('back');
  });
});
