import RegionGuide from './RegionGuide';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { defaultDriveLook, dragDriveLook, driveCameraOffset, settleDriveLook } from '../game/drive-camera';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CarFront, Footprints, RotateCcw, Flag } from 'lucide-react';
import { getRegion, regionObjective, regionResetLabel, type RegionId, type RegionMapShape } from '../game/regions';
import { minimapProjection } from '../game/minimap';
import { lookDelta, REGION_LOOK_SCALE, resolveMovement, type StickVector } from '../game/touch-controls';
import { useTouchControls } from '../game/use-touch-controls';
import WorldTouchControls from './WorldTouchControls';
import type { GuideRegion } from '../game/adventure';

/** Schematic furniture is authored in world metres; the map transform places it. */
export function RegionMapShapes({ shapes }: { shapes: readonly RegionMapShape[] }) {
  return <>{shapes.map((shape, index) => shape.kind === 'rect'
    ? <rect key={index} x={shape.x} y={shape.z} width={shape.width} height={shape.depth} rx={shape.radius} fill={shape.fill} />
    : <path key={index} d={`M${shape.from.x} ${shape.from.z} L${shape.to.x} ${shape.to.z}`} stroke={shape.stroke} strokeWidth={shape.width} fill="none" />)}</>;
}

/**
 * One walk/drive harness for every authored district. Regions differ only by
 * their descriptor, so a new map needs a scene builder and a registry entry.
 */
