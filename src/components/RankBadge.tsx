import type { Emblem, RankInsignia, WeaponShadow } from '../game/rank-insignia';

/**
 * Draws whatever `rank-insignia` resolved. Every mark is generated rather than
 * drawn by hand — a star is polar arithmetic, three chevrons are one chevron
 * three times — so a set declaring `{ kind: 'star', count: 4 }` gets a badge
 * nobody had to author, and fifty levels cost no fifty drawings.
 *
 * Everything is laid out in a 40x40 box and centred on the same origin, so
 * marks of different kinds sit at the same optical weight in the frame.
 */
const BOX = 40, MID = BOX / 2;

/** A five-pointed star as a polygon, so `count` costs nothing to satisfy. */
function starPoints(cx: number, cy: number, radius: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5, reach = i % 2 ? radius * 0.44 : radius;
    return `${(cx + Math.cos(angle) * reach).toFixed(2)},${(cy + Math.sin(angle) * reach).toFixed(2)}`;
  }).join(' ');
}
/**
 * Gun shadows, drawn side-on in their own 240x88 space and scaled into the
 * badge, so a silhouette can carry real proportions instead of being redrawn
 * small. `crossed` is the rifle twice, which is what the mark means.
 */
const RIFLE = 'M21 37h98l13-9h32l10 8h48v7h-48l-7 8h-53l-7 22H91l4-22H68l-2 17H47l-4-17H21z';
const SHADOWS: Record<WeaponShadow, readonly string[]> = {
  sidearm: ['M74 26h96v16h-40l-8 9h-16l-7 31H75l9-31H74z', 'M96 20h52v6H96z'],
  rifle: [RIFLE, 'M70 28h52v7H70z'],
  support: ['M18 34h150l12-7h30v10h-30l-9 7h-38l-7 21h-24l5-21H18z', 'M94 46a19 19 0 1 0 38 0a19 19 0 1 0-38 0z'],
  marksman: ['M16 38h62l10-9h40l8 9h88v6h-88l-6 8h-48l-8 21H56l7-21H16z', 'M92 20h60v9H92z', 'M148 44h64v4h-64z'],
  crossed: [RIFLE],
};
function Shadow({ shadow }: { shadow: WeaponShadow }) {
  const scale = shadow === 'crossed' ? 0.185 : 0.21, paths = SHADOWS[shadow];
  // The source box is 240x88; centre it, then lay the pair of crossed rifles
  // over each other at opposing angles rather than drawing a third silhouette.
  const place = (angle: number) => `translate(${MID} ${MID}) rotate(${angle}) scale(${scale}) translate(-120 -48)`;
  const angles = shadow === 'crossed' ? [-22, 22] : [0];
  return <>{angles.map(angle => <g key={angle} transform={place(angle)}>{paths.map((d, i) => <path key={i} d={d} />)}</g>)}</>;
}
/**
 * Laurel, generated the same way the star is: leaves placed along an arc
 * rather than drawn. Two earlier attempts failed for the same reason and it
 * is worth writing down — at 40px a *stroked* wreath with tick marks along it
 * aliases into a bowl with rays, and any mark sitting above that reads as a
 * pair of eyes over a smile. Filled leaves fanned along a stem read as laurel
 * at badge size because each one is a shape rather than two converging lines.
 */
