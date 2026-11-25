import { anthropic } from './anthropic.ts';
import { openai } from './openai.ts';
import type { Usage } from './types.ts';
export type Env = Record<string, string | undefined>;
const registry = { anthropic: { key: 'ANTHROPIC_API_KEY', defaultModel:'claude-sonnet-5-5', pilotBudget:2000, create: anthropic }, openai: { key: 'OPENAI_API_KEY', defaultModel:'gpt-5.6-luna', pilotBudget:500, create: openai } };
export function selectModel(env: Env, feature: 'CAST' | 'PILOT', fetcher = fetch) {
  const provider = env[feature + '_PROVIDER']?.trim() || (feature === 'CAST' ? 'anthropic' : 'openai');
  const entry = Object.hasOwn(registry, provider) ? registry[provider as keyof typeof registry] : undefined;
  const model = env[feature + '_MODEL']?.trim() || entry?.defaultModel || 'unconfigured';
  const key = entry && env[entry.key]?.trim();
  return { provider, model, pilotBudget:entry?.pilotBudget ?? 2000, complete: entry && key ? entry.create(key, fetcher, env.OPENAI_BASE_URL || 'https://api.openai.com/v1') : null };
}
const prices = new Map<string, number[]>([['claude-sonnet-5-5',[2,0.1,10]],['claude-opus-5-5',[4,0.2,20]],['claude-haiku-5-5',[0.1,0.01,0.5]]]);
export function estimate(model: string, u: Usage) {
  const p = prices.get(model);
  return p && ((u.inputTokens-u.cachedInputTokens)*p[0]+u.cachedInputTokens*p[1]+u.outputTokens*p[2])/1e6;
}
