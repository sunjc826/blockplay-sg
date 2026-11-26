export interface SpeechRequest { voiceId: string; model: string; text: string; signal?: AbortSignal }
export type Speak = (request: SpeechRequest) => Promise<ReadableStream<Uint8Array>>;

export class SpeechError extends Error {
  kind: 'credits' | 'forbidden' | 'busy' | 'upstream';
  constructor(kind: SpeechError['kind']) {
    super('Speech provider unavailable');
    this.kind = kind;
  }
}
