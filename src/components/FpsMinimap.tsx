import type { RegionBounds } from '../game/region-collision';
import { useEffect, useId, useRef, useState } from 'react';
import { getRegion, type RegionMapShape } from '../game/regions';
import { localMinimapBounds, minimapHeading, minimapProjection, MINIMAP_CONTACT_RANGE, type MinimapMarker } from '../game/minimap';
import { minimapColor, minimapLabels, minimapMarkerCategory, type MapLabel } from '../game/minimap-presentation';
import { getWorldZone, type WorldZoneId } from '../game/world-zones';
import { sectorAt, zoneSectors } from '../game/zone-sectors';
import type { FacilityState } from '../game/facilities';
import { CONTROL_COLOR, CONTROL_LABEL, sectorFacilityControl } from '../game/expedition-objectives';
import FpsMapMarker from './FpsMapMarker';
import { useMapPanelMotion } from './map-panel-motion';
import './fps-minimap.css';

/** All schematic furniture, including lines and shapes without a special FPS palette. */
function FpsMapShapes({ shapes }: { shapes: readonly RegionMapShape[] }) {
  return <>{shapes.map((shape, index) => shape.kind === 'rect'
    ? <rect key={index} data-map-decor="rect" x={shape.x} y={shape.z} width={shape.width} height={shape.depth} rx={shape.radius} fill={shape.fpsFill ?? minimapColor(shape.fill)} />
    : <path key={index} data-map-decor="line" d={`M${shape.from.x} ${shape.from.z}L${shape.to.x} ${shape.to.z}`} fill="none" stroke={shape.fpsStroke ?? minimapColor(shape.stroke)} strokeWidth={shape.width} />)}</>;
}

const SECTOR_FILL = { dense: '#31473b', broken: '#2c3f3a', open: '#354036' } as const;
const VIEW = { compact: { width: 200, height: 160 }, expanded: { width: 600, height: 440 } } as const;
const EDGE_KINDS = new Set<MinimapMarker['kind']>(['control','checkpoint', 'parachute', 'boat', 'facility']);
const SYMBOLS: { label: string; marker: MinimapMarker }[] = [
  ...(['command', 'garage', 'helipad', 'supply'] as const).map(facilityType => ({ label: { command: 'Command', garage: 'Garage', helipad: 'Helipad', supply: 'Depot' }[facilityType], marker: { id: facilityType, kind: 'facility' as const, facilityType, label: '', x: 0, z: 0 } })),
  ...(['weapon', 'ammo', 'medical', 'armor', 'food'] as const).map(lootType => ({ label: { weapon: 'Weapon', ammo: 'Ammo', medical: 'Medical / resupply', armor: 'Armor', food: 'Food' }[lootType], marker: { id: lootType, kind: 'loot' as const, lootType, label: '', x: 0, z: 0 } })),
  ...(['landmark', 'checkpoint', 'parachute', 'boat', 'scent', 'npc', 'car', 'helicopter'] as const).map(kind => ({ label: { landmark: 'Landmark', checkpoint: 'Exit / objective', parachute: 'Paratroopers', boat: 'Landing craft', scent: 'Scent', npc: 'NPC', car: 'Car', helicopter: 'Helicopter' }[kind], marker: { id: kind, kind, label: '', x: 0, z: 0 } })),
];

