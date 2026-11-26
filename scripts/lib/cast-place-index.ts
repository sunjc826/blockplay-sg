import { HARBOURFRONT_CONTOUR_PATH, HARBOURFRONT_RIDGE_REST, HARBOURFRONT_RIDGE_STAIR } from '../../src/game/harbourfront-sentosa-ground';
import { GAZEBO_LANDING } from '../../src/game/botanic-gardens-ground';
// Offline projection of visible, scene-dependent places. Never import the scene in the Worker.
import type { buildDistrictWorld } from '../../src/game/district-world';
import type { districtInfrastructure } from '../../src/game/district-infrastructure';
import { getRegion } from '../../src/game/regions';
import { borderingSectors, sectorAt } from '../../src/game/zone-sectors';
import { getVerticalPlaces } from '../../src/game/vertical-places';
import { getVerticalRoutes } from '../../src/game/vertical-routes';
import { getBuildingLifts } from '../../src/game/building-lifts';
import { getFpsDistrict } from '../../src/game/fps-districts';
import { rangeResupplyPoint } from '../../src/game/range-resupply';
import { DRAGON_BOAT_SPAWNS } from '../../src/game/marina-water';
import { HARDPOINT_ARENAS } from '../../src/game/hardpoint';
import type { StreetPropPlacement } from '../../src/game/district-street-props';
import { streetPropSpec } from '../../src/game/street-props';
import type { ExpeditionNpc } from '../../src/game/expedition-npcs';
import type { MapFeature } from '../../server/learned-map';

type Point = {x:number;z:number;y?:number};
export function projectPlaces(world:ReturnType<typeof buildDistrictWorld>, infrastructure:ReturnType<typeof districtInfrastructure>, npcs:ExpeditionNpc[]) {
  const region = world.zone.id, places:MapFeature[] = [], seen = new Set<string>();
  function add(id:string,name:string,p:Point,options:Partial<MapFeature> = {}) {
    if (!sectorAt(region,p.x,p.z) || seen.has(id)) return;
    seen.add(id);
    places.push({id,name,x:p.x,z:p.z,...(p.y ? {y:p.y} : {}),...options});
  }
  if (region === 'harbourfront') {
    add('ridge-rest','Bench on the ridge rest landing',HARBOURFRONT_RIDGE_REST);
    add('ridge-stair','Steps up to the ridge lookout',HARBOURFRONT_RIDGE_STAIR[0],{well:true});
    add('ridge-lookout','Lookout above the ridge steps',HARBOURFRONT_RIDGE_STAIR.at(-1)!,{well:true});
    add('contour-path','Contour path up the ridge shoulder',HARBOURFRONT_CONTOUR_PATH[0],{well:true});
  }
  if (region === 'botanic-gardens') add('gazebo-landing','Gazebo landing',GAZEBO_LANDING);
  const expedition = {mode:'expedition'} as const;
  for (const f of infrastructure.facilitySites) {
    const suffix = f.id.replace(region+'-','');
    add('site-'+suffix,f.name+(f.kind === 'command' ? ' console' : ' cabinet'),f,expedition);
    for (const prop of f.camp?.props ?? []) {
      if (prop.kind !== 'barricade') continue;
      const side = Math.abs(prop.x-f.x) > Math.abs(prop.z-f.z) ? prop.x > f.x ? 'east' : 'west' : prop.z > f.z ? 'south' : 'north';
      add(suffix+'-'+side,side+' barricade at '+f.name,prop,{...expedition,well:true});
    }
  }
  for (const n of npcs) if (n.interaction.kind === 'vendor') add('vendor-'+n.sectorId,n.name+' ('+n.interaction.catalogId.replace('food-','').replaceAll('-',' ')+')',n,expedition);
  const district = getFpsDistrict(region);
  const rangeFleet = {...district.vehicles,...(region === 'marina-bay' ? DRAGON_BOAT_SPAWNS : {})};
  const station = rangeResupplyPoint(district.spawn,world.bounds,[...world.obstacles,
    ...district.props.map(([,x,z,w,d]) => ({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2})),
    ...district.targets.map(({x,z}) => ({minX:x-.5,maxX:x+.5,minZ:z-.5,maxZ:z+.5}))],Object.values(rangeFleet));
  if (station) add('range-stock','Ammo, grenades and utilities at the range chest',station,{mode:'range'});
  for (const [mode,fleet] of [['expedition',infrastructure.fleetSpawns],['range',rangeFleet]] as const)
    for (const [kind,p] of Object.entries(fleet)) add(mode+'-'+kind,'Usual '+kind.replaceAll('-',' ')+' spot',p,{mode,scenery:kind.startsWith('dragon-boat')});

  for (const {area,sites} of HARDPOINT_ARENAS.filter(a => a.area.region === region)) {
    const arena = {mode:'arena',area:area.id} as const;
    for (const site of sites) add('hill-'+area.id+'-'+site.id,site.name+' control point',site,{...arena,hardpoint:true});
    for (const [i,block] of (area.cover ?? []).entries())
      add('cover-'+area.id+'-'+(i+1),'Cover wall',block,{...arena,well:true});
  }
  for (const place of getVerticalPlaces(world.scene)) {
    for (const c of place.connections) {
      const foot = c.from.y < c.to.y ? c.from : c.to;
      if (foot.y > .4) continue;
      const access = c.from.y === c.to.y ? 'Walkway to ' : c.stairs ? 'Steps up to ' : 'Ramp up to ';
      add(place.id+'-'+c.id,access+place.name,foot,{well:true});
    }
    for (const floor of place.floors) {
      if (floor.y > 0 && /lookout|viewing|overlook|summit/i.test(floor.id+' '+place.name))
        add(place.id+'-'+floor.id,place.name.toLowerCase().endsWith(floor.id) ? place.name : place.name+' '+floor.id.replaceAll('-',' '),floor,{well:true});
    }
  }
  for (const route of getVerticalRoutes(world.scene))
    for (const [i,p] of [route.points[0],route.points.at(-1)!].entries())
      add(route.id+'-approach-'+(i+1),'Approach to '+route.name,p,{well:true});
  for (const lift of getBuildingLifts(world.scene)) add(lift.id,lift.id.startsWith('sands-express') ? 'SkyPark express lift' : lift.id.replaceAll('-',' ')+' lift',{...lift,y:lift.bottom},{well:true});
  for (const p of (world.scene.userData.streetPropPlacements ?? []) as StreetPropPlacement[]) {
    const sector = sectorAt(region,p.x,p.z);
    // One representative fixture per furnishing strip and sector.
    add('fixture-'+sector?.id+'-'+p.site,streetPropSpec(p.kind).name+' by '+p.feature.split(/[;:]/)[0],p);
  }
  // The district navigation anchors follow these mapped road polylines. Report
  // a crossing only where consecutive samples actually pass between neighbours.
  for (const road of getRegion(region).mapRoads) {
    let prev = road.points[0], before = prev && sectorAt(region,prev.x,prev.z);
    for (let i=1;i<road.points.length;i++) {
      const a=road.points[i-1], b=road.points[i], steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/2);
      for (let j=1;j<=steps;j++) {
        const p={x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps}, here=sectorAt(region,p.x,p.z);
        if (before && here && here !== before && borderingSectors(before,here)) {
          add('road-'+before.id+'-'+here.id,'Road across to '+here.name,prev,{well:true});
          add('road-'+here.id+'-'+before.id,'Road across to '+before.name,p,{well:true});
        }
        before=here; prev=p;
      }
    }
  }
  return places;
}
