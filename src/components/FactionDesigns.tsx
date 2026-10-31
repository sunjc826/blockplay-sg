import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { arenaCharacterLook } from '../game/character-looks';
import { createCharacterRig } from '../game/character-rig';
import { PROXY_FACTIONS, proxyCharacterLook } from '../game/proxy-factions';
import { navigate } from '../lib/routes';
import './faction-designs.css';
import ProxyWeaponStudies from './ProxyWeaponStudies';

type Pose = 'standing' | 'walking' | 'crouched';

export default function FactionDesigns() {
  return new URLSearchParams(window.location.search).get('study') === 'weapons' ? <ProxyWeaponStudies /> : <OperatorDesigns />;
}

function OperatorDesigns() {
  const host = useRef<HTMLDivElement>(null), yaw = useRef(.2);
  const [compare, setCompare] = useState(false), [gray, setGray] = useState(false), [pose, setPose] = useState<Pose>('standing');
  const [status, setStatus] = useState('Preparing model studies…');
  const models = useMemo(() => compare ? [
    { name: 'Armed Forces', detail: 'Current faction · paired bars', look: arenaCharacterLook({ bot: true, faction: 'armed-forces', role: 'assault', rank: 3, id: 'study-1' }), color: '#c9cdbe' },
    { name: 'Black Kite', detail: 'Current faction · kite', look: arenaCharacterLook({ bot: true, faction: 'mercenaries', role: 'assault', rank: 3, id: 'study-2' }), color: '#c7cdd3' },
    ...PROXY_FACTIONS.map(faction => ({ name: faction.name, detail: `Concept · ${faction.operators[0].name}`, look: proxyCharacterLook(faction.id, faction.operators[0].id), color: faction.id === 'freedom-force' ? '#dfd9ca' : '#cdd8d2' })),
  ] : PROXY_FACTIONS.flatMap(faction => faction.operators.map((operator, index) => ({ name: operator.name, detail: `${faction.name} · ${operator.concept}`, look: proxyCharacterLook(faction.id, operator.id, `study-${index}`), color: faction.id === 'freedom-force' ? '#dfd9ca' : '#cdd8d2' }))), [compare]);

  useEffect(() => {
    const node = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setStatus('3D preview is unavailable on this device. Palettes and operator descriptions are below.'); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.setAttribute('aria-label', 'Four soldier model studies. Drag to rotate them together.');
    node.append(renderer.domElement); renderer.setScissorTest(true);
    const views = models.map(model => {
      const scene = new THREE.Scene(); scene.background = new THREE.Color(model.color);
      const rig = createCharacterRig(model.look, model.name); scene.add(rig.root);
      scene.add(new THREE.HemisphereLight('#edf3ff', '#66634f', 2.5));
      const key = new THREE.DirectionalLight('#fff0dc', 3.4); key.position.set(-3, 5, -4); scene.add(key);
      const rim = new THREE.DirectionalLight('#d2e4f0', 1.5); rim.position.set(2, 3, 3); scene.add(rim);
      const floorGeometry = new THREE.CircleGeometry(.42, 40), floorMaterial = new THREE.MeshStandardMaterial({ color: model.color, roughness: 1 });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -.004; scene.add(floor);
      return { scene, rig, camera: new THREE.PerspectiveCamera(32, 1, .05, 40), floorGeometry, floorMaterial };
    });
    const resize = () => renderer.setSize(Math.max(1, node.clientWidth), Math.max(1, node.clientHeight));
    const observer = new ResizeObserver(resize); observer.observe(node); resize();
    let frame = 0, previous = performance.now(), lastX: number | null = null;
    const down = (event: PointerEvent) => { lastX = event.clientX; renderer.domElement.setPointerCapture(event.pointerId); };
    const move = (event: PointerEvent) => { if (lastX === null) return; yaw.current += (event.clientX - lastX) * .012; lastX = event.clientX; };
    const up = () => { lastX = null; };
    renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointermove', move);
    renderer.domElement.addEventListener('pointerup', up); renderer.domElement.addEventListener('pointercancel', up); renderer.domElement.addEventListener('lostpointercapture', up);
    const render = (now: number) => {
      const dt = Math.min(.05, (now - previous) / 1000); previous = now;
      const cols = node.clientWidth < 700 ? 2 : 4, rows = 4 / cols, w = node.clientWidth / cols, h = node.clientHeight / rows;
      let calls = 0, finite = true;
      views.forEach(({ scene, rig, camera }, index) => {
        rig.update(dt, { aim: .3, ...(pose === 'walking' ? { velocity: { x: 0, z: -2 } } : pose === 'crouched' ? { crouch: 1 } : {}) }); rig.root.rotation.y = yaw.current;
        // Leave space for the scoped rifle in profile while keeping front views close.
        const profile = Math.abs(Math.sin(yaw.current)), centerX = -Math.sin(yaw.current) * .32;
        const distance = Math.max(4.6, (1.45 + .45 * profile) / (2 * Math.tan(16 * Math.PI / 180) * (w / h)));
        camera.aspect = w / h; camera.position.set(centerX, 1.2, -distance); camera.lookAt(centerX, .93, 0); camera.updateProjectionMatrix();
        renderer.setViewport(index % cols * w, (rows - 1 - Math.floor(index / cols)) * h, w, h);
        renderer.setScissor(index % cols * w, (rows - 1 - Math.floor(index / cols)) * h, w, h);
        renderer.render(scene, camera); calls += renderer.info.render.calls;
        finite &&= rig.root.matrixWorld.elements.every(Number.isFinite);
      });
      node.dataset.ready = 'true'; node.dataset.draws = String(calls); node.dataset.finite = String(finite); node.dataset.yaw = yaw.current.toFixed(3);
      frame = requestAnimationFrame(render);
    };
    setStatus(''); frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      for (const { rig, floorGeometry, floorMaterial } of views) { rig.dispose(); floorGeometry.dispose(); floorMaterial.dispose(); }
      renderer.dispose(); renderer.domElement.remove(); delete node.dataset.ready;
    };
  }, [models, pose]);

  return <main className="faction-designs">
    <header className="fd-top"><a href="/" onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate('menu'); }}>← Back to game</a><span>BLOCKPLAY / DESIGN STUDIES</span><span className="fd-status">CONCEPT MODELS</span></header>
    <section className="fd-intro"><div><p className="fd-eyebrow">FACTIONS / 02 NEW DETACHMENTS</p><h1>Proxy detachments</h1></div><p>Small, elite foreign formations with their own equipment and specialist jobs. Art prototypes for a future proxy conflict; alliances and live encounters are still open.</p></section>
    <nav className="fd-study-links" aria-label="Design study pages"><a href="/faction-designs" aria-current="page">Operator studies</a><a href="/faction-designs?study=weapons">Weapon studies →</a></nav>
    <section className="fd-gallery" aria-label="Interactive faction model gallery">
      <div className="fd-toolbar"><div className="fd-segments"><button aria-pressed={!compare} onClick={() => setCompare(false)}>Four specialists</button><button aria-pressed={compare} onClick={() => setCompare(true)}>Compare factions</button></div><div className="fd-tools"><button aria-pressed={gray} onClick={() => setGray(value => !value)}>Grayscale</button><button onClick={() => { yaw.current = 0; }}>Front</button><button onClick={() => { yaw.current = Math.PI / 2; }}>Side</button><button onClick={() => { yaw.current = Math.PI; }}>Rear</button><label><span className="fd-sr">Model pose</span><select value={pose} onChange={event => setPose(event.target.value as Pose)}><option value="standing">Standing</option><option value="walking">Walking</option><option value="crouched">Crouched</option></select></label></div></div>
      <div className={`fd-stage${gray ? ' is-gray' : ''}`}><div ref={host} className="fd-canvas" />{status && <p className="fd-preview-status" role="status">{status}</p>}<div className="fd-model-labels">{models.map(model => <div key={model.name}><strong>{model.name}</strong><span>{model.detail}</span></div>)}</div></div>
      <p className="fd-caption">DRAG TO ROTATE ALL MODELS <span>Shared lighting · same scale · faction markings visible without color</span></p>
    </section>
    <div className="fd-factions">{PROXY_FACTIONS.map((faction, index) => <section key={faction.id} className="fd-faction" aria-labelledby={`${faction.id}-heading`}>
      <p className="fd-eyebrow">0{index + 1} / {faction.influence}</p><h2 id={`${faction.id}-heading`}>{faction.name}</h2><p>{faction.premise}</p>
      <div className="fd-swatches">{faction.swatches.map(swatch => <div key={swatch.hex}><i style={{ background: swatch.hex }} /><strong>{swatch.name}</strong><code>{swatch.hex.toUpperCase()}</code></div>)}</div>
      <p className="fd-silhouette">{faction.silhouette}</p><div className="fd-operators">{faction.operators.map(operator => <article key={operator.id}><h3>{operator.name}</h3><span>{operator.concept}</span><p>{operator.equipment}</p></article>)}</div>
    </section>)}</div>
    <footer className="fd-footer">Original fictional factions. Western and Eastern influences guide equipment and visual language; faces are varied independently of faction. Weapon, shield and sensor models are visual studies with no new combat behavior.</footer>
  </main>;
}
