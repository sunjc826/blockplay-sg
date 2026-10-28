import * as THREE from 'three';
import { itemById } from './armory-catalog';
import { buildGrenadeModel } from './grenade-models';
import { grenadePayloads, grenadePops, type LiveGrenade, type GrenadeEvent } from './grenade-system';
/** Snapshot driven props, dense cloud volumes, warning rings and ember shower. */
export function createGrenadeVisuals(scene: THREE.Scene, boom: (point: THREE.Vector3, damage: number) => void, landing?: (point: THREE.Vector3) => THREE.Vector3) {
  const root = new THREE.Group(); root.userData.fpsEffect = true; scene.add(root);
  const props = new Map<number, ReturnType<typeof buildGrenadeModel>>(), areas = new Map<string, THREE.Group>(), seen = new Set<string>();
  const landed = new Map<number, NonNullable<ReturnType<typeof buildGrenadeModel>>>();
  const sphere = new THREE.SphereGeometry(1, 12, 8), ring = new THREE.RingGeometry(.96, 1, 64), emberGeo = new THREE.SphereGeometry(.07, 4, 3);
  const materials: THREE.Material[] = [];
  const clear = () => { props.forEach(m => { m?.root.removeFromParent(); m?.dispose(); }); props.clear(); landed.forEach(m => { m.root.removeFromParent(); m.dispose(); }); landed.clear(); areas.forEach(g => g.removeFromParent()); areas.clear(); materials.splice(0).forEach(m => m.dispose()); seen.clear(); };
  return { update(live: readonly LiveGrenade[], events: readonly GrenadeEvent[], now: number, snapshotTime = now) {
    const eventIds = new Set(events.map(e => e.serial));
    for (const [id, model] of landed) if (!eventIds.has(id)) { model.root.removeFromParent(); model.dispose(); landed.delete(id); }
    const ids = new Set(live.map(g => g.serial));
    for (const [id, model] of props) if (!ids.has(id)) { model?.root.removeFromParent(); model?.dispose(); props.delete(id); }
    for (const g of live) { let model = props.get(g.serial); if (!model) { model = buildGrenadeModel(g.id); props.set(g.serial, model); if (model) root.add(model.root); }
      if (model) { model.root.position.copy(g.position); const ahead = Math.min(.15, Math.max(0, now - snapshotTime)); if (!g.rested) { model.root.position.addScaledVector(new THREE.Vector3(g.velocity.x, g.velocity.y, g.velocity.z), ahead); model.root.position.y -= 4.9 * ahead * ahead; } model.root.rotation.set(g.id === 'grenade-finale' || g.id === 'grenade-chope' ? 0 : g.age * 3, g.age, 0); if (g.id === 'grenade-finale' && g.launched) model.root.position.y = g.position.y - (60 - g.velocity.y * g.velocity.y / 19.6); } }
    const active = new Set<string>();
    for (const event of events) {
      const age = now - event.start, spec = itemById(event.id)!.grenade!;
      if (['grenade-chope', 'grenade-finale'].includes(event.id) && !landed.has(event.serial)) { const model = buildGrenadeModel(event.id)!; model.root.position.copy(event.point); root.add(model.root); landed.set(event.serial, model); }
      for (const [i, pop] of grenadePops(event).entries()) { const key = `${event.serial}/boom/${i}`;
        if (age >= pop.time && !seen.has(key)) { seen.add(key); if (age < pop.time + 1) boom(landing && ['grenade-red-smoke', 'grenade-oranges'].includes(event.id) ? landing(new THREE.Vector3(pop.point.x, pop.point.y, pop.point.z)) : new THREE.Vector3(pop.point.x, pop.point.y, pop.point.z), pop.blast.damage); } }
      if (['grenade-oranges', 'grenade-firecrackers', 'grenade-finale'].includes(event.id)) {
        const key = `${event.serial}/pieces`; let group = areas.get(key);
        const pops = grenadePops(event), last = pops.at(-1)?.time ?? 6;
        if (age <= last) {
          active.add(key);
          if (!group) {
            group = new THREE.Group(); root.add(group); areas.set(key, group);
            const m = new THREE.MeshBasicMaterial({ color: event.id === 'grenade-oranges' ? '#ee8d27' : event.id === 'grenade-finale' ? '#ffd679' : '#bd382b', toneMapped: false }); materials.push(m);
            const count = event.id === 'grenade-finale' ? 120 : pops.length;
            for (let i = 0; i < count; i++) { const mesh = new THREE.Mesh(emberGeo, m); group.add(mesh); }
          }
          group.children.forEach((mesh, i) => {
            if (event.id === 'grenade-oranges') {
              const p = pops[i], t = Math.min(1, age / p.time);
              mesh.visible = age < p.time && (age >= .12 || i < 2);
              mesh.position.set(event.point.x + (p.point.x - event.point.x) * t, event.point.y + (.15 - event.point.y) * t * t, event.point.z + (p.point.z - event.point.z) * t);
              mesh.scale.setScalar(.7);
            } else if (event.id === 'grenade-firecrackers') { const p = pops[i]; mesh.visible = age < p.time; mesh.position.set(p.point.x, p.point.y, p.point.z); mesh.scale.set(1, 2, 1); }
            else { const angle = i * 2.39996, radial = Math.sin(i * 1.781), r = age * 7; mesh.position.set(event.point.x + Math.cos(angle) * r * radial, event.point.y + 60 + Math.cos(i * 1.781) * r - age * age * 1.4, event.point.z + Math.sin(angle) * r * radial); }
          });
        }
      }
      for (const p of grenadePayloads(event)) {
        if (p.type !== 'cloud' && p.type !== 'marker') continue;
        if (age < p.from || age > p.until) continue;
        const key = `${event.serial}/${p.id}`; active.add(key); let group = areas.get(key);
        if (!group) {
          group = new THREE.Group(); group.position.set(p.center.x, event.point.y, p.center.z); root.add(group); areas.set(key, group);
          if (p.type === 'cloud') {
            const effect = spec.effects.find(e => e.kind === 'cloud');
            if (effect?.kind === 'cloud' && effect.blocksSight === false) {
              const m = new THREE.MeshBasicMaterial({ color: '#ffd576', toneMapped: false }); materials.push(m);
              for (let i = 0; i < 100; i++) { const a = i * 2.39996, r = Math.sqrt(i / 100) * p.radius, ember = new THREE.Mesh(emberGeo, m); ember.position.set(Math.cos(a) * r, i % 20 + 2, Math.sin(a) * r); group.add(ember); }
            } else {
              const m = new THREE.MeshBasicMaterial({ color: p.colour, transparent: true, opacity: .75, depthWrite: false, side: THREE.DoubleSide }); materials.push(m);
              for (let i = 0; i < 14; i++) { const a = i * 2.39996, r = Math.sqrt(i / 14) * p.radius * .6, puff = new THREE.Mesh(sphere, m); puff.position.set(Math.cos(a) * r, 1.4 + i % 3 * .7, Math.sin(a) * r); puff.scale.set(p.radius * .5, 2.6, p.radius * .5); group.add(puff); }
            }
          } else { const m = new THREE.MeshBasicMaterial({ color: p.colour, transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false }); materials.push(m); const mesh = new THREE.Mesh(ring, m); mesh.rotation.x = -Math.PI / 2; mesh.position.y = .08; mesh.scale.setScalar(p.radius); group.add(mesh); }
        }
        if (p.type === 'cloud') { const scale = Math.min(1, .2 + age * .8) * Math.min(1, (p.until - age) / 2); group.scale.setScalar(scale); }
        if (event.id === 'grenade-finale') group.children.forEach((m, i) => m.position.y = 2 + ((i * 1.79 - age * 6) % 20 + 20) % 20);
      }
    }
    for (const [key, group] of areas) if (!active.has(key)) { group.removeFromParent(); group.traverse(n => { if (n instanceof THREE.Mesh) { const m = n.material as THREE.Material; if (materials.includes(m)) { m.dispose(); materials.splice(materials.indexOf(m), 1); } } }); areas.delete(key); }
    if (seen.size > 2048) seen.clear();
  }, reset: clear, dispose() { clear(); root.removeFromParent(); sphere.dispose(); ring.dispose(); emberGeo.dispose(); } };
}
