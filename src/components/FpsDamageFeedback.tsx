import { useEffect, useRef, useState } from 'react';
import type { FpsHud } from '../game/fps-engine';
import { armorBrokeOnScreen, bloodBorder, type ScreenVitals } from '../game/screen-damage';
import './fps-damage-feedback.css';

export default function FpsDamageFeedback({ hud }: { hud: Pick<FpsHud, 'health' | 'maxHealth' | 'armor' | 'maxArmor' | 'phase' | 'arenaSelf'> }) {
  const previous = useRef<ScreenVitals | null>(null);
  const [broken, setBroken] = useState(0);
  const playing = hud.phase === 'playing', alive = hud.health > 0 && hud.arenaSelf?.alive !== false;
  useEffect(() => {
    const next = { health: hud.health, armor: hud.armor, maxArmor: hud.maxArmor, playing, alive, deaths: hud.arenaSelf?.deaths };
    if (!playing || !alive) setBroken(0);
    else if (armorBrokeOnScreen(previous.current, next)) setBroken(key => key + 1);
    previous.current = next;
  }, [hud.health, hud.armor, hud.maxArmor, hud.arenaSelf?.deaths, playing, alive]);
  useEffect(() => {
    if (!broken) return;
    const timer = setTimeout(() => setBroken(0), 850);
    return () => clearTimeout(timer);
  }, [broken]);
  if (!playing || !alive) return null;
  const blood = bloodBorder(hud.health, hud.maxHealth);
  return <>
    <div className="fps-blood-border" data-health-band={blood.band} style={{ opacity: blood.opacity }} aria-hidden="true" />
    {broken > 0 && <div key={broken} className="fps-armor-break" aria-hidden="true">
      <svg viewBox="0 0 1000 700" preserveAspectRatio="none"><g>
        <path d="M0 80 82 145 55 207 132 253M82 145 140 124 184 160M55 207 0 242M0 590 92 552 125 613 195 645M92 552 73 489 110 461M125 613 111 700" />
        <path d="M1000 100 912 153 946 222 872 267M912 153 859 120 814 159M946 222 1000 255M1000 595 902 543 876 611 807 642M902 543 925 486 891 451M876 611 885 700" />
        <path d="M207 0 251 63 225 105M251 63 318 84M786 0 746 62 777 102M746 62 683 80M351 700 376 651 345 618M649 700 623 654 656 618" />
      </g></svg>
    </div>}
  </>;
}
