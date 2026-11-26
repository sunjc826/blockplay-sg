import { CastPcm } from './cast-pcm';

declare const sampleRate: number;
declare class AudioWorkletProcessor { readonly port: MessagePort }
declare function registerProcessor(name: string, ctor: typeof CastProcessor): void;

class CastProcessor extends AudioWorkletProcessor {
  private pcm: CastPcm;
  private playing = false;
  private stopped = false;

  constructor(options: { processorOptions: { rate: number; leadMs: number; stallMs: number } }) {
    super();
    const {rate, leadMs, stallMs} = options.processorOptions;
    this.pcm = new CastPcm(rate, sampleRate, leadMs, stallMs);
    this.port.onmessage = ({data}) => {
      if (data === 'play') this.playing = true;
      else if (data === 'end') this.pcm.ended = true;
      else if (data === 'stop') this.stopped = true;
      else this.pcm.push(data);
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    if (this.stopped) return false;
    if (!this.playing || this.pcm.render(outputs[0][0])) return true;
    this.port.postMessage('ended');
    return false;
  }
}
registerProcessor('cast-pcm', CastProcessor);
