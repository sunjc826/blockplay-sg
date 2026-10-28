import type { FpsEngine, FpsHud } from '../game/fps-engine';
import { tapProps } from './touch-tap';
import './fps-callouts.css';

/**
 * The food picker: Auto at the top, then every food carried round the ring.
 * With a captured mouse it is steered from the centre while 4 is held, as the
 * callout wheel is with Y; on touch or with a free pointer the foods are
 * buttons. The hub spells out what the food pointed at will do.
 */
export default function FpsFoodPicker({ hud, engine }: { hud: FpsHud; engine: FpsEngine | null }) {
  const picker = hud.foodPicker;
  if (!picker || hud.phase !== 'playing') return null;
  const focus = picker.options[picker.slot ?? -1] ?? picker.options.find(option => option.id === hud.foodChoice) ?? picker.options[0];
  return <div className="fps-callout-wheel fps-food-picker" role="dialog" aria-label="Choose food">
    <div className="fps-callout-ring">
      {picker.options.map((option, i) => {
        const angle = i / picker.options.length * Math.PI * 2, current = option.id === hud.foodChoice;
        return <button key={option.id ?? 'auto'} type="button" className="fps-callout-slot fps-food-option" data-tier={option.tier?.toLowerCase() ?? 'auto'}
          data-selected={picker.slot === i || undefined} data-current={current || undefined} aria-pressed={current}
          aria-label={`${option.name}${option.id ? `, ${option.count} carried, +${option.health} HP. ${option.effects.join('. ')}` : '. Heals to need.'}`}
          // The radius is the stylesheet's, so a phone can pull the ring in.
          style={{ left: `calc(50% + ${Math.sin(angle).toFixed(3)} * var(--food-radius))`, top: `calc(50% - ${Math.cos(angle).toFixed(3)} * var(--food-radius))` }}
          {...tapProps(() => engine?.chooseFood(option.id))}>
          <span>{option.name}<small>{option.id ? `x${option.count} · +${option.health} HP` : 'Heals to need'}</small></span>
        </button>;
      })}
      <div className="fps-callout-hub fps-food-hub">
        <b>{focus.name}</b>
        {focus.tier && <em data-tier={focus.tier.toLowerCase()}>{focus.tier}</em>}
        <ul>{focus.effects.map(line => { const [label, ...rest] = line.split(' · '); return <li key={line}><b>{label}</b> {rest.join(' · ')}</li>; })}</ul>
        <small>{hud.inputMode === 'touch' ? 'Tap a food to pick it' : hud.locked ? 'Point · release 4 to pick' : 'Click a food to pick it'}</small>
        <button type="button" className="fps-callout-close" aria-label="Close food picker" {...tapProps(() => engine?.closeFoodPicker())}>×</button>
      </div>
    </div>
  </div>;
}
