import { useId } from 'react';
import type { DeploymentView } from '../game/expedition-deployment';
import type { WorldZoneId } from '../game/world-zones';
import { getRegion } from '../game/regions';
import { minimapProjection } from '../game/minimap';
import './expedition-deployment.css';

export default function ExpeditionDeployment({ zone, deployment, onChoose }: { zone: WorldZoneId; deployment: DeploymentView | null; onChoose: (id: string) => void }) {
  const id = useId();
  if (!deployment?.canChoose) return null;
  const region = getRegion(zone), map = minimapProjection(region.bounds, 360, 190, 14);
  return <fieldset className="expedition-deployment" aria-label="Starting location">
    <legend>Starting location</legend>
    <label htmlFor={id}>Deploy at</label>
    <select id={id} value={deployment.choice} onChange={e => onChoose(e.target.value)}>
      <option value="random">Random entry point</option>
      {deployment.points.map((p, i) => <option key={p.id} value={p.id}>{i + 1}. {p.name}</option>)}
    </select>
    <small>{deployment.choice === 'random' ? 'A clear entry point will be chosen when you enter.' : 'Your entry is selected. Enter the district to deploy.'}</small>
    <details><summary>View entry points on map</summary>
      <svg viewBox="0 0 360 190" role="group" aria-label="Choose a deployment point">
        <rect width="360" height="190" rx="5" fill="#20372f" />
        <g transform={map.transform}>{region.mapRoads.map((road, i) => <polyline key={i} points={road.points.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="#657b6b" strokeWidth={2 / map.scale} />)}</g>
        {deployment.points.map((p, i) => <g key={p.id} data-deployment-id={p.id} data-world-x={p.x} data-world-z={p.z} transform={`translate(${map.x(p.x)} ${map.y(p.z)})`} role="button" tabIndex={0} aria-label={`Deploy at ${p.name}`} aria-pressed={deployment.choice === p.id}
          onClick={() => onChoose(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoose(p.id); } }}>
          <title>{p.name}</title><circle r="12" fill={deployment.choice === p.id ? '#f0d18a' : '#182c25'} stroke="#f0d18a" strokeWidth="2" />
          <text y="4" textAnchor="middle" fill={deployment.choice === p.id ? '#14241c' : '#fff1c6'} fontSize="11" fontWeight="700">{i + 1}</text>
        </g>)}
      </svg>
    </details>
  </fieldset>;
}
