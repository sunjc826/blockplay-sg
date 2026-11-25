import Anthropic from '@anthropic-ai/sdk';
import { ProviderError, type Provider } from './types.ts';

export function anthropic(key: string, fetcher: typeof fetch): Provider {
  const client = new Anthropic({ apiKey: key, fetch: fetcher, maxRetries: 1, timeout: 20_000 });
  return async r => {
    try {
      const reply = await client.messages.create({
        model: r.model, max_tokens: r.maxOutputTokens,
        system: r.system.map((text, i) => ({ type: 'text', text, ...(i === r.system.length - 1 && { cache_control: { type: 'ephemeral' as const } }) })),
        messages: [{ role: 'user', content: [
          ...(r.image ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: r.image.mediaType, data: r.image.base64 } }] : []),
          { type: 'text', text: r.user },
        ] }], output_config: { effort: r.effort, format: { type: 'json_schema', schema: r.schema } },
      }, { signal: r.signal ?? AbortSignal.timeout(45000) });
      if (reply.stop_reason === 'max_tokens') throw new ProviderError(502);
      const u = reply.usage, cached = u.cache_read_input_tokens ?? 0;
      const refused = reply.stop_reason === 'refusal', text = reply.content.find(p => p.type === 'text')?.text;
      return { model: reply.model, refused, json: refused && (!r.schemaName.startsWith('streamer_') || !text) ? null : JSON.parse(text ?? ''),
        usage: { inputTokens: u.input_tokens + cached + (u.cache_creation_input_tokens ?? 0), cachedInputTokens: cached, outputTokens: u.output_tokens } };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) throw new ProviderError(429);
      if (error instanceof Anthropic.AuthenticationError) throw new ProviderError(503);
      if (error instanceof Anthropic.APIError) throw new ProviderError(502);
      throw error;
    }
  };
}
