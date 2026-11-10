import { expect, it, vi } from 'vitest';
import { activateServiceWorkerUpdate, checkServiceWorkerUpdate, createPwaStore, type PwaHost } from './pwa';

/** A window stand-in that records listeners so tests can fire browser events. */
function fakeWindow(standalone = false, manualInstall = false, installedApps?: () => Promise<unknown[]>) {
  const listeners = new Map<string, ((event: Event) => void)[]>();
  const host: PwaHost = {
    addEventListener: (type, listener) => {
      listeners.set(type, [...(listeners.get(type) || []), listener]);
    },
    standalone: () => standalone,
    manualInstall: () => manualInstall,
    installedApps,
  };
  return { host, fire: (type: string, event: object) => listeners.get(type)?.forEach(listener => listener(event as Event)) };
}

const installPrompt = (outcome: 'accepted' | 'dismissed') => ({
  preventDefault: vi.fn(),
  prompt: vi.fn(async () => {}),
  userChoice: Promise.resolve({ outcome }),
});

it('offers an install once the browser says the app qualifies', () => {
  const { host, fire } = fakeWindow();
  const store = createPwaStore(host);
  expect(store.snapshot().canInstall).toBe(false);

  const changes = vi.fn();
  store.subscribe(changes);
  const event = installPrompt('accepted');
  fire('beforeinstallprompt', event);

  expect(store.snapshot().canInstall).toBe(true);
  expect(changes).toHaveBeenCalledOnce();
  // The menu's card is the offer; the browser's own banner is suppressed.
  expect(event.preventDefault).toHaveBeenCalled();
});

it('knows it is already installed when it is running as one', () => {
  expect(createPwaStore(fakeWindow(true).host).snapshot()).toMatchObject({ installed: true, canInstall: false });
});

it('spends the prompt once and reports the choice', async () => {
  const { host, fire } = fakeWindow();
  const store = createPwaStore(host);
  const event = installPrompt('dismissed');
  fire('beforeinstallprompt', event);

  expect(await store.install()).toBe('dismissed');
  expect(event.prompt).toHaveBeenCalledOnce();
  // A used prompt cannot be shown again; the button goes away until the
  // browser offers a fresh one.
  expect(store.snapshot().canInstall).toBe(false);
  expect(await store.install()).toBe('unavailable');
  expect(event.prompt).toHaveBeenCalledOnce();
});

it('does nothing when asked to install without an offer', async () => {
  expect(await createPwaStore(fakeWindow().host).install()).toBe('unavailable');
});

it('drops the install offer once the app is installed', () => {
  const { host, fire } = fakeWindow();
  const store = createPwaStore(host);
  fire('beforeinstallprompt', installPrompt('accepted'));
  fire('appinstalled', {});
  // This tab is still a tab: the app opened in a window of its own.
  expect(store.snapshot()).toMatchObject({ canInstall: false, installed: false, openInApp: true });
});

it('waits for the player to accept an update instead of swapping the build', () => {
  const store = createPwaStore(fakeWindow().host);
  const activate = vi.fn();
  expect(store.snapshot().updateReady).toBe(false);

  store.offerUpdate(activate);
  expect(store.snapshot().updateReady).toBe(true);
  expect(activate).not.toHaveBeenCalled();

  store.applyUpdate();
  expect(activate).toHaveBeenCalledOnce();
});

it('stops notifying a component that has unsubscribed', () => {
  const { host, fire } = fakeWindow();
  const store = createPwaStore(host);
  const changes = vi.fn();
  store.subscribe(changes)();
  fire('beforeinstallprompt', installPrompt('accepted'));
  expect(changes).not.toHaveBeenCalled();
});

it('offers Share → Add to Home Screen where there is no install event', () => {
  expect(createPwaStore(fakeWindow(false, true).host).snapshot()).toMatchObject({ manualInstall: true, canInstall: false });
  // Opened from the home screen, there is nothing left to offer.
  expect(createPwaStore(fakeWindow(true, true).host).snapshot().manualInstall).toBe(false);
  expect(createPwaStore(fakeWindow().host).snapshot().manualInstall).toBe(false);
});