const LEAVES_PER_BRANCH = 5, WREATH_RADIUS = 15.6, WREATH_CY = 21.5;
/** Degrees measured from straight down, so the branches open at the top. */
const BRANCH_FROM = 84, BRANCH_TO = 4;
const onArc = (degrees: number, radius: number) => {
  const radians = (degrees * Math.PI) / 180;
  return [MID + Math.cos(radians) * radius, WREATH_CY + Math.sin(radians) * radius] as const;
};
/** Sampled rather than an A command, so no sweep flag can quietly mirror it. */
const stem = (side: number) => Array.from({ length: 12 }, (_, i) => {
  const at = BRANCH_FROM + ((BRANCH_TO - BRANCH_FROM) * i) / 11;
  const [x, y] = onArc(side > 0 ? at : 180 - at, WREATH_RADIUS - 2.3);
  return `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
}).join(' ');
const Wreath = () => <g fill="currentColor" opacity=".92">
  {[-1, 1].map(side => <g key={side}>
    <path d={stem(side)} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    {Array.from({ length: LEAVES_PER_BRANCH }, (_, i) => {
      const at = BRANCH_FROM + ((BRANCH_TO - BRANCH_FROM) * i) / (LEAVES_PER_BRANCH - 1);
      const degrees = side > 0 ? at : 180 - at, [x, y] = onArc(degrees, WREATH_RADIUS);
      // Along the arc, fanned a little outward: a leaf on a stem, not a spoke.
      return <ellipse key={i} cx={x} cy={y} rx="3.5" ry="1.75" transform={`rotate(${degrees + 90 + side * 24} ${x} ${y})`} />;
    })}
  </g>)}
</g>;

function Mark({ emblem, level }: { emblem: Emblem; level: number }) {
  const count = Math.max(1, Math.min(5, emblem.count ?? 1));
  // Marks that repeat vertically shrink their spacing as they stack, so three
  // chevrons fill the same frame two do rather than growing out of it.
  if (emblem.kind === 'chevron') {
    const gap = count > 2 ? 7.5 : 9, top = MID - ((count - 1) * gap) / 2 - 4.5;
    return <g fill="none" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round">
      {Array.from({ length: count }, (_, i) => {
        const y = top + i * gap;
        return <path key={i} d={emblem.inverted ? `M8 ${y} L20 ${y + 8} L32 ${y}` : `M8 ${y + 8} L20 ${y} L32 ${y + 8}`} />;
      })}
    </g>;
  }
  if (emblem.kind === 'bar') {
    const gap = 8, top = MID - ((count - 1) * gap) / 2 - 2.6;
    return <g>{Array.from({ length: count }, (_, i) => <rect key={i} x="8" y={top + i * gap} width="24" height="5.2" rx="1.4" />)}</g>;
  }
  if (emblem.kind === 'diamond' || emblem.kind === 'star') {
    // Repeats sit side by side and shrink to fit, the way pips on a shoulder do.
    const size = count > 2 ? 7.4 : count > 1 ? 9 : 12, span = size * 2 + 1.5;
    const left = MID - ((count - 1) * span) / 2;
    return <g>{Array.from({ length: count }, (_, i) => {
      const cx = left + i * span;
      return emblem.kind === 'star'
        ? <polygon key={i} points={starPoints(cx, MID, size)} />
        : <path key={i} d={`M${cx} ${MID - size} L${cx + size * .72} ${MID} L${cx} ${MID + size} L${cx - size * .72} ${MID} Z`} />;
    })}</g>;
  }
  if (emblem.kind === 'weapon') return <Shadow shadow={emblem.shadow ?? 'rifle'} />;
  return <text x={MID} y={MID} textAnchor="middle" dominantBaseline="central" fontSize={level > 9 ? 21 : 25} fontWeight="700" letterSpacing="-.5">{level}</text>;
}

/**
 * The badge itself. `title` carries the full rank to assistive technology, so
 * the art is decorative and the label beside it is never the only copy of it.
 */
export default function RankBadge({ insignia, size = 44, className = '' }: { insignia: RankInsignia; size?: number; className?: string }) {
  const { emblem, accent, level, label } = insignia;
  // A wreathed mark nests inside the laurel rather than sitting over it: the
  // same three stars, shrunk to the opening and sat just above its centre,
  // where the branches are furthest apart.
  const nest = emblem.wreath ? `translate(${MID} ${WREATH_CY - 2}) scale(.68) translate(${-MID} ${-MID})` : undefined;
  return <svg className={`rank-badge ${className}`} width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} role="img" aria-label={`Rank ${label}, level ${level}`} style={{ color: accent }}>
    <g fill="currentColor" transform={nest}><Mark emblem={emblem} level={level} /></g>
    {emblem.wreath && <Wreath />}
  </svg>;
}
