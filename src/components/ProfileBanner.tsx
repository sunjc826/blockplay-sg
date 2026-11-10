import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Coins, Gem } from 'lucide-react';
import type { ArmoryStore } from '../game/use-armory';
import { ARMORY_CATALOG } from '../game/armory-catalog';
import { levelSkip, progression } from '../game/progression';
import { rankInsignia } from '../game/rank-insignia';
import RankBadge from './RankBadge';
import { MenuButton } from './MenuControls';
import { playMenuSound } from '../lib/menu-audio';
import { prepareStoreAudio, storeWithAudio } from '../lib/store-audio';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** One rank/CR/TK readout across menu layouts and equipment screens. */
export default function ProfileBanner({ store: sourceStore }: { store: ArmoryStore }) {
  const store = storeWithAudio(sourceStore), { profile } = store;
  const root = useRef<HTMLDivElement>(null), account = useRef<HTMLDetailsElement>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const level = progression(profile.xp), rank = rankInsignia(level.level, profile.rankSet);
  const skip = levelSkip(profile.xp);
  const nextUnlocks = ARMORY_CATALOG.filter(item => (item.requiredLevel ?? 0) > level.level);
  const nextLevel = Math.min(...nextUnlocks.map(item => item.requiredLevel!));
  const unlockNote = level.level >= 50 ? 'Maximum level reached · all equipment level requirements met.' : nextUnlocks.length ? `Level ${nextLevel} unlocks: ${nextUnlocks.filter(item => item.requiredLevel === nextLevel).map(item => item.name).join(' · ')}` : 'All equipment level requirements met.';
  const act = (action: () => boolean) => { action(); setShowFeedback(true); };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (account.current?.open && event.target instanceof Node && !root.current?.contains(event.target)) account.current.open = false;
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  const rankLabel = `${rank.label}, level ${level.level}, ${level.xp.toLocaleString('en')} XP`;
  const rankContent = <>
    <span className="game-rank" aria-hidden="true"><RankBadge insignia={rank} size={28} /></span>
    <span className="game-rank-copy"><strong>{rank.label}</strong><small>LV {level.level}<span className="game-profile-xp"> · {level.xp.toLocaleString('en')} XP</span></small></span>
  </>;
  return <div ref={root} className="game-profile profile-banner" role="group" aria-label="Rank and currencies" onKeyDown={event => {
    if (event.key === 'Escape' && account.current?.open) {
      event.preventDefault(); event.stopPropagation(); account.current.open = false;
      account.current.querySelector('summary')?.focus();
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) event.stopPropagation();
  }} onBlur={event => {
    if (account.current?.open && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) account.current.open = false;
  }}>
    <details ref={account} className="loadout-account profile-banner-account" onToggle={event => {
      if (event.currentTarget.open) prepareStoreAudio(); else setShowFeedback(false);
    }}>
      <summary className="profile-banner-rank" aria-label={`${rankLabel}. Account details`} onClick={() => playMenuSound('click')}>{rankContent}<ChevronDown className="profile-banner-chevron" size={12} aria-hidden="true" /></summary>
      <div className="profile-banner-panel">
        <h2>Rank & demo wallet</h2>
        <div className="profile-banner-rank-detail"><RankBadge insignia={rank} size={36} /><strong>{rank.label}</strong></div>
        <p>{level.xp.toLocaleString('en')} XP{level.level < 50 ? ` / ${level.next.toLocaleString('en')} XP` : ' · Maximum level reached'}</p>
        <progress value={level.progress} max={1} aria-label={level.level >= 50 ? 'Maximum level reached' : 'Progress to next level'} />
        <p>{unlockNote}</p>
        {!skip.atMax && <MenuButton data-store-outcome data-account-action="level" disabled={profile.tokens < skip.price} onClick={() => act(store.buyLevel)}>Skip to level {skip.next} · {skip.price.toLocaleString('en')} tokens</MenuButton>}
        <MenuButton data-store-outcome data-account-action="credits" onClick={() => act(store.demoCreditTopUp)}>+1,000 demo credits</MenuButton>
        <MenuButton data-store-outcome data-account-action="tokens" onClick={() => act(store.demoTopUp)}>+250 demo tokens</MenuButton>
        <small>Demo wallet · No real payments</small>
        {showFeedback && <p role="status">{store.saveError ? 'Browser storage is unavailable. Changes last for this session only.' : store.message}</p>}
      </div>
    </details>
    {([{ key: 'credits', label: 'Credits', unit: 'CR', Icon: Coins }, { key: 'tokens', label: 'Tokens', unit: 'TK', Icon: Gem }] as const).map(({ key, label, unit, Icon }) => {
      const value = profile[key], full = value.toLocaleString('en');
      return <span key={key} className={`game-wallet profile-banner-${key}`} role="group" title={`${full} ${label.toLowerCase()}`} aria-label={`${label}: ${full}`}>
        <Icon size={14} aria-hidden="true" />
        <b data-testid={key} aria-hidden="true"><span className="profile-banner-full">{full}</span><span className="profile-banner-compact">{value >= 10000 ? compact.format(value) : full}</span></b>
        <small aria-hidden="true">{unit}</small>
      </span>;
    })}
  </div>;
}
