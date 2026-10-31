import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildProxyWeapon, PROXY_WEAPONS, type ProxyWeaponId } from '../game/proxy-weapon-models';
import { navigate } from '../lib/routes';
import './faction-designs.css';

type View = 'profile' | 'opposite' | 'oblique' | 'front';
const presetTurn = (view: View) => ({ yaw: view === 'opposite' ? Math.PI : view === 'oblique' ? .65 : view === 'front' ? Math.PI / 2 : 0, pitch: view === 'oblique' ? -.15 : 0 });

export default function ProxyWeaponStudies() {
  const [selected, setSelected] = useState<ProxyWeaponId>('ff-strider'), [gray, setGray] = useState(false), [view, setView] = useState<View>('profile');
  const [status, setStatus] = useState('Preparing weapon study…');
  const host = useRef<HTMLDivElement>(null), turn = useRef({ yaw: 0, pitch: 0 });
  const study = PROXY_WEAPONS.find(model => model.id === selected)!;
  useEffect(() => {
    const node = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setStatus('3D preview is unavailable. Design notes and references remain available below.'); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(study.faction === 'freedom-force' ? '#dcd6c8' : '#ccd6d0');
    renderer.domElement.setAttribute('aria-label', `${study.name} 3D exterior weapon study. Drag to rotate; use view buttons for presets.`);
    node.append(renderer.domElement);
    const scene = new THREE.Scene(), model = buildProxyWeapon(selected); scene.add(model.root);
    scene.add(new THREE.HemisphereLight('#f2f6ff', '#595d50', 2.6));
    const key = new THREE.DirectionalLight('#fff1df', 3.6); key.position.set(-2, 4, 2); scene.add(key);
    const rim = new THREE.DirectionalLight('#e0efff', 1.4); rim.position.set(2, 1, -3); scene.add(rim);
    const bounds = new THREE.Box3().setFromObject(model.root), center = bounds.getCenter(new THREE.Vector3());
    model.root.position.sub(center);
    // Present the full outside profile along screen X, then rotate around its center.
    const pivot = new THREE.Group(); scene.remove(model.root); pivot.add(model.root); scene.add(pivot);
    const camera = new THREE.PerspectiveCamera(32, 1, .02, 20);
    turn.current = presetTurn(view);
    let frame = 0, previous: { x: number; y: number } | null = null;
    const resize = () => { renderer.setSize(Math.max(1, node.clientWidth), Math.max(1, node.clientHeight)); camera.aspect = node.clientWidth / Math.max(1, node.clientHeight); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(node); resize();
    const down = (event: PointerEvent) => { previous = { x: event.clientX, y: event.clientY }; renderer.domElement.setPointerCapture(event.pointerId); };
    const move = (event: PointerEvent) => { if (!previous) return; turn.current.yaw += (event.clientX - previous.x) * .01; turn.current.pitch = THREE.MathUtils.clamp(turn.current.pitch + (event.clientY - previous.y) * .007, -.85, .85); previous = { x: event.clientX, y: event.clientY }; };
    const up = () => { previous = null; };
    renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointermove', move);
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) renderer.domElement.addEventListener(event, up);
    setStatus('');
    const render = () => {
      // Same viewing distance for every study: long and compact weapons retain their scale difference.
      const distance = Math.max(1.65, 1.35 / (2 * Math.tan(16 * Math.PI / 180) * camera.aspect));
      camera.position.set(-distance, .035, 0); camera.lookAt(0, 0, 0);
      pivot.rotation.set(turn.current.pitch, turn.current.yaw, 0); renderer.render(scene, camera);
      node.dataset.ready = 'true'; node.dataset.model = selected; node.dataset.draws = String(renderer.info.render.calls); node.dataset.triangles = String(renderer.info.render.triangles); node.dataset.yaw = turn.current.yaw.toFixed(3);
      frame = requestAnimationFrame(render);
    }; frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); model.dispose(); renderer.dispose(); renderer.domElement.remove(); delete node.dataset.ready; };
  }, [selected, view, study.faction, study.name]);

  return <main className="faction-designs fd-weapon-studies">
    <header className="fd-top"><a href="/" onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate('menu'); }}>← Back to game</a><span>BLOCKPLAY / WEAPON STUDIES</span><span className="fd-status">ART PROTOTYPES</span></header>
    <section className="fd-intro"><div><p className="fd-eyebrow">FREEDOM FORCE / COLLECTIVE CORPS</p><h1>Proxy weapon studies</h1></div><p>Six exterior studies, including separate SCAR-L- and SCAR-H-inspired options for Freedom Force. Shared family traits, different proportions and magazines.</p></section>
    <nav className="fd-study-links" aria-label="Design study pages"><a href="/faction-designs">Operator studies</a><a href="/faction-designs?study=weapons" aria-current="page">Weapon studies</a></nav>
    <div className="fd-weapon-layout"><section className="fd-gallery" aria-label="Interactive weapon preview">
      <div className="fd-toolbar"><div className="fd-segments">{(['profile', 'opposite', 'oblique', 'front'] as const).map(preset => <button key={preset} aria-pressed={view === preset} onClick={() => { turn.current = presetTurn(preset); setView(preset); }}>{preset === 'opposite' ? 'Other side' : preset[0].toUpperCase() + preset.slice(1)}</button>)}</div><button aria-pressed={gray} onClick={() => setGray(value => !value)}>Grayscale</button></div>
      <div className={`fd-stage fd-weapon-stage${gray ? ' is-gray' : ''}`}><div className="fd-canvas" ref={host} />{status && <p className="fd-preview-status" role="status">{status}</p>}<div className="fd-weapon-mark"><span>{study.faction === 'freedom-force' ? 'FREEDOM FORCE' : 'COLLECTIVE CORPS'}</span><strong>{study.name}</strong></div></div>
      <p className="fd-caption">DRAG TO ROTATE <span>Same scale · exterior art study · no combat statistics</span></p>
    </section><aside className="fd-weapon-picker" aria-label="Select a weapon study">{PROXY_WEAPONS.map(model => <button key={model.id} aria-pressed={model.id === selected} onClick={() => setSelected(model.id)}><span>{model.faction === 'freedom-force' ? 'FREEDOM FORCE' : 'COLLECTIVE CORPS'} / {model.operator}</span><strong>{model.name}</strong><small>{model.reference} inspiration</small></button>)}</aside></div>
    <section className="fd-weapon-notes"><div><p className="fd-eyebrow">{study.operator.toUpperCase()} / EXTERIOR LANGUAGE</p><h2>{study.name}</h2><p>{study.silhouette}</p></div><div><h3>Faction interpretation</h3><p>{study.interpretation}</p><a href={study.referenceUrl} target="_blank" rel="noreferrer">Base reference: {study.reference} ↗</a></div></section>
    <footer className="fd-footer">Candidate designs, not locked loadouts. These models are outside the store, loot tables, weapon families and live encounters. Operator studies still carry their existing placeholders while hand fit, reloads, sights and gameplay integration remain open.</footer>
  </main>;
}