it('points to the installed app when the browser says it is on this device', async () => {
  const lookup = vi.fn(async () => [{ platform: 'webapp' }]);
  const store = createPwaStore(fakeWindow(false, true, lookup).host);
  await vi.waitFor(() => expect(store.snapshot()).toMatchObject({ openInApp: true, manualInstall: false, canInstall: false }));

  // Running as the app, there is nothing to point to and no need to ask.
  const asApp = vi.fn(async () => [{ platform: 'webapp' }]);
  expect(createPwaStore(fakeWindow(true, false, asApp).host).snapshot().openInApp).toBe(false);
  expect(asApp).not.toHaveBeenCalled();
});

it('keeps offering an install when the app is not found or the lookup fails', async () => {
  const none = createPwaStore(fakeWindow(false, false, async () => []).host);
  const failed = createPwaStore(fakeWindow(false, false, async () => { throw new Error('insecure'); }).host);
  await new Promise(resolve => setTimeout(resolve));
  expect(none.snapshot().openInApp).toBe(false);
  expect(failed.snapshot().openInApp).toBe(false);
});

it('checks on demand, ignores duplicate clicks, and reports the result', async () => {
  const store = createPwaStore(fakeWindow().host);
  let finish!: () => void;
  const check = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  store.setUpdateChecker(check);
  const pending = store.checkForUpdates();
  expect(store.snapshot().updateCheck).toBe('checking');
  await store.checkForUpdates();
  expect(check).toHaveBeenCalledOnce();
  finish(); await pending;
  expect(store.snapshot().updateCheck).toBe('current');
});

it('reports unavailable and failed checks and allows a retry', async () => {
  const store = createPwaStore(fakeWindow().host);
  await store.checkForUpdates();
  expect(store.snapshot().updateCheck).toBe('unavailable');
  store.setUpdateChecker(async () => { throw new Error('offline'); });
  await store.checkForUpdates();
  expect(store.snapshot().updateCheck).toBe('error');
  store.setUpdateChecker(async () => {});
  await store.checkForUpdates();
  expect(store.snapshot().updateCheck).toBe('current');
});

it('offers a discovered update without declaring it current or reloading', async () => {
  const store = createPwaStore(fakeWindow().host), apply = vi.fn();
  store.setUpdateChecker(async () => { store.offerUpdate(apply); });
  await store.checkForUpdates();
  expect(store.snapshot()).toMatchObject({ updateReady: true, updateCheck: 'idle' });
  expect(apply).not.toHaveBeenCalled();
  store.applyUpdate();
  expect(apply).toHaveBeenCalledOnce();
});

function fakeRegistration() {
  const worker = Object.assign(new EventTarget(), { state: 'installing' });
  const registration = { update: vi.fn(async () => {}), installing: worker };
  return { worker, registration: registration as unknown as ServiceWorkerRegistration };
}

it('waits for the worker to finish caching before completing a check', async () => {
  const { worker, registration } = fakeRegistration();
  const done = vi.fn();
  const checking = checkServiceWorkerUpdate(registration).then(done);
  await new Promise(resolve => setTimeout(resolve));
  expect(done).not.toHaveBeenCalled();
  worker.state = 'installed'; worker.dispatchEvent(new Event('statechange'));
  await checking;
  expect(done).toHaveBeenCalledOnce();
});

it('rejects failed installations instead of reporting up to date', async () => {
  const { worker, registration } = fakeRegistration();
  const checking = checkServiceWorkerUpdate(registration);
  const result = expect(checking).rejects.toThrow('installation failed');
  await new Promise(resolve => setTimeout(resolve));
  worker.state = 'redundant'; worker.dispatchEvent(new Event('statechange'));
  await result;
});

