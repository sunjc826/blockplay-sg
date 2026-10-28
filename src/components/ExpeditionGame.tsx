import FpsVehicleHud from './FpsVehicleHud';
import EnvironmentControls from './EnvironmentControls';
import FpsVisionChip from './FpsVisionChip';
import { cloudOpacity, visionKeyLabel } from '../game/vision-devices';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Compass, Maximize, Minimize, Pause, Play } from 'lucide-react';
import { createFpsEngine, initialFpsHud, type FpsCheckpoint, type FpsEngine } from '../game/fps-engine';
import { resolveLoadout, type ArmoryProfile, type VendorPurchaseResult } from '../game/armory-state';
import { createExpeditionLoot } from '../game/expedition-loot';
import { itemById } from '../game/armory-catalog';
import { findWorldRoute, getWorldZone, WORLD_GATEWAYS, WORLD_ZONES, type WorldZoneId, type ZoneSpawn } from '../game/world-zones';
import { useFpsFullscreen } from '../game/use-fps-fullscreen';
import FpsMinimap from './FpsMinimap';
import FpsWeaponHud from './FpsWeaponHud';
import FpsLootCard from './FpsLootCard';
import FpsWeaponSlider from './FpsWeaponSlider';
import FpsVitals from './FpsVitals';
import FpsShield from './FpsShield';
import FpsDebugPanel from './FpsDebugPanel';
import FpsPilotPanel from './FpsPilotPanel';
import FpsCommsLog from './FpsCommsLog';
import FpsRadio, { FpsRadioVoice } from './FpsRadio';
import FpsCalloutWheel, { FpsChatter } from './FpsCalloutWheel';
import FpsFoodPicker from './FpsFoodPicker';
import TouchControls from './TouchControls';
import { FpsControlGuide, FpsPlayerTools } from './FpsPlayerTools';
import { useDebugMode } from '../lib/debug-mode';
import { useTouchControls } from '../game/use-touch-controls';
import type { MinimapMarker } from '../game/minimap';
import './expedition.css';
import './fps-hit-direction.css';
import { getArenaFaction, PLAYER_FACTION, SQUAD_FACTIONS } from '../game/arena-factions';

interface ExpeditionScene { zone: WorldZoneId; spawn?: ZoneSpawn; checkpoint?: FpsCheckpoint; revision: number }

