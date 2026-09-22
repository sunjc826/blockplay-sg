import { useId, useState } from 'react';
import { recoilCurve, RECOIL_BURST, RECOIL_ROUNDS, targetArc, TARGET_RANGE, type RecoilPoint } from '../game/armory-balance';
import type { EquippedWeapon } from '../game/armory-state';

/**
 * Where a held trigger puts the sights, round by round, for the previewed
 * weapon and the one already equipped. Companion to the falloff curve: that one
 * says whether a hit kills, this one says whether the shot arrives at all.
 *
 * The target-width line is the point, the way the hits-to-kill bands are the
 * point next door. Degrees of climb mean nothing on their own; a burst is worth
 * firing for as long as it stays inside the thing it was aimed at, and the
 * chart shows where it stops doing that.
 *
 * The same two validated categorical slots as the falloff curve, on the same
 * panel surface, carried by a legend and an end-of-line label as well as by hue.
 */
const SERIES = ['#3987e5', '#d95926'];
const SURFACE = '#131c1d';
const WIDTH = 320, HEIGHT = 156;
const PAD = { top: 12, right: 52, bottom: 22, left: 30 };
const PLOT = { w: WIDTH - PAD.left - PAD.right, h: HEIGHT - PAD.top - PAD.bottom };

export default function RecoilCurve({ weapon, equipped }: { weapon: EquippedWeapon; equipped: EquippedWeapon }) {
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const preview = recoilCurve(weapon);
  const current = recoilCurve(equipped);
  // One line when the previewed item is the one already in hand: a lone series
  // needs no legend, and two identical lines would just read as a thicker one.
  const same = weapon.name === equipped.name;
  const series = same ? [{ name: weapon.name, points: preview, color: SERIES[0] }]
    : [{ name: weapon.name, points: preview, color: SERIES[0] }, { name: equipped.name, points: current, color: SERIES[1] }];

  const arc = targetArc();
  const peak = Math.max(...preview.map(p => p.climb), ...current.map(p => p.climb));
  const top = Math.max(5, Math.ceil(peak / 5) * 5);
  const x = (round: number) => PAD.left + (round / RECOIL_ROUNDS) * PLOT.w;
  // A square-root scale, because the climb spans two orders of magnitude and
  // the interesting half is the bottom of it: on a linear axis the target line
  // and the first few rounds — the only part a player can still shoot through —
  // collapse onto the baseline. Zero stays zero, the order is preserved, and
  // the uneven tick spacing is what tells the reader it is not linear.
  const y = (climb: number) => PAD.top + PLOT.h - Math.sqrt(Math.min(Math.max(climb, 0), top) / top) * PLOT.h;
  const ticks = [0, 2, 10, top].filter((value, i, all) => value <= top && all.indexOf(value) === i);
  const path = (points: RecoilPoint[]) =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(p.round).toFixed(1)} ${y(p.climb).toFixed(1)}`).join(' ');

  const at = hover === null ? null : Math.max(0, Math.min(RECOIL_ROUNDS, hover));
  const readout = at === null ? null : { round: at, rows: series.map(s => ({ ...s, point: s.points[at] })) };
  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const local = ((event.clientX - box.left) / box.width) * WIDTH;
    setHover(Math.round(((local - PAD.left) / PLOT.w) * RECOIL_ROUNDS));
  };
  const widths = (climb: number) => (climb / arc).toFixed(1);

  return <figure className="armory-curve" aria-labelledby={titleId}>
    <figcaption id={titleId}>{readout ? `Climb after ${readout.round} round${readout.round === 1 ? '' : 's'} held` : `Sight climb against rounds held · target width at ${TARGET_RANGE} m`}</figcaption>
    {/* The legend doubles as the hover readout, so a tooltip never covers the
        lines or their labels, and identity is never carried by hue alone. */}
    <div className="armory-curve-legend">
      {(readout ? readout.rows : series.map(s => ({ ...s, point: null }))).map(row => <span key={row.name}>
        <i style={{ background: row.color }} aria-hidden="true" />{row.name}
        {row.point && <b>{row.point.climb.toFixed(1)}° · {widths(row.point.climb)} widths</b>}
      </span>)}
    </div>
    <div className="armory-curve-plot">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Sight climb in degrees against rounds held for ${series.map(s => s.name).join(' and ')}, on a square-root scale, against the width of a target at ${TARGET_RANGE} metres.`}
        onPointerMove={move} onPointerLeave={() => setHover(null)}>
        {/* The opening rounds take less of the aim than the ones after them, so
            the burst window is a real edge on this chart rather than decoration. */}
        <rect x={PAD.left} y={PAD.top} width={Math.max(0, x(RECOIL_BURST) - PAD.left)} height={PLOT.h} fill="#ffffff" opacity=".05" />
        <line x1={x(RECOIL_BURST)} x2={x(RECOIL_BURST)} y1={PAD.top} y2={PAD.top + PLOT.h} stroke="#ffffff" strokeOpacity=".18" />
        <text x={x(RECOIL_BURST) - 4} y={PAD.top + 9} className="armory-curve-band" textAnchor="end">burst</text>
        {/* Where the burst leaves the target it was aimed at. */}
        {arc < top && <>
          <line x1={PAD.left} x2={PAD.left + PLOT.w} y1={y(arc)} y2={y(arc)} stroke="#9fb0a4" strokeOpacity=".55" strokeDasharray="3 2" />
          <text x={PAD.left + PLOT.w + 6} y={y(arc) + 3} className="armory-curve-band">target</text>
        </>}
        <line x1={PAD.left} x2={PAD.left + PLOT.w} y1={PAD.top + PLOT.h} y2={PAD.top + PLOT.h} stroke="#ffffff" strokeOpacity=".22" />
        {ticks.map(value => <text key={value} x={PAD.left - 6} y={y(value) + 3} className="armory-curve-axis" textAnchor="end">{Math.round(value)}°</text>)}
        {[0, 5, 10, 15, 20].map(round => <text key={round} x={x(round)} y={HEIGHT - 7} className="armory-curve-axis" textAnchor="middle">{round}</text>)}
        {series.map(s => <path key={s.name} d={path(s.points)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {/* In the right margin rather than over the line ends: these curves are
            steepest exactly where they finish, and a tag laid back along one
            would sit on top of it. Two weapons can also finish together on the
            ceiling, so the second steps down to clear the first. */}
        {series.map((s, i) => {
          const end = y(s.points[s.points.length - 1].climb);
          const above = i ? y(series[0].points[series[0].points.length - 1].climb) : -Infinity;
          const tag = Math.abs(end - above) < 10 ? above + 10 : end;
          // Anchored to the right edge rather than the plot's, so the longest
          // tier name in the catalog cannot run off the end of the drawing.
          return <text key={s.name} x={WIDTH - 2} y={Math.min(PAD.top + PLOT.h, Math.max(PAD.top + 7, tag + 3))}
            className="armory-curve-tag" fill={s.color} textAnchor="end">{s.name.split('·').pop()!.trim()}</text>;
        })}
        {at !== null && <g pointerEvents="none">
          <line x1={x(at)} x2={x(at)} y1={PAD.top} y2={PAD.top + PLOT.h} stroke="#ffffff" strokeOpacity=".35" strokeDasharray="2 2" />
          {series.map(s => <circle key={s.name} cx={x(at)} cy={y(s.points[at].climb)} r="4" fill={s.color} stroke={SURFACE} strokeWidth="2" />)}
        </g>}
      </svg>
    </div>
    <table className="armory-curve-table">
      <caption>Sight climb in degrees against rounds held, and how many target widths that is at {TARGET_RANGE} m</caption>
      <thead><tr><th scope="col">Rounds</th>{series.map(s => <th scope="col" key={s.name}>{s.name}</th>)}</tr></thead>
      <tbody>{[1, 5, 10, 15, 20].map(round => <tr key={round}>
        <th scope="row">{round}</th>
        {series.map(s => <td key={s.name}>{s.points[round].climb.toFixed(1)} degrees, {widths(s.points[round].climb)} target widths</td>)}
      </tr>)}</tbody>
    </table>
  </figure>;
}
