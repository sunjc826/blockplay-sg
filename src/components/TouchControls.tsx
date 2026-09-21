import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ChevronsUp, Crosshair, Footprints, Hand, Menu, Move3d, PackageOpen, RefreshCw, Rocket, Repeat2 } from 'lucide-react';
import type { FpsEngine, FpsHud } from '../game/fps-engine';
import type { StickVector } from '../game/touch-controls';
import TouchStick from './TouchStick';
import './touch-controls.css';

/**
 * The thumb layer: two floating sticks and the actions that need a finger of
 * their own, drawn over the scene instead of under it so a phone spends its
 * screen on the world rather than on a control bar.
 *
 * It is drawn only while a round is actually running: the pause and briefing
 * cards own the viewport the rest of the time. The sticks themselves are
 * aria-hidden, because a bare drag surface has nothing useful to announce — the
 * buttons here and the bar below the scene are the reachable path to the same
 * commands.
 */
export default function TouchControls({ hud, engine, mode, onMenu }: {
  hud: FpsHud;
  engine: FpsEngine | null;
  mode: 'range' | 'arena' | 'expedition';
  onMenu: () => void;
}) {
  const [crouched, setCrouched] = useState(false);
  const firePointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const alive = mode !== 'arena' || hud.arenaSelf?.alive !== false;
  const playing = hud.phase === 'playing' && alive;
  const mounted = hud.vehicle !== 'on-foot';
  const flying = hud.vehicle === 'helicopter';

  // The engine drops every held key when it pauses or the player dies, so the
  // crouch latch has to let go too or the button would lie about the stance.
  useEffect(() => { if (!playing) setCrouched(false); }, [playing]);
  useEffect(() => { if (!playing) { engine?.setMoveAxis(null); engine?.setLookAxis(null); } }, [playing, engine]);

  const hold = (key: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engine?.setInput(key, true); },
    onPointerUp: () => engine?.setInput(key, false),
    onPointerCancel: () => engine?.setInput(key, false),
    onLostPointerCapture: () => engine?.setInput(key, false),
  });
  const toggleCrouch = () => { const next = !crouched; setCrouched(next); engine?.setInput('c', next); };
  const move = (stick: StickVector) => engine?.setMoveAxis(stick.magnitude > 0 ? stick : null);
  const aim = (stick: StickVector) => engine?.setLookAxis(stick.magnitude > 0 ? stick : null);

  // Holding the trigger and sliding the same thumb keeps the aim correctable
  // one-handed; without this the right thumb has to choose between the two.
  const endFire = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (firePointer.current?.id !== event.pointerId) return;
    firePointer.current = null; engine?.setInput('fire', false);
  };
  const fire = {
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      firePointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      engine?.setInput('fire', true);
    },
    onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
      const from = firePointer.current;
      if (from?.id !== event.pointerId) return;
      engine?.lookBy(event.clientX - from.x, event.clientY - from.y);
      from.x = event.clientX; from.y = event.clientY;
    },
    onPointerUp: endFire,
    onPointerCancel: endFire,
    onLostPointerCapture: endFire,
  };

  // The visible label is dropped on a short screen to keep the row to one line,
  // so the name has to live on the element itself rather than in its text.
  const action = (key: string, label: string, icon: React.ReactNode, props: object) =>
    <button key={key} type="button" className="touch-button" data-touch-action={key} aria-label={label} title={label} {...props}>{icon}<span>{label}</span></button>;

  const actions: React.ReactNode[] = [];
  if (mounted) {
    actions.push(action('boost', flying ? 'Boost' : 'Sprint', <Rocket size={15} />, hold('shift')));
    actions.push(action('altitude', flying ? 'Climb' : 'Brake', <ChevronsUp size={15} />, hold(' ')));
    if (flying) actions.push(action('descend', 'Descend', <ArrowDownToLine size={15} />, hold('c')));
    actions.push(action('vehicle', 'Exit', <Footprints size={15} />, { onClick: () => engine?.interactVehicle(), disabled: !hud.interact }));
  } else {
    actions.push(action('aim', 'Aim', <Crosshair size={15} />, { onClick: () => engine?.toggleAim(), 'aria-pressed': hud.aiming, 'data-on': hud.aiming || undefined }));
    actions.push(action('reload', 'Reload', <RefreshCw size={15} />, { onClick: () => engine?.reload(), disabled: hud.reloading > 0 }));
    actions.push(action('jump', 'Jump', <ChevronsUp size={15} />, { onClick: () => engine?.jump() }));
    actions.push(action('crouch', 'Crouch', <ArrowDownToLine size={15} />, { onClick: toggleCrouch, 'aria-pressed': crouched, 'data-on': crouched || undefined }));
    actions.push(action('weapon', 'Swap', <Repeat2 size={15} />, { onClick: () => engine?.switchWeapon(hud.weapon === 0 ? 1 : 0) }));
    if (mode === 'expedition') {
      actions.push(action('loot', 'Pick up', <PackageOpen size={15} />, { onClick: () => engine?.interactLoot(), disabled: !hud.lootPrompt }));
      actions.push(action('travel', 'Travel', <Move3d size={15} />, { onClick: () => engine?.travelZone(), disabled: !hud.travelPrompt }));
      if (hud.quickItem) actions.push(action('supply', hud.quickItem, <Hand size={15} />, { onClick: () => engine?.useQuickItem(), disabled: !hud.quickCount }));
    } else if (mode === 'range') {
      actions.push(action('vehicle', 'Enter', <Move3d size={15} />, { onClick: () => engine?.interactVehicle(), disabled: !hud.interact }));
    }
  }

  return <div className="touch-layer" data-touch-layer={mode} data-mounted={mounted || undefined}>
    <div className="touch-side is-left">
      <TouchStick kind="move" label={mounted ? 'DRIVE' : 'MOVE'} onChange={move} />
    </div>
    <div className="touch-side is-right">
      <div className="touch-actions">
        {action('menu', mode === 'range' ? 'Pause' : 'Menu', <Menu size={15} />, { onClick: onMenu })}
        {actions}
      </div>
      <div className="touch-primary">
        <button type="button" className="touch-fire" data-touch-action="fire" disabled={mounted} {...fire}>FIRE</button>
        <TouchStick kind="look" label="LOOK" onChange={aim} />
      </div>
    </div>
  </div>;
}
