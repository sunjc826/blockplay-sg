import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ChevronsUp, Crosshair, Footprints, Hand, Menu, Move3d, PackageOpen, RefreshCw, Rocket, Repeat2 } from 'lucide-react';
import type { FpsEngine, FpsHud } from '../game/fps-engine';
import { promptLabel, thumbArc, type StickVector } from '../game/touch-controls';
import TouchStick from './TouchStick';
import './touch-controls.css';

/**
 * The thumb layer, laid out the way a phone shooter is.
 *
 * The left thumb keeps its floating movement stick. The right thumb gets the
 * trigger and nothing else to hunt for: the actions sit on the arc the thumb
 * already sweeps, rather than in a row that a hand holding a phone cannot
 * reach the far end of. Everything between the two is bare scene, because the
 * scene is the look surface — a drag anywhere the controls are not turns the
 * camera, which is why there is no look stick to take up a corner.
 *
 * Contextual actions do not sit in the arc. A button that appears and shifts
 * its neighbours while you walk past a crate is worse than no button, so they
 * are a prompt in the middle of the screen, where the HUD already puts the
 * matching line for a keyboard, and only while they can actually be pressed.
 *
 * It is drawn only while a round is running: the pause and briefing cards own
 * the viewport the rest of the time. The stick is aria-hidden, because a bare
 * drag surface has nothing useful to announce — these buttons and the bar
 * below the scene are the reachable path to the same commands.
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
  useEffect(() => { if (!playing) engine?.setMoveAxis(null); }, [playing, engine]);

  const hold = (key: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engine?.setInput(key, true); },
    onPointerUp: () => engine?.setInput(key, false),
    onPointerCancel: () => engine?.setInput(key, false),
    onLostPointerCapture: () => engine?.setInput(key, false),
  });
  const toggleCrouch = () => { const next = !crouched; setCrouched(next); engine?.setInput('c', next); };
  const move = (stick: StickVector) => engine?.setMoveAxis(stick.magnitude > 0 ? stick : null);

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

  type Action = { key: string; label: string; icon: React.ReactNode; props: Record<string, unknown> };
  const act = (key: string, label: string, icon: React.ReactNode, props: Record<string, unknown> = {}): Action => ({ key, label, icon, props });

  // The sweep, nearest the resting thumb first: what you press without stopping
  // shooting comes before what you press between fights.
  const sweep: Action[] = [];
  const prompts: Action[] = [];
  if (mounted) {
    sweep.push(act('boost', flying ? 'Boost' : 'Sprint', <Rocket size={17} />, hold('shift')));
    sweep.push(act('altitude', flying ? 'Climb' : 'Brake', <ChevronsUp size={17} />, hold(' ')));
    if (flying) sweep.push(act('descend', 'Descend', <ArrowDownToLine size={17} />, hold('c')));
    if (hud.interact) prompts.push(act('vehicle', promptLabel(hud.interact), <Footprints size={16} />, { onClick: () => engine?.interactVehicle() }));
  } else {
    sweep.push(act('aim', 'Aim', <Crosshair size={17} />, { onClick: () => engine?.toggleAim(), 'aria-pressed': hud.aiming, 'data-on': hud.aiming || undefined }));
    sweep.push(act('reload', 'Reload', <RefreshCw size={17} />, { onClick: () => engine?.reload(), disabled: hud.reloading > 0 }));
    sweep.push(act('crouch', 'Crouch', <ArrowDownToLine size={17} />, { onClick: toggleCrouch, 'aria-pressed': crouched, 'data-on': crouched || undefined }));
    sweep.push(act('jump', 'Jump', <ChevronsUp size={17} />, { onClick: () => engine?.jump() }));
    sweep.push(act('weapon', 'Swap', <Repeat2 size={17} />, { onClick: () => engine?.switchWeapon(hud.weapon === 0 ? 1 : 0) }));
    if (mode === 'expedition') {
      if (hud.quickItem && hud.quickCount > 0) sweep.push(act('supply', hud.quickItem, <Hand size={17} />, { onClick: () => engine?.useQuickItem() }));
      if (hud.lootPrompt) prompts.push(act('loot', promptLabel(hud.lootPrompt), <PackageOpen size={16} />, { onClick: () => engine?.interactLoot() }));
      if (hud.travelPrompt) prompts.push(act('travel', promptLabel(hud.travelPrompt), <Move3d size={16} />, { onClick: () => engine?.travelZone() }));
    } else if (mode === 'range' && hud.interact) {
      prompts.push(act('vehicle', promptLabel(hud.interact), <Move3d size={16} />, { onClick: () => engine?.interactVehicle() }));
    }
  }
  const arc = thumbArc(sweep.length);

  return <div className="touch-layer" data-touch-layer={mode} data-mounted={mounted || undefined} style={{ '--arc-spread': arc.spread } as React.CSSProperties}>
    {/* Out of both sweeps: a mis-hit here costs the round, not a magazine. */}
    <div className="touch-move">
      <button type="button" className="touch-chip" data-touch-action="menu" aria-label={mode === 'range' ? 'Pause' : 'Menu'} title={mode === 'range' ? 'Pause' : 'Menu'} onClick={onMenu}><Menu size={16} /></button>
      <TouchStick kind="move" label={mounted ? 'DRIVE' : 'MOVE'} onChange={move} />
    </div>

    {prompts.length > 0 && <div className="touch-prompts">
      {prompts.map(item => <button key={item.key} type="button" className="touch-prompt" data-touch-action={item.key} onClick={item.props.onClick as () => void}>{item.icon}<span>{item.label}</span></button>)}
    </div>}

    <div className="touch-combat">
      {sweep.map((item, index) => <button
        key={item.key}
        type="button"
        className="touch-button"
        data-touch-action={item.key}
        aria-label={item.label}
        title={item.label}
        style={{ '--arc-x': arc.slots[index].x, '--arc-y': arc.slots[index].y } as React.CSSProperties}
        {...item.props}
      >{item.icon}</button>)}
      <button type="button" className="touch-fire" data-touch-action="fire" aria-label="Fire" disabled={mounted} {...fire}>FIRE</button>
    </div>
  </div>;
}
