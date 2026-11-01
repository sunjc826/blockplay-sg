/** One final combat mix per context. Room reflections, gunfire and impacts can
 * coincide; a shared limiter preserves their balance instead of clipping at
 * the speakers. Quiet signals remain linear through the soft ceiling. */
const outputs = new WeakMap<BaseAudioContext, { input: GainNode; nodes: AudioNode[] }>();
export function combatOutput(context: BaseAudioContext): AudioNode {
  const previous = outputs.get(context); if (previous) return previous.input;
  const input = context.createGain(), compressor = context.createDynamicsCompressor(), ceiling = context.createWaveShaper();
  compressor.threshold.value = -2; compressor.knee.value = 3; compressor.ratio.value = 16;
  compressor.attack.value = .001; compressor.release.value = .08;
  const curve = new Float32Array(4096);
  for (let i = 0; i < curve.length; i++) {
    const x = i / (curve.length - 1) * 2 - 1, a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= .78 ? a : .78 + .18 * (1 - Math.exp(-(a - .78) / .18)));
  }
  ceiling.curve = curve; ceiling.oversample = '2x';
  input.connect(compressor).connect(ceiling).connect(context.destination);
  outputs.set(context, { input, nodes: [input, compressor, ceiling] }); return input;
}
export function disposeCombatOutput(context: BaseAudioContext | null) {
  if (!context) return;
  outputs.get(context)?.nodes.forEach(node => node.disconnect()); outputs.delete(context);
}
