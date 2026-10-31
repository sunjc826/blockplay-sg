import manifest from '../audio/sfx/manifest.json';

/**
 * Recorded sound effects (ElevenLabs takes, see scripts/sfx-batch.mjs), decoded once per AudioContext.
 * Each group holds several takes; `pick` rotates through them so no take plays twice running.
 * Until a group has loaded, or if it never does, `pick` returns null and callers fall back to synthesis.
 */
export type SfxGroup = keyof typeof manifest.groups;
export const SFX_GROUPS = Object.keys(manifest.groups) as SfxGroup[];

export function sfxUrls(group: SfxGroup, base = import.meta.env.BASE_URL) {
  return manifest.groups[group].map(clip => `${base}audio/sfx/${clip.file}`);
}

export function createSfxBank(fetcher: typeof fetch = fetch, random = Math.random) {
  const buffers = new Map<SfxGroup, AudioBuffer[]>(), last = new Map<SfxGroup, AudioBuffer>();
  let owner: BaseAudioContext | null = null;
  return {
    /** Starts fetching every group for this context; a new context starts over. Failures leave the group empty. */
    load(context: BaseAudioContext) {
      if (owner === context) return;
      owner = context; buffers.clear(); last.clear();
      for (const group of SFX_GROUPS) {
        void Promise.all(sfxUrls(group).map(async url => {
          try {
            const response = await fetcher(url);
            return response.ok ? await context.decodeAudioData(await response.arrayBuffer()) : null;
          } catch { return null; }
        })).then(decoded => {
          const loaded = decoded.filter((b): b is AudioBuffer => !!b);
          if (owner === context && loaded.length) buffers.set(group, loaded);
        });
      }
    },
    /** A take from the group, never the one it gave last, or null while none has loaded. */
    pick(group: SfxGroup): AudioBuffer | null {
      const takes = buffers.get(group); if (!takes?.length) return null;
      const choices = takes.length > 1 ? takes.filter(b => b !== last.get(group)) : takes;
      const buffer = choices[Math.floor(random() * choices.length)]; last.set(group, buffer);
      return buffer;
    },
    /** A consistent reference take, for weapons whose timbre must not change every shot. */
    get(group: SfxGroup, index = 0): AudioBuffer | null {
      const takes = buffers.get(group);
      return takes?.[index] ?? takes?.[0] ?? null;
    },
    dispose() { owner = null; buffers.clear(); last.clear(); },
  };
}
export type SfxBank = ReturnType<typeof createSfxBank>;
