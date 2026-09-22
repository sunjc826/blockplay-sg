import * as THREE from 'three';
import type { FieldLoot } from './expedition-loot';
import type { ExpeditionNpc } from './expedition-npcs';
import { itemById } from './armory-catalog';
import { WORLD_GATEWAYS, getWorldZone, type WorldZoneId } from './world-zones';

export function createExpeditionMarkers(scene: THREE.Scene, zone: WorldZoneId, loot: readonly FieldLoot[], npcs: readonly ExpeditionNpc[] = []) {
  const root = new THREE.Group(); root.name = 'expedition-markers'; root.userData.fpsEffect = true; scene.add(root);
  const resources: { dispose(): void }[] = [];
  const pickups = new Map<string, THREE.Group>();
  function mesh(parent: THREE.Group, geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .8 }); resources.push(geometry, material);
    const part = new THREE.Mesh(geometry, material); part.position.set(x,y,z); parent.add(part); return part;
  }
  function label(parent: THREE.Group, text: string, color: string, y: number) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 64;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#14231fea'; ctx.fillRect(0,0,512,64); ctx.font = '600 26px sans-serif'; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text,256,32,490);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map:texture, depthTest:true }); resources.push(texture,material);
    const sprite = new THREE.Sprite(material); sprite.position.y = y; sprite.scale.set(3.7,.46,1); parent.add(sprite);
  }
  for (const item of loot) {
    const group = new THREE.Group(); group.position.set(item.x, .13, item.z); root.add(group); pickups.set(item.id,group);
    const color = item.tier === 'Elite' ? '#e5bb55' : item.tier === 'Field' ? '#71b8d0' : '#b8c9b2';
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
  for (const npc of npcs) {
    const group = new THREE.Group(); group.position.set(npc.x, .13, npc.z); root.add(group);
    const interaction = npc.interaction;
    const vendor = interaction.kind === 'vendor';
    const action = interaction.kind === 'vendor'
      ? `${itemById(interaction.catalogId)?.name ?? 'SUPPLIES'} / ${interaction.price} ${interaction.currency === 'tokens' ? 'TK' : 'CR'}`
      : npc.role;
    for (const x of [-.17, .17]) mesh(group, new THREE.CylinderGeometry(.09,.1,.72,8),'#27352f',x,.36,0);
    mesh(group,new THREE.BoxGeometry(.58,.78,.34),vendor ? '#536f5d' : '#506b7c',0,1.05,0);
    mesh(group,new THREE.BoxGeometry(.46,.62,.04),vendor ? '#e0c991' : '#bdd4df',0,1.03,-.19);
    mesh(group,new THREE.SphereGeometry(.23,12,8),'#b9896e',0,1.68,0);
    mesh(group,new THREE.BoxGeometry(.48,.08,.42),'#2d4137',0,1.9,0);
    const accent = vendor ? '#efd077' : '#9bdcf0';
    const ring = mesh(group,new THREE.TorusGeometry(.55,.035,6,28),accent,0,.04,0); ring.rotation.x = Math.PI/2;
    label(group,`N / ${npc.name} / ${action}`,accent,2.38);
  }
  for (const gateway of WORLD_GATEWAYS.filter(gateway=>gateway.from===zone)) {
    const group = new THREE.Group(); group.position.set(gateway.position.x,.12,gateway.position.z); root.add(group);
    const ring = mesh(group,new THREE.TorusGeometry(3,.055,6,40),'#9ad9bd',0,.1,0); ring.rotation.x = Math.PI/2;
    for(const x of [-3.1,3.1]) { mesh(group,new THREE.BoxGeometry(.25,3.4,.25),'#344e40',x,1.7,0); mesh(group,new THREE.BoxGeometry(.29,.35,.29),'#b8e3c1',x,3.05,0); }
    label(group,`T / ${getWorldZone(gateway.to).name.toUpperCase()}`, '#d2efcf',3.9);
  }
  return {
    remove(id:string) { const group=pickups.get(id); if(group){group.visible=false;pickups.delete(id);} },
    dispose() { root.removeFromParent(); resources.forEach(resource=>resource.dispose()); pickups.clear(); },
  };
}
