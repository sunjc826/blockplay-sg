import * as THREE from 'three';
import { createParachute } from './parachute-model';
import { PROXY_RULES, type ProxySnapshot } from './proxy-operations';

/** One reusable cargo model; it neither blocks shots nor provides invisible cover. */
export function createProxyOperationVisuals(scene: THREE.Scene) {
  const root = new THREE.Group(); root.name='proxy-prototype-cargo'; root.userData.fpsEffect=true;
  const body = new THREE.BoxGeometry(1.25,.75,.85), band = new THREE.BoxGeometry(.1,.81,.91);
  const metal = new THREE.MeshStandardMaterial({ color: '#444f53', roughness:.65 });
  const trim = new THREE.MeshStandardMaterial({ color:'#e7bc68', roughness:.4 });
  const box = new THREE.Mesh(body,metal); box.position.y=.4; root.add(box);
  for (const x of [-.4,.4]) { const mesh = new THREE.Mesh(band,trim); mesh.position.set(x,.4,0); root.add(mesh); }
  const beaconGeometry = new THREE.SphereGeometry(.09,8,6), beaconMaterial = new THREE.MeshBasicMaterial({color:'#ffd98a'});
  const beacon=new THREE.Mesh(beaconGeometry,beaconMaterial); beacon.position.y=.87; root.add(beacon);
  const parachute=createParachute('#d7c8a0'); root.add(parachute.root);
  root.traverse(o => { o.userData.fpsEffect=true; o.raycast=()=>{}; }); root.visible=false; scene.add(root);
  return {
    update(snapshot?: ProxySnapshot) {
      const op=snapshot?.operation; root.visible=!!op && op.cargo==='sealed' && (op.phase==='incoming'||op.phase==='contested');
      if (!op || !root.visible) return;
      const height=op.phase==='incoming'?24*op.remaining/PROXY_RULES.warning:0;
      root.position.set(op.at.x,op.at.y+height,op.at.z); parachute.root.visible=height>0;
      beacon.scale.setScalar(1+.2*Math.sin(op.remaining*5));
      trim.color.set(op.owner==='freedom-force'?'#e7bc68':'#75968a');
    },
    dispose() { scene.remove(root); for(const resource of [body,band,metal,trim,beaconGeometry,beaconMaterial,...parachute.resources])resource.dispose(); },
  };
}
