import * as THREE from 'three';
import { PLAYER_FACTION } from './arena-factions';
import type { FacilitySite, FacilitySnapshot } from './facilities';
import { createCommandCampVisuals } from './command-camp-visuals';

/** Field camps surround command consoles; other facilities retain their cabinets. */
export function createFacilityVisuals(scene: THREE.Scene, sites: readonly FacilitySite[]) {
  const resources: (THREE.BufferGeometry | THREE.Material)[] = [];
  const roots = sites.map(site => {
    const root = new THREE.Group(); root.userData.facilityId = site.id;
    root.position.set(site.x, site.y, site.z);
    const metal = new THREE.MeshStandardMaterial({ color: '#53615d', roughness: .8 });
    const accent = new THREE.MeshStandardMaterial({ color: '#70cfff', emissive: '#70cfff', emissiveIntensity: .4 });
    resources.push(metal, accent);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, material = metal) => {
      const geometry = new THREE.BoxGeometry(w, h, d), mesh = new THREE.Mesh(geometry, material);
      resources.push(geometry); mesh.position.set(x, y, z); root.add(mesh); return mesh;
    };
    if(site.kind==='command') {
      // Open-legged map table, radio, screen and a field map replace the box.
      box(2.4,.16,1.6,0,.94,0);
      for(const x of [-1.05,1.05])for(const z of [-.65,.65])box(.12,.86,.12,x,.43,z);
      box(1.15,.025,.9,-.35,1.035,.1,accent);
      for(const x of [-.7,-.35,0])box(.025,.012,.8,x,1.055,.1);
      for(const z of [-.15,.15,.45])box(1.05,.012,.025,-.35,1.055,z);
      box(.6,.42,.5,.75,1.23,-.15);
      box(.42,.22,.03,.75,1.3,.12,accent);
      box(.07,.45,.07,.95,1.325,-.3);
      box(.08,.06,.18,.55,1.47,-.15,accent);
    } else {
      box(1.7, 1.8, 1.3, 0, .9, 0);
      box(1.5, .25, .12, 0, 1.4, .7, accent);
    }
    const mast = box(.08, 3.6, .08, .65, 1.8, -.3);
    box(1.2, .08, .08, .65, 3.3, -.3);
    box(.08, .6, .08, .3, 3.3, -.3);
    box(.08, .6, .08, 1, 3.3, -.3);
    const bar = box(1.7, .12, .1, 0, 2.1, .7, accent);
    const ringGeo = new THREE.RingGeometry(2.3, 2.45, 32); resources.push(ringGeo);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#70cfff', side: THREE.DoubleSide, transparent: true, opacity: .7, depthWrite: false }));
    resources.push(ring.material); ring.rotation.x = -Math.PI / 2; ring.position.y = .04; root.add(ring);
    const pad = new THREE.Group(); pad.userData.facilityId = site.id;
    if (site.kind === 'garage' || site.kind === 'helipad') {
      const g = new THREE.RingGeometry(site.kind === 'helipad' ? 5.5 : 2.5, site.kind === 'helipad' ? 5.7 : 2.65, 40); resources.push(g);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ddd4a4', side: THREE.DoubleSide, transparent: true, opacity: .6, depthWrite: false })); resources.push(m.material);
      m.rotation.x = -Math.PI / 2; pad.position.set(site.deployment.x, .04, site.deployment.z); pad.add(m); scene.add(pad);
    }
    const camp=site.kind==='command'?createCommandCampVisuals(scene,site,accent,resources):undefined;
    scene.add(root); return { site, root, pad, camp, metal, accent, mast, bar, ring };
  });
  return {
    update(snapshot?: FacilitySnapshot) {
      for (const v of roots) {
        const s = snapshot?.sites.find(s => s.id === v.site.id); if (!s) continue;
        const color = !s.health ? '#8a8e88' : s.suppressed ? '#f4cd61' : !s.owner ? '#efd077' : s.owner === PLAYER_FACTION ? '#70cfff' : '#f17c61';
        v.accent.color.set(color); v.accent.emissive.set(color); (v.ring.material as THREE.MeshBasicMaterial).color.set(color);
        v.metal.color.set(s.health ? '#53615d' : '#34332e'); v.mast.visible = s.health > 0;
        v.bar.scale.x = s.action?.progress ?? s.health / s.maxHealth;
        v.bar.visible = s.health > 0 || !!s.action;
      }
    },
    dispose() { roots.forEach(v => { scene.remove(v.root, v.pad); if(v.camp)scene.remove(v.camp); }); resources.forEach(r => r.dispose()); },
  };
}
