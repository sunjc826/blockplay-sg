import type { ShopItem } from '../game/armory-catalog';
import type { ArmoryProfile } from '../game/armory-state';
import type { LoadoutTarget } from '../game/loadout-store';
import { loadoutComparison, type ComparisonRow } from '../game/loadout-comparison';

const format = (value: number | string | undefined, row: ComparisonRow) => value === undefined ? '—' : typeof value === 'number' ? `${value.toFixed(row.digits ?? 0)}${row.unit ?? ''}` : value;
function Change({ row }: { row: ComparisonRow }) {
  if (row.current === undefined) return null;
  if (typeof row.current !== 'number' || typeof row.preview !== 'number') {
    return row.current === row.preview ? null : <small className={`loadout-delta ${row.direction ? row.direction > 0 ? 'better' : 'worse' : ''}`}>{row.direction ? row.direction > 0 ? 'Improved' : 'Reduced' : 'Changed'}</small>;
  }
  const delta = Number((row.preview - row.current).toFixed(row.digits ?? 0));
  const good = row.lower ? delta < 0 : delta > 0;
  return <small className={`loadout-delta ${delta && !row.neutral ? good ? 'better' : 'worse' : ''}`}>{delta ? `${delta > 0 ? '+' : ''}${format(delta, row)}` : 'No change'}</small>;
}
export default function LoadoutComparison({ item, profile, target }: { item: ShopItem; profile: ArmoryProfile; target: LoadoutTarget }) {
  const { groups, worn, error } = loadoutComparison(profile, item, target);
  if (!groups.length) return null;
  return <section className="loadout-stack" aria-label="Equipment comparison">
    <table className="loadout-comparison"><caption>Compared with your equipped {worn?.name ?? 'empty slot'}. Changes are shown below each preview value.</caption><thead><tr><th scope="col">Specification</th><th scope="col">Current</th><th scope="col">Preview</th></tr></thead>
      {groups.map(group => <tbody key={group.label}><tr className="loadout-comparison-group"><th colSpan={3} scope="rowgroup">{group.label}</th></tr>{group.rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{format(row.current, row)}</td><td>{format(row.preview, row)}<Change row={row} /></td></tr>)}</tbody>)}
    </table>
    <small>{error ? `Carried-load preview unavailable: ${error}` : 'Includes slotted weapons, armor, full ammunition and packed supplies. Gear in your locker adds no weight. Movement compares holding the weapon in this slot; for armor and vision, it uses your main weapon.'}</small>
  </section>;
}
