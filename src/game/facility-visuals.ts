import * as THREE from 'three';
import { PLAYER_FACTION } from './arena-factions';
import type { FacilitySite, FacilitySnapshot } from './facilities';

/** Small equipment objectives, not destructible landmark buildings. */
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
    const cabinet = box(1.7, 1.8, 1.3, 0, .9, 0);
    box(1.5, .25, .12, 0, 1.4, .7, accent);
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
    scene.add(root); return { site, root, pad, metal, accent, cabinet, mast, bar, ring };
  });
  return {
    update(snapshot?: FacilitySnapshot) {
      for (const v of roots) {
        const s = snapshot?.sites.find(s => s.id === v.site.id); if (!s) continue;
        const color = !s.health ? '#8a8e88' : s.suppressed ? '#f4cd61' : !s.owner ? '#efd077' : s.owner === PLAYER_FACTION ? '#70cfff' : '#f17c61';
        v.accent.color.set(color); v.accent.emissive.set(color); (v.ring.material as THREE.MeshBasicMaterial).color.set(color);
        v.cabinet.scale.y = 1; v.cabinet.position.y = .9;
        v.metal.color.set(s.health ? '#53615d' : '#34332e'); v.mast.visible = s.health > 0;
        v.bar.scale.x = s.action?.progress ?? s.health / s.maxHealth;
        v.bar.visible = s.health > 0 || !!s.action;
      }
    },
    dispose() { roots.forEach(v => { scene.remove(v.root, v.pad); }); resources.forEach(r => r.dispose()); },
  };
}
