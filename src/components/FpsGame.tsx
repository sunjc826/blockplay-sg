import FpsDamageFeedback from './FpsDamageFeedback';
import { MatchStreakHud, MatchStreakLoadout } from './MatchStreaks';
import { streakFriendly } from '../game/match-streak-visuals';
import MatchBotSettings, { type MatchSquad } from './MatchBotSettings';
import { DeploymentOverlay } from './DeploymentBriefing';
import { matchSummary } from '../game/match-menu';
import Scoreboard, { holdTime } from './ArenaScoreboard';
import { HARDPOINT_AREA, HARDPOINT_RULES, SMITH_CONTROL_SITES } from '../game/hardpoint';
import { TDM_RULES, TEAM_NAMES, tdmArea, type ArenaMatch } from '../game/arena-match';
import { RANGE_DAMAGE_IDLE_SECONDS } from '../game/range-damage';
import { confirmAction, requestLeave, useNavigationGuard } from '../lib/navigation-guard';
import MerlionHud from './MerlionHud';
import { playMusicStinger, setMusicCue, stopMusicStinger } from '../lib/music';
import { playOnce } from '../lib/menu-audio';
import type { PlayLoadScreen } from '../game/play-load-stages';
import { physicalWeaponFamilies, primaryWeaponFamily } from '../game/weapon-modes';
import RespawnLoadoutSelector from './RespawnLoadoutSelector';
import DeathRecap from './DeathRecap';
import { applyRespawnLoadout, type RespawnLoadoutSelection } from '../game/respawn-loadout';
import { RANGE_DRILLS, RANGE_DURATION, type RangeDrillId } from '../game/range-drills';
import './range-drills.css';
import type { RaiderBounty } from '../game/combat-rewards';
import FpsVehicleHud from './FpsVehicleHud';
import FpsDistrictCrossing from './FpsDistrictCrossing';
import FpsLootCard from './FpsLootCard';
import './expedition.css';
import { hasLaser, hasLight } from '../game/weapon-accessories';
import EnvironmentControls from './EnvironmentControls';
import FpsVisionChip from './FpsVisionChip';
import { cloudOpacity, visionKeyLabel } from '../game/vision-devices';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, LogOut, Maximize, Minimize, Pause, Play, RotateCcw, Users, Volume2, VolumeX } from 'lucide-react';
import { createFpsEngine, initialFpsHud, type FpsEngine, type FpsCheckpoint } from '../game/fps-engine';
import { createFpsSurface, type FpsSurface } from '../game/fps-surface';
import { getFpsDistrict } from '../game/fps-districts';
import { getWorldZone, type WorldZoneId, type ZoneSpawn } from '../game/world-zones';
import { useFpsFullscreen } from '../game/use-fps-fullscreen';
import { ELIMINATION_CREDITS, progression } from '../game/progression';
import { rankInsignia } from '../game/rank-insignia';
import { encikAddress, resolveLoadout, type ArmoryProfile, type ExerciseReward } from '../game/armory-state';
import type { LanSession } from '../game/lan-peer';
import { ARENA_DURATION, ARENA_KILL_LIMIT } from '../game/arena-rules';
import FpsMinimap from './FpsMinimap';
import RankBadge from './RankBadge';
import FpsWeaponHud from './FpsWeaponHud';
import FpsWeaponSlider from './FpsWeaponSlider';
import FpsShield from './FpsShield';
import FpsDebugPanel from './FpsDebugPanel';
import FpsPilotPanel from './FpsPilotPanel';
import FpsCommsLog from './FpsCommsLog';
import { FpsRadioVoice } from './FpsRadio';
import FpsHudLayout from './FpsHudLayout';
import FpsCalloutWheel from './FpsCalloutWheel';
import FpsUtilityPicker from './FpsUtilityPicker';
import TouchControls from './TouchControls';
import { PlayMenuButton, PlayPanel } from './PlayPanel';
import { FpsControlGuide, FpsPlayerTools } from './FpsPlayerTools';
import ReloadStyleToggle from './ReloadStyleToggle';
import { useDebugMode } from '../lib/debug-mode';
import { useTouchControls } from '../game/use-touch-controls';
import { useHudHints } from '../game/hud-hints-setting';
import './arena-hud.css';
import './arena-player.css';
import './fps-hit-direction.css';

type ArenaOptions = { match?: ArenaMatch; session: LanSession; botCount: number; composition: string };
interface RangeScene { region: WorldZoneId; spawn?: ZoneSpawn; checkpoint?: FpsCheckpoint }

