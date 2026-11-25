import { ProviderError, type Provider } from './types.ts';
export function openai(key: string, fetcher: typeof fetch, base: string): Provider {
  return async r => {
    const response = await fetcher(base.replace(/\/$/, '') + '/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: r.signal ?? AbortSignal.timeout(25000),
      body: JSON.stringify({ model: r.model, store: false, reasoning: { effort: r.effort }, max_output_tokens: r.maxOutputTokens,
        instructions: r.system.join('\n\n'), input: r.image ? [{ role: 'user', content: [{ type: 'input_text', text: r.user },
          { type: 'input_image', image_url: 'data:image/jpeg;base64,' + r.image.base64 }] }] : r.user,
        text: { format: { type: 'json_schema', name: r.schemaName, strict: true, schema: r.schema } } }),
    });
    if (!response.ok) throw new ProviderError(response.status === 429 ? 429 : response.status === 401 ? 503 : 502);
    const data = await response.json();
    if (data.status === 'incomplete') throw new ProviderError(502);
    const parts: {type: string; text?: string}[] = data.output.flatMap((item: {content?: unknown[]}) => item.content ?? []);
    const refused = parts.some(p => p.type === 'refusal'), text = parts.find(p => p.type === 'output_text')?.text;
    return { refused, json: refused && (!r.schemaName.startsWith('streamer_') || !text) ? null : JSON.parse(text ?? ''),
      model: data.model ?? r.model, usage: { inputTokens: data.usage?.input_tokens ?? 0, cachedInputTokens: data.usage?.input_tokens_details?.cached_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 } };
  };
}
