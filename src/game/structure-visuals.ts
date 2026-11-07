import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { StructureAppearance, StructureLayout } from './structure-types';
import { createStructurePropsVisuals } from './structure-prop-visuals';

/** Render a fixed physical layout. Mode adapters provide appearance updates. */
export function createStructureVisuals(scene: THREE.Scene, layout: StructureLayout, options: { batchParts?: boolean } = {}) {
  const resources: (THREE.BufferGeometry | THREE.Material)[] = [];
  const roots = layout.structures.map(site => {
    const root = new THREE.Group(); root.userData.structureId = site.id; root.userData.structureRole = 'core';
    root.userData.structureCover = site.core?.cover;
    root.position.set(site.x, site.y, site.z);
    const metal = new THREE.MeshStandardMaterial({ color: '#53615d', roughness: .8 });
    const accent = new THREE.MeshStandardMaterial({ color: '#70cfff', emissive: '#70cfff', emissiveIntensity: .4 });
    resources.push(metal, accent);
    const core = site.core ? (() => {
      const box = (w: number, h: number, d: number, x: number, y: number, z: number, material = metal) => {
        const geometry = new THREE.BoxGeometry(w, h, d), mesh = new THREE.Mesh(geometry, material);
        resources.push(geometry); mesh.position.set(x, y, z); root.add(mesh); return mesh;
      };
      if(site.core?.model==='command-console') {
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
      } else if (site.core) {
        box(1.7, 1.8, 1.3, 0, .9, 0);
        box(1.5, .25, .12, 0, 1.4, .7, accent);
      }
      const mast = box(.08, 3.6, .08, .65, 1.8, -.3);
      box(1.2, .08, .08, .65, 3.3, -.3);
      box(.08, .6, .08, .3, 3.3, -.3);
      box(.08, .6, .08, 1, 3.3, -.3);
      const bar = box(1.7, .12, .1, 0, 2.1, .7, accent);
      // Only these authored, fixed boxes share a draw. Each console retains its
      // own materials; the mast and progress bar still change independently.
      if (options.batchParts !== false) for (const material of [metal, accent]) {
        const parts = root.children.filter((o): o is THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> =>
          o instanceof THREE.Mesh && o !== mast && o !== bar && o.material === material);
        if (parts.length < 2) continue;
        const flightBounds = parts.map(part => {
          part.updateMatrix(); part.geometry.computeBoundingBox();
          return part.geometry.boundingBox!.clone().applyMatrix4(part.matrix);
        });
        const geometry = mergeGeometries(parts.map(part => part.geometry.applyMatrix4(part.matrix)), false)!;
        geometry.computeBoundingBox(); geometry.computeBoundingSphere(); resources.push(geometry);
        const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Structure fixed parts';
        // Preserve the gaps between parts for helicopter collision extraction.
        mesh.userData.flightBounds = flightBounds;
        for (const part of parts) {
          root.remove(part); resources.splice(resources.indexOf(part.geometry), 1); part.geometry.dispose();
        }
        root.add(mesh);
      }
      const ringGeo = new THREE.RingGeometry(2.3, 2.45, 32); resources.push(ringGeo);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#70cfff', side: THREE.DoubleSide, transparent: true, opacity: .7, depthWrite: false }));
      resources.push(ring.material); ring.rotation.x = -Math.PI / 2; ring.position.y = .04; root.add(ring);
      return { mast, bar, ring };
    })() : undefined;
    const pad = new THREE.Group(); pad.userData.structureId = site.id; pad.userData.structureRole = 'pad'; pad.userData.structureCover = 'none';
    if (site.pad) {
      const g = new THREE.RingGeometry(site.pad.innerRadius, site.pad.outerRadius, 40); resources.push(g);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ddd4a4', side: THREE.DoubleSide, transparent: true, opacity: .6, depthWrite: false })); resources.push(m.material);
      m.rotation.x = -Math.PI / 2; pad.position.set(site.pad.x, site.pad.y, site.pad.z); pad.add(m); scene.add(pad);
    }
    const camp=site.props || site.flag ? createStructurePropsVisuals(scene,site,accent,resources) : undefined;
    if (site.core) scene.add(root); return { site, root, pad, camp, metal, accent, core };
  });
  let disposed = false;
  return {
    roots,
    update(appearance: readonly StructureAppearance[]) {
      for (const v of roots) {
        const s = appearance.find(s => s.id === v.site.id); if (!s) continue;
        v.accent.color.set(s.accent); v.accent.emissive.set(s.accent);
        v.metal.color.set(s.body);
        if (v.core) {
          (v.core.ring.material as THREE.MeshBasicMaterial).color.set(s.accent);
          v.core.mast.visible = s.mastVisible;
          v.core.bar.scale.x = s.barFraction;
          v.core.bar.visible = s.barVisible;
        }
      }
    },
    dispose() { if (disposed) return; disposed = true; roots.forEach(v => { scene.remove(v.root, v.pad); if(v.camp)scene.remove(v.camp); }); resources.forEach(r => r.dispose()); },
  };
}
