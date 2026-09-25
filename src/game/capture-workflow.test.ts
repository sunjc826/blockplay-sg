import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error Node-only capture helper.
import { selectDistrictPlans, previewViews, preflightDistrict, districtPlanPath } from '../../scripts/capture-workflow.mjs';
import { REGION_IDS } from './region-ids';

it('selects only plans changed in this push, never all districts', () => {
  expect(selectDistrictPlans({ eventName: 'push', changedFiles: ['reconstruction/orchard-browser-plan.json', 'scripts/capture-marina-browser.mjs', 'reconstruction/api-usage.json'] })).toEqual(['reconstruction/orchard-browser-plan.json']);
  expect(selectDistrictPlans({ eventName: 'push', changedFiles: ['src/game/orchard-scene.ts', 'reconstruction/queenstown/references/view.png', '.github/workflows/capture-orchard.yml'] })).toEqual([]);
  expect(selectDistrictPlans({ eventName: 'push', changedFiles: ['reconstruction/queenstown-browser-plan.json', 'reconstruction/orchard-browser-plan.json', 'reconstruction/orchard-browser-plan.json'] })).toEqual(['reconstruction/orchard-browser-plan.json', 'reconstruction/queenstown-browser-plan.json']);
});
it('supports every district manually and rejects all/traversal', () => {
  for (const district of REGION_IDS) expect(selectDistrictPlans({ eventName: 'workflow_dispatch', district })).toEqual([districtPlanPath(district)]);
  for (const district of ['all', '../secrets', 'made-up']) expect(() => selectDistrictPlans({ eventName: 'workflow_dispatch', district })).toThrow();
});
it('defaults to one preview per source; full capture is explicit', () => {
  const views = [{ source: 'a.json', heading: 0 }, { source: 'a.json', heading: 90 }, { source: 'b.json', heading: 180 }];
  expect(previewViews({ views })).toEqual([views[0], views[2]]);
  expect(previewViews({ views, captureMode: 'full' })).toEqual(views);
  expect(() => previewViews({ views, captureMode: 'everything' })).toThrow();
});
it('fully cached Marina preflight makes no network calls', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('Unexpected network request'); }) as typeof fetch;
  try {
    const result = await preflightDistrict('reconstruction/marina-browser-plan.json');
    expect(result.newImages).toBe(0);
    expect(result.cached).toBeGreaterThan(0);
  } finally { globalThis.fetch = originalFetch; }
});
it('validates mismatched regions, limits and review gates before capture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'capture-plan-')), previous = process.cwd();
  try {
    process.chdir(root);
    await mkdir('reconstruction/chinatown/references', { recursive: true });
    const path = 'reconstruction/chinatown-browser-plan.json';
    const source = { lat: 1.28, lng: 103.84 };
    const plan = { name: 'test', region: 'chinatown', width: 1280, height: 900, maxNewImages: 1, sources: { 'a.json': source }, views: [{ id: 'a-0', source: 'a.json', heading: 0, pitch: 0, zoom: 1 }] };
    await writeFile(path, JSON.stringify({ ...plan, region: 'orchard' }));
    await expect(preflightDistrict(path)).rejects.toThrow('filename');
    await writeFile(path, JSON.stringify({ ...plan, maxNewImages: 0 }));
    await expect(preflightDistrict(path)).rejects.toThrow('safety limit');
    await writeFile(path, JSON.stringify({ ...plan, captureMode: 'full' }));
    await expect(preflightDistrict(path)).rejects.toThrow('preview');
    await writeFile('reconstruction/chinatown/references/a.json', JSON.stringify({ status: 'OK', pano_id: 'test', selectedGoogle: true, requested: source }));
    await expect(preflightDistrict(path)).rejects.toThrow('visualReview');
    await writeFile(path, JSON.stringify(plan));
    expect((await preflightDistrict(path)).newImages).toBe(1);
  } finally { process.chdir(previous); await rm(root, { recursive: true, force: true }); }
});
