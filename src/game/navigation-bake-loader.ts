import assets from 'virtual:navigation-assets';
import { validNavigationBake, type NavigationBake } from './navigation-bake';

/** One district per load, alongside models. A failed fetch retains lazy planning. */
export async function loadNavigationBake(id: string): Promise<NavigationBake | undefined> {
  const url = assets[id];
  if (!url) return undefined;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return undefined;
    const value: unknown = await response.json();
    return validNavigationBake(value) ? value : undefined;
  } catch { return undefined; }
}