export default function ExpeditionGame({ profile, nav, onExit, onVendorPurchase, onConsume, onElimination, suspended = false, initialZone = 'marina-bay', destination, onZoneChange, onLoaded }: { profile: ArmoryProfile; nav?: ReactNode; onLoaded?: () => void; onExit: () => void; onVendorPurchase: (catalogId: string, price: number) => VendorPurchaseResult; onConsume: (catalogId: string) => void; onElimination?: (id: string) => void; suspended?: boolean; initialZone?: WorldZoneId; destination?: WorldZoneId; onZoneChange?: (zone: WorldZoneId) => void }) {
  const [fieldProfile, setFieldProfile] = useState<ArmoryProfile>(() => structuredClone(profile));
  const fieldProfileRef = useRef(fieldProfile);
  const [loot] = useState(() => createExpeditionLoot(`${Date.now()}-${Math.random()}`));
  const [scene, setScene] = useState<ExpeditionScene>(() => ({ zone: initialZone, revision: 0 }));
  const zoneChanged = useRef(onZoneChange); zoneChanged.current = onZoneChange;
  useEffect(() => { zoneChanged.current?.(scene.zone); }, [scene.zone]);
  const [hud, setHud] = useState(initialFpsHud);
  const eliminationCallback = useRef(onElimination); eliminationCallback.current = onElimination;
  const debug = useDebugMode();
  const host = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), engine = useRef<FpsEngine | null>(null);
  const fullscreen = useFpsFullscreen(stage, () => engine.current?.pause());
  const fullscreenAction = useRef(fullscreen.toggle); fullscreenAction.current = fullscreen.toggle;
  useEffect(() => {
    setHud({ ...initialFpsHud });
    try {
      engine.current = createFpsEngine(host.current!, setHud, {
        loadout: resolveLoadout(fieldProfileRef.current),
        expedition: {
          zone: scene.zone, spawn: scene.spawn, checkpoint: scene.checkpoint,
          profile: fieldProfileRef.current, loot,
          onTravel: (transition, checkpoint) => setScene(current => ({ zone: transition.to, spawn: transition.spawn, checkpoint, revision: current.revision + 1 })),
          onEquipment: next => { fieldProfileRef.current = next; setFieldProfile(next); },
          onVendorPurchase,
        },
        onConsume,
        onElimination: id => eliminationCallback.current?.(id),
        onFullscreen: () => { void fullscreenAction.current(); },
      });
    } catch {
      setHud(current => ({ ...current, phase: 'error', message: 'The district could not load. Check that WebGL is available, then retry.' }));
    }
    return () => { engine.current?.dispose(); engine.current = null; };
  }, [scene, loot, onVendorPurchase, onConsume]);
  useEffect(() => { engine.current?.setPilotDestination(destination); }, [destination, scene]);
  useEffect(() => { if (suspended) engine.current?.pause(); }, [suspended]);
  const loaded = hud.phase !== 'loading';
  useEffect(() => { if (loaded) onLoaded?.(); }, [loaded, onLoaded]);

  const zone = getWorldZone(scene.zone), equipment = resolveLoadout(fieldProfile);
  const mounted = hud.vehicle !== 'on-foot';
  const playing = hud.phase === 'playing', alive = hud.arenaSelf?.alive !== false, canFight = playing && alive;
  const weapon = equipment.weapons[hud.weapon] ?? equipment.weapons[0];
  const gateways = WORLD_GATEWAYS.filter(gateway => gateway.from === scene.zone);
  const plannedRoute = destination ? findWorldRoute(scene.zone, destination) : [];
  const nextCheckpoint = plannedRoute[0];
  const mapMarkers: MinimapMarker[] = [
    ...hud.mapMarkers,
    ...(hud.fieldLoot ?? []).map(item => ({ id: item.id, x: item.x, z: item.z, kind: 'loot' as const, label: `${item.name} (${item.tier})${(item.y ?? 0) > 0 ? ` · upper level +${Math.round(item.y!)}m` : ''}` })),
    ...(hud.npcs ?? []).map(npc => ({ id: npc.id, x: npc.x, z: npc.z, kind: 'npc' as const, label: `${npc.name} · ${npc.role}` })),
    ...gateways.map(gateway => ({ id: gateway.id, ...gateway.position, kind: 'checkpoint' as const, label: gateway.name, active: gateway.id === nextCheckpoint?.id })),
  ];
  const nearbyLoot = [...(hud.fieldLoot ?? [])].sort((a, b) => Math.hypot(a.x - hud.x, a.z - hud.z) - Math.hypot(b.x - hud.x, b.z - hud.z)).slice(0, 5);
  const nearbyNpcs = [...(hud.npcs ?? [])].sort((a, b) => Math.hypot(a.x - hud.x, a.z - hud.z) - Math.hypot(b.x - hud.x, b.z - hud.z)).slice(0, 3);
  const distance = (point: { x: number; z: number }) => Math.round(Math.hypot(point.x - hud.x, point.z - hud.z));
  // A phone's corner holds the weapon slider above and the belt below, so touch lists only the nearest crossings; the map marks them all.
  const nearestGateways = [...gateways].sort((a, b) => distance(a.position) - distance(b.position));
  const touch = useTouchControls(hud.inputMode);
  const hold = (key: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engine.current?.setInput(key, true); },
    onPointerUp: () => engine.current?.setInput(key, false),
    onPointerCancel: () => engine.current?.setInput(key, false),
    onLostPointerCapture: () => engine.current?.setInput(key, false),
  });
  return <div className={`fps-game expedition-game ${fullscreen.immersive ? 'is-immersive' : ''}`} ref={stage} data-touch={touch ? 'on' : undefined}
    data-vehicle-view={hud.vehicleView} data-vehicle-personal-weapon={hud.vehiclePersonalWeapon} data-vehicle={hud.vehicle} data-vehicle-health={hud.vehicleHealth} data-vehicle-ammo={hud.vehicleAmmo} data-speed={hud.vehicleSpeed.toFixed(2)} data-altitude={hud.altitude.toFixed(2)} data-phase={hud.phase} data-pilot={hud.pilotEnabled || undefined} data-pointer-locked={hud.locked} data-zone={scene.zone} data-player-x={hud.x.toFixed(3)} data-player-z={hud.z.toFixed(3)}
    data-health={hud.health.toFixed(1)} data-armor={hud.armor.toFixed(1)} data-alive={alive} data-loot-count={hud.fieldLoot?.length ?? 0} data-npc-count={hud.npcs?.length ?? 0} data-bot-count={hud.arena?.actors.filter(actor => actor.bot).length ?? 0} data-friendly-count={hud.arena?.actors.filter(actor => actor.bot && actor.faction === PLAYER_FACTION).length ?? 0}>
    <div className="viewport fps-viewport">
      <div className="world" ref={host} />
      <div className="fps-top"><span className="fps-badge"><span className="status-dot" /> {zone.name.toUpperCase()} / EXPEDITION</span><span className="expedition-wallet">{hud.credits.toLocaleString()} CR · {hud.tokens.toLocaleString()} TK</span><span className={`expedition-risk risk-${zone.risk}`}>{zone.risk.toUpperCase()} THREAT</span></div>
      {fullscreen.immersive && <div className="fps-immersive-hint">F · FULLSCREEN <span>ESC · MENU & RELEASE MOUSE</span></div>}
      {fullscreen.immersive && !playing && <button className="fps-leave-screen" onClick={() => { void fullscreen.toggle(); }}><Minimize size={14} /> Exit fullscreen</button>}
      <FpsRadio hud={hud} />
      <FpsChatter hud={hud} />
      <FpsCalloutWheel hud={hud} engine={engine.current} />
      <FpsFoodPicker hud={hud} engine={engine.current} />
      <FpsFoodPicker hud={hud} engine={engine.current} kind="grenade" />
      {hud.pilotEnabled && playing && <div className="fps-pilot-indicator">AI PILOT · {hud.pilotStatus} · ESC TO STOP</div>}
      {playing && <>
        <FpsMinimap zone={scene.zone} player={hud} markers={mapMarkers} contactRange={hud.mapContactRange} mode="expedition" expanded={hud.mapExpanded} dangers={hud.mapDangers} jammed={hud.mapJammed} onToggle={touch ? () => engine.current?.toggleMap() : undefined} />
        <FpsVitals hud={hud} />
        <FpsVisionChip hud={hud} touch={touch} />
        {hud.hurt && <div className="fps-damage-overlay" aria-hidden="true" />}
        <FpsShield hud={hud} />
        {hud.cloudCover && <div className={`fps-cloud-overlay ${hud.cloudCover.kind}`} style={{ opacity: cloudOpacity(hud.cloudCover.amount, hud.vision?.on === true && hud.vision.kind === 'thermal') }} aria-hidden="true" />}
        {hud.incoming && <div className="fps-incoming">INCOMING · FIND COVER</div>}
        {hud.combatBanner && <div className={`fps-combat-banner ${hud.combatBanner.tone}`} role="status">{hud.combatBanner.text}</div>}
        {hud.hit && <div className="fps-hit-label">HIT −{hud.lastDamage}</div>}
        {hud.callout && <div className="fps-kill-callout" role="status"><span>ELIMINATION CHAIN ×{hud.chain}</span><strong>{hud.callout}</strong></div>}
        {!alive && <div className="expedition-respawn" role="status"><span>OPERATOR DOWN</span><strong>Regrouping in {Math.ceil(hud.arenaSelf?.respawnIn ?? 0)}s</strong></div>}
        {(!mounted || hud.vehiclePersonalWeapon) && <FpsWeaponSlider hud={hud} names={equipment.weapons.map(w => w.name.split(' · ')[0])} canSwitch={canFight} onSwitch={family => engine.current?.switchWeapon(family)} />}
        {(!mounted || hud.vehiclePersonalWeapon) && <FpsWeaponHud hud={hud} weapon={weapon} canFight={canFight} onUtility={kind => engine.current?.useUtility(kind)} onPickFood={() => engine.current?.toggleFoodPicker()} onInspect={() => engine.current?.inspectWeapon()} onPickGrenade={() => engine.current?.toggleGrenadePicker()} onGrenadeFire={held => engine.current?.setInput('fire', held)} touch={touch} />}
        <FpsVehicleHud hud={hud} />
        {hud.interact && <div className="fps-interact-prompt">{hud.interact}</div>}
        {hud.vehicleNotice && <div className="fps-vehicle-notice" role="status">{hud.vehicleNotice}</div>}
        {mounted && hud.vehicleCanFire && hud.vehicleAimVisible && <div className="fps-vehicle-reticle" aria-label="Vehicle gun impact point" style={{ left: `${hud.vehicleAimX}%`, top: `${hud.vehicleAimY}%` }}>⊕</div>}
        <div className="fps-objective">{mounted ? hud.vehicleSeat !== 0 ? 'V switch seat · E exit when stopped' : hud.vehicle === 'car' ? 'W / S throttle · A / D steer · Space brake' : 'W / S cruise · A / D yaw · Space climb · C descend' : 'Explore. Find supplies. Meet people in the district.'}<small>{mounted ? 'Driver dismounts with the crew · Land before exiting' : 'E · LOOT / BOARD · N · INTERACT · T · CROSS CHECKPOINT ON FOOT'}</small></div>
        <FpsLootCard hud={hud} touch={touch} />
        <div className="expedition-prompts" role="status">{hud.npcPrompt && <strong>{hud.npcPrompt}</strong>}{hud.travelPrompt && <strong>{hud.travelPrompt}</strong>}{hud.lootNotice && <span>{hud.lootNotice}</span>}</div>
        {(hud.sector || hud.sectorHeat) && <div className="expedition-sector" role="status"><span>LOCATION</span><strong>{hud.sector || zone.name}</strong>
          {hud.sectorHeat && <div className="expedition-heat" aria-label="Faction heat here">{[...SQUAD_FACTIONS].reverse().map(id =>
            <div key={id} data-faction={id}><small>{getArenaFaction(id)!.short}</small><i style={{ width: `${Math.round(hud.sectorHeat![id] * 100)}%`, background: getArenaFaction(id)!.accent }} /></div>)}</div>}</div>}
        {touch && !hud.pilotEnabled && <TouchControls hud={hud} engine={engine.current} mode="expedition" onMenu={() => engine.current?.pause()} />}
        <div className="expedition-route-hud">{nextCheckpoint && <strong>ROUTE TO {getWorldZone(destination!).name.toUpperCase()}</strong>}{(nextCheckpoint ? [nextCheckpoint] : touch ? nearestGateways.slice(0, 2) : gateways).map(gateway => <span key={gateway.id}>{getWorldZone(gateway.to).name} <b>{distance(gateway.position)}m</b></span>)}</div>
      </>}
      {!playing && <div className="fps-overlay"><div className="fps-start-card">
        {nav}
        <span className="eyebrow">SOLO EXPEDITION / {zone.risk.toUpperCase()} THREAT</span>
        <h2>{hud.phase === 'loading' ? `Entering ${zone.name}.` : hud.phase === 'error' ? 'District unavailable.' : hud.phase === 'paused' ? 'Operator menu.' : `Welcome to ${zone.name}.`}</h2>
        <p>{hud.phase === 'loading' ? 'Preparing the district, its patrols and supplies.' : hud.phase === 'error' ? hud.message : hud.phase === 'paused' ? 'Your controls are paused. Patrols remain active while the menu is open.' : `${zone.description} Search supply crates, equip weapons and cross marked checkpoints on foot.`}</p>
        {!['loading', 'error'].includes(hud.phase) && <p className="fps-armor-note">{equipment.rigName} · {equipment.plateName}<br />{zone.botCount} defenders · {zone.composition} roles · No match timer</p>}
        {hud.message && hud.phase !== 'error' && <p className="fps-capture-error" role="alert">{hud.message}</p>}
        <EnvironmentControls />
        {debug ? <>
          <FpsDebugPanel hud={hud} engine={engine.current} />
          <FpsRadioVoice hud={hud} engine={engine.current} />
          <FpsPilotPanel hud={hud} engine={engine.current} suspended={suspended} />
        </> : <FpsPlayerTools hud={hud} engine={engine.current} immersive={fullscreen.immersive} touch={touch} onFullscreen={() => { void fullscreen.toggle(); }} />}
        <button className="primary-button" disabled={hud.phase === 'loading' || suspended} onClick={() => { if (hud.phase === 'error') { setScene(current => ({ ...current, revision: current.revision + 1 })); return; } if (touch) fullscreen.enter(); engine.current?.start(); }}><Play size={16} />{hud.phase === 'loading' ? 'Loading…' : hud.phase === 'error' ? 'Retry district' : hud.phase === 'paused' ? 'Resume expedition' : 'Enter district'}<ArrowRight size={17} /></button>
        {!nav && <button className="fps-shop-link" onClick={onExit}>{debug ? 'Leave expedition →' : 'Leave to menu →'}</button>}
        <FpsControlGuide debug={debug}><span><kbd>WASD</kbd> Move</span><span><kbd>Shift</kbd> Sprint</span><span><kbd>LMB</kbd> Fire</span><span><kbd>Q / RMB</kbd> Toggle / hold aim</span><span><kbd>R</kbd> Reload</span><span><kbd>K</kbd> Inspect weapon</span><span><kbd>E</kbd> Collect / enter / exit vehicle</span><span><kbd>I</kbd> Swap armor inserts</span><span><kbd>V</kbd> Switch seat</span><span><kbd>L</kbd> Vehicle view</span><span><kbd>Space / C</kbd> Fly up / down</span><span><kbd>4–9</kbd> Use belt slot</span><span><kbd>G</kbd> Use last slot</span><span><kbd>M</kbd> Map</span><span><kbd>Y</kbd> Callouts</span>{equipment.vision && <span><kbd>H</kbd> {visionKeyLabel(equipment.vision.spec)}</span>}{equipment.weapons.some(weapon => weapon.accessories?.rail) && <span><kbd>B</kbd> Laser / light</span>}{equipment.weapons.some(weapon => weapon.accessories?.offsetDot) && <span><kbd>X</kbd> Offset dot</span>}<span><kbd>N</kbd> Interact nearby</span><span><kbd>T</kbd> Travel</span><span><kbd>F</kbd> Fullscreen</span></FpsControlGuide>
        {debug && <small className="fps-touch-note">{touch ? 'Thumb controls appear once you enter the district. ' : ''}Field equipment lasts for this expedition. Your permanent Armory stays saved.</small>}
      </div></div>}
    </div>
    {debug && <>
    <div className="experience-toolbar fps-toolbar"><div className="experience-title"><span className="mode-icon"><Compass size={22} /></span><div><h3>{zone.name} · expedition</h3><p>Connected districts · Random supplies · Solo survival</p></div></div><div className="toolbar-actions">
      <button className="session-button" aria-label={fullscreen.immersive ? 'Exit expedition fullscreen' : 'Fullscreen expedition'} onClick={() => { void fullscreen.toggle(); }}>{fullscreen.immersive ? <Minimize size={16} /> : <Maximize size={16} />} Fullscreen</button>
      <button className="session-button" disabled={['loading', 'error'].includes(hud.phase) || suspended} onClick={() => playing ? engine.current?.pause() : engine.current?.start()}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Menu' : 'Resume'}</button>
    </div></div>
    <FpsCommsLog entries={hud.comms} />
    <FpsRadioVoice hud={hud} engine={engine.current} />
    <FpsPilotPanel hud={hud} engine={engine.current} suspended={suspended} />
    <div className="fps-loadout" aria-label="Field loadout">{equipment.carriedFamilies.map((index, slot) => { const item = equipment.weapons[index]; return <button key={index} disabled={!canFight} aria-pressed={index === hud.weapon} onClick={() => engine.current?.switchWeapon(index)}><kbd>{slot + 1}</kbd><span>{item.name}<small>{item.role}</small></span><span className="fps-selected">{index === hud.weapon ? 'EQUIPPED' : 'EQUIP'}</span></button>; })}</div>
    <div className="fps-inputs" aria-label="Expedition touch controls">
      <div className="fps-dpad">{(['a', 'w', 's', 'd'] as const).map((key, index) => { const Icon = [ArrowLeft, ArrowUp, ArrowDown, ArrowRight][index]; return <button key={key} disabled={!canFight} aria-label={`Expedition ${['left', 'forward', 'backward', 'right'][index]}`} {...hold(key)}><Icon size={18} /></button>; })}</div>
      <button disabled={!canFight} {...hold('shift')}>Sprint</button><button disabled={!canFight} {...(mounted ? hold(' ') : { onClick: () => engine.current?.jump() })}>{mounted ? hud.vehicle === 'car' ? 'Brake' : 'Climb' : 'Jump'}</button>{mounted && hud.vehicle === 'helicopter' && <button disabled={!canFight} {...hold('c')}>Descend</button>}<button disabled={!canFight || !hud.interact} onClick={() => engine.current?.interactVehicle()}>{mounted ? 'Exit vehicle' : 'Board vehicle'}</button>{mounted && <><button disabled={!canFight} onClick={() => engine.current?.switchVehicleSeat()}>Switch seat</button><button disabled={!canFight} onClick={() => engine.current?.toggleVehicleView()}>Switch view</button></>}<button disabled={!canFight} onClick={() => engine.current?.reload()}>Reload</button><button disabled={!canFight} title="Toggle aim (Q)" aria-pressed={hud.aiming} onClick={() => engine.current?.toggleAim()}>Aim</button><button disabled={!canFight || !hud.lootPrompt || !!hud.lootCard?.blocked} onClick={() => engine.current?.interactLoot()}>{hud.lootCard?.action ?? 'Pick up'} · E</button>{hud.lootCard?.swap && <button disabled={!canFight} onClick={() => engine.current?.interactLoot('swap')}>Swap inserts · I</button>}<button disabled={!canFight || !hud.npcPrompt} onClick={() => engine.current?.interactNpc()}>Interact · N</button><button disabled={!canFight || !hud.travelPrompt} onClick={() => engine.current?.travelZone()}>Travel · T</button><button className="fps-fire-button" disabled={!canFight || mounted && !hud.vehiclePersonalWeapon && (!hud.vehicleCanFire || hud.vehicleAmmo === 0)} {...hold('fire')}>Fire</button>
    </div>
    <div className="expedition-intel">
      <section><h3>District network</h3><div className="expedition-network">{WORLD_ZONES.map(item => <div key={item.id} className={item.id === scene.zone ? 'current' : ''}><strong>{item.name}</strong><span className={`risk-${item.risk}`}>{item.risk} threat · Tier {item.lootTier}</span>{item.id === scene.zone && <small>YOU ARE HERE</small>}</div>)}</div><p>Queenstown ↔ Raffles Place ↔ Marina Bay</p><p>Raffles is the contested CBD: stronger patrols, better odds of elite weapons.</p></section>
      <section><h3>Checkpoints</h3>{destination && <p className="expedition-planned-route" role="status">{scene.zone === destination ? `You are in ${zone.name}.` : `Planned route: ${[zone.name, ...plannedRoute.map(step => getWorldZone(step.to).name)].join(" → ")}`}</p>}{gateways.map(gateway => <p key={gateway.id}><strong>{getWorldZone(gateway.to).name} · {distance(gateway.position)}m</strong><br /><span>Head to X {gateway.position.x}, Z {gateway.position.z}. Press T within 4m.</span></p>)}<small>Your position: X {Math.round(hud.x)}, Z {Math.round(hud.z)}</small></section>
      <section><h3>Local contacts &amp; supplies</h3>{nearbyNpcs.map(npc => <p key={npc.id}><strong>{npc.name} · {distance(npc)}m</strong><br /><span>{npc.interaction.kind === 'vendor' ? `${itemById(npc.interaction.catalogId)?.name} · ${npc.interaction.price} ${npc.interaction.currency === 'tokens' ? 'TK' : 'CR'}` : `${npc.role} · Talk`}</span></p>)}{nearbyLoot.length ? nearbyLoot.map(item => <p key={item.id}><strong>{item.name} · {distance(item)}m</strong><br /><span>{item.tier.toUpperCase()} · X {Math.round(item.x)}, Z {Math.round(item.z)}{(item.y ?? 0) > 0 ? ` · Upper level +${Math.round(item.y!)}m` : ''}</span></p>) : <p>{hud.phase === 'loading' ? 'Scanning the district…' : 'No random supplies remain nearby.'}</p>}<small>NPC interactions are additional to random loot. Press N near a local contact; look at supplies on your level and press E.</small></section>
    </div>
    <div className="expedition-footer"><span>Field gear is temporary · Armory purchases stay saved</span><button onClick={onExit}>Leave expedition <ArrowRight size={14} /></button></div>
    </>}
    {(debug || fullscreen.notice || hud.message) && <p className="fps-message" role="status">{fullscreen.notice || hud.message || (touch ? 'The left stick moves, dragging the scene looks around, and holding FIRE keeps the aim correctable. The Menu button pauses you; the district stays active.' : 'Drag the scene to look on touchscreens. ESC opens the menu; the district remains active.')}</p>}
  </div>;
}
