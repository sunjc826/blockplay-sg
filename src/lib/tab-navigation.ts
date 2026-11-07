import type { KeyboardEvent } from 'react';

/** Roving focus shared by Store and Inventory; Settings uses the same keys. */
export function tabNavigation(event: KeyboardEvent<HTMLElement>, select: (index: number) => void) {
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const at = tabs.indexOf(document.activeElement as HTMLButtonElement);
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
    : event.key === 'ArrowRight' ? (at + 1) % tabs.length : event.key === 'ArrowLeft' ? (at - 1 + tabs.length) % tabs.length : -1;
  if (index < 0) return;
  event.preventDefault(); select(index); tabs[index]?.focus(); tabs[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
