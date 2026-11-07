import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { resolveConfirmation, useConfirmation } from '../lib/navigation-guard';
import { useModalFocus } from '../lib/use-modal-focus';
import './navigation.css';

export default function NavigationConfirm() {
  const prompt = useConfirmation();
  const panel = useRef<HTMLDivElement>(null);
  useModalFocus(panel, !!prompt, () => resolveConfirmation(false));
  if (!prompt) return null;
  return createPortal(<div className="navigation-confirm-scrim"><div ref={panel} className="navigation-confirm" role="alertdialog" aria-modal="true" aria-labelledby="navigation-confirm-title" aria-describedby="navigation-confirm-detail" tabIndex={-1}>
    <h2 id="navigation-confirm-title">{prompt.title}</h2><p id="navigation-confirm-detail">{prompt.detail}</p>
    <div><button onClick={() => resolveConfirmation(false)}>Stay here</button><button className="confirm-leave" onClick={() => resolveConfirmation(true)}>{prompt.confirmLabel ?? 'Leave session'}</button></div>
  </div></div>, document.fullscreenElement ?? document.body);
}
