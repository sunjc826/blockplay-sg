import { useId } from 'react';
import { getRegion, type RegionMapShape } from '../game/regions';
import { localMinimapBounds, minimapHeading, minimapProjection, type MinimapMarker } from '../game/minimap';
import { getWorldZone, type WorldZoneId } from '../game/world-zones';
import { zoneSectors } from '../game/zone-sectors';
import './fps-minimap.css';

/** Only district furniture with an FPS palette is drawn on the dark minimap. */
function FpsMapShapes({ shapes }: { shapes: readonly RegionMapShape[] }) {
  return <>{shapes.map((shape, index) => shape.kind === 'rect'
    ? <rect key={index} x={shape.x} y={shape.z} width={shape.width} height={shape.depth} rx={shape.radius} fill={shape.fpsFill} />
    : null)}</>;
}

/** Sector tints sit under the roads, so named places read at a glance. */
const SECTOR_FILL = { dense: '#31473b', broken: '#2c3f3a', open: '#354036' } as const;
/** The corner map's drawing space, and the expanded map's: same aspect, more room. */
const VIEW = { compact: { width: 200, height: 160 }, expanded: { width: 600, height: 440 } } as const;

/**
 * Presentation only: callers decide which markers the player may see. Compact,
 * it is a local window that follows the player; expanded (M), it is the whole
 * district, with sector names and marker labels, over the centre of the scene.
 */
