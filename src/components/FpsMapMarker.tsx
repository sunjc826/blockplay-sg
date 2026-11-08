import type { MinimapMarker } from '../game/minimap';

/** Shapes stay distinct without relying on color, including at minimap size. */
export default function FpsMapMarker({ marker, outside }: { marker: MinimapMarker; outside: boolean }) {
  if(marker.kind==='control')return <g data-control-station={marker.id}><circle r="7" fill={marker.active?'#eef5fa':'#253c43'} stroke={marker.active?'#ffc56e':'#93a3aa'} strokeWidth="2"/><text y="3" textAnchor="middle" fontSize="9" fontWeight="800" fill={marker.active?'#152a32':'#dde6e9'}>{marker.number}</text></g>;
  if (marker.kind === 'facility') return <g data-facility-type={marker.facilityType ?? 'unknown'}>
    <rect x="-6" y="-6" width="12" height="12" rx="1" fill="#16231f" stroke={marker.side === 'ally' ? '#70cfff' : marker.side === 'enemy' ? '#ff8870' : '#cbd2c7'} strokeWidth="1.8" strokeDasharray={marker.inactive ? '2 2' : undefined} />
    {marker.inactive ? <path d="M-3 -3L3 3M-3 3L3 -3" stroke="#eef2e4" strokeWidth="1.4" />
      : marker.facilityType === 'command' ? <path d="M-2 4V-4L4 -4V0H-2" fill="none" stroke="#eef2e4" strokeWidth="1.3" />
      : marker.facilityType === 'garage' ? <path d="M-4 4V-2L0 -4L4 -2V4M-2 4V0H2V4" fill="none" stroke="#eef2e4" strokeWidth="1.2" />
      : marker.facilityType === 'supply' ? <path d="M-3 -3H3V3H-3ZM0 -3V3M-3 0H3" fill="none" stroke="#eef2e4" strokeWidth="1" />
      : <text y="3" textAnchor="middle" fontSize="9" fill="#eef2e4">{marker.facilityType === 'helipad' ? 'H' : '+'}</text>}
  </g>;
  if (marker.kind === 'loot') return <g data-loot-type={marker.lootType ?? 'unknown'} stroke="#b5efd0" strokeWidth="1.5" strokeLinejoin="round" fill="#17382c">
    {marker.lootType === 'weapon' ? <path d="M-6 -2H5V0H0L-2 4H-4L-3 0H-6Z" />
      : marker.lootType === 'ammo' ? <path d="M-4 4V-2L-2 -5L0 -2V4ZM1 4V-2L3 -5L5 -2V4Z" />
      : marker.lootType === 'medical' || marker.lootType === 'resupply' ? <path d="M-2 -5H2V-2H5V2H2V5H-2V2H-5V-2H-2Z" />
      : marker.lootType === 'armor' ? <path d="M0 -5L5 -3V1Q4 4 0 6Q-4 4 -5 1V-3Z" />
      : marker.lootType === 'food' ? <><path d="M-5 -1H5Q4 5 0 5Q-4 5 -5 -1Z" /><path d="M-2 -3V-6M2 -3V-6" fill="none" /></>
      : <rect x="-3" y="-3" width="6" height="6" fill="#91dcb0" stroke="#172820" />}
  </g>;
  if (marker.kind === 'landmark') return <path d="M0 -4L4 0L0 4L-4 0Z" fill="#96b3a3" stroke="#172820" />;
  if (marker.kind === 'parachute') return <path d="M-6 0 A6 5 0 0 1 6 0 Z M-6 0 L0 7 L6 0 M0 0 L0 7" fill={marker.side === 'ally' ? '#70cfff' : '#ff8870'} stroke="#e9e4cb" strokeWidth="1.2" />;
  if (marker.kind === 'boat') return <path d="M-5 -4 L5 -4 L4 3 L0 6 L-4 3 Z M-2 -6 L2 -6 L2 -4 L-2 -4 Z" fill={marker.side === 'ally' ? '#70cfff' : '#ff675c'} stroke="#172820" strokeWidth="1.3" />;
  if (marker.kind === 'checkpoint') return <path d="M0 -6 L6 0 L0 6 L-6 0 Z" fill={outside ? '#26362c' : '#efd077'} stroke="#efd077" strokeWidth="2" />;
  if (marker.kind === 'npc') return <><circle r="5" fill="#9bdcf0" stroke="#263f49" /><text y="3" textAnchor="middle" fill="#18303a" fontSize="7" fontWeight="800">N</text></>;
  if (marker.kind === 'target') return <circle r="3" fill="#ee967c" stroke="#401e18" />;
  if (marker.kind === 'ally') return <circle r="4" fill="#70cfff" stroke="#163a50" strokeWidth="1.5" />;
  if (marker.kind === 'enemy') return <path d="M0 -5 L5 0 L0 5 L-5 0 Z" fill="#ff675c" stroke="#4a1715" strokeWidth="1.5" />;
  if (marker.kind === 'scent') return <><circle r="7" fill="#c9c25a33" stroke="#c9c25a" strokeWidth="1.2" strokeDasharray="2 2" /><path d="M-3 2 q1.5 -3 0 -5 M0 2 q1.5 -3 0 -5 M3 2 q1.5 -3 0 -5" fill="none" stroke="#e3dc7a" strokeWidth="1.1" strokeLinecap="round" /></>;
  return <><rect x="-6" y="-6" width="12" height="12" rx="2" fill="#182d35" stroke="#9bdcf0" /><text y="3" textAnchor="middle" fill="#c7f3ff" fontSize="9" fontWeight="700">{marker.kind === 'car' ? 'C' : 'H'}</text></>;
}
