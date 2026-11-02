import type { CSSProperties } from 'react';
import type { FpsEngine, FpsHud } from '../game/fps-engine';
import { itemById } from '../game/armory-catalog';
import { armoryThumbnailFile } from '../game/armory-thumbnails';
import { tapProps } from './touch-tap';
import './fps-utility-picker.css';

/** The same photographs used in the store, with details only for the focused item. */
export default function FpsUtilityPicker({ hud, engine }: { hud: FpsHud; engine: FpsEngine | null }) {
  const picker = hud.recoveryPicker ?? hud.grenadePicker;
  if (!picker || hud.phase !== 'playing') return null;
  const recovery = !!hud.recoveryPicker, group = recovery ? 'recovery' : 'combat', key = recovery ? 'F' : 'G';
  const choice = recovery ? hud.recoveryChoice : hud.grenadeChoice;
  const focus = picker.options[picker.slot ?? -1] ?? picker.options.find(option => option.id === choice) ?? picker.options[0];
  const close = () => recovery ? engine?.closeRecoveryPicker() : engine?.closeGrenadePicker();
  return <div className="fps-utility-picker" data-group={group} role="dialog" aria-label={`Choose ${group} item`}>
    <div className="fps-utility-ring" style={{ '--utility-count': picker.options.length } as CSSProperties}>
      {picker.options.map((option, index) => {
        const angle = index / picker.options.length * Math.PI * 2, current = option.id === choice;
        const press = tapProps(() => recovery ? engine?.chooseRecovery(option.id) : engine?.chooseGrenade(option.id));
        return <button key={option.id} type="button" className="fps-utility-option" data-item={option.id} data-current={current || undefined}
          data-selected={picker.slot === index || undefined} aria-pressed={current} aria-label={`${option.name}, ${option.count} carried. ${option.effects.join('. ')}`}
          style={{ left: `calc(50% + ${Math.sin(angle).toFixed(4)} * var(--utility-radius))`, top: `calc(50% - ${Math.cos(angle).toFixed(4)} * var(--utility-radius))` }}
          onPointerEnter={() => { if (!hud.locked) engine?.pointUtilityOption(group, index); }} onFocus={() => engine?.pointUtilityOption(group, index)}
          {...press} onClick={event => { if ((event.nativeEvent as PointerEvent).pointerType !== 'touch') press.onClick(event); }}>
          <img src={`${import.meta.env.BASE_URL}images/armory/${armoryThumbnailFile(itemById(option.id)!)}`} alt="" draggable={false} />
          <b>×{option.count}</b>
        </button>;
      })}
      <div className="fps-utility-hub">
        <span>{key} · {recovery ? 'Recovery' : 'Combat'}</span>
        <strong>{focus.name}</strong>
        <small>{recovery ? `${focus.seconds.toFixed(1)} s to use` : 'Ready · fire to throw'}</small>
        <ul>{focus.effects.map((line, index) => <li key={index}>{line}</li>)}</ul>
        <p>{hud.inputMode === 'touch' ? 'Tap an item to select' : hud.locked ? `Point · release ${key} to select` : 'Click an item to select'}</p>
        <button type="button" aria-label="Close utility picker" {...tapProps(close)}>Cancel</button>
      </div>
    </div>
  </div>;
}
