// One source clock for the whole line. Neither a network read nor a render
// quantum resets the interpolation between adjacent 24 kHz samples.
export class CastPcm {
  private samples = new Float32Array(8192);
  private head = 0;
  private count = 0;
  private lowByte = -1;
  private phase = 0;
  private gain = 0;
  private primed = true;
  private silentFrames = 0;
  private readonly inputRate: number;
  private readonly outputRate: number;
  private readonly leadFrames: number;
  private readonly stallFrames: number;
  ended = false;

  constructor(inputRate: number, outputRate: number, leadMs: number, stallMs: number) {
    this.inputRate = inputRate;
    this.outputRate = outputRate;
    this.leadFrames = Math.ceil(inputRate * leadMs / 1000);
    this.stallFrames = Math.ceil(outputRate * stallMs / 1000);
  }

  push(bytes: Uint8Array) {
    const needed = this.count + Math.ceil(bytes.length / 2);
    if (needed > this.samples.length) {
      const larger = new Float32Array(Math.max(needed, this.samples.length * 2));
      for (let i = 0; i < this.count; i++) larger[i] = this.samples[(this.head + i) % this.samples.length];
      this.samples = larger;
      this.head = 0;
    }
    let tail = (this.head + this.count) % this.samples.length;
    for (const byte of bytes) {
      if (this.lowByte === -1) this.lowByte = byte;
      else {
        const high = byte < 128 ? byte : byte - 256;
        this.samples[tail] = (high * 256 + this.lowByte) / 32768;
        tail = (tail + 1) % this.samples.length;
        this.count++;
        this.lowByte = -1;
      }
    }
    if (bytes.length) this.silentFrames = 0;
  }

  // The caller has checked the initial lead. Re-prime after an underrun.
  // A four-millisecond envelope at exposed edges avoids steps to/from silence.
  render(output: Float32Array): boolean {
    const step = 1 / (.004 * this.outputRate);
    for (let i = 0; i < output.length; i++) {
      if (!this.primed && (this.count >= this.leadFrames || this.ended)) this.primed = true;
      if (!this.count || !this.primed) {
        this.primed = false;
        this.gain = 0;
        output.fill(0, i);
        this.silentFrames += output.length - i;
        return !this.ended && this.silentFrames < this.stallFrames;
      }
      const a = this.samples[this.head];
      const b = this.count > 1 ? this.samples[(this.head + 1) % this.samples.length] : a;
      const framesLeft = (this.count * this.outputRate - this.phase) / this.inputRate;
      this.gain = Math.min(1, this.gain + step, framesLeft * step);
      output[i] = (a + (b - a) * this.phase / this.outputRate) * this.gain;
      this.phase += this.inputRate;
      const consumed = Math.min(this.count, Math.floor(this.phase / this.outputRate));
      this.phase %= this.outputRate;
      this.head = (this.head + consumed) % this.samples.length;
      this.count -= consumed;
    }
    return this.count > 0 || !this.ended;
  }
}
