/**
 * Install and update state for the installable app.
 *
 * The browser fires `beforeinstallprompt` before React has mounted, so the
 * store is created at import time and the UI subscribes to it afterwards. The
 * factory takes its window as an argument so the wiring can be tested.
 */
import { useSyncExternalStore } from 'react';

export interface PwaState {
  /** The browser offered an install prompt that has not been used yet. */
  canInstall: boolean;
  /** Already running from the home screen or an app window. */
  installed: boolean;
  /** A newer build finished caching and is waiting for a reload. */
  updateReady: boolean;
}

/** Chromium's install prompt; not in the DOM types because it is not standard. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaHost {
  addEventListener(type: string, listener: (event: Event) => void): void;
  /** Whether the app is being displayed as an installed app right now. */
  standalone(): boolean;
}

export type PwaStore = ReturnType<typeof createPwaStore>;

export function createPwaStore(host: PwaHost) {
  let state: PwaState = { canInstall: false, installed: host.standalone(), updateReady: false };
  let prompt: InstallPromptEvent | null = null;
  let activate: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<PwaState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  host.addEventListener('beforeinstallprompt', event => {
    // Suppress the browser's own banner: the header button is the offer, and it
    // does not cover the game.
    event.preventDefault();
    prompt = event as InstallPromptEvent;
    set({ canInstall: true });
  });
  host.addEventListener('appinstalled', () => {
    prompt = null;
    set({ canInstall: false, installed: true });
  });

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    snapshot: () => state,
    /** Shows the browser's install dialog. A prompt can only be used once. */
    async install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
      const pending = prompt;
      if (!pending) return 'unavailable';
      prompt = null;
      set({ canInstall: false });
      await pending.prompt();
      const { outcome } = await pending.userChoice;
      // A dismissal is not a refusal forever, but this event is spent; the
      // browser fires a fresh one when it decides to offer again.
      return outcome;
    },
    /** Called by the registration when a new build has finished installing. */
    offerUpdate(apply: () => void) {
      activate = apply;
      set({ updateReady: true });
    },
    applyUpdate() {
      activate?.();
    },
  };
}

const browserHost: PwaHost = typeof window === 'undefined'
  ? { addEventListener() {}, standalone: () => false }
  : {
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    standalone: () => window.matchMedia?.('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true,
  };

export const pwa = createPwaStore(browserHost);

export function usePwa(store: PwaStore = pwa): PwaState {
  return useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
}

/** Check for a new build when a tab comes back after being left open. */
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;

/**
 * Registers the worker built by `scripts/service-worker-plugin.mjs`. Production
 * only: in development Vite serves unbundled modules, and a cache in front of
 * them is nothing but confusion.
 */
export function registerServiceWorker(store: PwaStore = pwa) {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const container = navigator.serviceWorker;
  let reloading = false;
  window.addEventListener('load', () => {
    void container.register('/sw.js').then(registration => {
      const offer = (worker: ServiceWorker) => store.offerUpdate(() => {
        reloading = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
      });
      // Only an update has something to offer: on a first visit the worker
      // installs into an uncontrolled page and there is nothing to reload for.
      if (registration.waiting && container.controller) offer(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && container.controller) offer(installing);
        });
      });
      let checked = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden || Date.now() - checked < UPDATE_CHECK_INTERVAL) return;
        checked = Date.now();
        void registration.update();
      });
    }).catch(() => {
      // An unavailable worker costs offline play, not the game; stay quiet.
    });
  });
  // Fires on the first install too, when the new worker claims this page —
  // reload only for an update the player asked to apply.
  container.addEventListener('controllerchange', () => {
    if (!reloading) return;
    reloading = false;
    window.location.reload();
  });
}
