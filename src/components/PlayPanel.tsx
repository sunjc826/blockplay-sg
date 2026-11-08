import { Menu } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { tapProps } from './touch-tap';
import './play-panel.css';

const isDirectPointer = (type: string) => type === 'touch' || type === 'pen';

/** Open World's session layout, with the next action first when play is paused. */
export function PlayPanel({ label, paused, primary, navigation, children, details, className = '', overlayClassName = '', debug = false }: {
  label: string;
  paused: boolean;
  primary: ReactNode;
  navigation?: ReactNode;
  children: ReactNode;
  details?: ReactNode;
  className?: string;
  overlayClassName?: string;
  debug?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  const touchedButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!paused || debug) return;
    const frame = requestAnimationFrame(() => {
      const resume = panel.current?.querySelector<HTMLButtonElement>('.pause-resume:not(:disabled)');
      if (resume?.getClientRects().length) resume.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [paused, debug]);
  return <div className={`fps-overlay ${debug ? '' : 'play-panel-overlay'} ${overlayClassName}`}>
    <section ref={panel} aria-label={label} className={`fps-start-card ${debug ? '' : 'play-panel'} ${className}${paused ? ' is-paused-menu' : ''}`}
      onPointerDownCapture={event => {
        touchedButton.current = isDirectPointer(event.pointerType) ? (event.target as Element).closest('button') : null;
      }}
      onPointerCancelCapture={() => { touchedButton.current = null; }}
      onClickCapture={event => {
        const button = (event.target as Element).closest('button');
        // Menu acts on touch-down. A browser can send that touch's click to the newly mounted Resume.
        if (button && isDirectPointer((event.nativeEvent as PointerEvent).pointerType) && touchedButton.current !== button) {
          event.preventDefault();
          event.stopPropagation();
        }
        touchedButton.current = null;
      }}>
      {paused && primary}
      {navigation}
      {children}
      {!paused && primary}
      {details}
    </section>
  </div>;
}

export function PlayMenuButton({ onMenu, compact = false }: { onMenu: () => void; compact?: boolean }) {
  return <button type="button" className={`play-menu-button${compact ? ' is-compact' : ''}`} aria-label="Menu"
    data-touch-action={compact ? 'menu' : undefined} {...tapProps(onMenu)}><Menu size={17} /><span>Menu</span></button>;
}
