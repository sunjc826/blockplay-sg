import * as THREE from 'three';
import { getRegion } from './regions';
import { getWorldZone } from './world-zones';
import { createRegionMovement } from './region-collision';
import { tdmArea } from './arena-match';
import type { ArenaEnvironment } from './arena-rules';

/** Match adapter: only terrain, movement, combat anchors and match rules. */
export function buildTeamDeathmatchWorld(areaId: string) {
  const area=tdmArea(areaId); if (!area) throw new Error('Unknown Team Deathmatch area');
  const region=getRegion(area.region), world=region.build();
  const bounds={...area.bounds,groundHeight:region.bounds.groundHeight}, move=createRegionMovement(bounds).move;
  const spawns=[...area.spawns.alpha,...area.spawns.bravo];
  const environment: ArenaEnvironment={bounds,move,spawns,navigationAnchors:[...spawns,...area.patrols],teamDeathmatch:area};
  // A visible perimeter marks the authoritative movement boundary; it is not shot cover.
  const {minX,maxX,minZ,maxZ}=bounds;
  const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(minX,.12,minZ),new THREE.Vector3(maxX,.12,minZ),new THREE.Vector3(maxX,.12,maxZ),new THREE.Vector3(minX,.12,maxZ),
  ]),new THREE.LineBasicMaterial({color:'#ffc56e',depthTest:false,transparent:true,opacity:.85}));
  line.name='Team Deathmatch perimeter'; line.userData.fpsEffect=true;line.renderOrder=10;world.scene.add(line);
  return {...world,zone:getWorldZone(area.region),bounds,move,environment,dispose(){line.removeFromParent();line.geometry.dispose();line.material.dispose();world.dispose();}};
}
