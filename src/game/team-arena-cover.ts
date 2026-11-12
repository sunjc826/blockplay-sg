import * as THREE from 'three';
import type { Obstacle, RegionBounds } from './region-collision';

/** Full-height, mode-owned sightline breaks. Coordinates use the district's ground. */
export interface TeamArenaCover { x:number; z:number; width:number; depth:number; height:number; color:string }
export function installTeamArenaCover(world:{scene:THREE.Scene;obstacles:Obstacle[]},bounds:RegionBounds,blocks:readonly TeamArenaCover[]) {
  const geometry=new THREE.BoxGeometry(1,1,1),materials=new Map<string,THREE.MeshStandardMaterial>(),roots:THREE.Mesh[]=[];
  const obstacles:Obstacle[]=[],anchors:{x:number;z:number}[]=[];
  for(const block of blocks) {
    let material=materials.get(block.color);
    if(!material){material=new THREE.MeshStandardMaterial({color:block.color,roughness:.85});materials.set(block.color,material);}
    const y=bounds.groundHeight?.(block.x,block.z)??0;
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Arena sightline cover';mesh.position.set(block.x,y+block.height/2,block.z);mesh.scale.set(block.width,block.height,block.depth);mesh.castShadow=mesh.receiveShadow=true;world.scene.add(mesh);roots.push(mesh);
    const obstacle={minX:block.x-block.width/2,maxX:block.x+block.width/2,minZ:block.z-block.depth/2,maxZ:block.z+block.depth/2,minY:y,maxY:y+block.height,supportsTop:true};
    obstacles.push(obstacle);world.obstacles.push(obstacle);
    for(const x of [obstacle.minX-1,obstacle.maxX+1])for(const z of [obstacle.minZ-1,obstacle.maxZ+1])anchors.push({x,z});
  }
  let disposed=false;
  return {anchors,dispose(){if(disposed)return;disposed=true;for(const mesh of roots)mesh.removeFromParent();geometry.dispose();for(const material of materials.values())material.dispose();const owned=new Set(obstacles);for(let i=world.obstacles.length-1;i>=0;i--)if(owned.has(world.obstacles[i]))world.obstacles.splice(i,1);}};
}
