import type { WeaponTerm } from './weapon-rentals';
import type { RaiderBounty } from './combat-rewards';
import { useCallback, useEffect, useRef, useState } from 'react';
import { discardRental, spendRentalTime, expireRentals, selectCarryWeapon, chooseEncikTone, chooseRankSet, claimReward, claimElimination, consumeItem, createProfile, equip, purchase, purchaseFromVendor, purchaseLevel, restoreProfile, STORAGE_KEY, type ArmoryProfile, type ExerciseReward } from './armory-state';
import type { MotorVehicleKind } from './vehicle-rules';
import { getRankSet } from './rank-insignia';
import type { EncikTone } from './encik-registers';

export function useArmory() {
  const [profile, setProfile] = useState<ArmoryProfile>(() => { try { return restoreProfile(localStorage.getItem(STORAGE_KEY)); } catch { return createProfile(); } });
  const current = useRef(profile); current.current = profile;
  const [message, setMessage] = useState(''), [saveError, setSaveError] = useState(false);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); setSaveError(false); } catch { setSaveError(true); } }, [profile]);
  const update = useCallback((next: ArmoryProfile) => { current.current = next; setProfile(next); }, []);
  useEffect(() => {
    const check = () => {
      const next = expireRentals(current.current);
      if (next !== current.current) { update(next); setMessage('Weapon rental expired. Issued gear is ready; renew in the armory.'); }
    };
    const timer = window.setInterval(check, 1000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [update]);
  const pendingRentalMs = useRef(0);
  const advanceRentalTime = useCallback((elapsedMs: number) => {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
    pendingRentalMs.current += elapsedMs;
    if (elapsedMs > 0 && pendingRentalMs.current < 1000) return;
    const spent = Math.floor(pendingRentalMs.current); pendingRentalMs.current -= spent;
    const next = spendRentalTime(current.current, spent);
    if (next !== current.current) update(next);
  }, [update]);
  useEffect(() => {
    const saveOnExit = () => {
      if (pendingRentalMs.current < 1) return;
      advanceRentalTime(0);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current.current)); } catch { /* Existing save error UI handles unavailable storage. */ }
    };
    window.addEventListener('pagehide', saveOnExit);
    return () => { saveOnExit(); window.removeEventListener('pagehide', saveOnExit); };
  }, [advanceRentalTime]);
  const discardWeaponRental = useCallback((id: string) => {
    const next = discardRental(current.current, id), changed = next !== current.current;
    update(next); setMessage(changed ? 'Rental discarded. Its remaining play time was removed; no currency refunded. Issued gear is ready.' : 'No active rental to discard.');
    return changed;
  }, [update]);
  const buy = useCallback((id: string, term?: WeaponTerm) => { const result = purchase(current.current, id, term); const changed = result.profile !== current.current; update(result.profile); setMessage(result.message); return changed; }, [update]);
  const buyFromVendor = useCallback((id: string, price?: number) => { const result = purchaseFromVendor(current.current, id, price); update(result.profile); setMessage(result.message); return result; }, [update]);
  const buyLevel = useCallback(() => { const result = purchaseLevel(current.current); const changed = result.profile !== current.current; update(result.profile); setMessage(result.message); return changed; }, [update]);
  const wearRankSet = useCallback((id: string) => { const next = chooseRankSet(current.current, id); if (next === current.current) return; update(next); setMessage(`Insignia set to ${getRankSet(id).name}.`); }, [update]);
  const setEncikTone = useCallback((tone: EncikTone) => { const next = chooseEncikTone(current.current, tone); if (next === current.current) return; update(next); setMessage(tone === 'recruit' ? 'Encik will treat you like a recruit, whatever your rank.' : 'Encik will follow your rank.'); }, [update]);
  const equipItem = useCallback((id: string, family: number, vehicle: MotorVehicleKind = 'car') => { const next = equip(current.current, id, family, vehicle); const changed = next !== current.current; update(next); setMessage(changed ? 'Equipped for your next exercise.' : 'Item must be owned or rented before equipping.'); return changed; }, [update]);
  const selectCarrySlot = useCallback((slot: 'main' | 'extra', family: number | null) => { const next = selectCarryWeapon(current.current, slot, family); const changed = next !== current.current; update(next); setMessage(changed ? 'Carry slots updated.' : 'That weapon cannot go in this slot.'); return changed; }, [update]);
  const award = useCallback((reward: ExerciseReward) => update(claimReward(current.current, reward)), [update]);
  const consume = useCallback((id: string) => update(consumeItem(current.current, id)), [update]);
  const awardElimination = useCallback((id: string, bounty?: RaiderBounty) => update(claimElimination(current.current, id, bounty)), [update]);
  const demoTopUp = useCallback(() => { const tokens = Math.min(1000000, current.current.tokens + 250); const changed = tokens !== current.current.tokens; update({ ...current.current, tokens }); setMessage('250 demo tokens added. No payment was made.'); return changed; }, [update]);
  const demoCreditTopUp = useCallback(() => {
    const credits = Math.min(1000000, current.current.credits + 1000), added = credits - current.current.credits;
    if (!added) { setMessage('Demo credits are already at the 1,000,000 CR cap.'); return false; }
    update({ ...current.current, credits }); setMessage(`${added.toLocaleString()} demo credits added. No payment was made.`); return true;
  }, [update]);
  return { profile, discardWeaponRental, advanceRentalTime, selectCarrySlot, buy, buyFromVendor, buyLevel, wearRankSet, setEncikTone, equipItem, award, awardElimination, consume, demoTopUp, demoCreditTopUp, message, saveError };
}
export type ArmoryStore = ReturnType<typeof useArmory>;
