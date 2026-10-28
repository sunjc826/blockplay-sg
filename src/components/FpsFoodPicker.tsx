import type { FpsEngine, FpsHud } from '../game/fps-engine';
import { tapProps } from './touch-tap';
import './fps-callouts.css';

/**
 * The food picker: Auto at the top, then every food carried round the ring.
 * With a captured mouse it is steered from the centre while 4 is held, as the
 * callout wheel is with Y; on touch or with a free pointer the foods are
 * buttons. The hub spells out what the food pointed at will do.
 */
export default function FpsFoodPicker({ hud, engine, kind = 'food' }: { hud: FpsHud; engine: FpsEngine | null; kind?: 'food' | 'grenade' }) {
  const grenade = kind === 'grenade', choice = grenade ? hud.grenadeChoice : hud.foodChoice;
  const picker = grenade ? hud.grenadePicker : hud.foodPicker;
  if (!picker || hud.phase !== 'playing') return null;
  const focus = picker.options[picker.slot ?? -1] ?? picker.options.find(option => option.id === choice) ?? picker.options[0];
  return <div className={`fps-callout-wheel fps-food-picker${grenade ? ' fps-grenade-picker' : ''}${picker.options.length > 8 ? ' is-many' : ''}`} role="dialog" aria-label={`Choose ${kind}`}>
    <div className="fps-callout-ring">
      {picker.options.map((option, i) => {
        const angle = i / picker.options.length * Math.PI * 2, current = option.id === choice;
        const press = tapProps(() => grenade ? engine?.chooseGrenade(option.id) : engine?.chooseFood(option.id));
        return <button key={option.id ?? 'auto'} type="button" className="fps-callout-slot fps-food-option" data-tier={option.tier?.toLowerCase() ?? 'auto'}
          data-selected={picker.slot === i || undefined} data-current={current || undefined} aria-pressed={current}
          aria-label={`${option.name}${option.id ? `, ${option.count} carried${grenade ? '' : `, +${option.health} HP`}. ${option.effects.join('. ')}` : grenade ? '. Catalogue order.' : '. Heals to need.'}`}
          // The radius is the stylesheet's, so a phone can pull the ring in.
          style={{ left: `calc(50% + ${Math.sin(angle).toFixed(3)} * var(--food-radius))`, top: `calc(50% - ${Math.cos(angle).toFixed(3)} * var(--food-radius))` }}
          {...press} onClick={event => {
            // A touch that opened the picker can end over a newly mounted option.
            // Touch choices already act on pointer-down; ignore its retargeted click.
            if ((event.nativeEvent as PointerEvent).pointerType !== 'touch') press.onClick(event);
          }}>
          <span>{option.name}<small>{option.id ? `x${option.count}${grenade ? '' : ` · +${option.health} HP`}` : grenade ? 'Catalogue order' : 'Heals to need'}</small></span>
        </button>;
      })}
      <div className="fps-callout-hub fps-food-hub">
        <b>{focus.name}</b>
        {focus.tier && <em data-tier={focus.tier.toLowerCase()}>{focus.tier}</em>}
        <ul>{focus.effects.map(line => { const [label, ...rest] = line.split(' · '); return <li key={line}><b>{label}</b> {rest.join(' · ')}</li>; })}</ul>
        <small>{hud.inputMode === 'touch' ? `Tap a ${kind} to pick it` : hud.locked ? `Point · release ${grenade ? '9' : '4'} to pick` : `Click a ${kind} to pick it`}</small>
        <button type="button" className="fps-callout-close" aria-label={`Close ${kind} picker`} {...tapProps(() => grenade ? engine?.closeGrenadePicker() : engine?.closeFoodPicker())}>×</button>
      </div>
    </div>
  </div>;
}
