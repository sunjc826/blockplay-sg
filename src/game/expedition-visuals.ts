import * as THREE from 'three';
import type { FieldLoot } from './expedition-loot';
import type { ExpeditionNpc } from './expedition-npcs';
import { itemById } from './armory-catalog';
import { FPS_WEAPONS } from './fps-rules';
import { buildServiceWeapon } from './service-weapon-models';
import { applyEnemyWeaponConfig } from './enemy-weapon-models';
import { disposeModel } from './armory-visuals';
import { WORLD_GATEWAYS, getWorldZone, type WorldZoneId } from './world-zones';
import { createCharacterRig, hashString, type CharacterGesture, type CharacterRig } from './character-rig';
import { npcCharacterLook, npcIdleGesture } from './character-looks';

export function createExpeditionMarkers(scene: THREE.Scene, zone: WorldZoneId, loot: readonly FieldLoot[], npcs: readonly ExpeditionNpc[] = []) {
  const root = new THREE.Group(); root.name = 'expedition-markers'; root.userData.fpsEffect = true; scene.add(root);
  const resources: { dispose(): void }[] = [];
  const pickups = new Map<string, THREE.Group>();
  function mesh(parent: THREE.Group, geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .8 }); resources.push(geometry, material);
    const part = new THREE.Mesh(geometry, material); part.position.set(x,y,z); parent.add(part); return part;
  }
  function label(parent: THREE.Group, text: string, color: string, y: number, owned = resources) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 64;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#14231fea'; ctx.fillRect(0,0,512,64); ctx.font = '600 26px sans-serif'; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text,256,32,490);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map:texture, depthTest:true }); owned.push(texture,material);
    const sprite = new THREE.Sprite(material); sprite.position.y = y; sprite.scale.set(3.7,.46,1); parent.add(sprite);
  }
  const tierColor = (tier: FieldLoot['tier']) => tier === 'Elite' ? '#e5bb55' : tier === 'Field' ? '#71b8d0' : '#b8c9b2';
  // A fallen enemy's weapon is drawn as itself, lying on its side where it fell,
  // with a tier ring so it reads from a distance. Each owns its resources, so
  // the oldest can be thrown away when a new one drops.
  const drops = new Map<string, { group: THREE.Group; resources: { dispose(): void }[] }>();
  function addDrop(item: FieldLoot) {
    if (item.kind !== 'weapon') { addKit(item); return; }
    const variant = itemById(item.catalogId ?? ''), spec = variant?.family === undefined ? undefined : FPS_WEAPONS[variant.family];
    const model = spec && buildServiceWeapon(spec.id); if (!variant || !model) return;
    const group = new THREE.Group(), owned: { dispose(): void }[] = [{ dispose: () => disposeModel(model) }];
    group.name = `drop-${item.id}`; group.position.set(item.x, (item.y ?? 0) + .02, item.z); root.add(group);
    applyEnemyWeaponConfig(model, spec.id, variant.config);
    // On its left side, so the ejection port and the flash hider face up and out.
    model.rotation.set(0, (hashString(item.id) % 628) / 100, Math.PI / 2); model.updateMatrixWorld(true);
    // Rest it on the ground by what is actually showing: a drum or a belt box hangs lower than a magazine.
    const bounds = new THREE.Box3();
    model.traverseVisible(node => { if (node instanceof THREE.Mesh) { node.geometry.computeBoundingBox(); bounds.union(node.geometry.boundingBox!.clone().applyMatrix4(node.matrixWorld)); } });
    model.position.y = bounds.isEmpty() ? .045 : -bounds.min.y;
    model.traverse(node => { node.userData.fpsEffect = true; });
    group.add(model);
    const color = tierColor(item.tier);
    const ringGeometry = new THREE.TorusGeometry(.62, .025, 6, 32), ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .75 });
    owned.push(ringGeometry, ringMaterial);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial); ring.rotation.x = Math.PI / 2; ring.position.y = .02; group.add(ring);
    label(group, `${item.tier.toUpperCase()} / ${item.name}`, color, .95, owned);
    drops.set(item.id, { group, resources: owned });
  }
  /** A kit set out on the ground from a supply crate: a small case in its tier colour with its name over it. */
  function addKit(item: FieldLoot) {
    const group = new THREE.Group(), owned: { dispose(): void }[] = [], color = tierColor(item.tier);
    group.name = `drop-${item.id}`; group.position.set(item.x, (item.y ?? 0) + .02, item.z); root.add(group);
    const caseGeometry = new THREE.BoxGeometry(.55, .28, .38), caseMaterial = new THREE.MeshStandardMaterial({ color: item.kind === 'medical' ? '#c9d1c4' : '#3f4a37', roughness: .8 });
    const lidGeometry = new THREE.BoxGeometry(.56, .05, .39), lidMaterial = new THREE.MeshStandardMaterial({ color: item.kind === 'medical' ? '#c43a32' : color, roughness: .7 });
    owned.push(caseGeometry, caseMaterial, lidGeometry, lidMaterial);
    const body = new THREE.Mesh(caseGeometry, caseMaterial); body.position.y = .14; group.add(body);
    const lid = new THREE.Mesh(lidGeometry, lidMaterial); lid.position.y = .3; group.add(lid);
    group.traverse(node => { node.userData.fpsEffect = true; });
    label(group, `${item.tier.toUpperCase()} / ${item.name}`, color, .85, owned);
    drops.set(item.id, { group, resources: owned });
  }
  for (const item of loot.filter(entry => entry.dropped)) addDrop(item);
  for (const item of loot.filter(entry => !entry.dropped)) {
    const group = new THREE.Group(); group.position.set(item.x, (item.y ?? 0) + .13, item.z); root.add(group); pickups.set(item.id,group);
    const color = tierColor(item.tier);
    mesh(group,new THREE.BoxGeometry(.9,.45,.55),'#35483d',0,.25,0);
    mesh(group,new THREE.BoxGeometry(.92,.07,.57),color,0,.49,0);
    for (const x of [-.31,.31]) mesh(group,new THREE.BoxGeometry(.06,.47,.57),'#222d27',x,.25,0);
    if (item.kind === 'weapon') { mesh(group,new THREE.BoxGeometry(.78,.09,.1),'#182723',0,.61,0); mesh(group,new THREE.BoxGeometry(.12,.17,.1),color,.1,.52,0); }
    else if (item.kind === 'medical' && itemById(item.catalogId || '')?.supplyType === 'food') {
      mesh(group,new THREE.CylinderGeometry(.16,.22,.13,12),'#efe2bd',-.12,.62,0);
      mesh(group,new THREE.CylinderGeometry(.1,.1,.27,10),'#c99668',.18,.64,0);
    } else if (item.kind === 'medical') { mesh(group,new THREE.BoxGeometry(.1,.24,.03),'#dbeee2',0,.26,-.292); mesh(group,new THREE.BoxGeometry(.24,.1,.03),'#dbeee2',0,.26,-.294); }
    label(group,`${item.tier.toUpperCase()} / ${item.name}`,color,1.32);
  }
  // Locals are articulated figures standing on whatever floor is under them.
  const floorRay = new THREE.Raycaster(), floors: THREE.Mesh[] = [];
  scene.updateMatrixWorld(true);
  for (const child of scene.children) if (child !== root) child.traverseVisible(node => { if (node instanceof THREE.Mesh && !node.userData.fpsEffect) floors.push(node); });
  const floorAt = (x: number, z: number) => {
    floorRay.set(new THREE.Vector3(x, 1.4, z), new THREE.Vector3(0, -1, 0)); floorRay.far = 2;
    const hit = floorRay.intersectObjects(floors, false).find(h => h.point.y < .7 && (h.face?.normal.clone().transformDirection(h.object.matrixWorld).y ?? 0) > .7);
    return hit ? hit.point.y : 0;
  };
  const locals: { npc: ExpeditionNpc; rig: CharacterRig; yaw: number; baseYaw: number; greeted: boolean; react: number; gesture: CharacterGesture }[] = [];
  for (const npc of npcs) {
    const ground = floorAt(npc.x, npc.z);
    const group = new THREE.Group(); group.position.set(npc.x, ground, npc.z); root.add(group);
    const interaction = npc.interaction;
    const vendor = interaction.kind === 'vendor';
    const action = interaction.kind === 'vendor'
      ? `${itemById(interaction.catalogId)?.name ?? 'SUPPLIES'} / ${interaction.price} ${interaction.currency === 'tokens' ? 'TK' : 'CR'}`
      : npc.role;
    const rig = createCharacterRig(npcCharacterLook(npc), `npc-${npc.id}`); rig.root.userData.npcId = npc.id;
    // Face the district spawn, the direction most visitors arrive from.
    const spawn = getWorldZone(zone).spawn, baseYaw = Math.atan2(-(spawn.x - npc.x), -(spawn.z - npc.z)) + (hashString(npc.id) % 100 - 50) / 120;
    rig.root.rotation.y = baseYaw; group.add(rig.root); resources.push(...rig.resources);
    locals.push({ npc, rig, yaw: baseYaw, baseYaw, greeted: false, react: 0, gesture: 'idle' });
    const accent = vendor ? '#efd077' : '#9bdcf0';
    const ring = mesh(group,new THREE.TorusGeometry(.55,.035,6,28),accent,0,.04,0); ring.rotation.x = Math.PI/2;
    label(group,`N / ${npc.name} / ${action}`,accent,2.38);
  }
  const viewerLocal = new THREE.Vector3();
  let clock = 0;
  for (const gateway of WORLD_GATEWAYS.filter(gateway=>gateway.from===zone)) {
    const group = new THREE.Group(); group.position.set(gateway.position.x,.12,gateway.position.z); root.add(group);
    const ring = mesh(group,new THREE.TorusGeometry(3,.055,6,40),'#9ad9bd',0,.1,0); ring.rotation.x = Math.PI/2;
    for(const x of [-3.1,3.1]) { mesh(group,new THREE.BoxGeometry(.25,3.4,.25),'#344e40',x,1.7,0); mesh(group,new THREE.BoxGeometry(.29,.35,.29),'#b8e3c1',x,3.05,0); }
    label(group,`T / ${getWorldZone(gateway.to).name.toUpperCase()}`, '#d2efcf',3.9);
  }
  return {
    /** Idle life, head-tracking, turning to face and greeting a nearby viewer. */
    update(dt: number, viewer: THREE.Vector3) {
      dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .1)) : 0; clock += dt;
      for (const local of locals) {
        const { npc, rig } = local, dx = viewer.x - npc.x, dz = viewer.z - npc.z, distance = Math.hypot(dx, dz);
        if (distance > 14) local.greeted = false;
        if (!local.greeted && distance < 6) { local.greeted = true; if (local.react <= 0) { local.react = 2.2; local.gesture = 'wave'; } }
        local.react = Math.max(0, local.react - dt);
        const wanted = distance < 4.5 ? Math.atan2(-dx, -dz) : local.baseYaw;
        const delta = Math.atan2(Math.sin(wanted - local.yaw), Math.cos(wanted - local.yaw));
        const step = Math.sign(delta) * Math.min(Math.abs(delta), 2.4 * dt, Math.abs(delta) * (1 - Math.exp(-5 * dt)) + .2 * dt);
        local.yaw += step; rig.root.rotation.y = local.yaw;
        const near = distance < 8;
        if (near) { viewerLocal.copy(viewer); rig.root.worldToLocal(viewerLocal); }
        rig.update(dt, { turn: dt > 0 ? step / dt : 0, lookAt: near ? viewerLocal : null, gesture: local.react > 0 ? local.gesture : npcIdleGesture(npc, clock) });
      }
    },
    /** A visible response to the player's interaction. */
    react(id: string, gesture: CharacterGesture, seconds = 2.6) {
      const local = locals.find(candidate => candidate.npc.id === id); if (!local) return;
      local.gesture = gesture; local.react = seconds; local.greeted = true;
    },
    addDrop,
    remove(id:string) {
      const group=pickups.get(id); if(group){group.visible=false;pickups.delete(id);}
      const dropped=drops.get(id); if(dropped){dropped.group.removeFromParent();dropped.resources.forEach(resource=>resource.dispose());drops.delete(id);}
    },
    dispose() { root.removeFromParent(); resources.forEach(resource=>resource.dispose()); drops.forEach(entry=>entry.resources.forEach(resource=>resource.dispose())); drops.clear(); pickups.clear(); },
  };
}
