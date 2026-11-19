import { getGraphicsSettings } from './graphics-settings';
import { isShaderManifest, unpackShader, type ShaderManifest } from './shader-manifest';

/**
 * Compiles the range's shaders while the player is still in the menus.
 *
 * A range load makes a new renderer, so three's own program cache starts empty
 * every time. The browser keeps a cache of its own below that, keyed by the
 * exact shader text and shared by every WebGL context on the page: a program
 * linked here, in a throwaway context, is a cache hit when the game's renderer
 * links the same text later. The list of texts is recorded from a real load at
 * build time (`scripts/capture-shader-manifest.mjs`); a deployment without one
 * simply has nothing to warm.
 *
 * One program at a time, with a breath between them: thrown at the driver all
 * at once they are the stall this exists to remove.
 */
export const SHADER_MANIFEST_PATH = '/shader-warm.json';
const DONE_KEY = 'blockplay-shader-warm', BREATH_MS = 24, POLL_MS = 12;

export interface ShaderWarmState {
  /** `held` while a game owns the GPU; `off` when there is nothing to do or no way to do it. */
  phase: 'idle' | 'working' | 'held' | 'done' | 'off';
  done: number;
  total: number;
}

let state: ShaderWarmState = { phase: 'idle', done: 0, total: 0 };
let started = false, holds = 0, resume: (() => void) | null = null;
const listeners = new Set<() => void>();

export const getShaderWarmState = () => state;
export function subscribeShaderWarm(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function set(next: Partial<ShaderWarmState>) { state = { ...state, ...next }; listeners.forEach(listener => listener()); }

/**
 * A game's renderer takes this for as long as it lives. Its own compile must
 * not queue behind the menu's, and a frame must not wait on one either.
 */
export function holdShaderWarm() {
  holds++;
  if (state.phase === 'working') set({ phase: 'held' });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--holds > 0) return;
    if (state.phase === 'held') set({ phase: 'working' });
    resume?.(); resume = null;
  };
}

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const released = () => holds === 0 ? Promise.resolve() : new Promise<void>(resolve => { const previous = resume; resume = () => { previous?.(); resolve(); }; });

function remembered() { try { return localStorage.getItem(DONE_KEY); } catch { return null; } }
function remember(id: string) { try { localStorage.setItem(DONE_KEY, id); } catch { /* Private mode: warm again next visit. */ } }

/** Safe to call from every screen: only the first call does anything. */
export function startShaderWarm(fetchManifest: () => Promise<unknown> = loadManifest) {
  if (started) return;
  started = true;
  // Browser smokes that count programs set this so the replay stays out of their numbers.
  if ((globalThis as { __noShaderWarm?: boolean }).__noShaderWarm || typeof document === 'undefined') { set({ phase: 'off' }); return; }
  void run(fetchManifest).catch(() => set({ phase: 'off' }));
}

async function loadManifest() {
  // `no-cache` revalidates, so a new deployment's list replaces the old one without a download when nothing changed.
  const response = await fetch(SHADER_MANIFEST_PATH, { cache: 'no-cache' });
  if (!response.ok || !/json/.test(response.headers.get('content-type') ?? '')) return null;
  return response.json();
}

async function run(fetchManifest: () => Promise<unknown>) {
  const manifest = await fetchManifest();
  if (!isShaderManifest(manifest) || !manifest.programs.length) { set({ phase: 'off' }); return; }
  const total = manifest.programs.length;
  // The browser's cache outlives the page, so one pass per list is enough.
  if (remembered() === manifest.id) { set({ phase: 'done', done: total, total }); return; }
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  // Three's own defaults, so nothing about the context separates these programs from the game's.
  const gl = canvas.getContext('webgl2', { alpha: true, depth: true, stencil: false, antialias: getGraphicsSettings().antialias, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'default' });
  if (!gl) { set({ phase: 'off' }); return; }
  let lost = false;
  canvas.addEventListener('webglcontextlost', () => { lost = true; });
  for (const name of manifest.extensions) gl.getExtension(name);
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  set({ phase: holds ? 'held' : 'working', done: 0, total });
  for (let index = 0; index < total; index++) {
    await released();
    if (lost || gl.isContextLost()) { set({ phase: 'off' }); return; }
    await link(gl, parallel, manifest, manifest.programs[index]);
    set({ done: index + 1 });
    await pause(BREATH_MS);
  }
  remember(manifest.id);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  set({ phase: 'done' });
}

async function link(gl: WebGL2RenderingContext, parallel: KHR_parallel_shader_compile | null, manifest: ShaderManifest, [vertex, fragment]: [number, number]) {
  const program = gl.createProgram();
  const shaders = ([[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const).map(([type, index]) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, unpackShader(manifest, index)); gl.compileShader(shader); gl.attachShader(program, shader);
    return shader;
  });
  gl.linkProgram(program);
  if (parallel) {
    // Asking for the link status would block until the driver is done; this does not.
    while (!gl.isContextLost() && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) await pause(POLL_MS);
  } else {
    await pause(0);
    gl.getProgramParameter(program, gl.LINK_STATUS);
  }
  // A program that fails here would fail in the game too, and says so there. The cache entry is all this wants.
  shaders.forEach(shader => gl.deleteShader(shader)); gl.deleteProgram(program);
}

/** Tests only. */
export function resetShaderWarm() { started = false; holds = 0; resume = null; state = { phase: 'idle', done: 0, total: 0 }; }
