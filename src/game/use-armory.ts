import { useCallback, useEffect, useRef, useState } from 'react';
import { selectCarryWeapon, chooseEncikTone, chooseRankSet, claimReward, claimElimination, consumeItem, createProfile, equip, purchase, purchaseFromVendor, purchaseLevel, restoreProfile, STORAGE_KEY, type ArmoryProfile, type ExerciseReward } from './armory-state';
import type { VehicleKind } from './vehicle-rules';
import { getRankSet } from './rank-insignia';
import type { EncikTone } from './encik-registers';

export function useArmory() {
  const [profile, setProfile] = useState<ArmoryProfile>(() => { try { return restoreProfile(localStorage.getItem(STORAGE_KEY)); } catch { return createProfile(); } });
  const current = useRef(profile); current.current = profile;
  const [message, setMessage] = useState(''), [saveError, setSaveError] = useState(false);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); setSaveError(false); } catch { setSaveError(true); } }, [profile]);
  const update = useCallback((next: ArmoryProfile) => { current.current = next; setProfile(next); }, []);
  const buy = useCallback((id: string) => { const result = purchase(current.current, id); update(result.profile); setMessage(result.message); }, [update]);
  const buyFromVendor = useCallback((id: string, price?: number) => { const result = purchaseFromVendor(current.current, id, price); update(result.profile); setMessage(result.message); return result; }, [update]);
  const buyLevel = useCallback(() => { const result = purchaseLevel(current.current); update(result.profile); setMessage(result.message); }, [update]);
  const wearRankSet = useCallback((id: string) => { const next = chooseRankSet(current.current, id); if (next === current.current) return; update(next); setMessage(`Insignia set to ${getRankSet(id).name}.`); }, [update]);
  const setEncikTone = useCallback((tone: EncikTone) => { const next = chooseEncikTone(current.current, tone); if (next === current.current) return; update(next); setMessage(tone === 'recruit' ? 'Encik will treat you like a recruit, whatever your rank.' : 'Encik will follow your rank.'); }, [update]);
  const equipItem = useCallback((id: string, family: number, vehicle: VehicleKind = 'car') => { const next = equip(current.current, id, family, vehicle); const changed = next !== current.current; update(next); setMessage(changed ? 'Equipped for your next exercise.' : 'Item must be owned before equipping.'); }, [update]);
  const selectCarrySlot = useCallback((slot: 'main' | 'extra', family: number | null) => { const next = selectCarryWeapon(current.current, slot, family); const changed = next !== current.current; update(next); setMessage(changed ? 'Carry slots updated.' : 'That weapon cannot go in this slot.'); }, [update]);
  const award = useCallback((reward: ExerciseReward) => update(claimReward(current.current, reward)), [update]);
  const consume = useCallback((id: string) => update(consumeItem(current.current, id)), [update]);
  const awardElimination = useCallback((id: string) => update(claimElimination(current.current, id)), [update]);
  const demoTopUp = useCallback(() => { update({ ...current.current, tokens: Math.min(1000000, current.current.tokens + 250) }); setMessage('250 demo tokens added. No payment was made.'); }, [update]);
  return { profile, selectCarrySlot, buy, buyFromVendor, buyLevel, wearRankSet, setEncikTone, equipItem, award, awardElimination, consume, demoTopUp, message, saveError };
}
export type ArmoryStore = ReturnType<typeof useArmory>;
