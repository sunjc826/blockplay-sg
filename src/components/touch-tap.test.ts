import { describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { tapProps } from './touch-tap';

const target = (disabled = false) => ({ disabled }) as unknown as HTMLButtonElement;
const down = (currentTarget: HTMLElement, pointerType: string) => ({ currentTarget, pointerType }) as React.PointerEvent<HTMLElement>;
const click = (currentTarget: HTMLElement) => ({ currentTarget }) as React.MouseEvent<HTMLElement>;

describe('tapProps', () => {
  it('acts on any finger touching down, once, even when the browser follows up with a click', () => {
    const action = vi.fn(), button = target(), props = tapProps(action);
    // A second finger: the browser sends no click at all, and the press still lands.
    props.onPointerDown(down(button, 'touch'));
    expect(action).toHaveBeenCalledTimes(1);
    // A first finger: the synthesised click after it is not a second press.
    props.onClick(click(button));
    expect(action).toHaveBeenCalledTimes(1);
  });
  it('leaves the mouse and the keyboard to the click', () => {
    const action = vi.fn(), button = target(), props = tapProps(action);
    props.onPointerDown(down(button, 'mouse'));
    expect(action).not.toHaveBeenCalled();
    props.onClick(click(button));
    expect(action).toHaveBeenCalledTimes(1);
  });
  it('ignores a disabled control', () => {
    const action = vi.fn(), props = tapProps(action);
    props.onPointerDown(down(target(true), 'touch'));
    expect(action).not.toHaveBeenCalled();
  });
});
