export interface Completion {
  model: string; system: string[]; user: string; image?: { mediaType: 'image/jpeg'; base64: string };
  schema: Record<string, unknown>; schemaName: string; maxOutputTokens: number; effort: 'low' | 'medium' | 'high'; signal?: AbortSignal;
}
// inputTokens includes cached reads and cache writes. Only cache reads get the discounted rate.
export interface Usage { inputTokens: number; cachedInputTokens: number; outputTokens: number }
export type Provider = (request: Completion) => Promise<{ json: unknown; usage: Usage; model: string }>;
export class ProviderError extends Error {
  status: number;
  constructor(status: number) { super('Model request failed'); this.status = status; }
}
