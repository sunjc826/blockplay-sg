import type { CSSProperties } from 'react';
import type { FpsHud } from '../game/fps-engine';
import { LOOT_TIER_COLORS, type LootStat } from '../game/loot-focus';

const statsList = (stats: LootStat[]) => <dl>{stats.map(stat => <div key={stat.label} data-trend={stat.trend}>
  <dt>{stat.label}</dt><dd>{stat.value}{stat.trend && <span aria-label={stat.trend === 'up' ? 'better' : 'worse'}>{stat.trend === 'up' ? '▲' : '▼'}</span>}</dd>
</div>)}</dl>;

/**
 * The card beside the crosshair for the item being looked at: what it is, how
 * it compares with what is carried, and what E does with it. Keyed by item, so
 * looking from one crate to the next plays the entrance again.
 */
export default function FpsLootCard({ hud, touch }: { hud: FpsHud; touch: boolean }) {
  const card = hud.lootCard;
  if (!card) return null;
  const style = { '--tier': LOOT_TIER_COLORS[card.tier] ?? LOOT_TIER_COLORS.Issued } as CSSProperties;
  return <aside key={card.id} className="fps-loot-card" style={style} data-kind={card.kind} data-blocked={card.blocked ? true : undefined} aria-live="polite" aria-label={`${card.tier} ${card.name}`}>
    <header>
      <span className="fps-loot-tier">{card.tier}<i aria-hidden="true" />{card.type}</span>
      <strong>{card.name}</strong>
    </header>
    {card.description && <p>{card.description}</p>}
    {card.stats.length > 0 && statsList(card.stats)}
    {card.note && <small className="fps-loot-note">{card.note}</small>}
    <footer>
      {card.blocked ? <span className="fps-loot-blocked">{card.blocked}</span>
        : <span className="fps-loot-action">{!touch && <kbd>E</kbd>}{card.action}</span>}
      {card.detail && <small>{card.detail}</small>}
    </footer>
    {card.swap && <section className="fps-loot-swap" aria-label="Swap inserts preview">
      <span className="fps-loot-note">Swap to this set</span>
      {statsList(card.swap.stats)}
      <small className="fps-loot-note">{card.swap.note}</small>
      <footer>
        <span className="fps-loot-action">{!touch && <kbd>I</kbd>}Swap inserts</span>
        <small>{card.swap.detail}</small>
      </footer>
    </section>}
  </aside>;
}
