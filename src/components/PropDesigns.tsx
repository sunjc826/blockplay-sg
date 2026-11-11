import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createPropMotion, createStreetPropKit, STREET_PROPS, type PropMotion, type StreetPropKind } from '../game/street-props';
import { STREET_PROP_RESEARCH } from '../game/street-prop-research';
import { navigate } from '../lib/routes';
import './prop-designs.css';

export default function PropDesigns() {
  const [selected,setSelected]=useState<StreetPropKind>('vending'),[status,setStatus]=useState(''),[night,setNight]=useState(false);
  const host=useRef<HTMLDivElement>(null),motion=useRef<PropMotion|null>(null),yaw=useRef(.5);
  const spec=STREET_PROPS.find(p=>p.kind===selected)!,research=STREET_PROP_RESEARCH[selected];
  useEffect(()=>{
    const node=host.current!;let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{setStatus('3D preview unavailable. All model descriptions remain available below.');return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label',`${spec.name}. Drag to rotate the view.`);node.append(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color(night?'#15282d':'#c9c7b7');
    const kit=createStreetPropKit(),model=kit.create(selected);scene.add(model);motion.current=createPropMotion(model,selected);
    scene.add(new THREE.HemisphereLight(night?'#9bbdcf':'#f0f5ec','#6a6454',night?1.5:2.8));
    const sun=new THREE.DirectionalLight(night?'#9dbfe9':'#fff2d2',night?2:3.5);sun.position.set(-3,6,4);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:20});sun.shadow.normalBias=.025;scene.add(sun);
    const floorGeometry=new THREE.CircleGeometry(2.8,64),floorMaterial=new THREE.MeshStandardMaterial({color:night?'#293d40':'#b4b2a3',roughness:1});
    const floor=new THREE.Mesh(floorGeometry,floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.y=-.01;floor.receiveShadow=true;scene.add(floor);
    const grid=new THREE.GridHelper(5.4,18,night?'#526461':'#92968c',night?'#344c4d':'#a1a595');grid.position.y=-.005;scene.add(grid);
    const camera=new THREE.PerspectiveCamera(34,1,.05,40);let frame=0,last=performance.now(),drag:number|null=null;
    const resize=()=>{renderer.setSize(node.clientWidth,node.clientHeight);camera.aspect=node.clientWidth/Math.max(1,node.clientHeight);camera.updateProjectionMatrix();};
    const observer=new ResizeObserver(resize);observer.observe(node);resize();
    const down=(e:PointerEvent)=>{drag=e.clientX;renderer.domElement.setPointerCapture(e.pointerId);};
    const move=(e:PointerEvent)=>{if(drag===null)return;yaw.current-=(e.clientX-drag)*.01;drag=e.clientX;};
    const up=()=>{drag=null;};
    renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',up);renderer.domElement.addEventListener('lostpointercapture',up);
    const render=(time:number)=>{motion.current?.update((time-last)/1000);last=time;
      const focus=Math.max(.6,spec.height*.5),distance=Math.max(4.8,spec.height*2.4,Math.max(3.4,spec.width*1.9)/camera.aspect);camera.position.set(Math.sin(yaw.current)*distance,focus+1.9,Math.cos(yaw.current)*distance);camera.lookAt(0,focus,0);renderer.render(scene,camera);
      node.dataset.ready='true';node.dataset.kind=selected;node.dataset.broken=String(motion.current?.broken);node.dataset.active=String(motion.current?.active);node.dataset.draws=String(renderer.info.render.calls);
      frame=requestAnimationFrame(render);
    };
    setStatus('');frame=requestAnimationFrame(render);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();motion.current=null;kit.dispose();floorGeometry.dispose();floorMaterial.dispose();grid.geometry.dispose();(grid.material as THREE.Material).dispose();sun.shadow.dispose();renderer.dispose();renderer.domElement.remove();delete node.dataset.ready;};
  },[selected,night,spec]);
  const react=()=>{if(motion.current?.hit(new THREE.Vector3(-.8,.1,-.6)))setStatus(spec.behavior==='breakable'?'Broken into fragments. Reset to rebuild.':'Knocked over. Reset to stand it up.');};
  return <main className="prop-designs">
    <header className="pd-header"><a href="/" onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate('menu');}}>← Back to game</a><span>BLOCKPLAY SG <b>/ OBJECT LIBRARY</b></span><a href="/world">Explore maps ↗</a></header>
    <section className="pd-intro"><div><p className="pd-eyebrow">STREET LIFE / COLLECTION 01</p><h1>The everyday city.</h1></div><p>{STREET_PROPS.length} pieces of everyday Singapore.<br/> Furniture for dining, gathering and daily routines.</p></section>
    <div className="pd-workbench">
      <aside className="pd-library" aria-label="Choose a prop"><div className="pd-library-title">THE COLLECTION <span>{STREET_PROPS.length} OBJECTS</span></div>
        {STREET_PROPS.map((p,i)=><button key={p.kind} aria-pressed={selected===p.kind} onClick={()=>setSelected(p.kind)}><span className="pd-number">{String(i+1).padStart(2,'0')}</span><span>{p.name}<small>{p.behavior==='fixed'?'Solid scenery':p.behavior==='breakable'?'Breakable decoration':'Movable decoration'}</small></span><i className={`pd-dot ${p.behavior}`} /></button>)}
      </aside>
      <section className="pd-preview" aria-label="Interactive prop preview">
        <div className={`pd-stage${night?' is-night':''}`}><div className="pd-stage-label"><span>OBJECT {String(STREET_PROPS.indexOf(spec)+1).padStart(2,'0')}</span><strong>{spec.behavior==='fixed'?'FIXED':spec.behavior==='breakable'?'BREAKABLE':'PHYSICS'}</strong></div><div ref={host} className="pd-canvas"/><div className="pd-stage-note">DRAG TO ORBIT <span>1 GRID SQUARE = 30 CM</span></div></div>
        <div className="pd-controls"><div><button onClick={()=>{yaw.current=.5;}}>Front</button><button onClick={()=>{yaw.current=Math.PI+.5;}}>Rear</button><button aria-pressed={night} onClick={()=>setNight(v=>!v)}>Night lighting</button></div><div><button className="pd-impact" disabled={spec.behavior==='fixed'} onClick={react}>{spec.behavior==='breakable'?'Break prop':'Knock over'}</button><button onClick={()=>{motion.current?.reset();setStatus('Prop reset.');}}>Reset</button></div></div>
        <div className="pd-description"><div><p className="pd-eyebrow">{spec.setting}</p><h2>{spec.name}</h2><p>{spec.detail}</p>{research&&<p className="pd-reference"><a href={research.url} target="_blank" rel="noreferrer">{research.label} ↗</a></p>}<p role="status" className="pd-status">{status||'Select a model to inspect its details and try its reaction.'}</p></div><dl><div><dt>FOOTPRINT</dt><dd>{spec.width.toFixed(2)} × {spec.depth.toFixed(2)} m</dd></div><div><dt>HEIGHT</dt><dd>{spec.height.toFixed(2)} m</dd></div><div><dt>IN THE MAPS</dt><dd>{spec.behavior==='fixed'?'Solid fixture':'Cosmetic reaction'}</dd></div></dl></div>
      </section>
    </div>
    <footer className="pd-footer"><span>MADE FOR THE NEIGHBOURHOOD</span><p>Furniture follows each place’s use: dining beside food stalls, communal seating in sheltered estates, deliveries at service edges and rest stops along paths. Heavy fixtures are solid. Small props react to visible gunfire with local breakage or bounded floor physics; they do not block movement or stop bullets. Reset the world to restore them.</p></footer>
  </main>;
}
