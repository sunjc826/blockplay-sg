import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { REGION_IDS } from '../src/game/region-ids.ts';
import { validatePlan, prepareViews, checkAllowance, planDirectory } from './browser-capture-plan.mjs';

export const districtPlanPath = region => `reconstruction/${region === 'marina-bay' ? 'marina' : region}-browser-plan.json`;
const byPath = new Map(REGION_IDS.map(region => [districtPlanPath(region), region]));
export function selectDistrictPlans({ eventName, district, changedFiles = [] }) {
  if (eventName === 'workflow_dispatch') {
    if (!REGION_IDS.includes(district)) throw new Error('Select one registered district.');
    return [districtPlanPath(district)];
  }
  if (eventName !== 'push') throw new Error('Unsupported capture event.');
  return [...new Set(changedFiles.filter(path => byPath.has(path)))].sort();
}
export function previewViews(plan) {
  if (plan.captureMode === 'full') return plan.views;
  if (plan.captureMode && plan.captureMode !== 'preview') throw new Error('captureMode must be preview or full.');
  const seen = new Set();
  return plan.views.filter(view => { if (seen.has(view.source)) return false; seen.add(view.source); return true; });
}
export async function preflightDistrict(path) {
  if (!byPath.has(path)) throw new Error('Not a district capture plan.');
  const plan = validatePlan(JSON.parse(await readFile(path, 'utf8')));
  const region = plan.region || 'marina-bay';
  if (region !== byPath.get(path)) throw new Error('Plan region does not match its filename.');
  const selected = { ...plan, region, views: previewViews(plan) };
  const views = [];
  for (const view of selected.views) {
    const sourcePath = view.source === 'original-waterfront' ? 'reconstruction/marina-bay.capture.json' : `${planDirectory(plan)}/${view.source}`;
    let source;
    try { source = JSON.parse(await readFile(sourcePath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!source) {
      try { await access(`${planDirectory(plan)}/${view.id}.png`); throw new Error('Image has no source metadata; recover it before selection.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const pos = plan.sources?.[view.source];
      if (!Number.isFinite(pos?.lat) || !Number.isFinite(pos?.lng) || pos.lat < 1.2 || pos.lat > 1.5 || pos.lng < 103.6 || pos.lng > 104.1) throw new Error('Missing valid Singapore source coordinates.');
      if (plan.captureMode === 'full') throw new Error('Capture and visually approve a preview before full capture.');
      views.push({ ...view });
    } else {
      const [prepared] = await prepareViews({ ...selected, views: [view] });
      if (!prepared.cached && plan.captureMode === 'full' && source.visualReview?.status !== 'accepted') throw new Error('Full capture needs visualReview.status=accepted on each source manifest.');
      if (plan.sources?.[view.source] && source.requested && (plan.sources[view.source].lat !== source.requested.lat || plan.sources[view.source].lng !== source.requested.lng)) throw new Error('Source coordinates changed; use a new source ID.');
      views.push(prepared);
    }
  }
  return { path, region, selected, ...checkAllowance(selected, views) };
}

async function main() {
  const command = process.argv[2];
  if (command === 'select') {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    let changedFiles = [];
    if (process.env.GITHUB_EVENT_NAME === 'push') {
      if (!/^[a-f0-9]{40}$/.test(event.before || '') || /^0+$/.test(event.before)) throw new Error('Missing push base; choose a district manually.');
      if (!/^[a-f0-9]{40}$/.test(event.after || '')) throw new Error('Invalid push head.');
      changedFiles = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', '--no-renames', event.before, event.after], { encoding: 'utf8' }).trim().split('\n');
    }
    const paths = selectDistrictPlans({ eventName: process.env.GITHUB_EVENT_NAME, district: event.inputs?.district, changedFiles });
    await mkdir('.cache', { recursive: true });
    await writeFile('.cache/capture-selection.json', JSON.stringify(paths));
    console.log(JSON.stringify({ selectedPlans: paths }));
    await writeFile(process.env.GITHUB_OUTPUT, `has_plans=${paths.length > 0}\norchard=${paths.includes(districtPlanPath('orchard'))}\n`, { flag: 'a' });
  } else if (command === 'preflight') {
    const paths = JSON.parse(await readFile('.cache/capture-selection.json', 'utf8'));
    const ready = [];
    // Validate every selected plan before making ANY Google request.
    for (const path of paths) ready.push(await preflightDistrict(path));
    const active = ready.filter(item => item.newImages > 0);
    for (const item of active) {
      item.runtimePlan = `reconstruction/${item.region}-selected-plan.json`;
      await writeFile(item.runtimePlan, JSON.stringify(item.selected, null, 2));
    }
    await writeFile('.cache/capture-active.json', JSON.stringify(active));
    await writeFile(process.env.GITHUB_OUTPUT, `needs_capture=${active.length > 0}\n`, { flag: 'a' });
    console.log(JSON.stringify(ready.map(({ region, cached, newImages }) => ({ region, cached, newImages }))));
  } else if (command === 'run') {
    if (process.env.GITHUB_RUN_ATTEMPT !== '1') throw new Error('Use a new run after importing any partial artifacts.');
    for (const item of JSON.parse(await readFile('.cache/capture-active.json', 'utf8'))) {
      for (const script of ['scripts/select-marina-references.mjs', 'scripts/capture-marina-browser.mjs']) {
        execFileSync(process.execPath, [script, '--plan', item.runtimePlan], { stdio: 'inherit', timeout: 300000 });
      }
    }
  } else if (command === 'stage') {
    const paths = JSON.parse(await readFile('.cache/capture-selection.json', 'utf8'));
    await mkdir('.cache/capture-output', { recursive: true });
    const { cp, access } = await import('node:fs/promises');
    for (const path of paths) {
      const region = byPath.get(path), dir = `reconstruction/${region}/references`;
      try { await access(dir); } catch { continue; }
      await cp(dir, `.cache/capture-output/${region}/references`, { recursive: true });
      execFileSync('git', ['add', '--', dir]);
    }
    await cp('reconstruction/api-usage.json', '.cache/capture-output/api-usage.json');
    execFileSync('git', ['add', '--', 'reconstruction/api-usage.json']);
  } else throw new Error('Use select, preflight, run or stage.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
