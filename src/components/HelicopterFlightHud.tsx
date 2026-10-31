import type { FpsHud } from '../game/fps-engine';

/** Fine helmet symbology; the world-projected gun reticle remains separate. */
export default function HelicopterFlightHud({ hud }: { hud: FpsHud }) {
  if (hud.vehicle !== 'helicopter' || hud.vehicleView !== 'first-person' || hud.vehicleSeat !== 0) return null;
  const heading = ((-hud.vehicleHeading * 180 / Math.PI) % 360 + 360) % 360;
  const pitch = hud.vehiclePitch * 180 / Math.PI;
  const climbing = hud.vehicleClimb;
  return <div className="helicopter-flight-hud" aria-label="Pilot flight HUD" data-warning={hud.vehicleDamage === 'critical' || undefined}>
    <svg viewBox="0 0 600 360" aria-hidden="true">
      <g className="flight-compass">
        <path d="M210 44h180 M296 29l4 5 4-5" />
        {[-3, -2, -1, 0, 1, 2, 3].map(step => {
          const x = 300 + (step - heading % 10 / 10) * 30;
          return x < 210 || x > 390 ? null : <g key={step} transform={`translate(${x} 44)`}><path d="M0 0v5" /><text y="-10" textAnchor="middle">{String((Math.floor(heading / 10) * 10 + step * 10 + 360) % 360).padStart(3, '0')}</text></g>;
        })}
        <text x="300" y="68" textAnchor="middle" className="flight-heading">{String(Math.round(heading) % 360).padStart(3, '0')}°</text>
      </g>
      <g className="flight-ladder" transform={`translate(0 ${Math.max(-45, Math.min(45, pitch * 2.5))})`}>
        {[-20, -10, 0, 10, 20].map(deg => <g key={deg} transform={`translate(300 ${180 - deg * 2.5})`}>
          <path strokeDasharray={deg < 0 ? '3 4' : undefined} d={deg === 0 ? 'M-82 0h50 M32 0h50' : 'M-44 0h22 M22 0h22'} />
          {deg !== 0 && <text x="-52" y="3" textAnchor="end">{Math.abs(deg)}</text>}
        </g>)}
      </g>
      <path className="flight-center" d="M273 180h17l5 5h10l5-5h17 M300 167v6" />
      <g className="flight-data"><path d="M134 156h-12v43h12 M466 156h12v43h-12" />
        <text x="110" y="181" textAnchor="end" className="flight-value">{Math.round(hud.vehicleSpeed)}</text><text x="110" y="199" textAnchor="end" className="flight-unit">KM/H</text>
        <text x="490" y="181" className="flight-value">{hud.altitude.toFixed(1)}</text><text x="490" y="199" className="flight-unit">ALT M</text>
        <text x="490" y="231" className="flight-climb">{climbing >= 0 ? '+' : '−'}{Math.abs(climbing).toFixed(1)}<tspan dx="6" className="flight-unit">M/S</tspan></text>
      </g>
      <text x="300" y="291" textAnchor="middle" className="flight-mode">{hud.altitude < .3 ? 'ON GROUND' : Math.abs(climbing) < .3 ? 'LEVEL' : climbing > 0 ? 'CLIMB' : 'DESCENT'}</text>
    </svg>
  </div>;
}