/** Callers supply only permitted tactical markers. Landmarks and boundaries are static. */
export default function FpsMinimap({ zone, player, markers = [], mode, expanded: open = false, onToggle, dangers = [], jammed = false, contactRange = MINIMAP_CONTACT_RANGE, facilities = [], matchBounds }: {
  matchBounds?: RegionBounds;
  facilities?: readonly FacilityState[];
  dangers?: readonly { id: string; x: number; z: number; radius: number; kind: 'ring' | 'crate' | 'raider' }[];
  jammed?: boolean;
  contactRange?: number;
  zone: WorldZoneId; player: { x: number; z: number; yaw: number };
  markers?: readonly MinimapMarker[]; mode: 'practice' | 'expedition' | 'arena';
  expanded?: boolean; onToggle?: () => void;
}) {
  const clip = useId(), title = useId(), staticId = useId(), district = getRegion(zone);
  const [selection, setSelection] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const closing = useMapPanelMotion(panel, open), expanded = open || closing;
  useEffect(() => { if (open) panel.current?.querySelector<HTMLButtonElement>('.fps-map-close')?.focus({ preventScroll: true }); }, [open]);
  const { width, height } = VIEW[expanded ? 'expanded' : 'compact'];
  const inset = expanded ? 10 : 6, edge = expanded ? 22 : 14;
  const areaBounds=matchBounds??district.bounds;
  const bounds = expanded ? areaBounds : localMinimapBounds(areaBounds, player), map = minimapProjection(bounds, width, height, expanded ? 16 : 8);
  const unit = 1 / map.scale;
  const decor = (layer: 'under' | 'over') => district.decor.filter(shape => (shape.fpsLayer ?? shape.layer ?? 'over') === layer);
  const sectors = zoneSectors(zone), here = sectorAt(zone, player.x, player.z);
  const controls = new Map(sectors.map(sector => [sector.id, sectorFacilityControl(sector, facilities)]));
  const landmarks: MinimapMarker[] = district.stamps.map((stamp, i) => ({ id: `landmark-${i}`, kind: 'landmark', label: stamp.name, x: stamp.x, z: stamp.z }));
  const visible = [...landmarks, ...(!jammed ? markers : [])].flatMap(marker => {
    const x = map.x(marker.x), y = map.y(marker.z);
    const outside = expanded
      ? marker.x < bounds.minX || marker.x > bounds.maxX || marker.z < bounds.minZ || marker.z > bounds.maxZ
      : x < edge || x > width - edge || y < edge || y > height - edge;
    if (outside && !EDGE_KINDS.has(marker.kind)) return [];
    return [{ marker, outside, x: Math.max(edge, Math.min(width - edge, x)), y: Math.max(edge, Math.min(height - edge, y)) }];
  });
  const ordered = [...visible].sort((a, b) => Number(!!b.marker.active) - Number(!!a.marker.active)
    || Number(a.marker.kind === 'landmark') - Number(b.marker.kind === 'landmark')
    || Math.hypot(a.marker.x - player.x, a.marker.z - player.z) - Math.hypot(b.marker.x - player.x, b.marker.z - player.z)
    || a.marker.id.localeCompare(b.marker.id));
  const selected = ordered.find(({ marker }) => `${zone}:${marker.id}` === selection) ?? ordered[0];
  const choose = (id: string) => setSelection(`${zone}:${id}`);
  const chooseStack = (id: string, x: number, y: number) => {
    // Closely spaced range targets and parked vehicles can share one hit area.
    const stack = visible.filter(point => Math.hypot(point.x - x, point.y - y) < 14);
    const current = stack.findIndex(point => `${zone}:${point.marker.id}` === selection);
    choose(stack.length > 1 && current >= 0 ? stack[(current + 1) % stack.length].marker.id : id);
  };
  const step = (delta: number) => {
    if (!selected || !ordered.length) return;
    const index = ordered.indexOf(selected);
    choose(ordered[(index + delta + ordered.length) % ordered.length].marker.id);
  };
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.matches('input,textarea,select,[contenteditable=true]')) return;
      if (event.key === '[' || event.key === ']') { event.preventDefault(); step(event.key === '[' ? -1 : 1); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const labelCandidates: MapLabel[] = expanded ? [
    ...sectors.map(sector => ({ id: `sector:${sector.id}`, name: sector.name, x: map.x((sector.bounds.minX + sector.bounds.maxX) / 2), y: map.y((sector.bounds.minZ + sector.bounds.maxZ) / 2), priority: sector.id === here?.id ? 110 : 70, lines: mode === 'expedition' && !jammed ? 2 : 1 })),
    ...visible.filter(({ marker }) => !['loot', 'target', 'ally', 'enemy', 'scent'].includes(marker.kind)).map(({ marker, x, y }) => ({ id: marker.id, name: marker.label.split(' · ')[0], x, y: y - 13, priority: marker.id === selected?.marker.id ? 120 : marker.active ? 100 : marker.kind === 'landmark' ? 20 : 60 })),
  ] : [];
  const labels = minimapLabels(labelCandidates, width, height);
  const bar = expanded ? 100 : 25;
  const legend = mode !== 'practice' ? `▲ You · ● Ally · ◆ Enemy · ${contactRange}m sight` : '▲ You · ● Targets · C/H Vehicles';
  return <div ref={panel} className={`fps-minimap ${expanded ? 'is-expanded' : ''} ${closing ? 'is-closing' : ''}`} inert={closing} data-map-zone={zone} data-map-expanded={open || undefined} data-map-contact-range={mode !== 'practice' ? contactRange : undefined}
    aria-label={`${getWorldZone(zone).name} ${expanded ? 'district map' : 'local minimap'}`}
    onClick={!expanded ? onToggle : undefined} role={!expanded && onToggle ? 'button' : undefined} tabIndex={!expanded && onToggle ? 0 : undefined}
    onKeyDown={event => { if (!expanded && onToggle && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); onToggle(); } }}>
    <div className="fps-minimap-heading"><strong>{getWorldZone(zone).name}{expanded && <small> · DISTRICT MAP</small>}</strong>{expanded && onToggle ? <button type="button" className="fps-map-close" onClick={onToggle}>Close <span className="fps-hud-hint">· M</span></button> : <span>↑ N<span className="fps-hud-hint"> · M MAP</span></span>}</div>
    <div className="fps-map-location" data-map-current-sector={here?.id}>{here?.name ?? 'Between named sectors'}</div>
    <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-labelledby={title}>
      <title id={title}>{`${getWorldZone(zone).name}: your position and facing direction. ${mode !== 'practice' ? `Blue allies and red enemies appear within ${contactRange}m while in view with clear line of sight. Range adapts to time of day and weather. Hidden opponents stay off the map unless you can smell them. Marked contacts can also appear beyond sight. ` : ''}Schematic roads, buildings, water and landmarks. Sector outlines may overlap and leave gaps. Outlined checkpoint markers at the edge indicate distant exits.${expanded ? ' Select a marker for details; use brackets to browse.' : ''}`}</title>
      <defs><pattern id={staticId} width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#1b2420" /><rect width="2" height="1" x="1" y="1" fill="#6b7a70" /><rect width="1" height="2" x="4" y="3" fill="#4e5c53" /></pattern><clipPath id={clip}><rect x={inset} y={inset} width={width - inset * 2} height={height - inset * 2} rx="5" /></clipPath></defs>
      <rect x={inset} y={inset} width={width - inset * 2} height={height - inset * 2} rx="5" fill="#273b35" />
      <g clipPath={`url(#${clip})`}>
        <g transform={map.transform}>
          {sectors.map(sector => <rect key={sector.id} x={sector.bounds.minX} y={sector.bounds.minZ} width={sector.bounds.maxX - sector.bounds.minX} height={sector.bounds.maxZ - sector.bounds.minZ} fill={SECTOR_FILL[sector.cover]} />)}
          <FpsMapShapes shapes={decor('under')} />
          {district.mapRoads.map((road, index) => <polyline key={index} points={road.points.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="#63766a" strokeWidth={expanded ? Math.max(6, 3 * unit) : 12} />)}
          <FpsMapShapes shapes={decor('over')} />
          {matchBounds && <rect data-match-boundary x={matchBounds.minX} y={matchBounds.minZ} width={matchBounds.maxX-matchBounds.minX} height={matchBounds.maxZ-matchBounds.minZ} fill="none" stroke="#ffc56e" strokeWidth={2*unit}><title>Match boundary</title></rect>}
          {!jammed && mode === 'expedition' && sectors.map(sector => {
            const control = controls.get(sector.id)!;
            return <rect key={sector.id} data-sector-control={control} data-control-sector={sector.id} x={sector.bounds.minX} y={sector.bounds.minZ} width={sector.bounds.maxX - sector.bounds.minX} height={sector.bounds.maxZ - sector.bounds.minZ}
              fill={CONTROL_COLOR[control]} fillOpacity={control === 'neutral' ? .025 : .14} stroke={control === 'contested' ? CONTROL_COLOR[control] : 'none'} strokeWidth={unit} strokeDasharray={`${4 * unit} ${3 * unit}`}>
              <title>{`${sector.name} · ${CONTROL_LABEL[control]} · based on surviving facilities`}</title>
            </rect>;
          })}
        </g>
        {jammed && <g data-map-jammed><rect x={inset} y={inset} width={width - inset * 2} height={height - inset * 2} fill={`url(#${staticId})`} opacity=".35" /></g>}
        <g transform={map.transform} fill="none">{[...sectors.filter(s => s.id !== here?.id), ...sectors.filter(s => s.id === here?.id)].map(sector => <rect key={sector.id} data-sector-boundary={sector.id} data-current={sector.id === here?.id}
          x={sector.bounds.minX} y={sector.bounds.minZ} width={sector.bounds.maxX - sector.bounds.minX} height={sector.bounds.maxZ - sector.bounds.minZ}
          stroke={sector.id === here?.id ? '#fff3bc' : '#b6cbbb'} strokeOpacity={sector.id === here?.id ? .95 : .4} strokeWidth={unit * (sector.id === here?.id ? 2 : .8)} />)}</g>
        {expanded && sectors.map(sector => {
          const label = labels.get(`sector:${sector.id}`); if (!label) return null;
          return <text key={sector.id} className="fps-map-sector" data-map-sector={sector.id} x={label.x} y={label.y} textAnchor="middle">{sector.name}{mode === 'expedition' && !jammed && <tspan x={label.x} dy="13" className="fps-map-control-label" fill={CONTROL_COLOR[controls.get(sector.id)!]}>{CONTROL_LABEL[controls.get(sector.id)!]}</tspan>}</text>;
        })}
        {!jammed && dangers.map(danger => danger.kind === 'raider'
          ? <g key={danger.id} data-map-danger={danger.kind} transform={`translate(${map.x(danger.x)} ${map.y(danger.z)})`}><path d="M0 -5 L5 4 L-5 4 Z" fill="#ff5a45" stroke="#2a0d0a" strokeWidth="1" /></g>
          : <circle key={danger.id} data-map-danger={danger.kind} cx={map.x(danger.x)} cy={map.y(danger.z)} r={Math.max(3, danger.radius * map.scale)} fill={danger.kind === 'crate' ? '#5fe08a22' : '#ff4a3a22'} stroke={danger.kind === 'crate' ? '#5fe08a' : '#ff5a45'} strokeWidth="1.5" strokeDasharray={danger.kind === 'crate' ? '3 2' : undefined} />)}
        {visible.map(({ marker, outside, x, y }) => {
          const label = labels.get(marker.id), distance = Math.round(Math.hypot(marker.x - player.x, marker.z - player.z));
          const select = () => choose(marker.id);
          return <g key={marker.id} data-minimap-marker={marker.id} data-marker-kind={marker.kind} data-edge={outside} data-active={!!marker.active} data-selected={expanded && selected?.marker.id === marker.id}
            className={expanded ? 'fps-map-marker' : undefined} role={expanded ? 'button' : undefined} tabIndex={expanded ? 0 : undefined} aria-label={expanded ? `${marker.label} · ${distance}m` : undefined} aria-pressed={expanded ? selected?.marker.id === marker.id : undefined}
            onClick={expanded ? () => chooseStack(marker.id, x, y) : undefined} onKeyDown={expanded ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); select(); } } : undefined}>
            <title>{`${marker.label} · ${distance}m${outside ? ' · beyond map edge' : ''}`}</title>
            <g transform={`translate(${x} ${y})${expanded ? ' scale(1.25)' : ''}`}>
              {expanded && <circle r="11" fill="transparent" />}
              {marker.active && <circle r="9" fill="#efd07733" stroke="#efd077" strokeWidth="1" />}
              {expanded && selected?.marker.id === marker.id && <circle r="10" fill="none" stroke="#fff9db" strokeWidth="1.5" />}
              <FpsMapMarker marker={marker} outside={outside} />
            </g>
            {label && <text className="fps-map-label" x={label.x} y={label.y} textAnchor="middle">{marker.label.split(' · ')[0]}</text>}
          </g>;
        })}
        <g data-minimap-player data-world-x={player.x} data-world-z={player.z} data-yaw={player.yaw} transform={`translate(${map.x(player.x)} ${map.y(player.z)}) rotate(${minimapHeading(player.yaw)})${expanded ? ' scale(1.3)' : ''}`} pointerEvents="none">
          <circle r="8" fill="#13231dcc" /><path d="M0 -7 L5 5 L0 2 L-5 5 Z" fill="#fff9db" stroke="#172820" strokeWidth="1" />
        </g>
      </g>
      <path d={`M${edge} ${height - 18} v4 h${map.scale * bar} v-4`} fill="none" stroke="#dde7cd" strokeWidth="1" /><text x={edge} y={height - 22} fontSize={expanded ? 10 : 7} fill="#dde7cd">{bar}m</text>
      {expanded && <text x={width - edge} y={edge + 10} textAnchor="end" fontSize="11" fill="#efd077" fontWeight="700">↑ N</text>}
    </svg>
    {jammed && <div className="fps-map-jammed" role="status">SIGNAL JAMMED · static map only</div>}
    {expanded && <div className="fps-map-inspector" aria-label="Selected map marker">
      <div>{selected ? <><span>{minimapMarkerCategory(selected.marker)} · {Math.round(Math.hypot(selected.marker.x - player.x, selected.marker.z - player.z))}m{selected.outside ? ' · beyond map edge' : ''}</span><strong>{selected.marker.label.split(' · ')[0]}</strong><p>{[selected.marker.side ? `${selected.marker.side === 'ally' ? 'Allied' : selected.marker.side === 'enemy' ? 'Enemy' : 'Neutral'}` : '', ...selected.marker.label.split(' · ').slice(1)].filter(Boolean).join(' · ') || (selected.marker.kind === 'landmark' ? 'Schematic landmark position' : 'Select a marker to inspect its details.')}</p></> : <p>No markers in this district.</p>}</div>
      <nav aria-label="Browse map markers"><button type="button" disabled={!selected} onClick={() => step(-1)} aria-label="Previous map marker">‹</button><button type="button" disabled={!selected} onClick={() => step(1)} aria-label="Next map marker">›</button></nav>
    </div>}
    <div className="fps-minimap-legend">{legend}</div>
    {expanded && <details className="fps-map-symbol-guide"><summary>Map key · Bright outline: your sector · Select markers or use [ ]</summary><div>{SYMBOLS.map(({ label, marker }) => <span key={marker.id}><svg viewBox="-10 -10 20 20" aria-hidden="true"><FpsMapMarker marker={marker} outside={false} /></svg>{label}</span>)}<span>△ Raider</span><span>◯ Hazard</span><span>◌ Supply drop</span></div><p>Click stacked markers again to cycle them. Schematic buildings and water; sector areas can overlap and leave gaps.</p></details>}
    {mode === 'expedition' && !jammed && <div className="fps-map-control-legend">Facility control: <span style={{ color: CONTROL_COLOR.ally }}>Blue allied</span> · <span style={{ color: CONTROL_COLOR.enemy }}>Red enemy</span> · <span style={{ color: CONTROL_COLOR.contested }}>Gold contested</span> · Grey unclaimed</div>}
  </div>;
}
