import { useId, useState } from 'react';
import { sprayAccuracy, sprayPattern, SPRAY_RANGES, SPRAY_ROUNDS, targetAngle, type SprayShot } from '../game/armory-balance';
import type { EquippedWeapon } from '../game/armory-state';

/**
 * A held burst, every round of it laid over the target it was aimed at — the
 * spray pattern, in the sense every shooter draws one.
 *
 * Plotted in angles rather than distances, which is what lets one drawing serve
 * three ranges: the pattern stays where it is while the target shrinks as it
 * moves away. The rings are the point. Degrees mean nothing on their own, and
 * the question a player has is not "how far does it climb" but "how many of
 * these land", which is the ring the round falls inside.
 *
 * Two things are drawn because two things decide where a round goes. The path
 * is the pattern proper — the deterministic climb and walk, the shape that can
 * be learned. The cloud behind it is the same burst fired fourteen times with
 * its real jitter and its real shot cone. Drawing only the path would advertise
 * a precision the weapon does not have.
 *
 * The same two validated categorical slots as the other dossier charts, on the
 * same surface, carried by a legend and a direct label as well as by hue.
 */
const SERIES = ['#3987e5', '#d95926'];
const SURFACE = '#131c1d';
const WIDTH = 320, HEIGHT = 560;
const PAD = { top: 16, right: 16, bottom: 24, left: 16 };
const PLOT = { w: WIDTH - PAD.left - PAD.right, h: HEIGHT - PAD.top - PAD.bottom };
/** Solid, dashed, dotted, so the three ranges separate without relying on size alone. */
const RING_DASH = ['', '4 3', '1 3'];

