/**
 * The list of shader programs a range load links, as the build records it
 * (`scripts/capture-shader-manifest.mjs`) and the menu replays it
 * (`shader-warm.ts`). No imports: the capture script loads this file in Node.
 *
 * A lit program is about 76 KB of text and nearly all of it is three's stock
 * chunks, the same in every program. Each distinct line is therefore stored
 * once, and a shader is the runs of consecutive lines it is made of.
 */
export interface ShaderManifest {
  version: 1;
  /** Changes whenever any program does; the menu skips a list it already compiled. */
  id: string;
  /** Extensions the game's renderer enables, which the replaying context enables too. */
  extensions: string[];
  lines: string[];
  /** Per shader: `[first line, count, first line, count, ...]`. */
  shaders: number[][];
  /** Per program: its vertex and fragment shader. */
  programs: [vertex: number, fragment: number][];
}

export interface ShaderPair { vertex: string; fragment: string }

/** Programs with the same two sources are stored once. */
export function packShaders(pairs: readonly ShaderPair[], extensions: readonly string[] = []): ShaderManifest {
  const lines: string[] = [], lineIndex = new Map<string, number>();
  const shaders: number[][] = [], shaderIndex = new Map<string, number>();
  const programs: [number, number][] = [], seen = new Set<string>();
  const shader = (source: string) => {
    const known = shaderIndex.get(source);
    if (known !== undefined) return known;
    const runs: number[] = [];
    for (const text of source.split('\n')) {
      let line = lineIndex.get(text);
      if (line === undefined) { line = lines.length; lines.push(text); lineIndex.set(text, line); }
      const last = runs.length - 2;
      if (last >= 0 && runs[last] + runs[last + 1] === line) runs[last + 1]++;
      else runs.push(line, 1);
    }
    shaderIndex.set(source, shaders.length); shaders.push(runs);
    return shaders.length - 1;
  };
  for (const pair of pairs) {
    const program: [number, number] = [shader(pair.vertex), shader(pair.fragment)], key = program.join(':');
    if (seen.has(key)) continue;
    seen.add(key); programs.push(program);
  }
  const used = [...new Set(extensions)].sort();
  return { version: 1, id: hashText(JSON.stringify([used, lines, shaders, programs])), extensions: used, lines, shaders, programs };
}

export function unpackShader(manifest: ShaderManifest, index: number): string {
  const runs = manifest.shaders[index], out: string[] = [];
  for (let i = 0; i < runs.length; i += 2) for (let line = runs[i], end = line + runs[i + 1]; line < end; line++) out.push(manifest.lines[line]);
  return out.join('\n');
}

/** Rejects anything that is not a manifest, such as the app shell a missing file falls back to. */
export function isShaderManifest(value: unknown): value is ShaderManifest {
  const manifest = value as ShaderManifest | null;
  return !!manifest && manifest.version === 1 && typeof manifest.id === 'string'
    && Array.isArray(manifest.extensions) && Array.isArray(manifest.lines) && Array.isArray(manifest.shaders) && Array.isArray(manifest.programs)
    && manifest.programs.every(program => Array.isArray(program) && program.length === 2 && program.every(index => Number.isInteger(index) && index >= 0 && index < manifest.shaders.length));
}

/** FNV-1a, twice with different seeds: an identity for a list, not a security boundary. */
function hashText(text: string) {
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193); b = Math.imul(b ^ code, 0x85ebca6b);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
