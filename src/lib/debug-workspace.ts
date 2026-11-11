import { isRegionId, type RegionId } from '../game/region-ids';
export const DEBUG_TOOLS = ['maps', 'models', 'walk', 'fps', 'world', 'arena', 'street', 'armory'] as const;
export type DebugTool = typeof DEBUG_TOOLS[number];
export interface DebugWorkspace { tool: DebugTool; district: RegionId; asset: string }
export const DEBUG_WORKSPACE_KEY = 'blockplay.debug.workspace.v1';
const validAsset = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9-]{0,39}\/[a-z0-9-]{1,80}$/.test(value);
export function readDebugWorkspace(search: string, saved?: string | null): DebugWorkspace {
  let previous: Partial<DebugWorkspace> = {};
  try { previous = JSON.parse(saved || '{}') ?? {}; } catch { /* Optional preferences must never block the workspace. */ }
  const query = new URLSearchParams(search), district = query.get('review') ?? query.get('district') ?? previous.district;
  const asset = query.get('asset') ?? previous.asset;
  const requested = query.has('room') ? 'arena' : query.has('asset') ? 'models' : query.has('review') ? 'maps' : query.get('tool');
  // Returning to /debug resumes design work, never automatically reconnects a live game or Street View.
  const tool = DEBUG_TOOLS.includes(requested as DebugTool) ? requested as DebugTool : previous.tool === 'models' ? 'models' : 'maps';
  return { tool, district: isRegionId(district) ? district : 'marina-bay', asset: validAsset(asset) ? asset : 'prop/vending' };
}
export function debugWorkspaceUrl(state: DebugWorkspace, search = '') {
  const query = new URLSearchParams(search);
  for (const key of ['review', 'asset', 'tool', 'district', 'thread', 'room']) query.delete(key);
  if (state.tool === 'maps') query.set('review', state.district);
  else if (state.tool === 'models') query.set('asset', state.asset);
  else { query.set('tool', state.tool); query.set('district', state.district); }
  return `/debug?${query}`;
}