it('times out stalled checks and removes installation listeners', async () => {
  vi.useFakeTimers();
  try {
    const { worker, registration } = fakeRegistration();
    const remove = vi.spyOn(worker, 'removeEventListener');
    const result = expect(checkServiceWorkerUpdate(registration)).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(60_000);
    await result;
    expect(remove).toHaveBeenCalledWith('statechange', expect.any(Function));
  } finally { vi.useRealTimers(); }
});

function fakeActivation() {
  const previous = Object.assign(new EventTarget(), { state: 'activated' });
  const worker = Object.assign(new EventTarget(), { state: 'installed', postMessage: vi.fn() });
  const registration = { waiting: worker as typeof worker | null, active: previous };
  const container = Object.assign(new EventTarget(), { controller: previous });
  const apply = () => activateServiceWorkerUpdate(
    registration as unknown as ServiceWorkerRegistration,
    container as unknown as ServiceWorkerContainer,
    worker as unknown as ServiceWorker,
    previous as unknown as ServiceWorker,
  );
  const activate = () => {
    registration.waiting = null;
    registration.active = worker;
    worker.state = 'activated';
    container.controller = worker;
  };
  return { worker, previous, registration, container, apply, activate };
}

it('waits for acceptance and a new controller before completing activation', async () => {
  const f = fakeActivation(), done = vi.fn();
  const pending = f.apply().then(done);
  expect(f.worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  f.container.dispatchEvent(new Event('controllerchange'));
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();
  f.activate();
  f.container.dispatchEvent(new Event('controllerchange'));
  await pending;
  expect(done).toHaveBeenCalledOnce();
});

it('completes when another tab already activated the offered update', async () => {
  const f = fakeActivation();
  f.activate();
  await f.apply();
  expect(f.worker.postMessage).not.toHaveBeenCalled();
});

it('uses the latest waiting worker when an old offer was replaced', async () => {
  const f = fakeActivation();
  f.worker.state = 'redundant';
  const latest = Object.assign(new EventTarget(), { state: 'installed', postMessage: vi.fn() });
  f.registration.waiting = latest;
  const pending = f.apply();
  expect(latest.postMessage).toHaveBeenCalledOnce();
  expect(f.worker.postMessage).not.toHaveBeenCalled();
  latest.state = 'activated';
  f.registration.active = latest;
  latest.dispatchEvent(new Event('statechange'));
  await pending;
});

it('detects activation without a delivered controllerchange event', async () => {
  vi.useFakeTimers();
  try {
    const f = fakeActivation();
    const pending = f.apply();
    f.activate();
    await vi.advanceTimersByTimeAsync(250);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

it('unlocks a stalled update for retry and removes listeners and timers', async () => {
  vi.useFakeTimers();
  try {
    const f = fakeActivation(), store = createPwaStore(fakeWindow(true).host);
    const remove = vi.spyOn(f.container, 'removeEventListener');
    store.offerUpdate(f.apply);
    const pending = store.applyUpdate();
    expect(store.snapshot().updateApply).toBe('applying');
    await store.applyUpdate();
    expect(f.worker.postMessage).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(15_000);
    await pending;
    expect(store.snapshot()).toMatchObject({ updateReady: true, updateApply: 'error' });
    expect(remove).toHaveBeenCalledWith('controllerchange', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    f.activate();
    await store.applyUpdate();
    expect(store.snapshot().updateApply).toBe('applying');
  } finally { vi.useRealTimers(); }
});

it('recovers from a messaging exception without leaving the update disabled', async () => {
  const f = fakeActivation(), store = createPwaStore(fakeWindow().host);
  f.worker.postMessage.mockImplementation(() => { throw new Error('worker gone'); });
  store.offerUpdate(f.apply);
  await store.applyUpdate();
  expect(store.snapshot().updateApply).toBe('error');
});

it('rejects a redundant update instead of reloading the old build', async () => {
  const f = fakeActivation();
  f.registration.waiting = null;
  f.worker.state = 'redundant';
  await expect(f.apply()).rejects.toThrow('replaced');
});
