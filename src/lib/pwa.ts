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
  /**
   * No install event will come, but the browser can still add the game to the
   * home screen by hand: Safari on iOS and iPadOS, through Share.
   */
  manualInstall: boolean;
  /**
   * Installed on this device, but this copy is open in a browser tab. A page
   * cannot open the app itself, so this can only point the way.
   */
  openInApp: boolean;
  /** A newer build finished caching and is waiting for a reload. */
  updateReady: boolean;
  updateCheck: 'idle' | 'checking' | 'current' | 'error' | 'unavailable';
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
  /** Whether this browser adds to the home screen from its own menu only. */
  manualInstall?(): boolean;
  /** The browser's list of this site's apps installed on the device, where it can tell. */
  installedApps?(): Promise<unknown[]>;
}

export type PwaStore = ReturnType<typeof createPwaStore>;

export function createPwaStore(host: PwaHost) {
  const installed = host.standalone();
  let state: PwaState = { canInstall: false, installed, manualInstall: !installed && (host.manualInstall?.() ?? false), openInApp: false, updateReady: false, updateCheck: 'idle' };
  let prompt: InstallPromptEvent | null = null;
  let activate: (() => void) | null = null;
  let checkUpdate: (() => Promise<void>) | null = null;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<PwaState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  host.addEventListener('beforeinstallprompt', event => {
    // Suppress the browser's own banner: the menu's install card is the offer,
    // and it does not cover the game.
    event.preventDefault();
    prompt = event as InstallPromptEvent;
    set({ canInstall: true });
  });
  host.addEventListener('appinstalled', () => {
    prompt = null;
    // The new app window opens on its own, but this tab stays open behind it.
    set({ canInstall: false, manualInstall: false, openInApp: !installed });
  });
  // Chromium 140+ on desktop and Chrome on Android answer this from inside the
  // app's scope, using `related_applications` in the manifest; other browsers
  // have no way to know, and keep offering what they can.
  if (!installed) {
    void host.installedApps?.().then(apps => {
      if (apps.length && !state.canInstall) set({ manualInstall: false, openInApp: true });
    }, () => { /* not allowed here, e.g. outside a secure context */ });
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    snapshot: () => state,
    setUpdateChecker(check: () => Promise<void>) {
      checkUpdate = check;
    },
    async checkForUpdates() {
      if (state.updateCheck === 'checking' || state.updateReady) return;
      if (!checkUpdate) { set({ updateCheck: 'unavailable' }); return; }
      set({ updateCheck: 'checking' });
      try {
        await checkUpdate();
        set({ updateCheck: state.updateReady ? 'idle' : 'current' });
      } catch {
        set({ updateCheck: state.updateReady ? 'idle' : 'error' });
      }
    },
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
    // `navigator.standalone` exists only in iOS and iPadOS WebKit, where every
    // browser adds to the home screen through Share and none fires the event.
    manualInstall: () => 'standalone' in window.navigator,
    installedApps: async () => {
      const lookup = (window.navigator as { getInstalledRelatedApps?: () => Promise<unknown[]> }).getInstalledRelatedApps;
      return lookup ? lookup.call(window.navigator) : [];
    },
  };

export const pwa = createPwaStore(browserHost);

export function usePwa(store: PwaStore = pwa): PwaState {
  return useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
}

/** Check for a new build when a tab comes back after being left open. */
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;

/** An update check is not complete until any new worker has finished caching. */
export async function checkServiceWorkerUpdate(registration: ServiceWorkerRegistration) {
  let cleanup = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Update check timed out')), 60_000);
  });
  try {
    await Promise.race([registration.update(), timeout]);
    const worker = registration.installing;
    if (!worker) return;
    await Promise.race([new Promise<void>((resolve, reject) => {
      const changed = () => {
        if (worker.state === 'installed' || worker.state === 'activated') resolve();
        else if (worker.state === 'redundant') reject(new Error('Update installation failed'));
      };
      cleanup = () => worker.removeEventListener('statechange', changed);
      worker.addEventListener('statechange', changed);
      changed();
    }), timeout]);
  } finally {
    clearTimeout(timer);
    cleanup();
  }
}

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
      store.setUpdateChecker(async () => {
        // A previously downloaded update can be ready before this check starts.
        if (registration.waiting && container.controller) { offer(registration.waiting); return; }
        await checkServiceWorkerUpdate(registration);
        if (registration.waiting && container.controller) offer(registration.waiting);
      });
      let checked = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden || Date.now() - checked < UPDATE_CHECK_INTERVAL) return;
        checked = Date.now();
        void registration.update().catch(() => { /* Offline: try again next time. */ });
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
