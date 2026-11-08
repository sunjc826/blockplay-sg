import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ChevronsDown, ChevronsUp, Crosshair, Eye, Flashlight, Footprints, Menu, MessageCircle, Minus, Move3d, PackageOpen, Plus, RefreshCw, Rocket, Repeat2, RotateCcw } from 'lucide-react';
import type { FpsEngine, FpsHud } from '../game/fps-engine';
import { padSlot, promptLabel, type StickVector } from '../game/touch-controls';
import { visionAction, visionStatus } from './FpsVisionChip';
import './fps-vision.css';
import TouchStick from './TouchStick';
import { tapProps } from './touch-tap';
import { CalloutChip } from './FpsCalloutWheel';
import './touch-controls.css';

/**
 * The thumb layer, laid out the way a phone shooter is.
 *
 * The left thumb keeps its floating movement stick and nothing else. The right
 * thumb gets the pad the big mobile shooters use, so a player's hands already
 * know it: the trigger raised off the corner where the thumb rests, aim and
 * jump up the edge beside it, crouch and prone along the bottom corner, and
 * reload a short reach to its left (`padSlot` has the map). Everything between
 * the two is bare scene, because the scene is the look surface — a drag
 * anywhere the controls are not turns the camera, which is why there is no
 * look stick to take up a corner.
 *
 * Contextual actions do not sit on the pad. A button that appears and shifts
 * its neighbours while you walk past a crate is worse than no button, so they
 * are a prompt in the middle of the screen, where the HUD already puts the
 * matching line for a keyboard, and only while they can actually be pressed.
 *
 * It is drawn only while a round is running: the pause and briefing cards own
 * the viewport the rest of the time. The stick is aria-hidden, because a bare
 * drag surface has nothing useful to announce — these buttons and the bar
 * below the scene are the reachable path to the same commands.
 */