export default function RegionGame({ region: regionId }: { region: Exclude<RegionId, 'marina-bay'> }) {
  const region = getRegion(regionId);
  const map = useMemo(() => minimapProjection(region.bounds), [region]);
  const stamps = region.stamps;
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [travel, setTravel] = useState<'walk' | 'drive'>('walk');
  const travelRef = useRef(travel);
  const keys = useRef(new Set<string>());
  // Thumb sticks live outside the scene effect, which never re-runs for input.
  const moveStick = useRef<StickVector | null>(null), lookStick = useRef<StickVector | null>(null);
  const touch = useTouchControls();
  const reset = useRef(() => {});
  const [hud, setHud] = useState({ distance: 0, speed: 0, x: region.spawn.x, z: region.spawn.z, collected: [] as number[] });
  const [guideSession, setGuideSession] = useState(0);
  useEffect(() => { travelRef.current = travel; keys.current.clear(); moveStick.current = null; lookStick.current = null; }, [travel]);

  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setError('WebGL could not start. Try a browser with hardware acceleration enabled.'); return; }
    const world = region.build();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
    const canvas = renderer.domElement; canvas.tabIndex = 0; container.appendChild(canvas);
    canvas.setAttribute('aria-label', `Modeled ${region.name} game. Click and use WASD to move; drag to look.`);
    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, region.cameraFar); camera.rotation.order = 'YXZ';
    let position = { x: region.spawn.x, z: region.spawn.z };
    let yaw = region.spawn.yaw, pitch = 0.14, speed = 0, distance = 0;
    let driveLook = defaultDriveLook(), lastLookAt = 0;
    let lastTravel = travelRef.current;
    const collected = new Set<number>();
    const report = () => setHud({ distance, speed, ...position, collected: [...collected] });
    reset.current = () => {
      setGuideSession(value => value + 1);
      position = { x: region.spawn.x, z: region.spawn.z }; yaw = region.spawn.yaw; pitch = 0.14; speed = 0; distance = 0; collected.clear();
      driveLook = defaultDriveLook(); drag = undefined; lastLookAt = 0;
      world.stamps.forEach(stamp => { stamp.visible = true; }); keys.current.clear(); report();
    };
    let drag: { x: number; y: number; pointerId: number } | undefined;
    const pointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      canvas.focus(); canvas.setPointerCapture(event.pointerId);
      drag = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    };
    const pointerMove = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (travelRef.current === 'drive') {
        driveLook = dragDriveLook(driveLook, event.clientX - drag.x, event.clientY - drag.y);
        lastLookAt = performance.now();
      } else {
        yaw -= (event.clientX - drag.x) * 0.004;
        pitch = THREE.MathUtils.clamp(pitch - (event.clientY - drag.y) * 0.003, -0.7, 1.1);
      }
      drag.x = event.clientX; drag.y = event.clientY;
    };
    const pointerUp = (event: PointerEvent) => { if (drag?.pointerId === event.pointerId) { drag = undefined; lastLookAt = performance.now(); } };
    const supported = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift'];
    const keyDown = (event: KeyboardEvent) => { const key = event.key.toLowerCase(); if (supported.includes(key)) { event.preventDefault(); keys.current.add(key); } };
    const keyUp = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const blur = () => { keys.current.clear(); moveStick.current = null; lookStick.current = null; speed = 0; drag = undefined; };
    canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', pointerUp); canvas.addEventListener('lostpointercapture', pointerUp);
    canvas.addEventListener('keydown', keyDown); canvas.addEventListener('blur', blur); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur);
    const resize = () => { const { width, height } = container.getBoundingClientRect(); renderer.setSize(width, height); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    let frame = 0, last = performance.now(), lastReport = 0;
    const animate = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      const held = keys.current;
      // One intent from the keys and the thumb stick; a pushed stick wins, and
      // its magnitude survives, so a half-pushed stick walks at half pace.
      const move = resolveMovement(held, moveStick.current);
      const forward = move.forward, side = move.side;
      const driving = travelRef.current === 'drive';
      if (lastTravel !== travelRef.current) {
        driveLook = defaultDriveLook(); drag = undefined; lastLookAt = 0;
        lastTravel = travelRef.current;
      }
      if (lookStick.current) {
        // A drag is a displacement and the stick is a rate, but both end up in
        // the same per-pixel constants, scaled to land on the same feel.
        const turn = lookDelta(lookStick.current, dt, REGION_LOOK_SCALE);
        if (driving) { driveLook = dragDriveLook(driveLook, turn.dx, turn.dy); lastLookAt = now; }
        else { yaw -= turn.dx * 0.004; pitch = THREE.MathUtils.clamp(pitch - turn.dy * 0.003, -0.7, 1.1); }
      }
      let dx = 0, dz = 0;
      if (driving) {
        speed = held.has(' ') ? THREE.MathUtils.damp(speed, 0, 15, dt) : forward ? THREE.MathUtils.clamp(speed + forward * 10 * dt, -5, 18) : THREE.MathUtils.damp(speed, 0, 2, dt);
        yaw -= side * Math.min(Math.abs(speed) / 8, 1.5) * Math.sign(speed) * dt;
        dx = -Math.sin(yaw) * speed * dt; dz = -Math.cos(yaw) * speed * dt;
      } else {
        speed = 0; const rate = move.sprint ? 8 : 4.2, normal = Math.max(1, Math.hypot(forward, side));
        dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * side) / normal * rate * dt;
        dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * side) / normal * rate * dt;
      }
      const next = region.move(position, dx, dz, driving ? 1.35 : 0.65, world.obstacles);
      const step = Math.hypot(next.x - position.x, next.z - position.z);
      if (driving && step < Math.hypot(dx, dz) * 0.2) speed = 0;
      distance += step; position = next;
      world.car.visible = driving; world.car.position.set(position.x, 0.12, position.z); world.car.rotation.y = yaw;
      if (driving) {
        if (!drag && Math.abs(speed) > 0.5 && now - lastLookAt > 800) driveLook = settleDriveLook(driveLook, dt);
        const offset = driveCameraOffset(yaw, driveLook);
        camera.position.set(position.x + offset.x, 1.3 + offset.y, position.z + offset.z);
        camera.lookAt(position.x, 1.3, position.z);
      } else {
        camera.position.set(position.x, 1.75, position.z); camera.rotation.set(pitch, yaw, 0, 'YXZ');
      }
      stamps.forEach((stamp, i) => {
        if (!collected.has(i) && Math.hypot(stamp.x - position.x, stamp.z - position.z) < 4) { collected.add(i); world.stamps[i].visible = false; }
      });
      world.animate(now / 1000); renderer.render(world.scene, camera);
      if (now - lastReport > 150) { report(); lastReport = now; }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); keys.current.clear(); reset.current = () => {};
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerUp); canvas.removeEventListener('lostpointercapture', pointerUp);
      canvas.removeEventListener('keydown', keyDown); canvas.removeEventListener('blur', blur); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur);
      world.dispose(); renderer.dispose(); canvas.remove();
    };
  }, [region, stamps]);

  const resetLabel = regionResetLabel(region);
  const under = region.decor.filter(shape => (shape.layer ?? 'over') === 'under');
  const over = region.decor.filter(shape => (shape.layer ?? 'over') === 'over');
  return <div className={`marina-reconstruction marina-game ${region.className}`} data-touch={touch ? 'on' : undefined} data-region={region.id}>
    <div className="viewport marina-viewport"><div ref={host} className="world" />
      {error ? <div className="viewer-message" role="alert"><p>{error}</p></div> : <>
        <div className="scene-top"><span className="scene-badge"><span className="status-dot" /> {region.badge}</span><span className="marina-stamp-count"><Flag size={14} />{hud.collected.length} / {stamps.length} stamps</span></div>
        <div className="marina-map" aria-label="Game map showing player position and collectible stamps"><span>{region.mapTitle}</span>
          <svg viewBox="0 0 200 160" role="img" aria-label="Schematic game map">
            <rect x="6" y="6" width="188" height="148" rx="5" fill={region.mapPaper} />
            <g transform={map.transform}>
              <RegionMapShapes shapes={under} />
              {region.mapRoads.map((road, i) => <polyline key={i} points={road.points.map(point => `${point.x},${point.z}`).join(' ')} fill="none" stroke={region.roadStroke} strokeWidth={region.roadWidth} />)}
              <RegionMapShapes shapes={over} />
            </g>
            {stamps.map((stamp, i) => <circle key={stamp.name} cx={map.x(stamp.x)} cy={map.y(stamp.z)} r="3" fill={hud.collected.includes(i) ? '#4f7960' : '#d78853'} />)}
            <circle cx={map.x(hud.x)} cy={map.y(hud.z)} r="4" stroke="#fffdf0" strokeWidth="2" fill="#244832" />
          </svg>
        </div>
        <div className="marina-objective">{regionObjective(region, hud.collected.length)}</div>
      </>}
      {touch && !error && <WorldTouchControls travel={travel}
        onMove={stick => { moveStick.current = stick.magnitude > 0 ? stick : null; }}
        onLook={stick => { lookStick.current = stick.magnitude > 0 ? stick : null; }}
        onBrake={brake => { if (brake) keys.current.add(' '); else keys.current.delete(' '); }} />}
    </div>
    {region.hasGuide && <RegionGuide key={guideSession} region={region.id as Exclude<GuideRegion, 'marina-bay'>} hud={hud} stops={[...stamps]} />}
    <div className="experience-toolbar"><div className="experience-title"><span className="mode-icon">{travel === 'walk' ? <Footprints size={20} /> : <CarFront size={20} />}</span><div><h3>{region.title}</h3><p>{region.subtitle}</p></div></div><div className="toolbar-actions"><button className="session-button" aria-pressed={travel === 'walk'} onClick={() => setTravel('walk')}>Walk</button><button className="session-button" aria-pressed={travel === 'drive'} onClick={() => setTravel('drive')}>Drive</button><button className="icon-button" aria-label={resetLabel} title={resetLabel} onClick={() => reset.current()}><RotateCcw size={16} /></button></div></div>
    <div className="session-strip"><div><span>EXPLORED</span><strong>{Math.round(hud.distance)}<small>m</small></strong></div><p className="marina-hint">{touch ? (travel === 'walk' ? 'Left stick walks · push it to the ring to run · right stick looks' : 'Left stick drives and steers · right stick orbits · Brake to stop') : `Click scene, then WASD · ${travel === 'walk' ? 'Drag to look · Shift to run' : `Drag to orbit · A/D steer · ${Math.round(Math.abs(hud.speed) * 3.6)} km/h · Space to brake`}`}</p><div className="touch-controls">{(['a', 'w', 's', 'd'] as const).map((key, index) => { const Icon = [ArrowLeft, ArrowUp, ArrowDown, ArrowRight][index]; return <button key={key} disabled={!!error} aria-label={`${region.shortName} ${['left', 'forward', 'backward', 'right'][index]}`} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); keys.current.add(key); }} onPointerUp={() => keys.current.delete(key)} onPointerCancel={() => keys.current.delete(key)} onLostPointerCapture={() => keys.current.delete(key)}><Icon size={15} /></button>; })}</div></div>
  </div>;
}
