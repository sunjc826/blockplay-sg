import { createProfile, restoreProfile, STORAGE_KEY } from './armory-state';

/** Fixed for the lifetime of a mounted game, including its pagehide and disposal callbacks. */
export function profileScope(sandbox = false) {
  const key = sandbox ? STORAGE_KEY+'.streamer' : STORAGE_KEY;
  return {
    key,
    load() { try { return restoreProfile(localStorage.getItem(key)); } catch { return createProfile(); } },
    save(profile: ReturnType<typeof createProfile>) { localStorage.setItem(key,JSON.stringify(profile)); },
  };
}