export default function TouchControls({ hud, engine, mode, onMenu, crossing = false }: {
  hud: FpsHud;
  engine: FpsEngine | null;
  mode: 'range' | 'arena' | 'expedition';
  onMenu: () => void;
  crossing?: boolean;
}) {
  const [crouched, setCrouched] = useState(false);
  const firePointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const alive = mode !== 'arena' || hud.arenaSelf?.alive !== false;
  const playing = (hud.phase === 'playing' || crossing) && alive;
  const mounted = hud.vehicle !== 'on-foot';
  const merlion=!!hud.arenaSelf?.alive&&hud.arena?.merlion?.operator===hud.arenaSelf?.id;
  const flying = hud.vehicle === 'helicopter';
  const aimPressed = hud.grenadeHeld ? hud.grenadeHeld.under : hud.aiming;
  // Above aim on the edge, and only through the scope: the picture is the only place a change of power shows.
  const zoom = hud.aiming && !merlion ? hud.scopeZoom : null;

  // The engine drops every held key when it pauses or the player dies, so the
  // crouch latch has to let go too or the button would lie about the stance.
  useEffect(() => { if (!playing) setCrouched(false); }, [playing]);
  // A slide that comes up into a run lets the latch go in the engine.
  useEffect(() => { if (hud.crouchLatched === false) setCrouched(false); }, [hud.crouchLatched]);
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
  // A press acts on touch-down for any finger (see `tapProps`), so a tap still lands while the other thumb steers.
  const act = (key: string, label: string, icon: React.ReactNode, props: Record<string, unknown> = {}): Action =>
    ({ key, label, icon, props: typeof props.onClick === 'function' ? { ...props, ...tapProps(props.onClick as () => void) } : props });

  // The right thumb's pad; each action has a fixed place (`padSlot`), so one
  // that comes or goes never moves its neighbours under the thumb.
  const pad: Action[] = [];
  const prompts: Action[] = [];
  if(merlion){
    pad.push(act('aim','Mist burst',<Crosshair size={17}/>,{onClick:()=>engine?.merlionAction('mist'),disabled:!!hud.arena?.merlion?.cooldown || (hud.arena?.merlion?.pressure??0)<.4}));
    prompts.push(act('vehicle','Leave Merlion',<Footprints size={16}/>,{onClick:()=>engine?.merlionAction('leave')}));
  } else if (mounted) {
    pad.push(act('seat', 'Switch seat', <Repeat2 size={17} />, { onClick: () => engine?.switchVehicleSeat(), 'data-pad-slot': 'corner-left' }));
    pad.push(act('view', 'Switch vehicle view', <Eye size={17} />, { onClick: () => engine?.toggleVehicleView(), 'data-pad-slot': 'edge-top' }));
    if (hud.vehicleSeat !== 0 && (hud.vehiclePersonalWeapon || hud.vehicleCanFire)) pad.push(act('aim', 'Aim', <Crosshair size={17} />, { onClick: () => engine?.toggleAim(), 'aria-pressed': hud.aiming }));
    if (hud.vehiclePersonalWeapon) pad.push(act('reload', 'Reload', <RefreshCw size={17} />, { onClick: () => engine?.reload(), disabled: hud.reloading > 0 }));
    if (hud.vehicleSeat === 0) {
      if (hud.vehicle === 'car' || flying) pad.push(act('boost', flying ? 'Boost' : 'Sprint', <Rocket size={17} />, hold('shift')));
      pad.push(act('altitude', flying ? 'Climb' : 'Brake', <ChevronsUp size={17} />, hold(' ')));
      if (flying) pad.push(act('descend', 'Descend', <ArrowDownToLine size={17} />, hold('control')));
    }
    if (hud.interact) prompts.push(act('vehicle', promptLabel(hud.interact), <Footprints size={16} />, { onClick: () => engine?.interactVehicle() }));
  } else {
    if(!hud.swimming) pad.push(act('crouch', 'Crouch', <ChevronsDown size={17} />, { onClick: toggleCrouch, 'aria-pressed': crouched, 'data-on': crouched || undefined }));
    if(!hud.swimming) pad.push(act('prone', hud.prone ? 'Stand' : 'Prone', <ArrowDownToLine size={17} />, { onClick: () => { setCrouched(false); engine?.setInput('z', true); }, 'aria-pressed': hud.prone, 'data-on': hud.prone || undefined }));
    if(!hud.swimming) pad.push(act('aim', hud.grenadeHeld ? 'Underarm lob' : 'Aim', <Crosshair size={17} />, { onClick: () => engine?.toggleAim(), 'aria-pressed': aimPressed, 'data-on': aimPressed || undefined }));
    pad.push(act('reload', 'Reload', <RefreshCw size={17} />, { onClick: () => engine?.reload(), disabled: hud.reloading > 0 }));
    if(!hud.swimming) pad.push(act('jump', 'Jump', <ChevronsUp size={17} />, { onClick: () => engine?.jump() }));
    // Only a weapon that carries them shows these, each in a slot of its own.
    if (hud.offsetDot) pad.push(act('cant', hud.canted ? 'Back to scope' : 'Offset dot', <RotateCcw size={17} />, { onClick: () => engine?.toggleCant(), 'aria-pressed': hud.canted, 'data-on': hud.canted || undefined }));
    if (hud.rail) pad.push(act('rail', `${hud.rail.kind === 'light' ? 'Weapon light' : hud.rail.kind === 'laser' ? 'Laser' : 'Laser-light'} ${hud.rail.on ? 'on' : 'off'}`, <Flashlight size={17} />, { onClick: () => engine?.toggleRail(), 'aria-pressed': hud.rail.on, 'data-on': hud.rail.on || undefined }));
    // Weapons are drawn from the slider in the top-right corner, not the pad.
    if (mode === 'expedition') {
      // Supplies are tapped on the utility belt itself, and field items on their own card (FpsLootCard).
      if (hud.npcPrompt) prompts.push(act('npc', promptLabel(hud.npcPrompt), <MessageCircle size={16} />, { onClick: () => engine?.interactNpc() }));
      if (hud.travelPrompt.startsWith('T · ')) prompts.push(act('travel', promptLabel(hud.travelPrompt), <Move3d size={16} />, { onClick: () => engine?.travelZone() }));
    }
    if (hud.rangeSupplyPrompt) prompts.push(act('resupply', 'Resupply', <PackageOpen size={16} />, { onClick: () => engine?.resupplyRange() }));
    if (hud.interact) {
      prompts.push(act('vehicle', promptLabel(hud.interact), <Move3d size={16} />, { onClick: () => engine?.interactVehicle() }));
    }
  }
  // The worn device, on foot or mounted: one button walks off, on and each thermal palette.
  if (hud.vision) pad.push(act('vision', hud.vision.on ? hud.vision.iffOnly ? 'IFF only on, switch off' : `${visionAction(hud.vision)} on${hud.vision.palettes > 1 ? hud.vision.kind === 'nvg' ? ', IFF only' : ', next palette' : ''}` : visionAction(hud.vision),
    <><Eye size={17} />{hud.vision.on && <small className="touch-badge" aria-hidden="true">{visionStatus(hud.vision, true)}</small>}</>, { onClick: () => engine?.pressVision(), 'aria-pressed': hud.vision.on, 'data-on': hud.vision.on || undefined }));

  return <div className="touch-layer" data-touch-layer={mode} data-mounted={mounted || undefined}>
    {/* Not a combat control, so it is in the top-left corner, out of reach of both thumbs mid-fight. */}
    <button type="button" className="touch-chip" data-touch-action="menu" aria-label="Menu" title="Menu" {...tapProps(onMenu)}><Menu size={16} /></button>
    <CalloutChip hud={hud} engine={engine} />
    <div className="touch-move">
      <TouchStick kind="move" label={merlion ? 'STATION' : mounted ? hud.vehicleSeat === 0 ? hud.vehicle.startsWith('dragon-boat') ? 'PADDLE' : 'DRIVE' : 'RIDING' : hud.swimming ? 'SWIM' : 'MOVE'} onChange={merlion || mounted && hud.vehicleSeat !== 0 ? () => {} : move} />
    </div>

    {prompts.length > 0 && <div className="touch-prompts">
      {prompts.map(item => <button key={item.key} type="button" className="touch-prompt" data-touch-action={item.key} {...item.props}>{item.icon}<span>{item.label}</span></button>)}
    </div>}

    <div className="touch-combat">
      {pad.map(item => <button
        key={item.key}
        type="button"
        className="touch-button"
        data-touch-action={item.key}
        data-pad-slot={padSlot(item.key)}
        aria-label={item.label}
        title={item.label}
        {...item.props}
      >{item.icon}</button>)}
      {zoom && <div className="touch-zoom" role="group" aria-label="Scope magnification" data-scope-zoom={zoom.value}>
        <button type="button" aria-label="Increase scope magnification" disabled={zoom.value >= zoom.max} {...tapProps(() => engine?.adjustScopeZoom(1))}><Plus size={17} /></button>
        <b aria-live="polite">{zoom.value}×</b>
        <button type="button" aria-label="Decrease scope magnification" disabled={zoom.value <= zoom.min} {...tapProps(() => engine?.adjustScopeZoom(-1))}><Minus size={17} /></button>
      </div>}
      <button type="button" className="touch-fire" data-touch-action="fire" aria-label="Fire" disabled={hud.swimming && !hud.swimCanFire || mounted && !hud.vehiclePersonalWeapon && (!hud.vehicleCanFire || hud.vehicleAmmo === 0)} {...fire}>FIRE</button>
    </div>
  </div>;
}