export default function SprayPattern({ weapon, equipped }: { weapon: EquippedWeapon; equipped: EquippedWeapon }) {
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const preview = sprayPattern(weapon);
  const current = sprayPattern(equipped);
  const same = weapon.name === equipped.name;

  // True aspect, or the rings stop being circles and "inside the target" stops
  // meaning anything. The climb is what binds; the walk is narrow by comparison.
  const climb = Math.max(...preview.cloud.map(s => s.y), ...current.cloud.map(s => s.y));
  const top = Math.max(2, Math.ceil(climb) + 1);
  // The point of aim sits a whole near-target above the floor, or the widest
  // ring is drawn half outside the plot and the one thing the chart is read
  // against gets clipped.
  const foot = targetAngle(SPRAY_RANGES[0]) + .3;
  const perDegree = PLOT.h / (top + foot);
  const x = (degrees: number) => PAD.left + PLOT.w / 2 + degrees * perDegree;
  const y = (degrees: number) => PAD.top + PLOT.h - (degrees + foot) * perDegree;
  const path = (shots: SprayShot[]) => shots.map((s, i) => `${i ? 'L' : 'M'}${x(s.x).toFixed(1)} ${y(s.y).toFixed(1)}`).join(' ');

  const series = same ? [{ name: weapon.name, spray: preview, color: SERIES[0] }]
    : [{ name: weapon.name, spray: preview, color: SERIES[0] }, { name: equipped.name, spray: current, color: SERIES[1] }];
  const at = hover === null ? null : Math.max(1, Math.min(SPRAY_ROUNDS, hover));
  const landed = (spray: { cloud: SprayShot[] }, range: number) => Math.round(sprayAccuracy(spray.cloud, range) * SPRAY_ROUNDS);
  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const local = ((event.clientY - box.top) / box.height) * HEIGHT;
    // Nearest round by height, which is how the pattern is read.
    const wanted = (PAD.top + PLOT.h - local) / perDegree;
    setHover(preview.mean.reduce((best, s) => Math.abs(s.y - wanted) < Math.abs(preview.mean[best - 1].y - wanted) ? s.round : best, 1));
  };

  return <figure className="armory-curve armory-spray" aria-labelledby={titleId}>
    <figcaption id={titleId}>{at ? `Round ${at} of a held burst` : `Spray pattern · ${SPRAY_ROUNDS} rounds held · target at ${SPRAY_RANGES.join(' / ')} m`}</figcaption>
    {/* The legend doubles as the readout, so nothing ever covers the pattern,
        and identity is never carried by hue alone. */}
    <div className="armory-curve-legend">
      {series.map(s => <span key={s.name}>
        <i style={{ background: s.color }} aria-hidden="true" />{s.name}
        <b>{at ? `${s.spray.mean[at - 1].y.toFixed(1)}° high` : `${landed(s.spray, SPRAY_RANGES[0])}/${SPRAY_ROUNDS} on target at ${SPRAY_RANGES[0]} m`}</b>
      </span>)}
    </div>
    <div className="armory-curve-plot">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Spray pattern for ${series.map(s => s.name).join(' and ')}: where ${SPRAY_ROUNDS} held rounds land relative to the point of aim, over targets at ${SPRAY_RANGES.join(', ')} metres.`}
        onPointerMove={move} onPointerLeave={() => setHover(null)}>
        {/* The point of aim, and the target around it at each range. */}
        <line x1={x(0)} x2={x(0)} y1={PAD.top} y2={PAD.top + PLOT.h} stroke="#ffffff" strokeOpacity=".08" />
        {SPRAY_RANGES.map((range, i) => <circle key={range} cx={x(0)} cy={y(0)} r={targetAngle(range) * perDegree}
          fill={i ? 'none' : '#ffffff'} fillOpacity={i ? 0 : .06} stroke="#9fb0a4" strokeOpacity=".7" strokeDasharray={RING_DASH[i]} />)}
        {/* Keyed along the foot rather than beside the rings: three concentric
            circles this close together cannot carry three labels without them
            landing on each other. */}
        {SPRAY_RANGES.map((range, i) => <g key={range} transform={`translate(${PAD.left + i * 70} ${HEIGHT - 6})`}>
          <line x1="0" x2="13" y1="-3" y2="-3" stroke="#9fb0a4" strokeOpacity=".7" strokeDasharray={RING_DASH[i]} />
          <text x="17" y="0" className="armory-curve-band">{range} m</text>
        </g>)}
        {/* Where the rounds actually go: jitter and shot cone, the previewed
            weapon only — two clouds on one drawing read as neither. */}
        {preview.cloud.map((shot, i) => <circle key={i} cx={x(shot.x)} cy={y(shot.y)} r="1.6" fill={SERIES[0]} fillOpacity=".22" />)}
        {/* The learnable shape, over the top of it. */}
        {series.map(s => <path key={s.name} d={path(s.spray.mean)} fill="none" stroke={s.color} strokeWidth="1.6"
          strokeOpacity={s.color === SERIES[0] ? 1 : .55} strokeLinejoin="round" strokeLinecap="round" />)}
        {series.map(s => s.spray.mean.filter(shot => shot.round === 1 || shot.round % 5 === 0).map(shot => <g key={`${s.name}-${shot.round}`}>
          <circle cx={x(shot.x)} cy={y(shot.y)} r="3.6" fill={s.color} stroke={SURFACE} strokeWidth="1.5" />
          {s.color === SERIES[0] && <text x={x(shot.x) + 7} y={y(shot.y) + 3} className="armory-curve-axis">{shot.round}</text>}
        </g>))}
        {at !== null && <g pointerEvents="none">
          {series.map(s => <circle key={s.name} cx={x(s.spray.mean[at - 1].x)} cy={y(s.spray.mean[at - 1].y)} r="5" fill="none" stroke="#ffffff" strokeOpacity=".8" strokeWidth="1.5" />)}
        </g>}
      </svg>
    </div>
    <table className="armory-curve-table">
      <caption>Rounds of a {SPRAY_ROUNDS}-round held burst that land on a target, by range</caption>
      <thead><tr><th scope="col">Range</th>{series.map(s => <th scope="col" key={s.name}>{s.name}</th>)}</tr></thead>
      <tbody>{SPRAY_RANGES.map(range => <tr key={range}>
        <th scope="row">{range} m</th>
        {series.map(s => <td key={s.name}>{landed(s.spray, range)} of {SPRAY_ROUNDS} on target</td>)}
      </tr>)}</tbody>
    </table>
  </figure>;
}
