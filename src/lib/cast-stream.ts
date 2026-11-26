import { CAST_PCM } from '../game/cast-wire';

export interface CastAudio { signal: AbortSignal; stream: ReadableStream<Uint8Array>; cancel(): void }

// Keep one reader across the prefix, UTF-8 header and PCM. A network chunk may
// end inside any of them, or contain the entire reply.
export async function readCastStream(response: Response, abort: AbortController) {
  let source = response.body;
  if (!source?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    source = new ReadableStream({start(controller) { controller.enqueue(bytes); controller.close(); }});
  }
  const reader = source.getReader();
  let tail: Uint8Array = new Uint8Array();
  async function take(length: number) {
    const bytes = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      if (!tail.length) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('Incomplete cast header');
        tail = chunk.value;
      }
      const count = Math.min(tail.length,length-offset);
      bytes.set(tail.subarray(0,count),offset);
      tail = tail.subarray(count);
      offset += count;
    }
    return bytes;
  }
  const cancel = () => {
    if (abort.signal.aborted) return;
    abort.abort();
    void reader.cancel().catch(() => {});
  };
  try {
    const length = new DataView((await take(4)).buffer).getUint32(0);
    if (!length || length > 65536) throw new Error('Invalid cast header length');
    const body = JSON.parse(new TextDecoder().decode(await take(length)));
    if (body.pcm !== CAST_PCM) throw new Error('Unknown cast audio format');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { if (tail.length) controller.enqueue(tail); },
      async pull(controller) {
        const chunk = await reader.read();
        if (chunk.done) controller.close();
        else controller.enqueue(chunk.value);
      },
      cancel,
    },new ByteLengthQueuingStrategy({highWaterMark:64*1024}));
    return {body,audio:{stream,cancel,signal:abort.signal}};
  } catch (error) {
    cancel();
    throw error;
  }
}
