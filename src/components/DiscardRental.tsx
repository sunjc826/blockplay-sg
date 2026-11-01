import { useState } from 'react';
import { rentalTimeLeft } from '../game/weapon-rentals';
import './rental-discard.css';

export default function DiscardRental({ name, remainingMs, onDiscard }: { name: string; remainingMs: number; onDiscard: () => boolean }) {
  const [confirming, setConfirming] = useState(false);
  return <div className="rental-discard">{confirming ? <>
    <p>Discard {name} with {rentalTimeLeft(remainingMs)}? All remaining play time will be removed. No refund.</p>
    <div><button type="button" autoFocus data-discard-confirm aria-label={`Confirm discard ${name}`} data-store-outcome onClick={() => { onDiscard(); setConfirming(false); }}>Discard rental</button><button type="button" onClick={() => setConfirming(false)}>Cancel</button></div>
  </> : <button type="button" data-discard-rental aria-label={`Discard rental ${name}`} onClick={() => setConfirming(true)}>Discard rental</button>}</div>;
}
