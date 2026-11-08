import * as THREE from 'three';
import { buildTeamCombatWorld } from './team-combat-world';
import { HARDPOINT_AREA, HARDPOINT_LAYOUT, SMITH_CONTROL_SITES, type HardpointSnapshot } from './hardpoint';
import { installStructureLayout } from './structure-layout';
import { createStructureVisuals } from './structure-visuals';

/** Fixed mode-owned stations, with presentation separate from objective occupancy. */
export function buildHardpointWorld() {
  const world=buildTeamCombatWorld(HARDPOINT_AREA,{hardpoint:{area:HARDPOINT_AREA,sites:SMITH_CONTROL_SITES}});
  const installed=installStructureLayout(world,HARDPOINT_LAYOUT);
  world.environment.navigationAnchors=[...world.environment.navigationAnchors??[],...installed.navigationAnchors,...SMITH_CONTROL_SITES];
  const structures=createStructureVisuals(world.scene,HARDPOINT_LAYOUT);
  const markers=SMITH_CONTROL_SITES.map(site=>{
    const root=new THREE.Group();root.userData.fpsEffect=true;root.name=`Control zone ${site.id}`;
    root.position.set(site.x,site.y+.06,site.z);
    const material=new THREE.MeshBasicMaterial({color:'#667780',side:THREE.DoubleSide,transparent:true,opacity:.25,depthWrite:false});
    const geometry=new THREE.RingGeometry(site.radius-.09,site.radius,48),ring=new THREE.Mesh(geometry,material);ring.rotation.x=-Math.PI/2;root.add(ring);
    const lightGeometry=new THREE.BoxGeometry(.18,.18,.18);
    for(let i=0;i<8;i++){const light=new THREE.Mesh(lightGeometry,material);light.position.set(Math.sin(i*Math.PI/4)*site.radius,.06,Math.cos(i*Math.PI/4)*site.radius);root.add(light);}
    world.scene.add(root);return {root,material,geometry,lightGeometry};
  });
  const controlStations={
    update(state?:HardpointSnapshot) {
      structures.update(SMITH_CONTROL_SITES.map((site,i)=>{
        const active=state?.active===site.id;
        const accent=active?(state.contested?'#ff7568':state.owner==='alpha'?'#70cfff':state.owner==='bravo'?'#ffc56e':'#eef5fa'):state?.next===site.id?'#e7df88':'#667780';
        markers[i].material.color.set(accent);markers[i].material.opacity=active?.85:state?.next===site.id?.55:.18;
        return {id:`control-${site.id}`,accent,body:'#33434b',mastVisible:true,barVisible:false,barFraction:1};
      }));
    },
  };
  controlStations.update();let disposed=false;
  return {...world,controlStations,dispose(){if(disposed)return;disposed=true;structures.dispose();installed.dispose();for(const m of markers){m.root.removeFromParent();m.geometry.dispose();m.lightGeometry.dispose();m.material.dispose();}world.dispose();}};
}
