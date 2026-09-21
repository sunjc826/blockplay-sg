import { expect, it, vi } from 'vitest';
import { createPwaStore, type PwaHost } from './pwa';

/** A window stand-in that records listeners so tests can fire browser events. */
function fakeWindow(standalone = false) {
  const listeners = new Map<string, ((event: Event) => void)[]>();
  const host: PwaHost = {
    addEventListener: (type, listener) => {
      listeners.set(type, [...(listeners.get(type) || []), listener]);
    },
    standalone: () => standalone,
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
  // The header button is the offer; the browser's own banner is suppressed.
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
  expect(store.snapshot()).toMatchObject({ canInstall: false, installed: true });
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