export default function FpsMinimap({ zone, player, markers = [], mode, expanded = false, onToggle, dangers = [], jammed = false }: {
  /** Combat events: rings for marked areas and supply crates, dots for aircraft. */
  dangers?: readonly { id: string; x: number; z: number; radius: number; kind: 'ring' | 'crate' | 'raider' }[];
  /** Jamming: static over the map and nothing on it but you. */
  jammed?: boolean;
  zone: WorldZoneId; player: { x: number; z: number; yaw: number };
  markers?: readonly MinimapMarker[]; mode: 'practice' | 'expedition' | 'arena';
  expanded?: boolean; onToggle?: () => void;
}) {
  const clip = useId(), title = useId(), district = getRegion(zone);
  const { width, height } = VIEW[expanded ? 'expanded' : 'compact'];
  const inset = expanded ? 10 : 6, edge = expanded ? 22 : 14;
  const bounds = expanded ? district.bounds : localMinimapBounds(district.bounds, player), map = minimapProjection(bounds, width, height, expanded ? 16 : 8);
  // Map units are metres, so stroke widths and labels shrink with the scale to stay the same on screen.
  const unit = 1 / map.scale;
  const decor = (layer: 'under' | 'over') => district.decor.filter(shape => shape.kind === 'rect' && shape.fpsFill && (shape.fpsLayer ?? shape.layer ?? 'over') === layer);
  const sectors = mode === 'expedition' || expanded ? zoneSectors(zone) : [];
  const legend = mode === 'arena' ? '▲ You · Opponents hidden' : mode === 'expedition' ? '▲ You · ■ Loot · ● NPC · ◆ Exit' : '▲ You · ● Targets · C/H Vehicles';
  const bar = expanded ? 100 : 25;
  return <div className={`fps-minimap ${expanded ? 'is-expanded' : ''}`} data-map-zone={zone} data-map-expanded={expanded || undefined}
    aria-label={`${getWorldZone(zone).name} ${expanded ? 'district map' : 'local minimap'}`}
    onClick={onToggle} role={onToggle ? 'button' : undefined} tabIndex={onToggle ? -1 : undefined}>
    <div className="fps-minimap-heading"><strong>{getWorldZone(zone).name}{expanded && <small> · DISTRICT MAP</small>}</strong><span>{expanded ? 'M · CLOSE' : '↑ N · M MAP'}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={title}>
      <title id={title}>{`${getWorldZone(zone).name}: your position and facing direction. ${mode === 'arena' ? 'Opponents are not shown, unless you can smell them.' : 'Nearby roads and supplies; outlined checkpoint markers at the edge indicate distant exits.'}`}</title>
      <defs><pattern id="fps-map-static" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#1b2420" /><rect width="2" height="1" x="1" y="1" fill="#6b7a70" /><rect width="1" height="2" x="4" y="3" fill="#4e5c53" /></pattern><clipPath id={clip}><rect x={inset} y={inset} width={width - inset * 2} height={height - inset * 2} rx="5" /></clipPath></defs>
      <rect x={inset} y={inset} width={width - inset * 2} height={height - inset * 2} rx="5" fill="#273b35" />
      <g clipPath={`url(#${clip})`}>
        <g transform={map.transform}>
          {sectors.map(sector => <rect key={sector.id}
            x={sector.bounds.minX} y={sector.bounds.minZ}
            width={sector.bounds.maxX - sector.bounds.minX} height={sector.bounds.maxZ - sector.bounds.minZ}
            rx={6} fill={SECTOR_FILL[sector.cover]} />)}
          <FpsMapShapes shapes={decor('under')} />
          {district.mapRoads.map((road, index) => <polyline key={index} points={road.points.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="#63766a" strokeWidth={expanded ? Math.max(6, 3 * unit) : 12} />)}
          <FpsMapShapes shapes={decor('over')} />
        </g>
        {expanded && sectors.map(sector => <text key={sector.id} className="fps-map-sector" data-map-sector={sector.id}
          x={map.x((sector.bounds.minX + sector.bounds.maxX) / 2)} y={map.y((sector.bounds.minZ + sector.bounds.maxZ) / 2)} textAnchor="middle">{sector.name}</text>)}
        {!jammed && dangers.map(danger => danger.kind === 'raider'
          ? <g key={danger.id} data-map-danger={danger.kind} transform={`translate(${map.x(danger.x)} ${map.y(danger.z)})`}><path d="M0 -5 L5 4 L-5 4 Z" fill="#ff5a45" stroke="#2a0d0a" strokeWidth="1" /></g>
          : <circle key={danger.id} data-map-danger={danger.kind} cx={map.x(danger.x)} cy={map.y(danger.z)} r={Math.max(3, danger.radius * map.scale)}
            fill={danger.kind === 'crate' ? '#5fe08a22' : '#ff4a3a22'} stroke={danger.kind === 'crate' ? '#5fe08a' : '#ff5a45'} strokeWidth="1.5" strokeDasharray={danger.kind === 'crate' ? '3 2' : undefined} />)}
        {!jammed && markers.map(marker => {
          const x = map.x(marker.x), y = map.y(marker.z);
          const outside = x < edge || x > width - edge || y < edge || y > height - edge;
          if (outside && marker.kind !== 'checkpoint') return null;
          const px = Math.max(edge, Math.min(width - edge, x)), py = Math.max(edge, Math.min(height - edge, y));
          const named = expanded && (marker.kind === 'checkpoint' || marker.kind === 'npc' || marker.kind === 'car' || marker.kind === 'helicopter');
          return <g key={marker.id} data-minimap-marker={marker.id} data-marker-kind={marker.kind} data-edge={outside} data-active={!!marker.active} transform={`translate(${px} ${py})${expanded ? ' scale(1.25)' : ''}`}>
            <title>{`${marker.label} · ${Math.round(Math.hypot(marker.x - player.x, marker.z - player.z))}m${outside ? ' · beyond map edge' : ''}`}</title>
            {marker.active && <circle r="9" fill="#efd07733" stroke="#efd077" strokeWidth="1" />}
            {marker.kind === 'checkpoint' ? <path d="M0 -6 L6 0 L0 6 L-6 0 Z" fill={outside ? '#26362c' : '#efd077'} stroke="#efd077" strokeWidth="2" />
              : marker.kind === 'loot' ? <rect x="-3" y="-3" width="6" height="6" fill="#91dcb0" stroke="#172820" />
              : marker.kind === 'npc' ? <><circle r="5" fill="#9bdcf0" stroke="#263f49" /><text y="3" textAnchor="middle" fill="#18303a" fontSize="7" fontWeight="800">N</text></>
              : marker.kind === 'target' ? <circle r="3" fill="#ee967c" stroke="#401e18" />
              : marker.kind === 'scent' ? <><circle r="7" fill="#c9c25a33" stroke="#c9c25a" strokeWidth="1.2" strokeDasharray="2 2" /><path d="M-3 2 q1.5 -3 0 -5 M0 2 q1.5 -3 0 -5 M3 2 q1.5 -3 0 -5" fill="none" stroke="#e3dc7a" strokeWidth="1.1" strokeLinecap="round" /></>
              : <><rect x="-6" y="-6" width="12" height="12" rx="2" fill="#182d35" stroke="#9bdcf0" /><text y="3" textAnchor="middle" fill="#c7f3ff" fontSize="9" fontWeight="700">{marker.kind === 'car' ? 'C' : 'H'}</text></>}
            {named && <text className="fps-map-label" y="-10" textAnchor="middle">{marker.label.split(' · ')[0]}</text>}
          </g>;
        })}
        <g data-minimap-player data-world-x={player.x} data-world-z={player.z} data-yaw={player.yaw} transform={`translate(${map.x(player.x)} ${map.y(player.z)}) rotate(${minimapHeading(player.yaw)})${expanded ? ' scale(1.3)' : ''}`}>
          <circle r="8" fill="#13231dcc" />
          <path d="M0 -7 L5 5 L0 2 L-5 5 Z" fill="#fff9db" stroke="#172820" strokeWidth="1" />
        </g>
      </g>
      {jammed && <g data-map-jammed><rect x={inset} y={inset} width={width - inset * 2} height={height - inset * 2} rx="5" fill="url(#fps-map-static)" opacity=".75" />
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={expanded ? 16 : 10} fontWeight="700" fill="#efd077" letterSpacing="2">SIGNAL JAMMED</text></g>}
            <path d={`M${edge} ${height - 18} v4 h${map.scale * bar} v-4`} fill="none" stroke="#dde7cd" strokeWidth="1" /><text x={edge} y={height - 22} fontSize={expanded ? 10 : 7} fill="#dde7cd">{bar}m</text>
      {expanded && <text x={width - edge} y={edge + 10} textAnchor="end" fontSize="11" fill="#efd077" fontWeight="700">↑ N</text>}
    </svg>
    <div className="fps-minimap-legend">{legend}</div>
  </div>;
}
