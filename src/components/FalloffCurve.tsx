import { useId, useState } from 'react';
import { CURVE_MAX_RANGE, curveRanges, falloffCurve, shotBands, STOCK_OPPONENT } from '../game/armory-balance';
import type { EquippedWeapon } from '../game/armory-state';

/**
 * Damage against range for the previewed weapon and the one already equipped,
 * over bands showing how many hits each damage level needs. The bands are the
 * point: a tier is only felt where the curve crosses into a lower one.
 *
 * Two validated categorical slots on this panel's dark surface, carried by a
 * legend and an end-of-line label as well as by hue.
 */
const SERIES = ['#3987e5', '#d95926'];
const SURFACE = '#131c1d';
const WIDTH = 320, HEIGHT = 156;
const PAD = { top: 12, right: 52, bottom: 22, left: 30 };
const PLOT = { w: WIDTH - PAD.left - PAD.right, h: HEIGHT - PAD.top - PAD.bottom };

export default function FalloffCurve({ weapon, equipped }: { weapon: EquippedWeapon; equipped: EquippedWeapon }) {
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const ranges = curveRanges();
  const preview = falloffCurve(weapon, STOCK_OPPONENT, ranges);
  const current = falloffCurve(equipped, STOCK_OPPONENT, ranges);
  // One line when the previewed item is the one already in hand: a lone series
  // needs no legend, and two identical lines would just read as a thicker one.
  const same = weapon.name === equipped.name;
  const series = same ? [{ name: weapon.name, points: preview, color: SERIES[0] }]
    : [{ name: weapon.name, points: preview, color: SERIES[0] }, { name: equipped.name, points: current, color: SERIES[1] }];

  const peak = Math.max(...preview.map(p => p.damage), ...current.map(p => p.damage));
  const top = Math.max(20, Math.ceil(peak / 10) * 10);
  const x = (range: number) => PAD.left + (range / CURVE_MAX_RANGE) * PLOT.w;
  const y = (damage: number) => PAD.top + PLOT.h - (Math.min(damage, top) / top) * PLOT.h;
  const path = (points: { range: number; damage: number }[]) =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(p.range).toFixed(1)} ${y(p.damage).toFixed(1)}`).join(' ');
  // Low damage means many hits, which means many bands too thin to label. Draw
  // and label only the ones with room, and summarise the rest as one floor.
  const all = shotBands(STOCK_OPPONENT, top);
  const bands = all.filter(band => y(band.from) - y(Math.min(band.to, top)) >= 9);
  const crowded = all.filter(band => !bands.includes(band));
  const floorShots = crowded.length ? Math.min(...crowded.map(band => band.shots)) : null;

  const at = hover === null ? null : Math.max(0, Math.min(ranges.length - 1, hover));
  const readout = at === null ? null : { range: ranges[at], rows: series.map(s => ({ ...s, point: s.points[at] })) };
  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const local = ((event.clientX - box.left) / box.width) * WIDTH;
    setHover(Math.round(((local - PAD.left) / PLOT.w) * CURVE_MAX_RANGE / 2));
  };

  return <figure className="armory-curve" aria-labelledby={titleId}>
    <figcaption id={titleId}>{readout ? `Damage at ${readout.range} m · stock 100 hp target` : 'Damage against range · stock 100 hp target'}</figcaption>
    {/* The legend doubles as the hover readout, so a tooltip never covers the
        lines or their labels, and identity is never carried by hue alone. */}
    <div className="armory-curve-legend">
      {(readout ? readout.rows : series.map(s => ({ ...s, point: null }))).map(row => <span key={row.name}>
        <i style={{ background: row.color }} aria-hidden="true" />{row.name}
        {row.point && <b>{row.point.damage} dmg · {row.point.shots} hits</b>}
      </span>)}
    </div>
    <div className="armory-curve-plot">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Damage against range for ${series.map(s => s.name).join(' and ')}, over hits-to-kill bands against a stock 100 hit point target.`}
        onPointerMove={move} onPointerLeave={() => setHover(null)}>
        {bands.map((band, i) => {
          const upper = y(Math.min(band.to, top)), lower = y(band.from);
          return <g key={band.shots}>
            <rect x={PAD.left} y={upper} width={PLOT.w} height={Math.max(0, lower - upper)}
              fill={i % 2 ? '#ffffff' : '#000000'} opacity={i % 2 ? .035 : .12} />
            <line x1={PAD.left} x2={PAD.left + PLOT.w} y1={upper} y2={upper} stroke="#ffffff" strokeOpacity=".09" />
            <text x={PAD.left + PLOT.w + 6} y={Math.min(lower - 3, upper + 11)} className="armory-curve-band">{band.shots} hits</text>
          </g>;
        })}
        {floorShots !== null && <text x={PAD.left + PLOT.w + 6} y={PAD.top + PLOT.h - 2} className="armory-curve-band">{floorShots}+ hits</text>}
        <line x1={PAD.left} x2={PAD.left + PLOT.w} y1={PAD.top + PLOT.h} y2={PAD.top + PLOT.h} stroke="#ffffff" strokeOpacity=".22" />
        {[0, top / 2, top].map(value => <text key={value} x={PAD.left - 6} y={y(value) + 3} className="armory-curve-axis" textAnchor="end">{Math.round(value)}</text>)}
        {[0, 40, 80, 120].map(range => <text key={range} x={x(range)} y={HEIGHT - 7} className="armory-curve-axis" textAnchor="middle">{range}m</text>)}
        {series.map(s => <path key={s.name} d={path(s.points)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {series.map(s => <text key={s.name} x={PAD.left + 4} y={y(s.points[0].damage) - 5}
          className="armory-curve-tag" fill={s.color} stroke={SURFACE} strokeWidth="3" paintOrder="stroke">{s.name.split('·').pop()!.trim()}</text>)}
        {at !== null && <g pointerEvents="none">
          <line x1={x(ranges[at])} x2={x(ranges[at])} y1={PAD.top} y2={PAD.top + PLOT.h} stroke="#ffffff" strokeOpacity=".35" strokeDasharray="2 2" />
          {series.map(s => <circle key={s.name} cx={x(ranges[at])} cy={y(s.points[at].damage)} r="4" fill={s.color} stroke={SURFACE} strokeWidth="2" />)}
        </g>}
      </svg>
    </div>
    <table className="armory-curve-table">
      <caption>Damage and hits to kill against a stock 100 hp target</caption>
      <thead><tr><th scope="col">Range</th>{series.map(s => <th scope="col" key={s.name}>{s.name}</th>)}</tr></thead>
      <tbody>{ranges.filter((_, i) => i % 10 === 0).map((range, row) => <tr key={range}>
        <th scope="row">{range} m</th>
        {series.map(s => <td key={s.name}>{s.points[row * 10].damage} damage, {s.points[row * 10].shots} hits</td>)}
      </tr>)}</tbody>
    </table>
  </figure>;
}
