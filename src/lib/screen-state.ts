import { useState, type Dispatch, type SetStateAction } from 'react';

// Browser-session UI memory only. Never stores a game engine or a saved run.
const screens = new Map<string, unknown>();
export function useScreenState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => screens.has(key) ? screens.get(key) as T : initial);
  const update: Dispatch<SetStateAction<T>> = next => setValue(previous => {
    const value = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
    screens.set(key, value); return value;
  });
  return [value, update];
}
