import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packShaders } from './shader-manifest';
import { getShaderWarmState, holdShaderWarm, resetShaderWarm, startShaderWarm } from './shader-warm';

const manifest = packShaders(Array.from({ length: 4 }, (_, index) => ({ vertex: `void main() { /* ${index} */ }`, fragment: 'void main() {}' })), ['EXT_color_buffer_float']);

/** A context that records what was asked of it and finishes each link when told to. */
function fakeContext() {
  const linked: string[][] = [], sources = new Map<object, string>(), attached = new Map<object, object[]>();
  let complete = true, lost = false;
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, LINK_STATUS: 3, extensions: [] as string[],
    getExtension(name: string) { this.extensions.push(name); return name === 'KHR_parallel_shader_compile' ? { COMPLETION_STATUS_KHR: 9 } : name === 'WEBGL_lose_context' ? { loseContext() { lost = true; } } : {}; },
    createProgram() { const program = {}; attached.set(program, []); return program; },
    createShader: () => ({}), shaderSource(shader: object, source: string) { sources.set(shader, source); }, compileShader() {},
    attachShader(program: object, shader: object) { attached.get(program)!.push(shader); },
    linkProgram(program: object) { linked.push(attached.get(program)!.map(shader => sources.get(shader)!)); },
    getProgramParameter: (_program: object, name: number) => name === 9 ? complete : true,
    deleteShader() {}, deleteProgram() {}, isContextLost: () => lost,
  };
  return { gl, linked, stall() { complete = false; }, finish() { complete = true; }, get lost() { return lost; } };
}

describe('menu shader warm-up', () => {
  let context: ReturnType<typeof fakeContext>;
  beforeEach(() => {
    vi.useFakeTimers(); resetShaderWarm();
    context = fakeContext();
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); } });
    vi.stubGlobal('document', { createElement: () => ({ addEventListener() {}, getContext: () => context.gl }) });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete (globalThis as { __noShaderWarm?: boolean }).__noShaderWarm; });

  it('links every program in the list, in order, then lets the context go', async () => {
    startShaderWarm(async () => manifest);
    await vi.runAllTimersAsync();
    expect(context.linked).toHaveLength(4);
    expect(context.linked[2]).toEqual(['void main() { /* 2 */ }', 'void main() {}']);
    expect(context.gl.extensions).toContain('EXT_color_buffer_float');
    expect(getShaderWarmState()).toEqual({ phase: 'done', done: 4, total: 4 });
    expect(context.lost).toBe(true);
  });

  it('waits for one program before starting the next', async () => {
    context.stall();
    startShaderWarm(async () => manifest);
    await vi.advanceTimersByTimeAsync(2000);
    expect(context.linked).toHaveLength(1);
    expect(getShaderWarmState()).toMatchObject({ phase: 'working', done: 0 });
    context.finish();
    await vi.runAllTimersAsync();
    expect(context.linked).toHaveLength(4);
  });

  it('stands aside while a game holds the GPU and carries on after', async () => {
    const release = holdShaderWarm(), second = holdShaderWarm();
    startShaderWarm(async () => manifest);
    await vi.advanceTimersByTimeAsync(5000);
    expect(context.linked).toHaveLength(0);
    expect(getShaderWarmState().phase).toBe('held');
    release(); release();
    await vi.advanceTimersByTimeAsync(5000);
    expect(context.linked).toHaveLength(0); // The other game is still up.
    second();
    await vi.runAllTimersAsync();
    expect(getShaderWarmState()).toMatchObject({ phase: 'done', done: 4 });
  });

  it('compiles a list once, and again when a deployment changes it', async () => {
    startShaderWarm(async () => manifest);
    await vi.runAllTimersAsync();
    resetShaderWarm(); context = fakeContext();
    startShaderWarm(async () => manifest);
    await vi.runAllTimersAsync();
    expect(context.linked).toHaveLength(0);
    expect(getShaderWarmState().phase).toBe('done');
    resetShaderWarm();
    startShaderWarm(async () => packShaders([{ vertex: 'void main() { /* new */ }', fragment: 'void main() {}' }]));
    await vi.runAllTimersAsync();
    expect(context.linked).toHaveLength(1);
  });

  it('does nothing without a list, or when a smoke asks it not to', async () => {
    startShaderWarm(async () => '<!doctype html>');
    await vi.runAllTimersAsync();
    expect(getShaderWarmState().phase).toBe('off');
    resetShaderWarm();
    (globalThis as { __noShaderWarm?: boolean }).__noShaderWarm = true;
    startShaderWarm(async () => manifest);
    await vi.runAllTimersAsync();
    expect(context.linked).toHaveLength(0);
    expect(getShaderWarmState().phase).toBe('off');
  });
});
