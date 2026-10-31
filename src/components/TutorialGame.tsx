import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Menu, Play, RotateCcw } from 'lucide-react';
import { createFpsEngine, initialFpsHud, type FpsEngine, type FpsHud } from '../game/fps-engine';
import { createProfile, resolveLoadout } from '../game/armory-state';
import { advanceCourse, COURSE_STEPS, COURSE_LAYOUT, startCourse } from '../game/tutorial-course';
import { useTouchControls } from '../game/use-touch-controls';
import { useFpsFullscreen } from '../game/use-fps-fullscreen';
import { transitionTo } from '../lib/route-transition';
import TouchControls from './TouchControls';
import FpsWeaponSlider from './FpsWeaponSlider';
import FpsWeaponHud from './FpsWeaponHud';
import { FpsPlayerTools } from './FpsPlayerTools';
import './tutorial.css';

export default function TutorialGame({ suspended, onStore }: { suspended: boolean; onStore: () => void }) {
  const host = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), engine = useRef<FpsEngine | null>(null);
  const progress = useRef(startCourse());
  const [hud, setHud] = useState<FpsHud>(initialFpsHud), [step, setStep] = useState(0), [epoch, setEpoch] = useState(0);
  const [equipment] = useState(() => resolveLoadout(createProfile()));
  const touch = useTouchControls(hud.inputMode);
  const fullscreen = useFpsFullscreen(stage, () => engine.current?.pause());
  const toggleFullscreen = useRef(fullscreen.toggle); toggleFullscreen.current = fullscreen.toggle;
  useEffect(() => {
    progress.current = startCourse(); setStep(0); setHud(initialFpsHud);
    try {
      engine.current = createFpsEngine(host.current!, next => {
        const advanced = advanceCourse(progress.current, next);
        if (advanced.step !== progress.current.step) { setStep(advanced.step); engine.current?.setTutorialStep(advanced.step); }
        progress.current = advanced; setHud(next);
      }, { tutorial: true, loadout: equipment, onFullscreen: () => { void toggleFullscreen.current(); } });
      engine.current.setTutorialStep(0);
    } catch { setHud(h => ({ ...h, phase: 'error', message: '3D graphics could not start. Enable WebGL and retry.' })); }
    return () => { engine.current?.dispose(); engine.current = null; };
  }, [epoch, equipment]);
  useEffect(() => { if (suspended) engine.current?.pause(); }, [suspended]);
  const complete = step >= COURSE_STEPS.length, lesson = COURSE_STEPS[step];
  const playing = hud.phase === 'playing';
  useEffect(() => { if (complete) engine.current?.pause(); }, [complete]);
  const skip = () => { progress.current = { ...progress.current, step: step + 1, weapon: hud.weapon }; setStep(step + 1); engine.current?.setTutorialStep(step + 1, true); };
  const restart = () => setEpoch(n => n + 1);
  const begin = () => { if (touch) fullscreen.enter(); engine.current?.start(); };
  const toStore = () => { engine.current?.pause(); if (fullscreen.immersive) void fullscreen.toggle(); onStore(); };
  return <div className={`fps-game tutorial-game${fullscreen.immersive ? ' is-immersive' : ''}`} ref={stage} data-phase={hud.phase} data-step={lesson?.id ?? 'complete'} data-touch={touch ? 'on' : undefined} data-player-x={hud.x} data-player-z={hud.z} data-player-yaw={hud.yaw} data-player-pitch={hud.pitch}>
    <div className="viewport fps-viewport">
      <div className="world" ref={host} />
      {playing && !complete && <>
        <button className="tutorial-menu" aria-label="Pause tutorial" onClick={() => engine.current?.pause()}><Menu size={18} /> <span>Menu</span></button>
        <aside className="tutorial-lesson" aria-label="Current lesson">
          <span className="tutorial-eyebrow">FIELD SCHOOL · {String(step + 1).padStart(2, '0')} / {COURSE_STEPS.length}</span>
          <h2 aria-live="polite">{lesson.title}</h2><p>{lesson.detail}</p><strong>{touch ? lesson.touch : lesson.desktop}</strong>
          {'x' in lesson && <small>{Math.round(Math.hypot(hud.x - lesson.x, hud.z - lesson.z))} m to station {String(step).padStart(2, '0')}</small>}
          {lesson.id === 'sprint' && <small>{Math.min(COURSE_LAYOUT.sprintRequired, Math.floor(progress.current.sprintMetres))} / {COURSE_LAYOUT.sprintRequired} m sprinted</small>}
          <progress value={step} max={COURSE_STEPS.length} aria-label="Course progress" />
        </aside>
        {hud.mapExpanded && <div className="tutorial-course-map"><span className="tutorial-eyebrow">FIELD SCHOOL</span><svg viewBox="-58 -102 114 198" role="img" aria-label="Course map with your position, obstacle lane and firing range"><path d={`M${COURSE_LAYOUT.laneX} ${COURSE_LAYOUT.spawnZ}V${COURSE_LAYOUT.bendZ}H${COURSE_LAYOUT.rangeX}V-94`} fill="none" stroke="#789f7d" strokeWidth="7" />{[COURSE_LAYOUT.crouch, COURSE_LAYOUT.crawl].map((s, i) => <rect key={i} x={COURSE_LAYOUT.laneX - 4} y={s.exitZ} width="8" height={s.entryZ - s.exitZ} fill="#a59373" />)}{COURSE_STEPS.map(s => 'x' in s ? <circle key={s.id} cx={s.x} cy={s.z} r="2.4" fill="#e1bf7d" /> : null)}<circle cx={hud.x} cy={hud.z} r="3" fill="#ffffff" /></svg><p>White dot: you · Gold rings: stations</p><p>{touch ? 'Tap Map again to close.' : 'Press M again to close.'}</p></div>}
        <FpsWeaponSlider hud={hud} names={equipment.weapons.map(w => w.name)} canSwitch onSwitch={family => engine.current?.switchWeapon(family)} />
        <FpsWeaponHud hud={hud} weapon={equipment.weapons[hud.weapon]} canFight onUtility={() => {}} onInspect={() => engine.current?.inspectWeapon()} touch={touch} />
        {lesson.id === 'map' && <button className="tutorial-map" aria-pressed={hud.mapExpanded} onClick={() => engine.current?.toggleMap()}>Map <kbd>M</kbd></button>}
        {touch && <TouchControls hud={hud} engine={engine.current} mode="range" onMenu={() => engine.current?.pause()} />}
      </>}
      {(!playing || complete) && <div className="fps-overlay"><div className="fps-start-card tutorial-card">
        <button className="tutorial-back" onClick={() => transitionTo('menu', 'Menu')}><ArrowLeft size={15} /> Menu</button>
        <span className="tutorial-eyebrow">RECRUIT / FIELD SCHOOL</span>
        <h2>{complete ? 'Ready for your first deployment.' : hud.phase === 'loading' ? 'Setting up the yard…' : hud.phase === 'error' ? 'Course unavailable.' : hud.phase === 'paused' ? 'Take your time.' : 'Learn by doing.'}</h2>
        <p>{complete ? 'You’ve reached the end of the control lessons. Next, find your way around the store and prepare a loadout.' : hud.phase === 'error' ? hud.message : hud.phase === 'paused' ? `Next: ${lesson.title}. Your progress is saved while this course stays open.` : 'A short obstacle course, then a guided visit to the store. Move, sprint, jump, crouch and practise with your weapon at your own pace.'}</p>
        {hud.message && hud.phase !== 'error' && <p role="alert">{hud.message}</p>}
        {!complete && hud.phase !== 'paused' && <div className="tutorial-brief"><span>01 / Move through the gates</span><span>02 / Learn your weapon</span><span>03 / Explore the store</span></div>}
        <small>Issued practice gear · No incoming fire · Your credits and supplies stay intact</small>
        {complete ? <button className="primary-button" onClick={toStore}>Tour the store <ArrowRight size={17} /></button> : <button className="primary-button" disabled={hud.phase === 'loading' || suspended} onClick={hud.phase === 'error' ? restart : begin}><Play size={16} /> {hud.phase === 'loading' ? 'Loading…' : hud.phase === 'error' ? 'Retry course' : hud.phase === 'paused' ? 'Resume course' : 'Start course'} <ArrowRight size={17} /></button>}
        {hud.phase === 'paused' && !complete && <button className="tutorial-secondary" onClick={skip}>Skip this lesson <ArrowRight size={14} /></button>}
        <button className="tutorial-secondary" onClick={toStore}>{complete ? <Check size={14} /> : null} {complete ? 'Continue to equipment' : 'Go straight to the store tour'}</button>
        {(hud.phase === 'paused' || complete) && <button className="tutorial-secondary" onClick={restart}><RotateCcw size={14} /> Restart course</button>}
        <FpsPlayerTools hud={hud} engine={engine.current} immersive={fullscreen.immersive} touch={touch} onFullscreen={() => { void fullscreen.toggle(); }} />
      </div></div>}
    </div>
  </div>;
}
