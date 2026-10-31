import type { FpsHud } from '../game/fps-engine';

/** Helmet flight symbology; gun impact remains the separately projected reticle. */
export default function HelicopterFlightHud({ hud }: { hud: FpsHud }) {
  if (hud.vehicle !== 'helicopter' || hud.vehicleView !== 'first-person' || hud.vehicleSeat !== 0) return null;
  const heading = ((-hud.vehicleHeading * 180 / Math.PI) % 360 + 360) % 360;
  const pitch = hud.vehiclePitch * 180 / Math.PI;
  const climbing = hud.vehicleClimb;
  return <div className="helicopter-flight-hud" aria-label="Pilot flight HUD" data-warning={hud.vehicleDamage === 'critical' || undefined}>
    <svg viewBox="0 0 600 380" aria-hidden="true">
      <g className="flight-scale">
        <path d="M180 45H420 M300 45v12 M180 45v8 M240 45v8 M360 45v8 M420 45v8 M292 29l8 9 8-9" />
        {[-2, -1, 0, 1, 2].map((step) => <text key={step} x={300 + step * 60} y="22" textAnchor="middle">{String((Math.round(heading / 10) * 10 + step * 10 + 360) % 360).padStart(3, '0')}</text>)}
        <text x="300" y="80" textAnchor="middle">HDG {String(Math.round(heading) % 360).padStart(3, '0')}</text>
        <path d="M115 132h-15v116h15 M485 132h15v116h-15 M255 190h28l8 7h18l8-7h28 M300 177v8" />
        <g transform={`translate(0 ${Math.max(-50, Math.min(50, pitch * 3))})`}>
          {[-20, -10, 0, 10, 20].map(deg => <g key={deg} transform={`translate(300 ${190 - deg * 3})`}>
            <path strokeDasharray={deg < 0 ? '5 4' : undefined} d={deg === 0 ? 'M-105 0h75 M30 0h75' : 'M-65 0h40 M25 0h40'} />
            {deg !== 0 && <><text x="-75" y="4" textAnchor="end">{deg}</text><text x="75" y="4">{deg}</text></>}
          </g>)}
        </g>
      </g>
      <text x="85" y="168" textAnchor="end" className="flight-value">{Math.round(hud.vehicleSpeed)}</text><text x="85" y="186" textAnchor="end">KM/H</text>
      <text x="515" y="168" className="flight-value">{hud.altitude.toFixed(1)}</text><text x="515" y="186">ALT M</text>
      <text x="515" y="226">{climbing >= 0 ? '+' : ''}{climbing.toFixed(1)}</text><text x="515" y="244">V/S M/S</text>
      <text x="300" y="310" textAnchor="middle">{hud.altitude < .3 ? 'ON GROUND' : Math.abs(climbing) < .3 ? 'LEVEL FLIGHT' : climbing > 0 ? 'CLIMB' : 'DESCENT'}</text>
      <text x="300" y="339" textAnchor="middle">{hud.vehicleDamage === 'critical' ? 'CAUTION · HULL CRITICAL' : `HULL ${Math.ceil(hud.vehicleHealth / hud.vehicleMaxHealth * 100)}%   /   GUN ${hud.vehicleAmmo}`}</text>
    </svg>
  </div>;
}
