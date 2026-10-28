import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw } from 'lucide-react';
import { pwa, usePwa } from '../lib/pwa';
import './pwa-update-modal.css';

/** One update prompt for every route, including fullscreen games. */
export default function PwaUpdateModal() {
  const { updateReady } = usePwa();
  const dialog = useRef<HTMLDialogElement>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!updateReady) return;
    const modal = dialog.current!;
    // The native modal enters the top layer above fullscreen and makes the
    // rest of the page inert. Release the mouse so its action is reachable.
    if (document.pointerLockElement) document.exitPointerLock();
    modal.showModal();
    return () => { modal.close(); };
  }, [updateReady]);

  if (!updateReady) return null;
  return createPortal(<dialog ref={dialog} className="pwa-update-modal"
    aria-labelledby="pwa-update-title" aria-describedby="pwa-update-description"
    onCancel={event => event.preventDefault()}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Tab') {
        event.preventDefault();
        event.currentTarget.querySelector('button')?.focus();
      }
    }} onKeyUp={event => event.stopPropagation()}>
    <span className="pwa-update-icon"><RefreshCw size={26} aria-hidden="true" /></span>
    <span className="eyebrow">UPDATE AVAILABLE</span>
    <h2 id="pwa-update-title">A new version is ready.</h2>
    <p id="pwa-update-description">Update now to get the latest improvements. Reloading will end your current session. Your armory, credits and XP will stay saved on this device.</p>
    <button autoFocus type="button" disabled={applying} onClick={() => { setApplying(true); pwa.applyUpdate(); }}>
      <RefreshCw size={17} aria-hidden="true" />{applying ? 'Updating…' : 'Update & reload'}
    </button>
    <span className="pwa-update-status" role="status">{applying ? 'Applying the update. The app will reload shortly.' : ''}</span>
  </dialog>, document.body);
}