export default function FpsGame({ region: initialRegion = 'marina-bay', suspended = false, profile, nav, onReward, onElimination, onRentalTime, onConsume, onOpenShop, arena, onLeaveArena, onReturnRoom, roomView=false, onPhaseChange, onLoaded, onRegionChange, loadScreen }: { region?: WorldZoneId; suspended?: boolean; profile: ArmoryProfile; nav?: ReactNode; onLoaded?: (ready: boolean) => void; loadScreen?: PlayLoadScreen; onRegionChange?: (region: WorldZoneId) => void; onReward: (result: ExerciseReward) => void; onElimination: (id: string, bounty?: RaiderBounty) => void; onConsume: (id: string) => void; onRentalTime?: (elapsedMs: number) => void; onOpenShop: () => void; arena?: ArenaOptions; onLeaveArena?: () => void; onReturnRoom?:()=>void; roomView?:boolean; onPhaseChange?:(phase:string)=>void }) {
  const [scene, setScene] = useState<RangeScene>(() => ({ region: initialRegion }));
  const region = scene.region;
  const regionChanged = useRef(onRegionChange); regionChanged.current = onRegionChange;
  useEffect(() => { setScene(current => current.region === initialRegion ? current : { region: initialRegion }); }, [initialRegion]);
  useEffect(() => { regionChanged.current?.(region); }, [region]);
  const district = getFpsDistrict(region), zone = getWorldZone(region);
  const rank = progression(profile.xp);
  const insignia = rankInsignia(rank.level, profile.rankSet);
  // The engine is built once per session; the Encik reads this each callout,
  // so a level bought or earned mid-exercise changes his tone straight away.
  const speaking = useRef(encikAddress(profile)); speaking.current = encikAddress(profile);
  const startingLevel = useRef(rank.level);
  const rentalCallback = useRef(onRentalTime); rentalCallback.current = onRentalTime;
  const eliminationCallback = useRef(onElimination); eliminationCallback.current = onElimination;
  const consumeCallback = useRef(onConsume); consumeCallback.current = onConsume;
  const [startingEquipment] = useState(() => resolveLoadout(profile));
  const loadoutRef = useRef(startingEquipment);
  const [liveEquipment, setLiveEquipment] = useState(startingEquipment);
  const equipment = liveEquipment;
  const [nextProfile, setNextProfile] = useState(profile), [loadoutOpen, setLoadoutOpen] = useState(false);
  const [arenaOptions] = useState(() => arena ? { ...arena, profile } : undefined);
  const [bots, setBots] = useState(arena?.botCount ?? 3), [squad, setSquad] = useState<MatchSquad>((arena?.composition as MatchSquad) ?? 'mixed');
  const [combat, setCombat] = useState(false);
  const [drill, setDrill] = useState<RangeDrillId>('classic');
  const rewardCallback = useRef(onReward); rewardCallback.current = onReward;
  const armoryProfileRef = useRef(profile); armoryProfileRef.current = profile;
  const host = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), engine = useRef<FpsEngine | null>(null);
  const surface = useRef<FpsSurface | null>(null);
  const fullscreen = useFpsFullscreen(stage, () => engine.current?.pause());
  const fullscreenAction = useRef(fullscreen.toggle); fullscreenAction.current = fullscreen.toggle;
  const [hud, setHud] = useState(initialFpsHud), [epoch, setEpoch] = useState(0);
  const promoted = hud.phase === 'complete' && rank.level > startingLevel.current;
  useEffect(() => { if (promoted && !hud.muted) playOnce('world-rank-up'); }, [promoted]); // eslint-disable-line react-hooks/exhaustive-deps
  const debug = useDebugMode();
  const soloArena = arenaOptions?.session.role === 'solo';
  const activeRun = useRef(false);
  if (['playing', 'deploying', 'paused'].includes(hud.phase)) activeRun.current = true;
  if (['complete', 'defeated'].includes(hud.phase)) activeRun.current = false;
  useNavigationGuard(!roomView && !debug && (arenaOptions && !soloArena ? !['complete', 'error'].includes(hud.phase) : activeRun.current), {
    title: arenaOptions ? 'Leave this match?' : 'End this exercise?',
    detail: arenaOptions ? `${arenaOptions.session.role === 'host' ? 'You are hosting. Leaving closes the match for everyone. ' : soloArena ? 'This solo match will end. ' : 'You will disconnect from this match. '}Credits and XP already earned stay saved.` : 'Your exercise progress will be lost. Credits, XP and Store purchases already saved are kept. Changing equipment in the Store starts a new exercise.',
    onRequest: () => engine.current?.pause(),
  });
  useEffect(() => {
    setHud({ ...initialFpsHud, inputMode: scene.checkpoint?.continuation?.inputMode ?? 'mouse' });
    try {
      if (!arenaOptions) surface.current ??= createFpsSurface(host.current!);
      engine.current = createFpsEngine(host.current!, setHud, { armoryProfile: () => armoryProfileRef.current, surface: surface.current ?? undefined, region, rangeDrill: drill, loadScreen, deploymentIntro: !debug,
        rangeTravel: arenaOptions ? undefined : { spawn: scene.spawn, checkpoint: scene.checkpoint, onTravel: (transition, checkpoint) => {
          startingLevel.current = rank.level;
          setHud(current => ({ ...current, phase: 'loading' }));
          setScene({ region: transition.to, spawn: transition.spawn, checkpoint });
        } },
        loadout: loadoutRef.current, onLoadout: setLiveEquipment, combat, arena: arenaOptions, onComplete: result => rewardCallback.current(result), onRentalTime: elapsed => rentalCallback.current?.(elapsed), onElimination: (id, bounty) => eliminationCallback.current(id, bounty), onConsume: id => consumeCallback.current(id), onFullscreen: () => { void fullscreenAction.current(); }, encik: () => speaking.current });
    }
    catch {
      if (document.pointerLockElement === surface.current?.renderer.domElement) document.exitPointerLock();
      setHud(h => ({ ...h, phase: 'error', message: '3D graphics could not start. Check that WebGL is enabled, then retry.' }));
    }
    return () => { if (engine.current) loadoutRef.current = engine.current.getLoadout(); engine.current?.dispose(); engine.current = null; };
  }, [epoch, combat, startingEquipment, arenaOptions, scene]);
  useEffect(() => () => { surface.current?.dispose(); surface.current = null; }, []);
  useEffect(() => { if (suspended) engine.current?.pause(); }, [suspended]);
  useEffect(()=>{onPhaseChange?.(hud.phase);},[hud.phase,onPhaseChange]);
  useEffect(()=>{if(!roomView&&onReturnRoom&&['ready','paused'].includes(hud.phase)){const id=requestAnimationFrame(()=>stage.current?.querySelector<HTMLButtonElement>('.arena-start-card .primary-button, .match-deployment .primary-button')?.focus());return()=>cancelAnimationFrame(id);}},[roomView,hud.phase]);
  const returnToRoom=async()=>{engine.current?.pause();if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});onReturnRoom?.();};
  // The map's track runs on through loading, then the range is quiet.
  useEffect(() => { if (hud.phase !== 'loading') setMusicCue(null); }, [hud.phase]);
  // A short sting for how the match went. A draw has none.
  const matchWinner = arena && hud.phase === 'complete' && !hud.muted ? hud.arena?.winner : undefined;
  useEffect(() => {
    if (!matchWinner || matchWinner === 'Draw') return;
    const self = hud.arena?.actors.find(actor => actor.id === arena?.session.id);
    if (self) void playMusicStinger(matchWinner === (self.team ? TEAM_NAMES[self.team] : self.name) ? 'win' : 'lose');
    return stopMusicStinger;
  }, [matchWinner]);
  const loadResult = hud.phase === 'loading' ? null : hud.phase !== 'error';
  useEffect(() => { if (loadResult !== null) onLoaded?.(loadResult); }, [loadResult, onLoaded]);
  const openLoadout = () => { engine.current?.pause(); setLoadoutOpen(true); };
  const queueLoadout = async (selection: RespawnLoadoutSelection) => {
    const next = applyRespawnLoadout(profile, selection);
    if (!next || !await (hud.phase === 'ready' ? engine.current?.setStartingLoadout(selection) : engine.current?.queueRespawnLoadout(selection))) return false;
    setNextProfile(next); return true;
  };
  const resetExercise = () => { startingLevel.current = rank.level; engine.current?.reset(); };
  const chooseDrill = (next: boolean) => { if (combat !== next) { startingLevel.current = rank.level; setCombat(next); } };
  const isArena = !!arenaOptions, guest = arenaOptions?.session.role === 'guest';
  const mounted = hud.vehicle !== 'on-foot';
  const merlionOperating=hud.merlion?.operating;
  const deploying = hud.phase === 'deploying';
  const playing = hud.phase === 'playing', weapon = equipment.weapons[hud.weapon];
  const physicalCrossing = !isArena && !!scene.checkpoint?.continuation;
  const canFight = playing && (!isArena || (hud.arenaSelf?.alive === true && hud.arenaConnected));
  const disconnected = isArena && (guest || arenaOptions.session.transport === 'public') && hud.phase !== 'loading' && !hud.arenaConnected;
  useEffect(() => { if (disconnected) engine.current?.pause(); }, [disconnected]);
  const tdm = arenaOptions?.match?.mode === 'team-deathmatch';
  const hp=arenaOptions?.match?.mode==='hardpoint',teamMode=tdm||hp;
  const control=hud.arena?.hardpoint,teamScore=control??hud.arena?.teamDeathmatch;
  const activeSite=SMITH_CONTROL_SITES.find(s=>s.id===control?.active),nextSite=SMITH_CONTROL_SITES.find(s=>s.id===control?.next);
  const matchObjective=hp ? 'HARDPOINT · First team to 200' : tdm ? `TEAM DEATHMATCH · First team to ${TDM_RULES.scoreLimit}` : `FREE FOR ALL · First to ${ARENA_KILL_LIMIT} eliminations`;
  const remaining = Math.max(0, Math.ceil((hp ? HARDPOINT_RULES.duration : tdm ? TDM_RULES.duration : ARENA_DURATION) - (hud.arena?.elapsed || 0)));
  const arenaClock = `${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, '0')}`;
  const accuracy = hud.shots ? Math.min(100, Math.round(hud.landed / hud.shots * 100)) : 0;
  const rangeClock = drill === 'timed' ? `${Math.max(0, Math.ceil(RANGE_DURATION - hud.elapsed))}s left` : `${hud.elapsed.toFixed(1)}s`;
  const rangeObjective = drill === 'classic' ? `Clear the ${district.targets.length} dummies around the ${district.setting}.` : drill === 'timed' ? 'Clear as many targets as you can in 90 seconds.' : 'Keep practising. Targets will return; end the drill from the pause menu.';
  const touch = useTouchControls(hud.inputMode);
  const hudHints = useHudHints(), showHints = touch || hudHints;
  const aerial = hud.phase === 'ready' && !debug ? {
    zoom: hud.overviewZoom, onZoom: (factor: number) => engine.current?.zoomDeployment(factor), onResetView: () => engine.current?.resetDeploymentView(),
    loadout: <button type="button" className="respawn-loadout-trigger" onClick={openLoadout}>Choose starting loadout</button>,
  } : undefined;
  const hold = (key: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engine.current?.setInput(key, true); },
    onPointerUp: () => engine.current?.setInput(key, false),
    onPointerCancel: () => engine.current?.setInput(key, false),
    onLostPointerCapture: () => engine.current?.setInput(key, false),
  });
  return <div className={`fps-game ${isArena ? 'is-arena' : ''} ${isArena && !debug ? 'arena-player-view' : ''} ${fullscreen.immersive ? 'is-immersive' : ''}`} ref={stage} data-deployment-planning={hud.phase === 'ready' && !debug || undefined} data-range-drill={!isArena ? drill : undefined} data-range-eliminations={!isArena ? hud.hits : undefined} data-range-supply={hud.rangeSupplyPrompt ? 'available' : undefined} data-touch={touch ? 'on' : undefined} data-hud-hints={hudHints ? 'on' : 'off'} data-map-zone={region} data-phase={hud.phase} data-pilot={hud.pilotEnabled || undefined} data-pointer-locked={hud.locked} data-health={hud.health.toFixed(1)} data-armor={hud.armor.toFixed(1)} data-vehicle-view={hud.vehicleView} data-vehicle-personal-weapon={hud.vehiclePersonalWeapon} data-vehicle={hud.vehicle} data-swimming={hud.swimming || undefined} data-vehicle-health={hud.vehicleHealth} data-vehicle-ammo={hud.vehicleAmmo} data-vehicle-damage={hud.vehicleDamage} data-speed={hud.vehicleSpeed.toFixed(2)} data-altitude={hud.altitude.toFixed(2)} data-player-x={hud.x.toFixed(3)} data-player-z={hud.z.toFixed(3)} data-player-yaw={hud.yaw.toFixed(4)} data-player-pitch={hud.pitch.toFixed(4)} data-match-mode={arenaOptions?.match?.mode} data-hardpoint-active={control?.active} data-hardpoint-next={control?.next??undefined} data-hardpoint-owner={control?.owner??undefined} data-hardpoint-contested={control?.contested} data-team={hud.arenaSelf?.team} data-alpha-score={teamScore?.scores.alpha} data-bravo-score={teamScore?.scores.bravo} data-arena={isArena || undefined} data-arena-connected={isArena ? hud.arenaConnected : undefined} data-arena-alive={hud.arenaSelf?.alive} data-arena-kills={hud.arenaSelf?.kills}>
    <div className="viewport fps-viewport">
      <div className="world" ref={host} />
      <FpsDamageFeedback hud={hud} />
      {(deploying || playing && hud.deploymentBriefing) && <DeploymentOverlay location={arenaOptions?.match ? matchSummary(arenaOptions.match).map : zone.name} operation={isArena ? 'MATCH' : 'TRAINING'} intro={hud.deploymentIntro} briefing={hud.deploymentBriefing} clock={() => engine.current?.deploymentBriefingTime() ?? null}>
        {deploying && <div className="expedition-intro-actions"><button onClick={() => engine.current?.pause()}>Menu</button><button onClick={() => engine.current?.skipDeployment()}>Skip intro{!touch && <kbd>SPACE</kbd>}</button></div>}
      </DeploymentOverlay>}
      {loadoutOpen && <RespawnLoadoutSelector deployment={hud.phase === 'ready'} inventory={profile} selected={nextProfile} onSave={queueLoadout} onClose={() => setLoadoutOpen(false)} />}
      {(debug || !isArena && (fullscreen.notice || hud.message)) && <p className="fps-message" role="status">{fullscreen.notice || hud.message || (isArena ? `Eliminations pay ${ELIMINATION_CREDITS} CR · Match scores are session-only · Infantry armor/ammo replenish on respawn · Vehicle ammo resets with the match` : 'Game balance stats · Scenery blocks shots · Armor replenishes each exercise')}</p>}
      {fullscreen.immersive && fullscreen.notice && <div className="fps-screen-notice" role="status">{fullscreen.notice}</div>}
      {fullscreen.immersive && <div className="fps-immersive-hint">ESC · PAUSE & RELEASE MOUSE</div>}
      {fullscreen.immersive && !playing && <button className="fps-leave-screen" onClick={() => { void fullscreen.toggle(); }}><Minimize size={14} /> Exit fullscreen</button>}
      <div className="fps-top"><span className="fps-badge"><span className="status-dot" /> {zone.name.toUpperCase()}{(!touch || isArena) && ` / ${isArena ? 'ARENA' : 'FIELD RANGE'}`}</span><span className="fps-score">{isArena ? `${hud.arenaSelf?.kills || 0} K / ${hud.arenaSelf?.deaths || 0} D` : drill === 'classic' ? `${hud.hits} / ${district.targets.length} TARGETS` : `${hud.hits} CLEARED`} <b>{isArena ? arenaClock : rangeClock}</b></span></div>
      {isArena && playing && <><div className="arena-kill-feed" aria-label="Elimination feed">{hud.arena?.feed.slice(-4).map(event => <p key={event.id} className={event.killerId === arenaOptions.session.id ? 'own-kill' : event.victimId === arenaOptions.session.id ? 'own-death' : ''}>{event.text}</p>)}</div>{hud.arenaSelf && !hud.arenaSelf.alive && hud.deathRecap && <DeathRecap recap={hud.deathRecap} respawnIn={hud.arenaSelf.respawnIn} touch={touch} onLoadout={openLoadout} />}{hud.arenaSelf && !hud.arenaSelf.alive && !hud.deathRecap && <div className="arena-respawn" role="status"><span>ELIMINATED</span><strong>Back in {Math.ceil(hud.arenaSelf.respawnIn)}s</strong><small>{teamMode ? 'Armor and ammo replenish · Protection ends when firing.' : 'Infantry armor/ammo replenish on respawn · Vehicle ammo resets with the match.'}</small><button type="button" className="respawn-loadout-trigger" onClick={openLoadout}>Choose next respawn loadout</button></div>}{!hud.arenaStarted && !disconnected && <div className="arena-waiting" role="status">Waiting for the host to start the match.</div>}</>}
      {!debug && playing && !hud.pilotEnabled && (!touch || hud.arenaSelf?.alive === false) && <PlayMenuButton compact={touch} onMenu={() => engine.current?.pause()} />}
      <FpsHudLayout hud={hud} history={debug && fullscreen.immersive}>
        {playing && <FpsMinimap matchBounds={hp?HARDPOINT_AREA.bounds:arenaOptions?.match?.mode==='team-deathmatch'?tdmArea(arenaOptions.match.area)?.bounds:undefined} zone={region} player={hud} markers={hud.mapMarkers} contactRange={hud.mapContactRange} mode={isArena ? 'arena' : 'practice'} expanded={hud.mapExpanded} dangers={hud.mapDangers} jammed={hud.mapJammed} onToggle={() => engine.current?.toggleMap()} />}
      </FpsHudLayout>
      <FpsCalloutWheel hud={hud} engine={engine.current} />
      {isArena && playing && !disconnected && hud.arena && hud.scoreboardHeld &&
        <section className="arena-live-scoreboard" aria-label="Live match scoreboard">
          <header><strong>Live scoreboard</strong><small>Release Tab to close</small></header>
          <Scoreboard snapshot={hud.arena} selfId={arenaOptions.session.id} />
        </section>}
      <FpsUtilityPicker hud={hud} engine={engine.current} />
      {hud.pilotEnabled && playing && <div className="fps-pilot-indicator">AI PILOT · {hud.pilotStatus}<span className="fps-hud-hint"> · ESC TO STOP</span></div>}
      {playing && <>
        {!touch && <span className="fps-capture-state fps-input-status" aria-label="Mouse capture status">{hud.pilotEnabled ? 'AI PILOT' : hud.locked ? 'MOUSE LOCKED' : 'DRAG TO LOOK'}</span>}
        <FpsVisionChip hud={hud} touch={touch} />
        {hud.hurt && <div className="fps-damage-overlay" aria-hidden="true" />}
        <FpsShield hud={hud} />
        <MerlionHud hud={hud} engine={engine.current} />
        {hud.cloudCover && <div className={`fps-cloud-overlay ${hud.cloudCover.kind}`} style={{ opacity: cloudOpacity(hud.cloudCover.amount, hud.vision?.on === true && hud.vision.kind === 'thermal') }} aria-hidden="true" />}
        {hud.incoming && <div className="fps-incoming">INCOMING · MOVE OR TAKE COVER</div>}
        {hud.combatBanner && <div className={`fps-combat-banner ${hud.combatBanner.tone}`} role="status">{hud.combatBanner.text}</div>}
        {hud.hit && <div className="fps-hit-label" aria-hidden="true">{!isArena && hud.headshot ? 'HEADSHOT' : 'HIT'} −{hud.lastDamage}</div>}
        {hud.callout && <div key={`${hud.hits}-${hud.callout}`} className="fps-kill-callout" role="status"><span>ELIMINATION CHAIN ×{hud.chain}</span><strong>{hud.callout}</strong>{!isArena && <small>+25 XP</small>}</div>}
        <div className="fps-compass">SG <span>· · ·</span> {district.setting.toUpperCase()} <span>· · ·</span> 01</div>
        {hud.swimming && <div className="fps-swim-status" role="status">SWIMMING · {hud.swimCanFire ? 'SIDEARM HIP FIRE · LOW ACCURACY' : 'STOP TO USE SIDEARM'} · CLIMB OUT AT GOLD LADDERS</div>}
        {mounted && hud.vehicleCanFire && hud.vehicleAimVisible && <div className="fps-vehicle-reticle" aria-label="Vehicle gun impact point" style={{ left: `${hud.vehicleAimX}%`, top: `${hud.vehicleAimY}%` }}>⊕</div>}
        {!merlionOperating && (!mounted || hud.vehiclePersonalWeapon) && <FpsWeaponSlider hud={hud} names={equipment.weapons.map(w => w.name.split(' · ')[0])} canSwitch={canFight} onSwitch={family => engine.current?.switchWeapon(family)} />}
        {!merlionOperating && (!mounted || hud.vehiclePersonalWeapon) && <FpsWeaponHud hud={hud} weapon={weapon} canFight={canFight} onUtility={kind => engine.current?.useSelectedUtility(kind)} onPickRecovery={() => engine.current?.toggleRecoveryPicker()} onPickGrenade={() => engine.current?.toggleGrenadePicker()} onInspect={() => engine.current?.inspectWeapon()} onScopeZoom={direction => engine.current?.adjustScopeZoom(direction)} onToggleMode={() => engine.current?.toggleWeaponMode()} touch={touch} />}
        {hp && control && <div className="hardpoint-status" aria-label="Hardpoint objective"><strong>{activeSite?.name} <b>{Math.ceil(control.remaining)}s</b></strong><span>{control.contested?'CONTESTED · Scoring paused':control.owner?`${TEAM_NAMES[control.owner]} CONTROL · +1 / sec`:'NEUTRAL · Enter the marked zone'}</span>{nextSite && <small>Next: {nextSite.name}</small>}</div>}
        {teamMode && <div className="tdm-score" aria-label="Team score"><strong>ALPHA {teamScore?.scores.alpha??0} : {teamScore?.scores.bravo??0} BRAVO</strong><span>{hud.arenaSelf?.team ? <>You are {TEAM_NAMES[hud.arenaSelf.team]}<small className="tdm-uniform"> · {hud.arenaSelf.team==='alpha'?'green field uniforms':'navy contractor uniforms'}</small></> : 'Assigning team'}</span></div>}
        <div className={`fps-objective${mounted ? ' fps-hud-hint' : ''}`}>{mounted && hud.vehicleSeat !== 0 ? hud.vehicle === 'car' ? 'V switch seat · E bail out · Speed risks injury' : 'Ride together · V switch seat · E exit when landed' : isArena && !mounted ? matchObjective : mounted ? hud.vehicle === 'car' ? 'W / S throttle · A / D steer · Space brake' : 'W / S cruise · A / D yaw · Space climb · Ctrl descend' : rangeObjective}<small>{hud.locked ? isArena ? 'ESC opens menu · Match keeps running' : 'ESC pauses and releases the mouse' : touch ? 'Left stick moves · Drag the scene to look · Hold FIRE and slide to aim' : 'Drag to look · On-screen controls available'}</small></div>
        {!isArena && <div className="fps-vehicle-locator">CAR {Math.round(hud.carDistance)}m <span>·</span> HELI {Math.round(hud.helicopterDistance)}m</div>}
        <FpsLootCard hud={hud} touch={touch} actions={touch && playing && !hud.pilotEnabled && !mounted ? { take: () => isArena ? engine.current?.interactLoot() : engine.current?.takeRangeWeapon() } : undefined} />
        {hud.rangeSupplyPrompt && <div className="fps-interact-prompt">{showHints ? hud.rangeSupplyPrompt : 'Resupply ammo, grenades & utilities'}</div>}
        {!hud.rangeSupplyPrompt && !hud.lootCard && (hud.interact || hud.travelPrompt) && <div className="fps-interact-prompt">{hud.travelPrompt || (showHints ? hud.interact : hud.interact.replace(/^E · /, ''))}</div>}
        {hud.vehicleNotice && <div className="fps-vehicle-notice" role="status">{hud.vehicleNotice}</div>}
        <FpsVehicleHud hud={hud} />
      </>}
      {isArena && playing && !hud.mapExpanded && !hud.scoreboardHeld && <MatchStreakHud progress={hud.arenaSelf ? hud.arena?.streaks?.players[hud.arenaSelf.id] : undefined} effects={(hud.arena?.streaks?.effects ?? []).filter(e => streakFriendly(hud.arena?.actors.find(a => a.id === e.owner), hud.arenaSelf))} now={hud.arena?.elapsed ?? 0} hardpoint={hp} alive={hud.arenaSelf?.alive === true} touch={touch} placement={hud.streakPlacement} notice={hud.streakNotice} onUse={slot => engine.current?.useStreak(slot)} onConfirm={() => engine.current?.confirmStreak()} onCancel={() => engine.current?.cancelStreak()} />}
      {touch && !hud.pilotEnabled && hud.arenaSelf?.alive !== false && (playing || physicalCrossing && hud.phase === 'loading') && <TouchControls hud={hud} engine={engine.current} mode={isArena ? 'arena' : 'range'} crossing={physicalCrossing && hud.phase === 'loading'} onMenu={() => engine.current?.pause()} />}
      {physicalCrossing && <FpsDistrictCrossing key={region} name={zone.name} phase={hud.phase} />}
      {isArena && !deploying && (!playing || disconnected) && <PlayPanel label={hud.phase === 'paused' ? 'Match menu' : arenaOptions.match ? matchSummary(arenaOptions.match).name : 'Match'}
        paused={hud.phase === 'paused'} className="arena-start-card" aerial={aerial} overlayClassName="arena-overlay" debug={debug}
        navigation={<nav className="play-nav" aria-label="Match navigation">
          {onReturnRoom && <button className="play-nav-back arena-room-return" onClick={() => void returnToRoom()}><ArrowLeft size={15} />{soloArena ? 'Return to setup' : 'Return to room'}</button>}
          <button className="play-nav-back arena-leave" onClick={() => requestLeave(() => onLeaveArena?.())}><LogOut size={15} />{!onReturnRoom ? 'Leave match' : soloArena ? 'End solo match' : guest ? 'Leave room' : 'Close room for everyone'}</button>
        </nav>}
        primary={!disconnected && <button className={`primary-button${hud.phase === 'paused' ? ' pause-resume' : ''}`} disabled={hud.phase === 'loading' || suspended || (guest && hud.phase === 'complete')} onClick={() => { if (hud.phase === 'error') setEpoch(n => n + 1); else if (hud.phase === 'complete') resetExercise(); else { if (touch) fullscreen.enter(); engine.current?.start(); } }}>
          {hud.phase === 'complete' || hud.phase === 'error' ? <RotateCcw size={16} /> : <Play size={16} />} {hud.phase === 'loading' ? 'Loading…' : hud.phase === 'error' ? 'Retry' : hud.phase === 'complete' ? guest ? 'Waiting for host rematch' : 'Start a rematch' : hud.phase === 'paused' ? 'Resume match' : guest ? 'Enter match' : 'Start match'} <ArrowRight size={17} />
        </button>}
        details={<>
        {hud.phase === 'complete' && hud.arena && <Scoreboard snapshot={hud.arena} selfId={arenaOptions.session.id} />}
        {!['loading', 'error', 'complete'].includes(hud.phase) && !disconnected && <>
          <FpsPlayerTools hud={hud} engine={engine.current} immersive={fullscreen.immersive} onFullscreen={() => { void fullscreen.toggle(); }} />
          {hud.phase === 'ready' && <details className="play-panel-fold"><summary>Match briefing</summary>
            <p>{hp ? '4 vs 4. Hold the active station uncontested for one point per second. It rotates every 60 seconds, with a 10-second preview. First to 200 or most points after six minutes wins.' : tdm ? '4 vs 4. First team to 30 or most eliminations after five minutes wins. Friendly fire is off.' : `First to ${ARENA_KILL_LIMIT} eliminations wins. Three minutes. Unlimited respawns.`}</p>
            <p>Pick up any fallen player's or bot’s weapon with {touch ? 'the pickup button' : 'E'}: a full magazine and spare ammo come with it. Respawning restores your chosen loadout.</p>
            {teamMode && <p>Three-second respawns. Protection ends when firing{hp ? ' or entering the active zone' : ''}.</p>}
          </details>}
          {hud.phase === 'ready' && touch && <p className="arena-touch-brief">Left thumb to move · Drag to look · Hold FIRE to shoot</p>}
          {hud.arena && <details className="arena-menu-section" open={debug && hud.phase === 'paused' ? true : undefined}><summary>Players &amp; scores <span>{!touch && 'Hold Tab in match · '}{hud.arena.actors.length}</span></summary><Scoreboard snapshot={hud.arena} selfId={arenaOptions.session.id} /></details>}
          <EnvironmentControls multiplayer={!soloArena} />
          {hud.phase !== 'ready' && <button type="button" className="respawn-loadout-trigger" onClick={openLoadout}>Choose next respawn loadout</button>}
          {hud.phase === 'ready' && !guest && !teamMode && !hud.arenaStarted && <MatchBotSettings bots={bots} squad={squad} onBots={count => { if (engine.current?.configureMatchBots(count, squad)) setBots(count); }} onSquad={composition => { if (engine.current?.configureMatchBots(bots, composition)) setSquad(composition); }} />}
          <MatchStreakLoadout mode={hp ? 'hardpoint' : tdm ? 'team-deathmatch' : 'free-for-all'} progress={hud.arenaSelf ? hud.arena?.streaks?.players[hud.arenaSelf.id] : undefined} disabled={!hud.arenaSelf || (hud.arena?.elapsed ?? 0) > 0} onChange={ids => engine.current?.configureStreaks(ids)} />
          <details className="arena-menu-section"><summary>Your loadout</summary><p>{equipment.rigName} · {equipment.plateName} · {equipment.armor} AP</p><p>{teamMode ? 'Teams fill to four with assault bots. Your equipped Armory gear is ready.' : guest ? 'Your equipped Armory gear is ready.' : `${bots} bots · ${squad} squad`}</p><button className="fps-shop-link arena-armory-link" onClick={onOpenShop}>Leave match and open Store →</button></details>
          {!guest && hud.phase === 'paused' && <button className="arena-reset-button" aria-label="Reset arena match" onClick={() => confirmAction({ title: 'Restart this match?', detail: soloArena ? 'Scores and current match progress will reset. Credits and XP already saved are kept.' : 'Scores and current match progress will reset for everyone. Credits and XP already saved are kept.', confirmLabel: 'Restart match', action: resetExercise })}><RotateCcw size={14} /> Restart match</button>}
        </>}
        {debug && <><FpsDebugPanel hud={hud} engine={engine.current} /><div className="fps-player-tools"><ReloadStyleToggle /></div><FpsPilotPanel hud={hud} engine={engine.current} suspended={suspended} /></>}
        {!['complete', 'loading', 'error'].includes(hud.phase) && !disconnected && !touch && <FpsControlGuide debug={debug}><span><kbd>WASD</kbd> Move</span><span><kbd>LMB</kbd> Fire</span><span><kbd>Q / RMB</kbd> Toggle / hold aim</span><span><kbd>R</kbd> Reload</span><span><kbd>K</kbd> Inspect weapon</span><span><kbd>Shift</kbd> Sprint</span><span><kbd>Ctrl / C</kbd> Hold / toggle crouch</span><span><kbd>Sprint + C</kbd> Slide</span><span><kbd>Z</kbd> Prone / mount</span><span><kbd>Space</kbd> Jump</span><span><kbd>1–3</kbd> Switch</span>{isArena && <span><kbd>4–6</kbd> Streak rewards</span>}<span><kbd>F / G</kbd> Recovery / combat · tap to use, hold to choose</span><span><kbd>M</kbd> Map</span><span><kbd>Y</kbd> Callouts</span>{equipment.vision && <span><kbd>N</kbd> {visionKeyLabel(equipment.vision.spec)}</span>}{equipment.weapons.some(weapon => hasLaser(weapon.accessories)) && <span><kbd>B</kbd> Laser</span>}{equipment.weapons.some(weapon => hasLight(weapon.accessories)) && <span><kbd>L</kbd> Weapon light</span>}{equipment.weapons.some(weapon => weapon.accessories?.offsetDot) && <span><kbd>X</kbd> Offset dot</span>}<span><kbd>ESC</kbd> Menu</span></FpsControlGuide>}
        </>}>
        <span className="eyebrow">{disconnected ? 'CONNECTION LOST' : hud.phase === 'complete' ? 'MATCH COMPLETE' : hud.phase === 'paused' ? 'MATCH MENU' : `${zone.name.toUpperCase()} / ${hp ? 'HARDPOINT' : tdm ? 'TEAM DEATHMATCH' : 'FREE FOR ALL'}`}</span>
        <h2>{disconnected ? guest ? 'Host disconnected.' : 'Room connection lost.' : hud.phase === 'loading' ? 'Preparing the arena.' : hud.phase === 'error' ? 'Arena unavailable.' : hud.phase === 'complete' ? hud.arena?.winner === 'Draw' ? 'Draw.' : `${hud.arena?.winner || 'Match'} wins.` : hud.phase === 'paused' ? 'Match menu.' : 'Ready to play.'}</h2>
        <p>{disconnected ? 'The host connection has closed. Return to the room to leave or reconnect.' : hud.phase === 'loading' ? soloArena ? 'Loading the arena.' : 'Loading your equipped gear and connecting the match.' : hud.phase === 'error' ? hud.message : hud.phase === 'complete' ? `${hp?`${holdTime(hud.arenaSelf?.controlSeconds)} uncontested hold · `:''}${hud.arenaSelf?.kills || 0} eliminations · ${hud.arenaSelf?.deaths || 0} deaths · ${accuracy}% accuracy` : hud.phase === 'paused' ? soloArena ? 'The match keeps running while this menu is open.' : 'The match and other players keep running while this menu is open.' : hp ? 'Hold rotating control stations to score for your team.' : tdm ? 'Eliminate opponents to score for your team.' : 'Score the most eliminations before time runs out.'}</p>
        {hp && control && hud.phase==='paused' && <p className="match-pause-objective"><strong>{activeSite?.name} · {Math.ceil(control.remaining)}s</strong><br/>{control.contested?'Contested · scoring paused':control.owner?`${TEAM_NAMES[control.owner]} controls`:'Neutral · enter the marked zone'}{nextSite && ` · Next: ${nextSite.name}`}</p>}
        {hud.message && hud.phase !== 'error' && !disconnected && <p className="fps-capture-error" role="alert">{hud.message}</p>}
      </PlayPanel>}
      {!playing && !deploying && !isArena && !(physicalCrossing && hud.phase === 'loading') && <PlayPanel label={hud.phase === 'paused' ? 'Training menu' : 'Live-fire range'}
        paused={hud.phase === 'paused'} navigation={nav} debug={debug} aerial={aerial}
        primary={<button className={`primary-button${hud.phase === 'paused' ? ' pause-resume' : ''}`} disabled={hud.phase === 'loading' || suspended} onClick={() => { if (hud.phase === 'error') setEpoch(n => n + 1); else if (hud.phase === 'complete' || hud.phase === 'defeated') resetExercise(); else { if (touch) fullscreen.enter(); engine.current?.start(); } }}>
          {hud.phase === 'complete' || hud.phase === 'defeated' || hud.phase === 'error' ? <RotateCcw size={16} /> : <Play size={16} />} {hud.phase === 'loading' ? 'Loading…' : hud.phase === 'error' ? 'Retry' : hud.phase === 'complete' || hud.phase === 'defeated' ? 'Reset exercise' : hud.phase === 'paused' ? 'Resume exercise' : 'Enter range'} <ArrowRight size={17} />
        </button>}
        details={<>
        {debug ? <>
          <FpsDebugPanel hud={hud} engine={engine.current} /><div className="fps-player-tools"><ReloadStyleToggle /></div>
          <FpsRadioVoice hud={hud} engine={engine.current} />
          <FpsPilotPanel hud={hud} engine={engine.current} suspended={suspended} />
        </> : <FpsPlayerTools hud={hud} engine={engine.current} immersive={fullscreen.immersive} onFullscreen={() => { void fullscreen.toggle(); }} />}
        <EnvironmentControls />
        {['ready', 'complete', 'defeated'].includes(hud.phase) && <fieldset className="range-drill-picker"><legend>DRILL</legend>{(Object.keys(RANGE_DRILLS) as RangeDrillId[]).map(id => <button key={id} aria-pressed={drill === id} onClick={() => { if (drill !== id) { startingLevel.current = rank.level; engine.current?.setRangeDrill(id); setDrill(id); } }}>{RANGE_DRILLS[id].name}</button>)}</fieldset>}
        {['ready', 'complete', 'defeated'].includes(hud.phase) && <div className="fps-drill-choice"><button aria-pressed={!combat} onClick={() => chooseDrill(false)}>Practice</button><button aria-pressed={combat} onClick={() => chooseDrill(true)}>{drill === 'continuous' ? 'Counter-fire' : 'Counter-fire · +100 CR'}</button></div>}
        {hud.phase === 'ready' && <details className="play-panel-fold"><summary>Range briefing</summary>
        <p className="fps-armor-note">{equipment.rigName} · {equipment.plateName} · {equipment.armor} AP<br />{combat ? 'Targets return simulated fire. Move when warned to dodge.' : 'Practice mode: targets do not return fire.'}</p>
        <p>Dummies span armor tiers 0–4, from unarmored to commander. Labels show hits, health damage, average health DPS (minimum 1s window), and armor damage. Each dummy’s totals reset after {RANGE_DAMAGE_IDLE_SECONDS}s without a hit. Continuous mode brings cleared dummies back.</p>
        <p>The resupply box provides free practice ammunition, grenades and utilities. Press E near it, or tap Resupply.</p>
        {engine.current?.rangeArmoryState() && <p className="fps-armor-note">Gallery wall nearby, marked on the map: try issued, captured and your own weapons. Swaps last for this session.</p>}
        </details>}
        {hud.phase === 'paused' && drill !== 'classic' && <button className="range-end-drill" onClick={() => engine.current?.endDrill()}>End drill & view summary</button>}
        {hud.phase === 'complete' && drill !== 'classic' && <p className="range-summary-note">{hud.rangeDrill?.endedEarly || drill === 'continuous' ? 'Per-target rewards kept · no completion bonus.' : hud.hits ? 'Challenge complete · completion bonus included.' : 'No targets cleared · no completion bonus.'}</p>}
        <button className="fps-shop-link" onClick={onOpenShop}>{hud.phase === 'paused' ? 'End exercise and open Store →' : 'Open Store →'}</button>
        <FpsControlGuide debug={debug}><span><kbd>WASD</kbd> Move</span><span><kbd>LMB</kbd> Fire</span><span><kbd>Q / RMB</kbd> Toggle / hold aim</span><span><kbd>R</kbd> Reload</span><span><kbd>K</kbd> Inspect weapon</span><span><kbd>Shift</kbd> Sprint</span><span><kbd>Ctrl / C</kbd> Hold / toggle crouch</span><span><kbd>Sprint + C</kbd> Slide</span><span><kbd>Z</kbd> Prone / mount</span><span><kbd>Space</kbd> Jump</span><span><kbd>1–3</kbd> Switch</span>{isArena && <span><kbd>4–6</kbd> Streak rewards</span>}<span><kbd>F / G</kbd> Recovery / combat · tap to use, hold to choose</span><span><kbd>M</kbd> Map</span><span><kbd>Y</kbd> Callouts</span>{equipment.vision && <span><kbd>N</kbd> {visionKeyLabel(equipment.vision.spec)}</span>}{equipment.weapons.some(weapon => hasLaser(weapon.accessories)) && <span><kbd>B</kbd> Laser</span>}{equipment.weapons.some(weapon => hasLight(weapon.accessories)) && <span><kbd>L</kbd> Weapon light</span>}{equipment.weapons.some(weapon => weapon.accessories?.offsetDot) && <span><kbd>X</kbd> Offset dot</span>}<span><kbd>E</kbd> Resupply / enter / exit vehicle</span><span><kbd>V</kbd> Switch seat</span><span><kbd>C</kbd> Vehicle view</span><span><kbd>Space / Ctrl</kbd> Fly up / down</span></FpsControlGuide>
        {debug && <small className="fps-touch-note">{touch ? 'Thumb controls appear once the range opens: the left stick moves, dragging the scene looks around, and the actions sit on the arc around the trigger.' : 'On touchscreens, drag the scene to look and use the controls below.'}</small>}
        </>}>
        <span className="eyebrow">{hud.phase === 'defeated' ? 'EXERCISE ENDED' : hud.phase === 'complete' ? drill === 'classic' ? 'RANGE CLEAR' : 'DRILL SUMMARY' : hud.phase === 'paused' ? 'TAKE A BREATHER' : 'SINGAPORE / FIELD EXERCISE 01'}</span>
        <h2>{hud.phase === 'loading' ? 'Preparing the range.' : hud.phase === 'error' ? 'Range unavailable.' : hud.phase === 'defeated' ? 'Regroup. Re-equip.' : hud.phase === 'complete' ? drill === 'classic' ? 'Eight for eight.' : `${hud.hits} targets cleared.` : hud.phase === 'paused' ? 'Training menu.' : 'Set up your exercise.'}</h2>
        <p>{hud.phase === 'loading' ? `Loading your equipment and ${zone.name}.` : hud.phase === 'error' ? hud.message : hud.phase === 'defeated' ? 'Your health reached zero. Move during the incoming warning or break line of sight. Armor absorbs a share of each hit until depleted.' : hud.phase === 'complete' ? `${hud.elapsed.toFixed(1)} seconds · ${hud.shots} shots · ${accuracy}% accuracy` : rangeObjective}</p>
        {hud.message && hud.phase !== 'error' && <p className="fps-capture-error" role="alert">{hud.message}</p>}
        {hud.phase === 'complete' && <div className="fps-reward">+{hud.earned} CR · +{hud.earnedXp} XP earned{rank.level > startingLevel.current && <strong className="fps-level-up">{insignia.promoted ? 'PROMOTED' : 'LEVEL UP'} · LV {rank.level} {insignia.label.toUpperCase()}</strong>}{hud.callout && <span className="fps-final-callout">{hud.callout}</span>}</div>}
      </PlayPanel>}
    </div>
    {debug && <>
    <div className="experience-toolbar fps-toolbar"><div className="experience-title"><span className="mode-icon">{isArena ? <Users size={22} /> : <Crosshair size={22} />}</span><div><h3>{`${district.label} · ${isArena ? 'arena' : 'field range'}`}</h3><p>{isArena ? `${arenaOptions.session.role === 'solo' ? 'Solo vs bots' : arenaOptions.session.transport === 'public' ? 'Online room' : 'P2P LAN'} · ${hp ? 'Hardpoint · 4 vs 4' : tdm ? 'Team Deathmatch · 4 vs 4' : `Free for all · ${ARENA_KILL_LIMIT} eliminations`}` : `${combat ? 'Counter-fire drill' : 'Practice drill'} · Custom loadout · ${RANGE_DRILLS[drill].name}`}</p></div></div><div className="toolbar-actions">
      <button className="icon-button" aria-label={hud.muted ? 'Enable range sound' : 'Mute range sound'} onClick={() => engine.current?.toggleSound()}>{hud.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
      <button className="session-button fps-fullscreen-button" aria-label={fullscreen.immersive ? 'Exit fullscreen range' : 'Fullscreen range'} aria-pressed={fullscreen.immersive} onClick={() => { void fullscreen.toggle(); }}>{fullscreen.immersive ? <Minimize size={16} /> : <Maximize size={16} />} {fullscreen.immersive ? 'Windowed' : 'Fullscreen'}</button>
      {!guest && <button className="icon-button" aria-label={isArena ? 'Reset arena match' : 'Reset FPS exercise'} disabled={hud.phase === 'loading' || hud.phase === 'error'} onClick={resetExercise}><RotateCcw size={16} /></button>}
      <button className="session-button" disabled={disconnected || hud.phase === 'loading' || hud.phase === 'error' || hud.phase === 'complete' || hud.phase === 'defeated' || suspended} onClick={() => playing ? engine.current?.pause() : engine.current?.start()}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? isArena ? 'Menu' : 'Pause' : hud.phase === 'ready' ? 'Start' : 'Resume'}</button>
    </div></div>
    {!fullscreen.immersive && <FpsCommsLog entries={hud.comms} />}
    <FpsRadioVoice hud={hud} engine={engine.current} />
    <FpsPilotPanel hud={hud} engine={engine.current} suspended={suspended} />
    <div className="fps-loadout" aria-label="Weapon selection">{physicalWeaponFamilies(equipment.carriedFamilies).map((i, slot) => { const w = equipment.weapons[i]; return <button key={w.id} aria-pressed={i === primaryWeaponFamily(hud.weapon)} disabled={hud.phase === 'loading' || hud.phase === 'error'} onClick={() => engine.current?.switchWeapon(i)}><kbd>{slot + 1}</kbd><span>{w.name}<small>{w.role}</small></span><span className="fps-selected">{i === primaryWeaponFamily(hud.weapon) ? 'EQUIPPED' : 'EQUIP'}</span></button>; })}{hud.quickItem && <button className="fps-supply" data-testid="quick-item" disabled={!hud.quickCount || hud.phase !== 'playing'} onClick={() => engine.current?.useQuickItem()}><kbd>G</kbd><span>{hud.quickItem}<small>{hud.quickType}</small></span><span className="fps-selected">x{hud.quickCount}</span></button>}<div className="fps-accuracy"><span>ACCURACY</span><strong>{accuracy}%</strong></div></div>
    <div className="fps-inputs" aria-label="On-screen FPS controls">
      <div className="fps-dpad">{(['a', 'w', 's', 'd'] as const).map((key, i) => { const Icon = [ArrowLeft, ArrowUp, ArrowDown, ArrowRight][i]; return <button key={key} disabled={!canFight || (mounted && hud.vehicleSeat !== 0)} aria-label={`FPS ${['left', 'forward', 'backward', 'right'][i]}`} {...hold(key)}><Icon size={18} /></button>; })}</div>
      <button disabled={!canFight || (mounted && hud.vehicleSeat !== 0)} {...hold('shift')}>{hud.vehicle === 'helicopter' ? 'Boost' : 'Sprint'}</button><button disabled={!canFight || (mounted && hud.vehicleSeat !== 0)} {...hold('c')}>{hud.vehicle === 'helicopter' ? 'Descend' : 'Crouch'}</button>{mounted ? <button disabled={!canFight || hud.vehicleSeat !== 0} {...hold(' ')}>{hud.vehicle === 'helicopter' ? 'Climb' : 'Brake'}</button> : <button disabled={!canFight} onClick={() => engine.current?.jump()}>Jump</button>}<button disabled={!playing || !hud.rangeSupplyPrompt} onClick={() => engine.current?.resupplyRange()}>Resupply</button><button disabled={!playing || !hud.interact} onClick={() => engine.current?.interactVehicle()}>{mounted ? 'Exit vehicle' : 'Enter vehicle'}</button>{mounted && <><button disabled={!canFight} onClick={() => engine.current?.switchVehicleSeat()}>Switch seat</button><button disabled={!canFight} onClick={() => engine.current?.toggleVehicleView()}>Switch view</button></>}<button disabled={!canFight || mounted} onClick={() => engine.current?.setInput('z', true)}>{hud.prone ? 'Stand' : 'Prone'}</button><button disabled={!canFight || mounted && !hud.vehiclePersonalWeapon} onClick={() => engine.current?.reload()}>Reload</button><button disabled={!canFight} title="Toggle aim (Q)" aria-pressed={hud.aiming} onClick={() => engine.current?.toggleAim()}>Aim</button><button className="fps-fire-button" disabled={!canFight || hud.swimming && !hud.swimCanFire || (mounted && !hud.vehiclePersonalWeapon && (!hud.vehicleCanFire || hud.vehicleAmmo === 0))} {...hold('fire')}>Fire</button>
    </div>
    {isArena && hud.arena && hud.phase !== 'complete' && <details className="arena-standings" open={!playing}><summary>Match scoreboard <span>{hud.arena.actors.length} combatants</span></summary><Scoreboard snapshot={hud.arena} selfId={arenaOptions.session.id} /></details>}
    {isArena ? <div className="arena-session-footer"><span>{arenaOptions.session.role === 'solo' ? 'LOCAL BOT MATCH' : hud.arenaConnected ? arenaOptions.session.transport === 'public' ? 'ONLINE CONNECTED' : 'P2P CONNECTED' : 'CONNECTING'} · {arenaOptions.session.name}</span><button onClick={() => requestLeave(() => onLeaveArena?.())}>Leave match <ArrowRight size={13} /></button></div> : <div className="fps-progression-summary"><RankBadge insignia={insignia} size={17} /><b>LV {rank.level} · {insignia.label}</b><progress value={rank.progress} max={1} aria-label="FPS level progress" /><span>{rank.remaining ? `${rank.remaining} XP to next level` : 'Maximum level'}</span></div>}
    </>}
  </div>;
}
